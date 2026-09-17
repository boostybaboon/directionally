import type { JointSnapshot, PartDraft } from './types.js';
import type { LightConfig } from '../domain/types.js';
import { slug } from './aiDraft.js';
import { IDENTITY_TRANSFORM, localToWorld, worldToLocal } from './transform.js';
import type { Transform } from './transform.js';

/**
 * The tree-shaped set document — the persistent form of a set. A `part` is a leaf;
 * a `group` nests children. The runtime holds a `SetDocument` and rebuilds the
 * scene from it (`CartoonSketcher`), so this module owns every structural edit:
 * parts, groups, attach joints and the durable group bonds.
 *
 * Node `id`s are parent-unique name segments — the "stable path segment" of
 * set-staging-architecture.md. A part leaf keeps its runtime guid (`part.id`),
 * so mesh identity survives a re-derivation, while the node id adds the segment
 * for path addressing (`group-id/part-id`).
 */
export type SetNode =
  | { kind: 'part'; id: string; role: 'prop'; part: PartDraft }
  | { kind: 'group'; id: string; role: 'structure'; name?: string; isGroup?: boolean; position?: [number, number, number]; quaternion?: [number, number, number, number]; scale?: [number, number, number]; children: SetNode[] };

export type SetDocument = {
  version: 2;
  root: SetNode[];
  joints: JointSnapshot[];
  lights?: LightConfig[];
  environmentMap?: string;
  /**
   * Durable group bond components: each entry is the set of part IDs that form
   * one group unit. Unlike group nodes, these survive attach merges — when an
   * attach op collapses a group into a larger assembly, the bond topology is
   * preserved here so that detaching restores the group correctly.
   */
  groupComponents?: string[][];
};

/** A document with nothing in it. */
export function emptyDocument(): SetDocument {
  return { version: 2, root: [], joints: [] };
}

/** A detached copy of a document — snapshots and loads never alias live state. */
export function cloneDocument(doc: SetDocument): SetDocument {
  return JSON.parse(JSON.stringify(doc)) as SetDocument;
}

/** Assign a parent-unique name segment for `wanted`, deduping against `taken`. */
function nameSegment(wanted: string, taken: Set<string>): string {
  const base = slug(wanted);
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) candidate = `${base}-${i++}`;
  taken.add(candidate);
  return candidate;
}

// ── Tree mutation operations (the live model's edit surface) ─────────────────

/** Number of part leaves in a document, nested groups included. */
export function countParts(doc: SetDocument): number {
  return collectParts(doc).length;
}

/** Every part leaf in the document, in tree order. */
export function collectParts(doc: SetDocument): PartDraft[] {
  const parts: PartDraft[] = [];
  const walk = (nodes: SetNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'part') parts.push(node.part);
      else walk(node.children);
    }
  };
  walk(doc.root);
  return parts;
}

/**
 * Build a document from a flat list of parts — the bundled library's authoring form.
 * Node ids are the same parent-unique name segments `insertPart` assigns, so a
 * hand-written definition and an edited one address their nodes identically.
 */
export function documentFromParts(parts: PartDraft[]): SetDocument {
  const doc: SetDocument = { version: 2, root: [], joints: [] };
  for (const part of parts) insertPart(doc, part);
  return doc;
}

function partTransform(part: PartDraft): Transform {
  return { position: part.position, quaternion: part.quaternion, scale: part.scale };
}

function groupTransform(node: Extract<SetNode, { kind: 'group' }>): Transform {
  return {
    position: node.position ?? [0, 0, 0],
    quaternion: node.quaternion ?? [0, 0, 0, 1],
    scale: node.scale ?? [1, 1, 1],
  };
}

function segmentsOf(nodes: SetNode[]): Set<string> {
  return new Set(nodes.map((n) => n.id));
}

/** Locate a part leaf by guid, returning its sibling array, index, and that array's parent world transform. */
function findPartLocation(nodes: SetNode[], partId: string, parent: Transform): { nodes: SetNode[]; index: number; parent: Transform } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === 'part') {
      if (node.part.id === partId) return { nodes, index: i, parent };
    } else {
      const found = findPartLocation(node.children, partId, localToWorld(groupTransform(node), parent));
      if (found) return found;
    }
  }
  return null;
}

/** Locate the group that directly contains `partId`, with its sibling array + parent world transform. */
function findGroupOfPart(nodes: SetNode[], partId: string, parent: Transform): { group: Extract<SetNode, { kind: 'group' }>; nodes: SetNode[]; index: number; parent: Transform } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.kind === 'group') {
      if (node.children.some((c) => c.kind === 'part' && c.part.id === partId)) {
        return { group: node, nodes, index: i, parent };
      }
      const nested = findGroupOfPart(node.children, partId, localToWorld(groupTransform(node), parent));
      if (nested) return nested;
    }
  }
  return null;
}

/** Return the group node that directly contains `partId`, or null. */
export function findGroupOfPartId(doc: SetDocument, partId: string): Extract<SetNode, { kind: 'group' }> | null {
  const found = findGroupOfPart(doc.root, partId, IDENTITY_TRANSFORM);
  return found ? found.group : null;
}

/** Add a part leaf to the document root. */
export function insertPart(doc: SetDocument, part: PartDraft): void {
  doc.root.push({ kind: 'part', id: nameSegment(part.label ?? part.name, segmentsOf(doc.root)), role: 'prop', part });
}

/** Remove a part leaf (by guid) from the tree. */
export function removePart(doc: SetDocument, partId: string): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  loc.nodes.splice(loc.index, 1);
  return true;
}

/**
 * Wrap a set of sibling parts into a new group node placed at their world centroid.
 * Members are re-localised to the new group (world positions preserved).
 *
 * `isGroup` distinguishes a pure group (true) from an attach assembly (false),
 * which is bond-backed only when the group is a whole `groupComponents` entry.
 */
export function groupParts(doc: SetDocument, partIds: string[], name?: string, isGroup?: boolean): boolean {
  const first = findPartLocation(doc.root, partIds[0], IDENTITY_TRANSFORM);
  if (!first) return false;

  const members: { node: Extract<SetNode, { kind: 'part' }>; index: number; world: Transform }[] = [];
  for (const pid of partIds) {
    const loc = findPartLocation(first.nodes, pid, first.parent);
    if (!loc || loc.nodes !== first.nodes) return false; // members must be siblings
    const node = loc.nodes[loc.index];
    if (node.kind !== 'part') return false;
    members.push({ node, index: loc.index, world: localToWorld(partTransform(node.part), first.parent) });
  }

  const centroid: [number, number, number] = [0, 0, 0];
  for (const m of members) {
    centroid[0] += m.world.position[0];
    centroid[1] += m.world.position[1];
    centroid[2] += m.world.position[2];
  }
  centroid[0] /= members.length;
  centroid[1] /= members.length;
  centroid[2] /= members.length;
  const groupT: Transform = { position: centroid, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  const ascending = [...members].sort((a, b) => a.index - b.index);
  const insertAt = ascending[0].index;
  for (const m of ascending) {
    const local = worldToLocal(m.world, groupT);
    m.node.part.position = local.position;
    m.node.part.quaternion = local.quaternion;
    m.node.part.scale = local.scale;
  }
  for (const m of [...ascending].reverse()) first.nodes.splice(m.index, 1);

  const groupNode: SetNode = {
    kind: 'group',
    id: nameSegment(name ?? 'group', segmentsOf(first.nodes)),
    role: 'structure',
    ...(name !== undefined ? { name } : {}),
    ...(isGroup !== undefined ? { isGroup } : {}),
    position: centroid,
    children: ascending.map((x) => x.node),
  };
  first.nodes.splice(insertAt, 0, groupNode);
  return true;
}

/** Dissolve the group that directly contains `partId`, promoting its children (world positions preserved). */
export function ungroupPart(doc: SetDocument, partId: string): boolean {
  const found = findGroupOfPart(doc.root, partId, IDENTITY_TRANSFORM);
  if (!found) return false;
  const { group, nodes, index, parent } = found;
  const groupWorld = localToWorld(groupTransform(group), parent);

  const promoted: SetNode[] = group.children.map((child) => {
    if (child.kind === 'part') {
      const local = worldToLocal(localToWorld(partTransform(child.part), groupWorld), parent);
      child.part.position = local.position;
      child.part.quaternion = local.quaternion;
      child.part.scale = local.scale;
    } else {
      const local = worldToLocal(localToWorld(groupTransform(child), groupWorld), parent);
      child.position = local.position;
      child.quaternion = local.quaternion;
      child.scale = local.scale;
    }
    return child;
  });

  nodes.splice(index, 1, ...promoted);
  return true;
}

/** Set a part leaf's local transform. */
export function setPartTransform(doc: SetDocument, partId: string, transform: Transform): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  const node = loc.nodes[loc.index];
  if (node.kind !== 'part') return false;
  node.part.position = transform.position;
  node.part.quaternion = transform.quaternion;
  node.part.scale = transform.scale;
  return true;
}

/** Set a part leaf's colour (and reset per-face colours to the uniform colour). */
export function setPartColor(doc: SetDocument, partId: string, color: number): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  const node = loc.nodes[loc.index];
  if (node.kind !== 'part') return false;
  node.part.color = color;
  node.part.faceColors = undefined; // reset per-face colours to the uniform colour
  return true;
}

/** Set a single draw group's colour. */
export function setFaceColor(doc: SetDocument, partId: string, materialIndex: number, color: number): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  const node = loc.nodes[loc.index];
  if (node.kind !== 'part') return false;
  const part = node.part;
  if (!part.faceColors || materialIndex < 0 || materialIndex >= part.faceColors.length) return false;
  part.faceColors[materialIndex] = color;
  return true;
}

/** Set (or clear, with null) a single draw group's texture data URL. */
export function setFaceTexture(doc: SetDocument, partId: string, materialIndex: number, dataUrl: string | null): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  const node = loc.nodes[loc.index];
  if (node.kind !== 'part') return false;
  const part = node.part;
  if (!part.faceTextures || materialIndex < 0 || materialIndex >= part.faceTextures.length) return false;
  part.faceTextures[materialIndex] = dataUrl;
  return true;
}

/** Set (or clear, with undefined) a part's semantic label. */
export function setPartLabel(doc: SetDocument, partId: string, label: string | undefined): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  const node = loc.nodes[loc.index];
  if (node.kind !== 'part') return false;
  if (label === undefined) delete node.part.label;
  else node.part.label = label;
  return true;
}

// ── Attach topology (joints, group nodes, durable bonds) ─────────────────────

/** The group node carrying `id`, searching nested groups. */
export function findGroupNodeById(nodes: SetNode[], id: string): Extract<SetNode, { kind: 'group' }> | null {
  for (const node of nodes) {
    if (node.kind !== 'group') continue;
    if (node.id === id) return node;
    const nested = findGroupNodeById(node.children, id);
    if (nested) return nested;
  }
  return null;
}

/**
 * The part ids of the group node that contains `partId` — the part itself when it
 * is ungrouped. An attach merge covers every member of both sides' groups.
 */
export function groupMembersOf(doc: SetDocument, partId: string): string[] {
  const group = findGroupOfPartId(doc, partId);
  if (!group) return [partId];
  const ids: string[] = [];
  const collect = (nodes: SetNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'part') ids.push(node.part.id);
      else collect(node.children);
    }
  };
  collect(group.children);
  return ids;
}

/** Append an attach joint to the document. */
export function addJoint(doc: SetDocument, joint: JointSnapshot): void {
  doc.joints.push(joint);
}

/** Remove every joint that touches `partId`. */
export function removeJointsTouching(doc: SetDocument, partId: string): void {
  doc.joints = doc.joints.filter((j) => j.partAId !== partId && j.partBId !== partId);
}

/** The durable group bonds, as plain arrays. */
export function groupBonds(doc: SetDocument): string[][] {
  return doc.groupComponents ?? [];
}

/**
 * Fold `partIds` — plus every bond that overlaps them — into one pure group bond.
 * Callers pass the full expanded member list, so grouping one member of an existing
 * group re-bonds the whole group.
 */
export function addGroupBond(doc: SetDocument, partIds: string[]): void {
  const members = new Set(partIds);
  const kept: string[][] = [];
  for (const bond of groupBonds(doc)) {
    if (bond.some((id) => members.has(id))) for (const id of bond) members.add(id);
    else kept.push(bond);
  }
  kept.push([...members]);
  doc.groupComponents = kept;
}

/** Drop the bond that contains `partId` — an explicit ungroup. */
export function removeGroupBondContaining(doc: SetDocument, partId: string): void {
  const kept = groupBonds(doc).filter((bond) => !bond.includes(partId));
  if (kept.length === 0) delete doc.groupComponents;
  else doc.groupComponents = kept;
}

/** Evict a deleted part from every bond, pruning bonds that shrink below two members. */
export function evictFromGroupBonds(doc: SetDocument, partId: string): void {
  const kept = groupBonds(doc)
    .map((bond) => bond.filter((id) => id !== partId))
    .filter((bond) => bond.length >= 2);
  if (kept.length === 0) delete doc.groupComponents;
  else doc.groupComponents = kept;
}

/**
 * Collapse `partIds` into one group node — an attach assembly, so it carries no
 * bond and dissolves when its last joint goes. Existing groups the members belong
 * to are dissolved first; world positions are preserved throughout.
 */
export function mergeIntoGroup(doc: SetDocument, partIds: string[], name?: string): boolean {
  if (partIds.length < 2) return false;
  for (const id of partIds) promoteToRoot(doc, id);
  return groupParts(doc, partIds, name, false);
}

/**
 * Rebuild group topology for `partIds` after joints were removed: parts still
 * connected by joints or by a durable bond reform as groups, the rest return to
 * the document root. A component that is one whole bond with no attach joint
 * inside it comes back as a pure group.
 */
export function rebuildGroups(doc: SetDocument, partIds: string[]): void {
  for (const id of partIds) promoteToRoot(doc, id);
  for (const component of connectedComponents(doc, partIds)) {
    if (component.length < 2) continue;
    const hasAttachJoint = doc.joints.some(
      (j) => component.includes(j.partAId) && component.includes(j.partBId),
    );
    const bonded = groupBonds(doc).some((bond) => component.every((id) => bond.includes(id)));
    groupParts(doc, component, undefined, !hasAttachJoint && bonded);
  }
}

/** Dissolve every group containing `partId`, promoting its members to the document root. */
function promoteToRoot(doc: SetDocument, partId: string): void {
  while (findGroupOfPart(doc.root, partId, IDENTITY_TRANSFORM)) ungroupPart(doc, partId);
}

/** Connected components of `partIds` over attach joints and durable bonds. */
function connectedComponents(doc: SetDocument, partIds: string[]): string[][] {
  const remaining = new Set(partIds);
  const visited = new Set<string>();
  const components: string[][] = [];
  for (const startId of remaining) {
    if (visited.has(startId)) continue;
    const component: string[] = [];
    const queue = [startId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      for (const joint of doc.joints) {
        if (joint.partAId === current && remaining.has(joint.partBId) && !visited.has(joint.partBId)) queue.push(joint.partBId);
        else if (joint.partBId === current && remaining.has(joint.partAId) && !visited.has(joint.partAId)) queue.push(joint.partAId);
      }
      for (const bond of groupBonds(doc)) {
        if (bond.includes(current)) {
          for (const id of bond) if (remaining.has(id) && !visited.has(id)) queue.push(id);
        }
      }
    }
    components.push(component);
  }
  return components;
}
