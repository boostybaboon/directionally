import * as THREE from 'three';
import type { LightConfig } from '../domain/types.js';
import type { PartDraft, SketcherDraft } from './types.js';

/**
 * The AI Draft — a sympathetic, AI-facing projection of a `SketcherDraft`.
 *
 * The canonical draft stores quaternions, guids, and flat group membership; the
 * AI Draft exposes Euler degrees, readable handles, and named groups, plus an
 * explicit coordinate convention. `toAIDraft` / `fromAIDraft` bridge the two;
 * `SketcherDraft` stays the single source of truth and the AI Draft is never
 * persisted.
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

export type AIPart = {
  /** Handle the AI addresses the part by; unique within the draft. */
  id: string;
  /** Semantic name (the part's `label`, or its preset name when unlabelled). */
  name: string;
  kind: PartDraft['kind'];
  /** Lowercase primitive preset ('box', 'sphere', …) — primitives only. */
  shape?: string;
  /** Absolute dimensions, per `shape` — primitives only. */
  size?: number[];
  /** Raw scale — sketch/lathe parts only. */
  scale?: [number, number, number];
  position: [number, number, number];
  /** Euler rotation in degrees, XYZ order. */
  rotation: [number, number, number];
  color: number;
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

function slug(name: string): string {
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

function toEulerDeg(quaternion: [number, number, number, number]): [number, number, number] {
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion(quaternion[0], quaternion[1], quaternion[2], quaternion[3]));
  return [fixZero(e.x * DEG), fixZero(e.y * DEG), fixZero(e.z * DEG)];
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

function scaleToSize(shape: string, scale: [number, number, number]): number[] {
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

/** Project the canonical draft into its AI-facing form. */
export function toAIDraft(draft: SketcherDraft): AIDraftProjection {
  const taken = new Set<string>();
  const idMap: Record<string, string> = {};
  const handleOfGuid = new Map<string, string>();

  // Reserve group handles first so part handles never collide with them.
  const groupHandles = (draft.groups ?? []).map((g, i) => {
    const h = uniqueHandle(slug(g.name ?? `group-${i + 1}`), taken);
    taken.add(h);
    return h;
  });

  const groupHandleOfGuid = new Map<string, string>();
  (draft.groups ?? []).forEach((g, i) => {
    for (const pid of g.partIds) groupHandleOfGuid.set(pid, groupHandles[i]);
  });

  const parts: AIPart[] = draft.parts.map((p) => {
    const handle = uniqueHandle(slug(p.label ?? p.name), taken);
    taken.add(handle);
    idMap[handle] = p.id;
    handleOfGuid.set(p.id, handle);
    const groupHandle = groupHandleOfGuid.get(p.id);
    const isPrimitive = p.kind === 'primitive';
    return {
      id: handle,
      name: p.label ?? p.name,
      kind: p.kind,
      ...(isPrimitive
        ? { shape: p.name.toLowerCase(), size: scaleToSize(p.name.toLowerCase(), p.scale) }
        : { scale: p.scale }),
      position: p.position,
      rotation: toEulerDeg(p.quaternion),
      color: p.color,
      ...(p.faceColors !== undefined ? { faceColors: p.faceColors } : {}),
      ...(p.faceTextures !== undefined ? { faceTextures: p.faceTextures } : {}),
      ...(p.shapePoints !== undefined ? { shapePoints: p.shapePoints } : {}),
      ...(p.holes !== undefined ? { holes: p.holes } : {}),
      ...(p.lathePoints !== undefined ? { lathePoints: p.lathePoints } : {}),
      ...(p.phiLength !== undefined ? { phiLength: p.phiLength } : {}),
      ...(p.depth !== undefined ? { depth: p.depth } : {}),
      ...(groupHandle !== undefined ? { group: groupHandle } : {}),
    };
  });

  const groups: AIGroup[] = (draft.groups ?? []).map((g, i) => ({
    id: groupHandles[i],
    ...(g.name !== undefined ? { name: g.name } : {}),
    children: g.partIds
      .map((pid) => handleOfGuid.get(pid))
      .filter((h): h is string => h !== undefined),
  }));

  return {
    aiDraft: {
      convention: AI_CONVENTION,
      parts,
      groups,
      ...(draft.lights !== undefined ? { lights: draft.lights } : {}),
      ...(draft.environmentMap !== undefined ? { environmentMap: draft.environmentMap } : {}),
    },
    idMap,
  };
}

/** Rebuild the canonical draft from the AI's (edited) projection. */
export function fromAIDraft(aiDraft: AIDraft, idMap: Record<string, string> = {}): SketcherDraft {
  const used = new Set<string>();
  const guidOfHandle = new Map<string, string>();

  const parts: PartDraft[] = aiDraft.parts.map((p) => {
    let guid = idMap[p.id] ?? guidOfHandle.get(p.id);
    if (guid === undefined) guid = crypto.randomUUID();
    let unique = guid;
    let i = 2;
    while (used.has(unique)) unique = `${guid}-${i++}`;
    used.add(unique);
    guidOfHandle.set(p.id, unique);

    const isPrimitive = p.shape !== undefined && p.size !== undefined;
    const presetName = isPrimitive ? capitalize(p.shape!) : p.name;

    return {
      id: unique,
      kind: p.kind,
      name: presetName,
      ...(isPrimitive && p.name !== presetName ? { label: p.name } : {}),
      position: p.position,
      quaternion: toQuaternion(p.rotation),
      scale: isPrimitive ? sizeToScale(p.shape!, p.size!) : (p.scale ?? [1, 1, 1]),
      color: p.color,
      ...(p.faceColors !== undefined ? { faceColors: p.faceColors } : {}),
      ...(p.faceTextures !== undefined ? { faceTextures: p.faceTextures } : {}),
      ...(p.shapePoints !== undefined ? { shapePoints: p.shapePoints } : {}),
      ...(p.holes !== undefined ? { holes: p.holes } : {}),
      ...(p.lathePoints !== undefined ? { lathePoints: p.lathePoints } : {}),
      ...(p.phiLength !== undefined ? { phiLength: p.phiLength } : {}),
      ...(p.depth !== undefined ? { depth: p.depth } : {}),
    };
  });

  const groups = aiDraft.groups.length > 0
    ? aiDraft.groups.map((g) => ({
        partIds: g.children
          .map((h) => guidOfHandle.get(h))
          .filter((x): x is string => x !== undefined),
        ...(g.name !== undefined ? { name: g.name } : {}),
      }))
    : undefined;

  return {
    version: 2,
    parts,
    joints: [],
    ...(groups !== undefined ? { groups } : {}),
    ...(aiDraft.lights !== undefined ? { lights: aiDraft.lights } : {}),
    ...(aiDraft.environmentMap !== undefined ? { environmentMap: aiDraft.environmentMap } : {}),
  };
}

