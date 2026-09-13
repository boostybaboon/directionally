import type { GroupSnapshot, JointSnapshot, PartDraft, PartSnapshot, SketcherDraft } from './types.js';
import type { LightConfig } from '../domain/types.js';
import { slug } from './aiDraft.js';
import { IDENTITY_TRANSFORM, localToWorld, worldToLocal } from './transform.js';
import type { Transform } from './transform.js';

/**
 * The tree-shaped set document — the increment-2 target. A `part` is a leaf; a
 * `group` nests children. This module converts between the flat `SketcherDraft`
 * (still the canonical persisted form today) and the tree, so the runtime can
 * migrate to the tree without a lossy jump.
 *
 * Node `id`s are parent-unique name segments — the "stable path segment" of
 * set-staging-architecture.md. The flat draft's `part.id` guid stays as the runtime
 * identity (preserved on the `part` leaf), while the tree adds the segment for
 * path addressing (`group-id/part-id`).
 */
export type SetNode =
  | { kind: 'part'; id: string; part: PartDraft }
  | { kind: 'group'; id: string; name?: string; isGroup?: boolean; position?: [number, number, number]; quaternion?: [number, number, number, number]; scale?: [number, number, number]; children: SetNode[] };

export type SetDocument = {
  version: 2;
  root: SetNode[];
  joints: JointSnapshot[];
  lights?: LightConfig[];
  environmentMap?: string;
};

/**
 * Tree-shaped undo snapshot — the same tree shape as `SetDocument`, but leaves are
 * lightweight `PartSnapshot`s (live meshes are reused on restore, so geometry and
 * object identity persist), and it carries the durable group-bond topology
 * (`groupComponents`) that the draft intentionally omits.
 */
export type SetSnapshotNode =
  | { kind: 'part'; part: PartSnapshot }
  | { kind: 'group'; name?: string; isGroup?: boolean; position?: [number, number, number]; quaternion?: [number, number, number, number]; scale?: [number, number, number]; children: SetSnapshotNode[] };

export type SetSnapshot = {
  root: SetSnapshotNode[];
  joints: JointSnapshot[];
  /**
   * Durable group bond components: each entry is the set of part IDs that form
   * one group unit. Unlike groups, these survive attach merges — when an attach
   * op collapses a group into a larger assembly, the bond topology is
   * preserved here so that detaching restores the group correctly.
   */
  groupComponents?: string[][];
};

/** Assign a parent-unique name segment for `wanted`, deduping against `taken`. */
function nameSegment(wanted: string, taken: Set<string>): string {
  const base = slug(wanted);
  let candidate = base;
  let i = 2;
  while (taken.has(candidate)) candidate = `${base}-${i++}`;
  taken.add(candidate);
  return candidate;
}

/** Group each part under its owning group; ungrouped parts become root nodes. Node `id`s are parent-unique name segments. */
export function draftToDocument(draft: SketcherDraft): SetDocument {
  const groups = draft.groups ?? [];
  const groupOfPart = new Map<string, number>();
  groups.forEach((g, i) => {
    for (const pid of g.partIds) groupOfPart.set(pid, i);
  });

  // Name segments are unique among siblings: root nodes share one set, each group has its own.
  const rootTaken = new Set<string>();
  const groupTaken = groups.map(() => new Set<string>());

  // Root parts first (matching the final root order), then group members.
  const root: SetNode[] = [];
  const groupChildren: SetNode[][] = groups.map(() => []);
  for (const pd of draft.parts) {
    const gi = groupOfPart.get(pd.id);
    const taken = gi === undefined ? rootTaken : groupTaken[gi];
    const node: SetNode = { kind: 'part', id: nameSegment(pd.label ?? pd.name, taken), part: pd };
    if (gi === undefined) root.push(node);
    else groupChildren[gi].push(node);
  }

  const groupNodes: SetNode[] = groups.map((g, i) => ({
    kind: 'group' as const,
    id: nameSegment(g.name ?? 'group', rootTaken),
    ...(g.name !== undefined ? { name: g.name } : {}),
    ...(g.isGroup !== undefined ? { isGroup: g.isGroup } : {}),
    ...(g.position !== undefined ? { position: g.position } : {}),
    ...(g.quaternion !== undefined ? { quaternion: g.quaternion } : {}),
    ...(g.scale !== undefined ? { scale: g.scale } : {}),
    children: groupChildren[i],
  }));

  return {
    version: 2,
    root: [...root, ...groupNodes],
    joints: draft.joints,
    ...(draft.lights !== undefined ? { lights: draft.lights } : {}),
    ...(draft.environmentMap !== undefined ? { environmentMap: draft.environmentMap } : {}),
  };
}

/** Rebuild the flat draft from the tree (group members flattened back into `groups`). */
export function documentToDraft(doc: SetDocument): SketcherDraft {
  const parts: PartDraft[] = [];
  const groups: GroupSnapshot[] = [];

  const walk = (nodes: SetNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'part') {
        parts.push(node.part);
      } else {
        const partIds: string[] = [];
        const collect = (n: SetNode) => {
          if (n.kind === 'part') {
            partIds.push(n.part.id);
            parts.push(n.part);
          } else {
            n.children.forEach(collect);
          }
        };
        node.children.forEach(collect);
        groups.push({
          partIds,
          ...(node.name !== undefined ? { name: node.name } : {}),
          ...(node.position !== undefined ? { position: node.position } : {}),
          ...(node.quaternion !== undefined ? { quaternion: node.quaternion } : {}),
          ...(node.scale !== undefined ? { scale: node.scale } : {}),
          ...(node.isGroup !== undefined ? { isGroup: node.isGroup } : {}),
        });
      }
    }
  };
  walk(doc.root);

  return {
    version: 2,
    parts,
    joints: doc.joints,
    ...(groups.length > 0 ? { groups } : {}),
    ...(doc.lights !== undefined ? { lights: doc.lights } : {}),
    ...(doc.environmentMap !== undefined ? { environmentMap: doc.environmentMap } : {}),
  };
}

// ── Tree mutation operations (the live model's edit surface) ─────────────────

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

/** Add a part leaf to the document root. */
export function insertPart(doc: SetDocument, part: PartDraft): void {
  doc.root.push({ kind: 'part', id: nameSegment(part.label ?? part.name, segmentsOf(doc.root)), part });
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
 */
export function groupParts(doc: SetDocument, partIds: string[], name?: string): boolean {
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
    ...(name !== undefined ? { name } : {}),
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

/** Set a part leaf's colour. */
export function setPartColor(doc: SetDocument, partId: string, color: number): boolean {
  const loc = findPartLocation(doc.root, partId, IDENTITY_TRANSFORM);
  if (!loc) return false;
  const node = loc.nodes[loc.index];
  if (node.kind !== 'part') return false;
  node.part.color = color;
  return true;
}
