import type { JointSnapshot, PartDraft } from './types.js';
import type { DistributiveOmit, LightConfig } from '../domain/types.js';
import { slug } from './aiDraft.js';
import { IDENTITY_TRANSFORM, localToWorld, worldToLocal } from './transform.js';
import type { Transform } from './transform.js';

/**
 * The tree-shaped set document — the persistent form of a set. One node type is used
 * fractally: a part leaf carries `content`, a group nests `children`, and every node
 * owns its local `transform`, so leaves and groups are walked, realised and written
 * back the same way. The runtime holds a `SetDocument` and rebuilds the scene from it
 * (`CartoonSketcher`), so this module owns every structural edit: parts, groups,
 * attach joints and the durable group bonds.
 *
 * Node `id`s are parent-unique name segments — the "stable path segment" of
 * set-staging-architecture.md. A part leaf keeps its runtime guid (`content.id`), so
 * mesh identity survives a re-derivation, while the node id adds the segment for path
 * addressing (`group-id/part-id`).
 */
export type NodeRole = 'prop' | 'structure' | 'light';

export type SetNode = {
  id: string;
  role: NodeRole;
  /** Local, relative to the parent node (world at the document root). */
  transform: Transform;
  /** Child nodes; empty on a leaf. */
  children: SetNode[];
  /** A `prop` leaf's body. */
  content?: PartDraft;
  /**
   * A `light` node's configuration. The node id *is* the light id and the node
   * transform *is* its position, so neither is repeated here; a spot's `target` stays,
   * being a second point rather than the node's own placement.
   */
  light?: LightBody;
  /** A group's semantic name. */
  name?: string;
  /** `true` for a pure group; absent or `false` for an attach assembly. */
  isGroup?: boolean;
};

/** A light's payload: its config minus the identity and placement the node owns. */
export type LightBody = DistributiveOmit<LightConfig, 'id' | 'position'>;

/** A part leaf. `normalizeDocument()` guarantees a `prop` node carries `content`. */
export type PartNode = SetNode & { role: 'prop'; content: PartDraft };

/** A part before it is a node: its body plus the transform it will own. */
export type PartSeed = { content: PartDraft; transform?: Transform };

/** A part leaf's body and transform, both present — what `collectPartNodes` yields. */
export type PlacedPart = { content: PartDraft; transform: Transform };

/** True when `node` is a part leaf rather than a group or a light. */
export function isPartNode(node: SetNode): node is PartNode {
  return node.role === 'prop' && node.content !== undefined;
}

/** True when `node` is a light. */
export function isLightNode(node: SetNode): node is SetNode & { role: 'light'; light: LightBody } {
  return node.role === 'light' && node.light !== undefined;
}

/** A node transform, detached from any shared default. */
function nodeTransform(t: Transform | undefined): Transform {
  const source = t ?? IDENTITY_TRANSFORM;
  return { position: [...source.position], quaternion: [...source.quaternion], scale: [...source.scale] };
}

export type SetDocument = {
  root: SetNode[];
  joints: JointSnapshot[];
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
  return { root: [], joints: [] };
}

/** A detached copy of a document — snapshots and loads never alias live state. */
export function cloneDocument(doc: SetDocument): SetDocument {
  return JSON.parse(JSON.stringify(doc)) as SetDocument;
}

/**
 * The load-time guard for a document of unknown provenance: fill in what may be missing
 * (`children`, `transform`), drop what cannot be read, and report what changed. There is
 * no version field to bump — a document that predates this shape is abandoned rather
 * than migrated — so this is where a stale file is caught instead of silently rendering
 * its parts at the origin.
 */
export function normalizeDocument(input: unknown): SetDocument {
  if (typeof input !== 'object' || input === null) {
    console.warn('normalizeDocument: not a document — ignoring');
    return emptyDocument();
  }
  const source = input as Partial<SetDocument>;
  const issues: string[] = [];
  const doc: SetDocument = {
    root: normalizeNodes(Array.isArray(source.root) ? source.root : [], 'root', issues),
    joints: Array.isArray(source.joints) ? source.joints : [],
  };
  if (source.environmentMap !== undefined) doc.environmentMap = source.environmentMap;
  if (source.groupComponents !== undefined) doc.groupComponents = source.groupComponents;
  if (issues.length > 0) console.warn(`normalizeDocument: ${issues.join('; ')}`);
  return doc;
}

function normalizeNodes(nodes: unknown[], path: string, issues: string[]): SetNode[] {
  const out: SetNode[] = [];
  nodes.forEach((raw, i) => {
    const node = normalizeNode(raw, `${path}[${i}]`, issues);
    if (node) out.push(node);
  });
  return out;
}

function normalizeNode(raw: unknown, path: string, issues: string[]): SetNode | null {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(`${path} is not a node`);
    return null;
  }
  const n = raw as Partial<SetNode>;
  if (typeof n.id !== 'string' || n.id === '') {
    issues.push(`${path} has no id`);
    return null;
  }
  if (n.role !== 'prop' && n.role !== 'structure' && n.role !== 'light') {
    issues.push(`${path} (${n.id}) has unknown role "${String(n.role)}"`);
    return null;
  }
  if (n.role === 'prop' && (typeof n.content !== 'object' || n.content === null)) {
    issues.push(`${path} (${n.id}) is a prop with no content`);
    return null;
  }
  if (n.role === 'light' && (typeof n.light !== 'object' || n.light === null)) {
    issues.push(`${path} (${n.id}) is a light with no configuration`);
    return null;
  }
  return {
    id: n.id,
    role: n.role,
    transform: nodeTransform(n.transform),
    children: normalizeNodes(Array.isArray(n.children) ? n.children : [], `${path}.children`, issues),
    ...(n.content !== undefined ? { content: n.content } : {}),
    ...(n.light !== undefined ? { light: n.light } : {}),
    ...(n.name !== undefined ? { name: n.name } : {}),
    ...(n.isGroup !== undefined ? { isGroup: n.isGroup } : {}),
  };
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
  return collectPartNodes(doc).length;
}

/** Every part leaf in the document, in tree order — node form, transform included. */
export function collectPartNodes(doc: SetDocument): PartNode[] {
  return collectPartNodesIn(doc.root);
}

/** Every part leaf under `nodes`, in tree order. */
export function collectPartNodesIn(nodes: SetNode[]): PartNode[] {
  const parts: PartNode[] = [];
  const walk = (list: SetNode[]) => {
    for (const node of list) {
      if (isPartNode(node)) parts.push(node);
      else walk(node.children);
    }
  };
  walk(nodes);
  return parts;
}

/** Every part leaf's body, in tree order. */
export function collectParts(doc: SetDocument): PartDraft[] {
  return collectPartNodes(doc).map((node) => node.content);
}

/**
 * Build a document from a flat list of part seeds — the bundled library's authoring
 * form. Node ids are the same parent-unique name segments `insertPart` assigns, so a
 * hand-written definition and an edited one address their nodes identically.
 */
export function documentFromParts(seeds: PartSeed[]): SetDocument {
  const doc: SetDocument = { root: [], joints: [] };
  for (const seed of seeds) insertPart(doc, seed);
  return doc;
}

function segmentsOf(nodes: SetNode[]): Set<string> {
  return new Set(nodes.map((n) => n.id));
}

/** Where a node sits: its sibling array, index, the parent's world transform and its path. */
type NodeLocation = {
  node: SetNode;
  nodes: SetNode[];
  index: number;
  parent: Transform;
  /** Node ids from the root, joined with '/' — unique within a document. */
  path: string;
};

function locate(
  nodes: SetNode[],
  match: (node: SetNode, path: string) => boolean,
  parent: Transform,
  prefix: string,
): NodeLocation | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const path = prefix ? `${prefix}/${node.id}` : node.id;
    if (match(node, path)) return { node, nodes, index: i, parent, path };
    const found = locate(node.children, match, localToWorld(node.transform, parent), path);
    if (found) return found;
  }
  return null;
}

/**
 * Locate a node by its path (`row-2/chair-3`) or, for a part, by its runtime guid.
 * Node ids are only parent-unique, so the path is what addresses a node unambiguously;
 * a part's guid is what the runtime knows it by.
 */
function findNodeLocation(doc: SetDocument, target: string): NodeLocation | null {
  return locate(doc.root, (node, path) => path === target || (isPartNode(node) && node.content.id === target), IDENTITY_TRANSFORM, '');
}

/** Locate `node` itself — by identity, so an edit's own re-parenting cannot invalidate it. */
function findNodeLocationOf(doc: SetDocument, node: SetNode): NodeLocation | null {
  return locate(doc.root, (candidate) => candidate === node, IDENTITY_TRANSFORM, '');
}

/** A node given by path, by part guid, or as the node itself — the forms an op accepts. */
export type NodeRef = string | SetNode;

function locationOf(doc: SetDocument, ref: NodeRef): NodeLocation | null {
  return typeof ref === 'string' ? findNodeLocation(doc, ref) : findNodeLocationOf(doc, ref);
}

/** The path of `node` in a document, or null when it is not in this document. */
export function pathOfNode(doc: SetDocument, node: SetNode): string | null {
  return findNodeLocationOf(doc, node)?.path ?? null;
}

/** The node a path or part guid names, or null. */
export function nodeAt(doc: SetDocument, target: string): SetNode | null {
  return findNodeLocation(doc, target)?.node ?? null;
}

/** The path of the part carrying `partId`, or null. Node ids are only parent-unique, so a
 *  part is addressed by path once nesting makes its segment ambiguous. */
export function pathOfPart(doc: SetDocument, partId: string): string | null {
  return findNodeLocation(doc, partId)?.path ?? null;
}

/** The part leaf carrying `partId`, or null. */
function findPartNode(doc: SetDocument, partId: string): PartNode | null {
  const loc = findNodeLocation(doc, partId);
  return loc && isPartNode(loc.node) ? loc.node : null;
}

/**
 * Locate the group whose *direct* children include `node` — by identity, so dissolving a
 * group mid-walk cannot invalidate the search the way a path would.
 */
function findGroupOfNode(nodes: SetNode[], node: SetNode, parent: Transform, prefix: string): NodeLocation | null {
  for (let i = 0; i < nodes.length; i++) {
    const candidate = nodes[i];
    if (candidate.role !== 'structure') continue;
    const path = prefix ? `${prefix}/${candidate.id}` : candidate.id;
    if (candidate.children.includes(node)) return { node: candidate, nodes, index: i, parent, path };
    const nested = findGroupOfNode(candidate.children, node, localToWorld(candidate.transform, parent), path);
    if (nested) return nested;
  }
  return null;
}

/** True when `ancestor` is one of the groups holding `node`, at any depth. */
function isInside(doc: SetDocument, node: SetNode, ancestor: SetNode): boolean {
  let containing = findGroupOfNode(doc.root, node, IDENTITY_TRANSFORM, '');
  while (containing) {
    if (containing.node === ancestor) return true;
    containing = findGroupOfNode(doc.root, containing.node, IDENTITY_TRANSFORM, '');
  }
  return false;
}

/** The group node that directly contains the part `partId`, or null. */
export function findGroupOfPartId(doc: SetDocument, partId: string): SetNode | null {
  const loc = findNodeLocation(doc, partId);
  if (!loc) return null;
  return findGroupOfNode(doc.root, loc.node, IDENTITY_TRANSFORM, '')?.node ?? null;
}

/** The group node at `path`, or null. */
export function findGroupByPath(doc: SetDocument, path: string): SetNode | null {
  const loc = findNodeLocation(doc, path);
  return loc && loc.node.role === 'structure' ? loc.node : null;
}

/** Add a part leaf to the document root. */
export function insertPart(doc: SetDocument, seed: PartSeed): void {
  const { content } = seed;
  doc.root.push({
    id: nameSegment(content.label ?? content.name, segmentsOf(doc.root)),
    role: 'prop',
    transform: nodeTransform(seed.transform),
    children: [],
    content,
  });
}

/** Remove a part leaf (by guid) from the tree. */
export function removePart(doc: SetDocument, partId: string): boolean {
  const loc = findNodeLocation(doc, partId);
  if (!loc || !isPartNode(loc.node)) return false;
  loc.nodes.splice(loc.index, 1);
  return true;
}

/**
 * Wrap sibling nodes into a new group placed at their world centroid, preserving world
 * positions. A member is a node path, a part's runtime guid, or the node itself — so a member
 * may be a part leaf or a whole group, which is what makes a group-of-groups. Members must be
 * siblings: the new group nests into the array they already share.
 *
 * `isGroup` distinguishes a pure group (true) from an attach assembly (false), which is
 * bond-backed only when the group is a whole `groupComponents` entry. Returns the new group
 * node, or null when the members are not siblings (nothing is changed on that path).
 */
export function groupNodes(doc: SetDocument, members: NodeRef[], name?: string, isGroup?: boolean): SetNode | null {
  if (members.length === 0) return null;

  const locations: NodeLocation[] = [];
  for (const member of members) {
    const loc = locationOf(doc, member);
    if (!loc) return null;
    locations.push(loc);
  }
  // A node cannot be grouped with its own ancestor: keep the innermost of such a pair, or the
  // request would dissolve the ancestor on its way to a common sibling array. A request that
  // collapses to a single node is refused, there being nothing to group.
  const kept = locations.filter(
    (loc) => !locations.some((other) => other !== loc && isInside(doc, loc.node, other.node)),
  );
  if (kept.length < locations.length && kept.length < 2) return null;

  const siblings = kept[0].nodes;
  if (!kept.every((loc) => loc.nodes === siblings)) return null; // members must be siblings

  const placed = kept.map((loc) => ({ loc, world: localToWorld(loc.node.transform, loc.parent) }));
  const centroid: [number, number, number] = [0, 0, 0];
  for (const m of placed) {
    centroid[0] += m.world.position[0];
    centroid[1] += m.world.position[1];
    centroid[2] += m.world.position[2];
  }
  centroid[0] /= placed.length;
  centroid[1] /= placed.length;
  centroid[2] /= placed.length;
  const groupT: Transform = { position: centroid, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  const ascending = [...placed].sort((a, b) => a.loc.index - b.loc.index);
  const insertAt = ascending[0].loc.index;
  for (const m of ascending) m.loc.node.transform = worldToLocal(m.world, groupT);
  for (const m of [...ascending].reverse()) siblings.splice(m.loc.index, 1);

  const groupNode: SetNode = {
    id: nameSegment(name ?? 'group', segmentsOf(siblings)),
    role: 'structure',
    transform: groupT,
    children: ascending.map((m) => m.loc.node),
    ...(name !== undefined ? { name } : {}),
    ...(isGroup !== undefined ? { isGroup } : {}),
  };
  siblings.splice(insertAt, 0, groupNode);
  return groupNode;
}

/**
 * Dissolve a group, promoting its children into its parent — the document root only when it
 * sat there. `target` is a node path or a part's guid: the group *at* that target when the
 * target is itself a group, otherwise the group that directly contains it.
 */
export function ungroupNode(doc: SetDocument, target: string): boolean {
  const loc = findNodeLocation(doc, target);
  if (!loc) return false;
  const group = loc.node.role === 'structure'
    ? loc
    : findGroupOfNode(doc.root, loc.node, IDENTITY_TRANSFORM, '');
  if (!group) return false;
  dissolveGroup(group);
  return true;
}

/** Promote a group's children into its parent, preserving world positions. */
function dissolveGroup(group: NodeLocation): void {
  const groupWorld = localToWorld(group.node.transform, group.parent);
  // Every node kind carries its own transform, so promotion is one line each — the
  // uniformity the node hoist buys.
  const promoted: SetNode[] = group.node.children.map((child) => {
    child.transform = worldToLocal(localToWorld(child.transform, groupWorld), group.parent);
    return child;
  });
  group.nodes.splice(group.index, 1, ...promoted);
}

/** Set a part leaf's local transform. */
export function setPartTransform(doc: SetDocument, partId: string, transform: Transform): boolean {
  const node = findPartNode(doc, partId);
  if (!node) return false;
  node.transform = transform;
  return true;
}

/** Set a part leaf's colour (and reset per-face colours to the uniform colour). */
export function setPartColor(doc: SetDocument, partId: string, color: number): boolean {
  const node = findPartNode(doc, partId);
  if (!node) return false;
  node.content.color = color;
  node.content.faceColors = undefined; // reset per-face colours to the uniform colour
  return true;
}

/** Set a single draw group's colour. */
export function setFaceColor(doc: SetDocument, partId: string, materialIndex: number, color: number): boolean {
  const node = findPartNode(doc, partId);
  if (!node) return false;
  const part = node.content;
  if (!part.faceColors || materialIndex < 0 || materialIndex >= part.faceColors.length) return false;
  part.faceColors[materialIndex] = color;
  return true;
}

/** Set (or clear, with null) a single draw group's texture data URL. */
export function setFaceTexture(doc: SetDocument, partId: string, materialIndex: number, dataUrl: string | null): boolean {
  const node = findPartNode(doc, partId);
  if (!node) return false;
  const part = node.content;
  if (!part.faceTextures || materialIndex < 0 || materialIndex >= part.faceTextures.length) return false;
  part.faceTextures[materialIndex] = dataUrl;
  return true;
}

/** Set (or clear, with undefined) a part's semantic label. */
export function setPartLabel(doc: SetDocument, partId: string, label: string | undefined): boolean {
  const node = findPartNode(doc, partId);
  if (!node) return false;
  if (label === undefined) delete node.content.label;
  else node.content.label = label;
  return true;
}

// ── Lights ───────────────────────────────────────────────────────────────────

/** `wanted` if free among `nodes`, else `wanted-2`, `wanted-3`, … */
function uniqueNodeId(wanted: string, nodes: SetNode[]): string {
  const taken = segmentsOf(nodes);
  if (!taken.has(wanted)) return wanted;
  let i = 2;
  while (taken.has(`${wanted}-${i}`)) i++;
  return `${wanted}-${i}`;
}

/**
 * Add a light at the document root — a node like any other, so it undoes and
 * round-trips with the set. The config's `id` becomes the node id and its `position`
 * becomes the node transform.
 */
export function addLightNode(doc: SetDocument, config: LightConfig): void {
  const { id: wanted, position, ...light } = config;
  doc.root.push({
    id: uniqueNodeId(wanted || 'light', doc.root),
    role: 'light',
    transform: { position: position ?? [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    children: [],
    light,
  });
}

function findLightLocation(nodes: SetNode[], id: string): { nodes: SetNode[]; index: number } | null {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (node.role === 'light' && node.id === id) return { nodes, index: i };
    const nested = findLightLocation(node.children, id);
    if (nested) return nested;
  }
  return null;
}

/** Remove the light node carrying `id`, searching nested nodes. */
export function removeLightNode(doc: SetDocument, id: string): boolean {
  const loc = findLightLocation(doc.root, id);
  if (!loc) return false;
  loc.nodes.splice(loc.index, 1);
  return true;
}

/**
 * The document's lights in the renderer's shape, in tree order. Identity and position
 * come back from the node, which owns them.
 */
export function collectLights(doc: SetDocument): LightConfig[] {
  const lights: LightConfig[] = [];
  const walk = (nodes: SetNode[]) => {
    for (const node of nodes) {
      if (isLightNode(node)) {
        lights.push({ ...node.light, id: node.id, position: node.transform.position } as LightConfig);
      }
      walk(node.children);
    }
  };
  walk(doc.root);
  return lights;
}

// ── Attach topology (joints, group nodes, durable bonds) ─────────────────────



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
      if (isPartNode(node)) ids.push(node.content.id);
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
  for (const id of partIds) {
    const node = nodeAt(doc, id);
    if (node) promoteToRoot(doc, node);
  }
  return groupNodes(doc, partIds, name, false) !== null;
}

/**
 * Rebuild group topology for `partIds` after joints were removed: parts still
 * connected by joints or by a durable bond reform as groups, the rest return to
 * the document root. A component that is one whole bond with no attach joint
 * inside it comes back as a pure group.
 */
export function rebuildGroups(doc: SetDocument, partIds: string[]): void {
  for (const id of partIds) {
    const node = nodeAt(doc, id);
    if (node) promoteToRoot(doc, node);
  }
  for (const component of connectedComponents(doc, partIds)) {
    if (component.length < 2) continue;
    const hasAttachJoint = doc.joints.some(
      (j) => component.includes(j.partAId) && component.includes(j.partBId),
    );
    const bonded = groupBonds(doc).some((bond) => component.every((id) => bond.includes(id)));
    groupNodes(doc, component, undefined, !hasAttachJoint && bonded);
  }
}

/**
 * Dissolve every group containing `node`, promoting it to the document root. By identity, so
 * the caller can hold the node across the edits this makes.
 */
export function promoteToRoot(doc: SetDocument, node: SetNode): void {
  let containing = findGroupOfNode(doc.root, node, IDENTITY_TRANSFORM, '');
  while (containing) {
    dissolveGroup(containing);
    containing = findGroupOfNode(doc.root, node, IDENTITY_TRANSFORM, '');
  }
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
