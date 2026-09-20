import { describe, it, expect } from 'vitest';
import { toAIDraft, fromAIDraft, AI_CONVENTION } from './aiDraft.js';
import { addLightNode, collectPartNodes, collectParts, collectRefs, documentFromParts, groupNodes, insertRef, isPartNode } from './documentTree.js';
import type { PartSeed, SetDocument } from './documentTree.js';
import type { PartDraft } from './types.js';
import type { AIPart } from './aiDraft.js';
import type { Transform } from './transform.js';

function doc(seeds: PartSeed[] = []): SetDocument {
  return documentFromParts(seeds);
}

/** A part seed, with optional body and transform overrides. */
function part(id: string, content: Partial<PartDraft> = {}, transform: Partial<Transform> = {}): PartSeed {
  return {
    content: { id, kind: 'primitive', name: 'Box', color: 0xffffff, ...content },
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], ...transform },
  };
}

const box = (id: string, name = 'Box'): PartSeed => part(id, { name });

/** The same part as the AI grammar states it. */
const aiBox = (id: string, name = 'Box'): AIPart => ({
  id, name, kind: 'primitive', shape: 'box', size: [1, 1, 1],
  position: [0, 0, 0], rotation: [0, 0, 0], color: 0xffffff,
});

/** Bodies and transforms together — what a whole placement is made of. */
const placed = (d: SetDocument) => collectPartNodes(d).map((n) => ({ content: n.content, transform: n.transform }));

/** Wrap ids in one group node — the tree's own grouping, world positions preserved. */
function grouped(d: SetDocument, ids: string[], name?: string): SetDocument {
  groupNodes(d, ids, name);
  return d;
}

describe('toAIDraft', () => {
  it('projects quaternions to Euler degrees', () => {
    const d = doc([part('a', {}, { quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] })]);
    const { aiDraft } = toAIDraft(d);
    expect(aiDraft.parts[0].rotation[0]).toBeCloseTo(0);
    expect(aiDraft.parts[0].rotation[1]).toBeCloseTo(90);
    expect(aiDraft.parts[0].rotation[2]).toBeCloseTo(0);
  });

  it('slugifies names into unique handles and maps them to guids', () => {
    const d = doc([box('a'), box('b'), box('c', '  Tree Trunk! ')]);
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts.map((p) => p.id)).toEqual(['box', 'box-2', 'tree-trunk']);
    expect(idMap).toEqual({ box: 'a', 'box-2': 'b', 'tree-trunk': 'c' });
  });

  it('projects a group node into a named group with children handles', () => {
    const d = grouped(doc([box('top'), box('leg')]), ['top', 'leg']);
    const { aiDraft } = toAIDraft(d);
    expect(aiDraft.groups).toHaveLength(1);
    expect(aiDraft.groups[0].id).toBe('group-1');
    expect(aiDraft.groups[0].children).toEqual(['box', 'box-2']);
    expect(aiDraft.parts.find((p) => p.id === 'box')?.group).toBe('group-1');
  });

  it('projects world transforms through the group node', () => {
    const d = doc([box('top'), box('leg')]);
    for (const n of collectPartNodes(d)) n.transform.position = [n.content.id === 'top' ? 2 : 0, 0, 0];
    grouped(d, ['top', 'leg']);
    // Move the group itself: its members travel with it.
    const group = d.root.find((n) => n.role === 'structure');
    if (!group) throw new Error('expected a group node');
    group.transform.position = [10, 0, 0];

    const { aiDraft } = toAIDraft(d);

    // The group sits at [10, 0, 0] and its members keep their offsets: 10 ± 1.
    expect(aiDraft.parts.find((p) => p.id === 'box')!.position).toEqual([11, 0, 0]);
    expect(aiDraft.parts.find((p) => p.id === 'box-2')!.position).toEqual([9, 0, 0]);
    expect(aiDraft.groups[0]).toMatchObject({ position: [10, 0, 0] });
  });

  it('carries the convention, lights and environment verbatim', () => {
    const d = doc();
    d.environmentMap = 'studio';
    addLightNode(d, { type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [0, 10, 0] });
    const { aiDraft } = toAIDraft(d);
    expect(aiDraft.convention).toEqual(AI_CONVENTION);
    expect(aiDraft.environmentMap).toBe('studio');
    expect(aiDraft.lights).toHaveLength(1);
  });
});

describe('fromAIDraft', () => {
  it('converts Euler degrees back to quaternions', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ ...aiBox('box'), rotation: [0, 90, 0] }],
      groups: [],
    });
    const q = collectPartNodes(out)[0].transform.quaternion;
    expect(q[0]).toBeCloseTo(0);
    expect(q[1]).toBeCloseTo(Math.SQRT1_2);
    expect(q[2]).toBeCloseTo(0);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it('reuses guids via the id map and assigns fresh ones to new handles', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ ...aiBox('box'), rotation: [0, 0, 0] }],
      groups: [],
    }, { box: 'existing-guid' });
    expect(collectParts(out)[0].id).toBe('existing-guid');

    const fresh = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ ...aiBox('new-thing'), rotation: [0, 0, 0] }],
      groups: [],
    });
    expect(collectParts(fresh)[0].id).toBeTruthy();
  });

  it('rebuilds group membership from group children', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [
        { ...aiBox('top'), rotation: [0, 0, 0] },
        { ...aiBox('leg'), rotation: [0, 0, 0] },
      ],
      groups: [{ id: 'group-1', children: ['top', 'leg'] }],
    }, { top: 'g-top', leg: 'g-leg' });

    const group = out.root.find((n) => n.role === 'structure');
    if (!group) throw new Error('expected a group node');
    expect(group.children.map((c) => (isPartNode(c) ? c.content.id : ''))).toEqual(['g-top', 'g-leg']);
  });
});


describe('round trip', () => {
  it('toAIDraft then fromAIDraft reproduces the document (excluding joints)', () => {
    const d = doc([
      part('top', { color: 0x885544, faceColors: [0x885544, 0x885544, 0x885544] }, { position: [0, 0.8, 0], scale: [1.2, 0.1, 0.8] }),
      part('leg', { color: 0x334455 }, { position: [-0.4, 0.4, 0], scale: [0.1, 0.8, 0.1] }),
      part('loose', { name: 'Sphere' }, { position: [1, 0, 0] }),
    ]);
    grouped(d, ['top', 'leg']);
    d.environmentMap = 'studio';

    const { aiDraft, idMap } = toAIDraft(d);
    const out = fromAIDraft(aiDraft, idMap);

    expect(placed(out)).toEqual(placed(d));
    // The group survives the round trip with its members.
    const group = out.root.find((n) => n.role === 'structure');
    if (!group) throw new Error('expected a group node');
    expect(group.children.map((c) => (isPartNode(c) ? c.content.id : ''))).toEqual(['top', 'leg']);
    expect(out.environmentMap).toBe('studio');
    expect(out.joints).toEqual([]);
  });
});

describe('size and semantic names', () => {
  it('exposes absolute size and the semantic name for primitives', () => {
    const d = doc([part('a', { label: 'tabletop' }, { scale: [1.2, 0.1, 0.8] })]);
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts[0]).toMatchObject({ shape: 'box', size: [1.2, 0.1, 0.8], name: 'tabletop' });
    expect(idMap).toEqual({ tabletop: 'a' });
  });

  it('reconstructs scale and label from size and name', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ id: 'tabletop', name: 'table top', kind: 'primitive', shape: 'box', size: [1.2, 0.1, 0.8], position: [0, 0, 0], rotation: [0, 0, 0], color: 0xffffff }],
      groups: [],
    }, { tabletop: 'g-1' });
        expect(collectParts(out)[0]).toMatchObject({ id: 'g-1', name: 'Box', label: 'table top' });
    expect(collectPartNodes(out)[0].transform.scale).toEqual([1.2, 0.1, 0.8]);
  });

  it('round-trips a uniformly scaled sphere through size', () => {
    const d = doc([part('a', { name: 'Sphere' }, { scale: [1, 1, 1] })]);
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts[0]).toMatchObject({ shape: 'sphere', size: [0.75] }); // 0.75 radius base
    expect(collectPartNodes(fromAIDraft(aiDraft, idMap))[0].transform.scale).toEqual([1, 1, 1]);
  });

  it('round-trips a semantic group name', () => {
    const d = grouped(doc([box('top'), box('leg')]), ['top', 'leg'], 'table');
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.groups[0]).toMatchObject({ id: 'table', name: 'table' });

    const out = fromAIDraft(aiDraft, idMap);
    const group = out.root.find((n) => n.role === 'structure');
    if (!group) throw new Error('expected a group node');
    expect(group.name).toBe('table');
    expect(group.children.map((c) => (isPartNode(c) ? c.content.id : ''))).toEqual(['top', 'leg']);
  });
});

describe('reference parts', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  it('projects an instance as a ref part, at its world position', () => {
    const d = doc();
    insertRef(d, { ref: 'chair', name: 'chair', transform: { ...identity, position: [2, 0, 0] } });

    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts).toHaveLength(1);
    expect(aiDraft.parts[0]).toMatchObject({ name: 'chair', ref: 'chair', position: [2, 0, 0] });
    // No body is described: the Definition supplies it.
    expect(aiDraft.parts[0].shape).toBeUndefined();
    expect(aiDraft.parts[0].color).toBeUndefined();
    expect(idMap).toEqual({ chair: 'chair' });
  });

  it('fromAIDraft places a reference instead of copying a body', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ id: 'desk', name: 'desk', ref: 'school-desk', position: [1, 0, 0], rotation: [0, 90, 0] }],
      groups: [],
    });

    expect(collectParts(out)).toHaveLength(0);
    expect(out.root).toHaveLength(1);
    expect(out.root[0].ref).toBe('school-desk');
    expect(out.root[0].children).toEqual([]);
    expect(out.root[0].transform.position).toEqual([1, 0, 0]);
    expect(collectRefs(out)).toEqual(['school-desk']);
  });

  it('groups a reference with a part', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [
        { id: 'chair', name: 'chair', ref: 'chair-def', position: [0, 0, 0], rotation: [0, 0, 0] },
        { id: 'box', name: 'box', kind: 'primitive', shape: 'box', size: [1, 1, 1], position: [1, 0, 0], rotation: [0, 0, 0], color: 0xffffff },
      ],
      groups: [{ id: 'row', name: 'row', children: ['chair', 'box'] }],
    });

    const group = out.root.find((node) => node.role === 'structure')!;
    expect(group.id).toBe('row');
    expect(group.children).toHaveLength(2);
    expect(group.children.some((child) => child.ref === 'chair-def')).toBe(true);
  });

  it('carries an instance\u2019s overrides out, in the draft\u2019s terms', () => {
    const d = doc();
    insertRef(d, {
      ref: 'chair',
      name: 'chair',
      transform: { ...identity },
      overrides: [
        { path: 'legs/right', op: 'remove' },
        { path: 'seat', op: 'set', value: { transform: { ...identity, position: [0, 0.9, 0] }, hidden: true } },
      ],
    });

    expect(toAIDraft(d).aiDraft.parts[0].overrides).toEqual([
      { path: 'legs/right', op: 'remove' },
      { path: 'seat', op: 'set', transform: { position: [0, 0.9, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }, hidden: true },
    ]);
  });

  it('restores an instance\u2019s overrides, so an AI edit cannot drop them', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{
        id: 'chair',
        name: 'chair',
        ref: 'chair-def',
        position: [1, 0, 0],
        rotation: [0, 0, 0],
        overrides: [
          { path: 'legs/right', op: 'remove' },
          { path: 'back', op: 'set', hidden: false },
          { path: 'seat', op: 'set', transform: { position: [0, 0.9, 0], rotation: [0, 90, 0] } },
        ],
      }],
      groups: [],
    });

    const [removeLeg, back, seat] = out.root[0].overrides!;
    expect(removeLeg).toEqual({ path: 'legs/right', op: 'remove' });
    expect(back).toEqual({ path: 'back', op: 'set', value: { hidden: false } });
    if (seat.op !== 'set') throw new Error('expected a set override');
    // A `set` replaces the node's transform, so the fields the draft left out come back at rest.
    expect(seat.value.transform).toMatchObject({ position: [0, 0.9, 0], scale: [1, 1, 1] });
    // The draft's Euler degrees are stored as a quaternion: 90° about Y.
    expect(seat.value.transform!.quaternion[1]).toBeCloseTo(Math.SQRT1_2);
  });

  it('round-trips an instance\u2019s overrides through the projection', () => {
    const d = doc();
    insertRef(d, {
      ref: 'chair',
      name: 'chair',
      transform: { ...identity, position: [2, 0, 0] },
      overrides: [{ path: 'legs', op: 'set', value: { hidden: true } }],
    });

    const { aiDraft } = toAIDraft(d);
    const out = fromAIDraft(aiDraft);

    expect(out.root[0].overrides).toEqual([{ path: 'legs', op: 'set', value: { hidden: true } }]);
    expect(out.root[0].transform.position).toEqual([2, 0, 0]);
  });
});
