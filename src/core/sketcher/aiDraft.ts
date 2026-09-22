import * as THREE from 'three';
import type { LightConfig } from '../domain/types.js';
import type { PartDraft } from './types.js';
import { addLightNode, collectLights, emptyDocument, groupNodes, insertPart, insertRef, isPartNode, isRefNode } from './documentTree.js';
import type { SetDocument, SetNode } from './documentTree.js';

/**
 * The AI Draft — a sympathetic, AI-facing projection of a `SetDocument`.
 *
 * The document stores quaternions, guids, and a nested tree; the AI Draft exposes
 * Euler degrees, readable handles, and named groups, plus an explicit coordinate
 * convention. `toAIDraft` / `fromAIDraft` bridge the two; the document stays the
 * single source of truth and the AI Draft is never persisted.
 *
 * The AI grammar is flat — groups hold parts, never other groups — so the
 * projection flattens nested groups into their outermost group.
 *
 * Not carried (v1): joints (attach contact points aren't AI-editable — the AI
 * works with groups), and primitive `size` (the core stores `scale` of a preset
 * whose base dimensions vary; absolute dimensions are a follow-up enrichment).
 */

export type AIConvention = {
  units: 'metres';
  up: '+Y';
  groundY: 0;
  forward: '-Z';
};

export const AI_CONVENTION: AIConvention = {
  units: 'metres',
  up: '+Y',
  groundY: 0,
  forward: '-Z',
};

/**
 * One variation a reference part carries: a patch to a node inside its Definition, addressed by
 * path. The AI reads and writes Euler degrees and Definition-local coordinates, the document stores
 * quaternions — `toAIDraft`/`fromAIDraft` translate, so an AI edit cannot quietly drop an
 * instance's variation.
 */
export type AIOverride = {
  path: string;
  op: 'set' | 'remove';
  /** `set`: replaces the node's transform inside the Definition. */
  transform?: {
    position?: [number, number, number];
    /** Euler degrees, XYZ order. */
    rotation?: [number, number, number];
    scale?: [number, number, number];
  };
  /** `set`: hides the node, or shows a Definition-hidden one again with `false`. */
  hidden?: boolean;
};

export type AIPart = {
  /** Handle the AI addresses the part by; unique within the draft. */
  id: string;
  /** Semantic name (the part's `label`, or its preset name when unlabelled). */
  name: string;
  /**
   * Catalogue Definition to place - an *instance*, so the draft carries a reference and a
   * placement rather than a body. `describe_catalogue` is where the AI learns the ids.
   */
  ref?: string;
  /** Variation the instance applies to its Definition — reference parts only. */
  overrides?: AIOverride[];
  /** Body kind; absent on a reference part, where the Definition supplies it. */
  kind?: PartDraft['kind'];
  /** Lowercase primitive preset ('box', 'sphere', …) — primitives only. */
  shape?: string;
  /** Absolute dimensions, per `shape` — primitives only. */
  size?: number[];
  /** Raw scale — sketch/lathe parts only. */
  scale?: [number, number, number];
  position: [number, number, number];
  /** Euler rotation in degrees, XYZ order. */
  rotation: [number, number, number];
  color?: number;
  faceColors?: number[];
  faceTextures?: (string | null)[];
  shapePoints?: [number, number][];
  holes?: [number, number][][];
  lathePoints?: [number, number][];
  phiLength?: number;
  depth?: number;
  /** Handle of the owning group, or undefined for a standalone part. */
  group?: string;
};

export type AIGroup = {
  id: string;
  /** Optional semantic name; absent for unnamed groups. */
  name?: string;
  /** Handles of member parts. */
  children: string[];
  /** Optional world-space transform (position/quaternion/scale) — carried for a lossless round-trip. */
  position?: [number, number, number];
  quaternion?: [number, number, number, number];
  scale?: [number, number, number];
};

export type AIDraft = {
  convention: AIConvention;
  parts: AIPart[];
  groups: AIGroup[];
  /** Optional human-friendly name for the whole setting (generation hint only). */
  label?: string;
  lights?: LightConfig[];
  environmentMap?: string;
};

export type AIDraftProjection = {
  aiDraft: AIDraft;
  /** handle → canonical guid, for `fromAIDraft`. */
  idMap: Record<string, string>;
};

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

export function slug(name: string): string {
  const s = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s || 'part';
}

function uniqueHandle(wanted: string, taken: Set<string>): string {
  let handle = wanted;
  let i = 2;
  while (taken.has(handle)) handle = `${wanted}-${i++}`;
  return handle;
}

function fixZero(n: number): number {
  return Object.is(n, -0) ? 0 : n;
}

export function toEulerDeg(quaternion: [number, number, number, number]): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]));
  return [fixZero(e.x * DEG), fixZero(e.y * DEG), fixZero(e.z * DEG)];
}

/**
 * The preset to build for the shape a model named: one it recognises, or a box when it named something
 * the sketcher has no preset for. Dropping the part instead would lose a thing it asked for; a box is
 * the honest reading of "a counter", and its size is what makes it a counter rather than a cube.
 */
function buildableShape(shape: unknown): string {
  const named = typeof shape === 'string' ? shape.toLowerCase() : '';
  return named in SHAPES ? named : 'box';
}

/** One triple from an untrusted draft, or the fallback when it cannot be read. */
function readTriple(v: unknown, fallback: [number, number, number]): [number, number, number] {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')
    ? [v[0], v[1], v[2]]
    : [...fallback];
}

function toQuaternion(rotation: [number, number, number]): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation[0] * RAD, rotation[1] * RAD, rotation[2] * RAD, 'XYZ'));
  return [fixZero(q.x), fixZero(q.y), fixZero(q.z), fixZero(q.w)];
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

// Base dimensions of each primitive preset (mirrors PRIMITIVE_PRESETS in
// CartoonSketcher.ts), and the scale axis each dimension maps to. The core
// stores a `scale` of a fixed base primitive; the AI Draft exposes the absolute
// `size` instead.
const SHAPES: Record<string, { base: number[]; axis: number[] }> = {
  box:      { base: [1, 1, 1],      axis: [0, 1, 2] }, // [w, h, d]
  sphere:   { base: [0.75],          axis: [0] },       // [radius]
  cylinder: { base: [0.3, 0.3, 2],   axis: [0, 2, 1] }, // [rTop, rBottom, h]
  capsule:  { base: [0.3, 1],        axis: [0, 1] },    // [radius, length]
  cone:     { base: [0.5, 2],        axis: [0, 1] },    // [radius, h]
  torus:    { base: [0.5, 0.2],      axis: [0, 1] },    // [radius, tube]
};

export function scaleToSize(shape: string, scale: [number, number, number]): number[] {
  const s = SHAPES[shape];
  if (!s) return [...scale];
  return s.base.map((b, i) => b * scale[s.axis[i]]);
}

function sizeToScale(shape: string, size: number[]): [number, number, number] {
  const out: [number, number, number] = [1, 1, 1];
  const s = SHAPES[shape];
  if (!s) {
    for (let i = 0; i < Math.min(3, size.length); i++) out[i] = size[i];
    return out;
  }
  s.base.forEach((b, i) => { out[s.axis[i]] = size[i] / b; });
  return out;
}

// The document stores LOCAL transforms; the AI Draft exposes WORLD transforms. Group
// nodes carry their own transform so the conversion is lossless in both directions.

import type { Transform } from './transform.js';
import { IDENTITY_TRANSFORM, localToWorld } from './transform.js';
import type { NodeOverride, NodePatch } from './documentTree.js';

/** An instance's override, in the draft's terms: Euler degrees, Definition-local coordinates. */
function toAIOverride(override: NodeOverride): AIOverride {
  if (override.op === 'remove') return { path: override.path, op: 'remove' };
  const t = override.value.transform;
  return {
    path: override.path,
    op: 'set',
    ...(t ? { transform: { position: t.position, rotation: toEulerDeg(t.quaternion), scale: t.scale } } : {}),
    ...(override.value.hidden !== undefined ? { hidden: override.value.hidden } : {}),
  };
}

function fromAIOverride(override: AIOverride): NodeOverride {
  if (override.op === 'remove') return { path: override.path, op: 'remove' };
  const value: NodePatch = {};
  if (override.transform) {
    value.transform = {
      position: override.transform.position ?? [0, 0, 0],
      quaternion: toQuaternion(override.transform.rotation ?? [0, 0, 0]),
      scale: override.transform.scale ?? [1, 1, 1],
    };
  }
  if (override.hidden !== undefined) value.hidden = override.hidden;
  return { path: override.path, op: 'set', value };
}

/** Project a set document into its AI-facing form. */
export function toAIDraft(doc: SetDocument): AIDraftProjection {
  const taken = new Set<string>();
  const idMap: Record<string, string> = {};
  const parts: AIPart[] = [];
  const groups: AIGroup[] = [];
  /** Part handles claimed by each top-level group, by that group's handle. */
  const childrenOfGroup = new Map<string, string[]>();

  const walk = (nodes: SetNode[], parent: Transform, groupHandle: string | undefined) => {
    for (const node of nodes) {
      // Lights are carried by the draft's flat `lights` list, so they are not projected
      // as parts or as groups here.
      if (node.role === 'light') continue;
      if (isRefNode(node)) {
        const handle = uniqueHandle(slug(node.name ?? node.ref), taken);
        taken.add(handle);
        idMap[handle] = node.id;
        if (groupHandle !== undefined) childrenOfGroup.get(groupHandle)!.push(handle);
        const world = localToWorld(node.transform, parent);
        const overrides = node.overrides?.map(toAIOverride);
        parts.push({
          id: handle,
          name: node.name ?? node.ref,
          ref: node.ref,
          position: world.position,
          rotation: toEulerDeg(world.quaternion),
          ...(overrides && overrides.length > 0 ? { overrides } : {}),
          ...(groupHandle !== undefined ? { group: groupHandle } : {}),
        });
        continue;
      }
      if (isPartNode(node)) {
        const pd = node.content;
        const handle = uniqueHandle(slug(pd.label ?? pd.name), taken);
        taken.add(handle);
        idMap[handle] = pd.id;
        if (groupHandle !== undefined) childrenOfGroup.get(groupHandle)!.push(handle);
        const isPrimitive = pd.kind === 'primitive';
        const world = localToWorld(node.transform, parent);
        parts.push({
          id: handle,
          name: pd.label ?? pd.name,
          kind: pd.kind,
          ...(isPrimitive
            ? { shape: pd.name.toLowerCase(), size: scaleToSize(pd.name.toLowerCase(), world.scale) }
            : { scale: world.scale }),
          position: world.position,
          rotation: toEulerDeg(world.quaternion),
          color: pd.color,
          ...(pd.faceColors !== undefined ? { faceColors: pd.faceColors } : {}),
          ...(pd.faceTextures !== undefined ? { faceTextures: pd.faceTextures } : {}),
          ...(pd.shapePoints !== undefined ? { shapePoints: pd.shapePoints } : {}),
          ...(pd.holes !== undefined ? { holes: pd.holes } : {}),
          ...(pd.lathePoints !== undefined ? { lathePoints: pd.lathePoints } : {}),
          ...(pd.phiLength !== undefined ? { phiLength: pd.phiLength } : {}),
          ...(pd.depth !== undefined ? { depth: pd.depth } : {}),
          ...(groupHandle !== undefined ? { group: groupHandle } : {}),
        });
      } else {
        const world = localToWorld(node.transform, parent);
        // A nested group is flattened into its outermost group: the AI grammar has no
        // way to express one group inside another.
        let handle = groupHandle;
        if (handle === undefined) {
          handle = uniqueHandle(slug(node.name ?? `group-${groups.length + 1}`), taken);
          taken.add(handle);
          idMap[handle] = node.id;
          childrenOfGroup.set(handle, []);
          groups.push({
            id: handle,
            ...(node.name !== undefined ? { name: node.name } : {}),
            children: [],
            position: world.position,
            quaternion: world.quaternion,
            scale: world.scale,
          });
        }
        walk(node.children, world, handle);
      }
    }
  };
  walk(doc.root, IDENTITY_TRANSFORM, undefined);

  for (const group of groups) group.children = childrenOfGroup.get(group.id) ?? [];

  const lights = collectLights(doc);
  return {
    aiDraft: {
      convention: AI_CONVENTION,
      parts,
      groups,
      ...(lights.length > 0 ? { lights } : {}),
      ...(doc.environmentMap !== undefined ? { environmentMap: doc.environmentMap } : {}),
    },
    idMap,
  };
}

/**
 * Rebuild the document from the AI's (edited) projection. Handles map back to their
 * guids through `idMap`, so a part the AI left alone keeps its identity — and every
 * named group becomes a group node over its members.
 */
export function fromAIDraft(aiDraft: AIDraft, idMap: Record<string, string> = {}): SetDocument {
  const used = new Set<string>();
  const guidOfHandle = new Map<string, string>();

  const doc = emptyDocument();
  const parts = Array.isArray(aiDraft?.parts) ? aiDraft.parts : [];
  for (const p of parts) {
    if (typeof p !== 'object' || p === null) continue;
    // What the model left out is what the grammar asked for and did not get: the part lands at rest
    // rather than the whole turn failing, and the diff shown for review says where it landed.
    const shape = buildableShape(p.shape);
    const size = Array.isArray(p.size) && p.size.length === 3 && p.size.every((n) => typeof n === 'number')
      ? (p.size as [number, number, number])
      : undefined;
    const transform: Transform = {
      position: readTriple(p.position, [0, 0, 0]),
      quaternion: toQuaternion(readTriple(p.rotation, [0, 0, 0])),
      scale: size !== undefined ? sizeToScale(shape, size) : (p.scale ?? [1, 1, 1]),
    };

    // A reference part places a Definition instead of describing geometry: the document holds
    // an instance, so the item keeps its own names and paths and is never copied.
    if (p.ref !== undefined) {
      const overrides = Array.isArray(p.overrides) ? p.overrides.map(fromAIOverride) : undefined;
      guidOfHandle.set(p.id, insertRef(doc, {
        ref: p.ref,
        name: p.name,
        transform,
        ...(overrides && overrides.length > 0 ? { overrides } : {}),
      }).id);
      continue;
    }

    let guid = idMap[p.id] ?? guidOfHandle.get(p.id);
    if (guid === undefined) guid = crypto.randomUUID();
    let unique = guid;
    let i = 2;
    while (used.has(unique)) unique = `${guid}-${i++}`;
    used.add(unique);
    guidOfHandle.set(p.id, unique);

    const isPrimitive = (p.kind ?? 'primitive') === 'primitive';
    const presetName = isPrimitive ? capitalize(shape) : (p.name ?? 'Part');

    insertPart(doc, {
      content: {
        id: unique,
        kind: p.kind ?? 'primitive',
        name: presetName,
        ...(isPrimitive && p.name !== undefined && p.name !== presetName ? { label: p.name } : {}),
        color: p.color ?? 0x8888cc,
        ...(p.faceColors !== undefined ? { faceColors: p.faceColors } : {}),
        ...(p.faceTextures !== undefined ? { faceTextures: p.faceTextures } : {}),
        ...(p.shapePoints !== undefined ? { shapePoints: p.shapePoints } : {}),
        ...(p.holes !== undefined ? { holes: p.holes } : {}),
        ...(p.lathePoints !== undefined ? { lathePoints: p.lathePoints } : {}),
        ...(p.phiLength !== undefined ? { phiLength: p.phiLength } : {}),
        ...(p.depth !== undefined ? { depth: p.depth } : {}),
      },
      transform,
    });
  }
  // AI parts carry WORLD transforms, so each group wraps its members where they already
  // stand: the node lands at their centroid and the members localise to it.
  const groups = Array.isArray(aiDraft?.groups) ? aiDraft.groups : [];
  for (const group of groups) {
    if (typeof group !== 'object' || group === null) continue;
    const memberIds = (Array.isArray(group.children) ? group.children : [])
      .map((handle) => guidOfHandle.get(handle))
      .filter((id): id is string => id !== undefined);
    if (memberIds.length > 0) groupNodes(doc, memberIds, group.name, true);
  }

  // Lights arrive flat, so each becomes a root node; the AI's own id is kept (an
  // untrusted draft may omit it, hence the fallback).
  for (const [i, config] of (aiDraft.lights ?? []).entries()) {
    addLightNode(doc, { ...config, id: config.id || `light-${i + 1}` });
  }

  return {
    ...doc,
    ...(aiDraft.environmentMap !== undefined ? { environmentMap: aiDraft.environmentMap } : {}),
  };
}

