import type { CartoonSketcher } from './CartoonSketcher.js';
import type { LightConfig } from '../domain/types.js';
import type { SketcherCommand } from './SketcherCommand.js';
import { collectLights, isPartNode, isRefNode, sameOrder } from './documentTree.js';
import { fromAIDraft } from './aiDraft.js';
import type { AIDraft } from './aiDraft.js';
import type { NodeOverride, PlacedPart, RefNode, RefSeed, SetDocument, SetNode } from './documentTree.js';
import { IDENTITY_TRANSFORM, localToWorld } from './transform.js';
import type { Transform } from './transform.js';

/**
 * applyDraft — the app-side id-diff + apply step of an AI edit (ROADMAP_API.md
 * P0). The AI returns a whole new document; this diffs it against the live
 * session's document by stable part id and applies only what changed, as one
 * undoable command.
 *
 * v1 applies primitives only for *added* parts; unchanged sketch/lathe parts are
 * left untouched by the diff (same id + same data → no-op).
 *
 * Every transform here is **world**, like the AI Draft's, not local: what the AI means by a part's
 * transform is where the part stands, and a node's local transform depends on which group it happens
 * to sit in. Comparing worlds is also what makes a member that moves between groups read as
 * "unchanged", and placing at world before the group pass is what lets the pass wrap nodes without
 * moving any of them.
 */

export type DocumentDiff = {
  add: PlacedPart[];
  remove: string[];
  update: PlacedPart[];
  /** Instances the edit places, as node seeds (the seed carries the node's id). */
  addRefs: RefSeed[];
  /** Instances the edit drops, by node id. */
  removeRefs: string[];
  /** Instances the edit moves, by node id — a placement the AI changed. */
  moveRefs: { id: string; transform: Transform }[];
  /**
   * Instances whose dressing changed, whole rather than per path: a set override is what the edit wants
   * the instance to say, and an empty list means the instance now varies nothing.
   */
  overrideRefs: { id: string; overrides: NodeOverride[] }[];
  /** How the edit rearranges groups, which is a separate pass from what it adds or moves. */
  groups: GroupStructureDiff;
  /**
   * Lights, which a draft carries flat and a document holds as nodes: the diff compares them by id so
   * a light that only changed intensity is updated rather than replaced, keeping its place in the list.
   */
  lights: { add: LightConfig[]; remove: string[]; update: LightConfig[] };
  /** The environment, present only when the edit changes it — `id` undefined means cleared. */
  environment?: { id?: string };
  /**
   * Whether the edit rearranges nodes within their parents. Order was the one thing the diff ignored,
   * which meant a reordered draft was reported as no change at all and then dropped on apply.
   */
  orderChanged: boolean;
};

/** Whether two dressing lists say the same thing: same paths, same ops, same values. */
function sameOverrides(a: NodeOverride[], b: NodeOverride[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((left, i) => {
    const right = b[i];
    if (left.path !== right.path || left.op !== right.op) return false;
    const leftValue = left.op === 'set' ? left.value : null;
    const rightValue = right.op === 'set' ? right.value : null;
    return JSON.stringify(leftValue) === JSON.stringify(rightValue);
  });
}

/** Whether two light configs say the same thing, key by key (position compared as a value). */
function sameLight(a: LightConfig, b: LightConfig): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const av = (a as Record<string, unknown>)[key];
    const bv = (b as Record<string, unknown>)[key];
    if (JSON.stringify(av) !== JSON.stringify(bv)) return false;
  }
  return true;
}

/**
 * A group the edit adds, and the nodes that go into it — members the document does not hold yet are
 * left out here, since the pass runs after the adds.
 */
export type NewGroup = { name?: string; members: string[] };

/**
 * Group structure as a diff: which groups appear, which go, and which stay while their membership
 * changes. Members are part guids and instance node ids — the two things the AI Draft addresses
 * nodes by — because groups are the one part of the grammar that is about arrangement rather than
 * bodies.
 */
export type GroupStructureDiff = {
  create: NewGroup[];
  dissolve: string[];
  join: { group: string; members: string[] }[];
  leave: { group: string; members: string[] }[];
};

const EPS = 1e-6;

function vecEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return false;
  return true;
}

function transformEquals(a: Transform, b: Transform): boolean {
  return vecEquals(a.position, b.position)
    && vecEquals(a.quaternion, b.quaternion)
    && vecEquals(a.scale, b.scale);
}

function partEquals(a: PlacedPart, b: PlacedPart): boolean {
  const ac = a.content;
  const bc = b.content;
  return ac.kind === bc.kind
    && ac.name === bc.name
    && (ac.label ?? null) === (bc.label ?? null)
    && ac.color === bc.color
    && transformEquals(a.transform, b.transform);
}

/** Every part leaf as a body + world transform, in tree order — the form the AI Draft speaks. */
function placedParts(doc: SetDocument): PlacedPart[] {
  const parts: PlacedPart[] = [];
  const walk = (nodes: SetNode[], parent: Transform): void => {
    for (const node of nodes) {
      if (isPartNode(node)) parts.push({ content: node.content, transform: localToWorld(node.transform, parent) });
      else walk(node.children, localToWorld(node.transform, parent));
    }
  };
  walk(doc.root, IDENTITY_TRANSFORM);
  return parts;
}

/**
 * The document's *pure* groups, by node id. An attach assembly (`isGroup` unset) is a constraint the
 * sketcher made — joints and bonds hold it together — so it is not the AI's to rearrange, and the
 * pass below leaves it alone.
 */
function pureGroups(doc: SetDocument): Map<string, SetNode> {
  const found = new Map<string, SetNode>();
  const walk = (nodes: SetNode[]) => {
    for (const node of nodes) {
      if (node.role === 'structure' && node.isGroup === true) found.set(node.id, node);
      walk(node.children);
    }
  };
  walk(doc.root);
  return found;
}

/** The members a group holds at any depth, in the terms the AI addresses them: part guids, instance ids. */
function membersOf(group: SetNode): string[] {
  const ids: string[] = [];
  const walk = (nodes: SetNode[]) => {
    for (const node of nodes) {
      if (isPartNode(node)) ids.push(node.content.id);
      else if (isRefNode(node)) ids.push(node.id);
      walk(node.children);
    }
  };
  walk(group.children);
  return ids;
}

/**
 * Diff group structure. Membership is compared as *what a group holds*, not as its direct children:
 * the AI's grammar is flat, so a member that lives inside a group of its own reads the same as a
 * direct child, and re-parenting it would rearrange a tree the AI never saw.
 */
function groupStructure(current: SetDocument, target: SetDocument): GroupStructureDiff {
  const currentGroups = pureGroups(current);
  const targetGroups = pureGroups(target);
  const create: NewGroup[] = [];
  const dissolve: string[] = [];
  const join: { group: string; members: string[] }[] = [];
  const leave: { group: string; members: string[] }[] = [];

  for (const [id, group] of targetGroups) {
    const wanted = new Set(membersOf(group));
    const existing = currentGroups.get(id);
    if (!existing) {
      create.push({ ...(group.name !== undefined ? { name: group.name } : {}), members: [...wanted] });
      continue;
    }
    const held = new Set(membersOf(existing));
    const joiners = [...wanted].filter((member) => !held.has(member));
    const leavers = [...held].filter((member) => !wanted.has(member));
    if (joiners.length > 0) join.push({ group: id, members: joiners });
    if (leavers.length > 0) leave.push({ group: id, members: leavers });
  }
  for (const id of currentGroups.keys()) {
    if (!targetGroups.has(id)) dissolve.push(id);
  }

  return { create, dissolve, join, leave };
}

/**
 * Every instance in the document, by node id, with the world transform it stands at. A `ref` node
 * has no body to compare, so it is diffed by node instead: the placement and the reference *are* the
 * node, and its internals belong to the Definition. Node ids are what survives an AI round trip
 * (`toAIDraft` re-derives them from the same names), which is what makes an instance addressable at
 * all.
 */
function instances(doc: SetDocument): Map<string, { node: RefNode; world: Transform }> {
  const found = new Map<string, { node: RefNode; world: Transform }>();
  const walk = (nodes: SetNode[], parent: Transform): void => {
    for (const node of nodes) {
      const world = localToWorld(node.transform, parent);
      if (isRefNode(node)) found.set(node.id, { node, world });
      walk(node.children, world);
    }
  };
  walk(doc.root, IDENTITY_TRANSFORM);
  return found;
}

/** Diff two documents by stable id — part leaves by part id, instances by node id.
 *  Pure — no Three.js runtime. */
/** The tree diff: everything except the lights and the environment, which diff by identity below. */
function diffParts(current: SetDocument, target: SetDocument): Omit<DocumentDiff, 'lights' | 'environment' | 'orderChanged'> {
  const currentById = new Map(placedParts(current).map((p) => [p.content.id, p]));
  const targetById = new Map(placedParts(target).map((p) => [p.content.id, p]));
  const add: PlacedPart[] = [];
  const update: PlacedPart[] = [];
  const remove: string[] = [];

  for (const t of targetById.values()) {
    const c = currentById.get(t.content.id);
    if (!c) add.push(t);
    else if (!partEquals(c, t)) update.push(t);
  }
  for (const c of currentById.values()) {
    if (!targetById.has(c.content.id)) remove.push(c.content.id);
  }

  const currentRefs = instances(current);
  const targetRefs = instances(target);
  const addRefs: RefSeed[] = [];
  const removeRefs: string[] = [];
  const moveRefs: { id: string; transform: Transform }[] = [];
  const overrideRefs: { id: string; overrides: NodeOverride[] }[] = [];

  for (const [id, { node, world }] of targetRefs) {
    const before = currentRefs.get(id);
    // A node the AI re-pointed at another Definition is a replacement: drop it, place the new
    // one. Keeping the id is deliberate — it is one node in the tree either way.
    if (!before || before.node.ref !== node.ref) {
      if (before) removeRefs.push(id);
      addRefs.push({
        id, ref: node.ref, name: node.name, transform: world,
        ...(node.overrides && node.overrides.length > 0 ? { overrides: node.overrides } : {}),
      });
      continue;
    }
    if (!transformEquals(before.world, world)) moveRefs.push({ id, transform: world });
    // A dressing is part of what an instance is, so a change to it is an edit like any other — which
    // it was not, and an instruction about dressing produced no diff at all because of it.
    if (!sameOverrides(before.node.overrides ?? [], node.overrides ?? [])) {
      overrideRefs.push({ id, overrides: node.overrides ?? [] });
    }
  }
  for (const id of currentRefs.keys()) {
    if (!targetRefs.has(id)) removeRefs.push(id);
  }

  return { add, remove, update, addRefs, removeRefs, moveRefs, overrideRefs, groups: groupStructure(current, target) };
}

/**
 * Lights and the environment, diffed the way the rest is: by identity, so a light that changed only its
 * intensity is an update rather than a removal and an addition — which is what keeps its place in the
 * list a person reads, and what lets one instruction change one number.
 */
function lightDiff(current: SetDocument, target: SetDocument): { add: LightConfig[]; remove: string[]; update: LightConfig[] } {
  const before = new Map(collectLights(current).map((l) => [l.id, l]));
  const after = new Map(collectLights(target).map((l) => [l.id, l]));
  const add: LightConfig[] = [];
  const update: LightConfig[] = [];
  const remove: string[] = [];

  for (const [id, config] of after) {
    const previous = before.get(id);
    if (!previous) add.push(config);
    else if (!sameLight(previous, config)) update.push(config);
  }
  for (const id of before.keys()) {
    if (!after.has(id)) remove.push(id);
  }
  return { add, remove, update };
}

/**
 * Everything one edit changes: the tree, the lights, and the environment when it moved. A draft carries
 * lights flat and documents hold them as nodes, which is exactly the kind of shape difference the diff
 * exists to hide from everything downstream.
 */
export function diffDocument(current: SetDocument, target: SetDocument): DocumentDiff {
  const diff: DocumentDiff = {
    ...diffParts(current, target),
    lights: lightDiff(current, target),
    orderChanged: !sameOrder(current, target),
  };
  return current.environmentMap === target.environmentMap
    ? diff
    : { ...diff, environment: { id: target.environmentMap } };
}

/**
 * Build a command that reconciles the live session with `target`. Execute it via
 * `SketcherDocument.execute()` so the whole AI turn is one undoable step.
 */
export function applyDocumentCommand(sketcher: CartoonSketcher, target: SetDocument): SketcherCommand {
  const diff = diffDocument(sketcher.toDocument(), target);
  const adds = diff.add.length + diff.addRefs.length;
  const updates = diff.update.length + diff.moveRefs.length;
  const removes = diff.remove.length + diff.removeRefs.length;
  const groups = diff.groups.create.length + diff.groups.dissolve.length
    + diff.groups.join.length + diff.groups.leave.length;
  const lights = diff.lights.add.length + diff.lights.remove.length + diff.lights.update.length;
  const dresses = diff.overrideRefs.length;
  const environment = diff.environment !== undefined ? 1 : 0;
  return {
    label: `AI edit (${adds} add, ${updates} update, ${removes} remove${groups > 0 ? `, ${groups} group` : ''}${lights > 0 ? `, ${lights} light` : ''}${dresses > 0 ? `, ${dresses} dress` : ''}${environment > 0 ? ', environment' : ''})`,
    execute() {
      for (const id of diff.remove) sketcher.removePart(id);
      for (const id of diff.removeRefs) sketcher.removeNode(id);

      // The session gives a node its own identity when it is created, so the draft's ids cannot
      // address what this turn just inserted: placements and group membership go through this map.
      // This is the invariant that was missing — the plan shown and the plan executed are the same
      // only if the nodes they name are the same ones.
      const sessionIdOf = new Map<string, string>();
      const resolve = (draftId: string): string => sessionIdOf.get(draftId) ?? draftId;

      for (const p of diff.update) {
        const part = sketcher.getSession().parts.find((x) => x.id === p.content.id);
        if (!part) continue;
        part.label = p.content.label;
        sketcher.setPartColor(p.content.id, p.content.color);
      }

      for (const p of diff.add) {
        if (p.content.kind !== 'primitive') {
          console.warn(`applyDraft: ${p.content.label ?? p.content.name} is a ${p.content.kind}, which the sketcher cannot build yet — skipped`);
          continue;
        }
        const part = sketcher.insertPrimitive(p.content.name);
        if (!part) {
          console.warn(`applyDraft: the sketcher has no preset called "${p.content.name}" — ${p.content.label ?? 'a part'} skipped`);
          continue;
        }
        sessionIdOf.set(p.content.id, part.id);
        part.label = p.content.label;
        sketcher.setPartColor(part.id, p.content.color);
      }

      // An instance has no mesh of its own to place: its live group *is* the placement, and
      // the next write-back carries the transform into the document.
      for (const seed of diff.addRefs) {
        const id = sketcher.insertInstance(seed);
        if (id !== null && seed.id !== undefined) sessionIdOf.set(seed.id, id);
      }

      // Placements *before* the group pass, as worlds: the pass re-parents nodes without moving any
      // of them, so where they stand now is where the AI means them to stand. A node that stays
      // where it is gets the local transform its own parent calls for.
      for (const p of diff.add) {
        const id = sessionIdOf.get(p.content.id);
        if (id !== undefined) sketcher.placeNodeAtWorld(id, p.transform);
      }
      for (const p of diff.update) sketcher.placeNodeAtWorld(p.content.id, p.transform);
      for (const { id, transform } of diff.moveRefs) sketcher.placeNodeAtWorld(id, transform);
      for (const seed of diff.addRefs) {
        if (seed.id !== undefined && seed.transform) sketcher.placeNodeAtWorld(resolve(seed.id), seed.transform);
      }

      // ── Group structure last: a new group's members have to exist, and everything it wraps keeps
      //    the world position it was just given.
      for (const id of diff.groups.dissolve) sketcher.ungroup(resolve(id));
      for (const { group, members } of diff.groups.leave) sketcher.moveOutOfGroup(resolve(group), members.map(resolve));
      for (const { group, members } of diff.groups.join) sketcher.moveIntoGroup(resolve(group), members.map(resolve));
      for (const group of diff.groups.create) sketcher.groupPure(group.members.map(resolve), group.name);

      // ── Lights last, and the environment with them: a light is a document node like any other, so it
      //    undoes with the turn, and an update keeps the light exactly where it was in the list.
      for (const config of diff.lights.update) sketcher.setLight(config);
      for (const config of diff.lights.add) sketcher.addLight(config);
      for (const id of diff.lights.remove) sketcher.removeLight(id);
      if (diff.environment !== undefined) sketcher.setEnvironmentMap(diff.environment.id);

      // ── Dressing, whole: an instance says what it varies, and saying nothing is a valid answer.
      for (const { id, overrides } of diff.overrideRefs) sketcher.setInstanceOverrides(id, overrides);

      // ── Order last, once every node exists: a released or re-added member takes the slot the draft
      //    gives it rather than the slot a removal left behind.
      if (diff.orderChanged) sketcher.reorderToMatch(target);
    },
  };
}

/**
 * The apply step of the agent-edit loop: the AI Draft that came back from /agent/edit becomes the
 * command that reconciles the live session with it. `idMap` is the one describe_session returned, and
 * passing it is what keeps a part the AI left alone the *same* part rather than a delete and an add.
 *
 * Execute the result through `SketcherDocument.execute()` — one AI turn is one undoable step.
 */
export function applyDraftCommand(
  sketcher: CartoonSketcher,
  draft: AIDraft,
  idMap: Record<string, string> = {},
): SketcherCommand {
  return applyDocumentCommand(sketcher, fromAIDraft(draft, idMap));
}

