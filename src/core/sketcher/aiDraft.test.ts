import { describe, it, expect } from 'vitest';
import { toAIDraft, fromAIDraft, AI_CONVENTION } from './aiDraft.js';
import { collectParts, documentFromParts, groupParts } from './documentTree.js';
import type { SetDocument } from './documentTree.js';
import type { PartDraft } from './types.js';

function doc(parts: PartDraft[] = []): SetDocument {
  return documentFromParts(parts);
}

const box = (id: string, name = 'Box'): PartDraft => ({
  id, kind: 'primitive', name, position: [0, 0, 0],
  quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff,
});

/** Wrap ids in one group node — the tree's own grouping, world positions preserved. */
function grouped(d: SetDocument, ids: string[], name?: string): SetDocument {
  groupParts(d, ids, name);
  return d;
}

describe('toAIDraft', () => {
  it('projects quaternions to Euler degrees', () => {
    const d = doc([{ ...box('a'), quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }]);
    const { aiDraft } = toAIDraft(d);
    expect(aiDraft.parts[0].rotation[0]).toBeCloseTo(0);
    expect(aiDraft.parts[0].rotation[1]).toBeCloseTo(90);
    expect(aiDraft.parts[0].rotation[2]).toBeCloseTo(0);
  });

  it('slugifies names into unique handles and maps them to guids', () => {
    const d = doc([box('a'), box('b'), { ...box('c', '  Tree Trunk! ') }]);
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
    for (const p of collectParts(d)) p.position = [p.id === 'top' ? 2 : 0, 0, 0];
    grouped(d, ['top', 'leg']);
    // Move the group itself: its members travel with it.
    const group = d.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    group.position = [10, 0, 0];

    const { aiDraft } = toAIDraft(d);

    // The group sits at [10, 0, 0] and its members keep their offsets: 10 ± 1.
    expect(aiDraft.parts.find((p) => p.id === 'box')!.position).toEqual([11, 0, 0]);
    expect(aiDraft.parts.find((p) => p.id === 'box-2')!.position).toEqual([9, 0, 0]);
    expect(aiDraft.groups[0]).toMatchObject({ position: [10, 0, 0] });
  });

  it('carries the convention, lights and environment verbatim', () => {
    const d = doc();
    d.environmentMap = 'studio';
    d.lights = [{ type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [0, 10, 0] }];
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
      parts: [{ ...box('box'), rotation: [0, 90, 0] }],
      groups: [],
    });
    const q = collectParts(out)[0].quaternion;
    expect(q[0]).toBeCloseTo(0);
    expect(q[1]).toBeCloseTo(Math.SQRT1_2);
    expect(q[2]).toBeCloseTo(0);
    expect(q[3]).toBeCloseTo(Math.SQRT1_2);
  });

  it('reuses guids via the id map and assigns fresh ones to new handles', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ ...box('box'), rotation: [0, 0, 0] }],
      groups: [],
    }, { box: 'existing-guid' });
    expect(collectParts(out)[0].id).toBe('existing-guid');

    const fresh = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ ...box('new-thing'), rotation: [0, 0, 0] }],
      groups: [],
    });
    expect(collectParts(fresh)[0].id).toBeTruthy();
  });

  it('rebuilds group membership from group children', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [
        { ...box('top'), rotation: [0, 0, 0] },
        { ...box('leg'), rotation: [0, 0, 0] },
      ],
      groups: [{ id: 'group-1', children: ['top', 'leg'] }],
    }, { top: 'g-top', leg: 'g-leg' });

    const group = out.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    expect(group.children.map((c) => (c.kind === 'part' ? c.part.id : ''))).toEqual(['g-top', 'g-leg']);
  });
});


describe('round trip', () => {
  it('toAIDraft then fromAIDraft reproduces the document (excluding joints)', () => {
    const d = doc([
      { id: 'top', kind: 'primitive', name: 'Box', position: [0, 0.8, 0], quaternion: [0, 0, 0, 1], scale: [1.2, 0.1, 0.8], color: 0x885544, faceColors: [0x885544, 0x885544, 0x885544] },
      { id: 'leg', kind: 'primitive', name: 'Box', position: [-0.4, 0.4, 0], quaternion: [0, 0, 0, 1], scale: [0.1, 0.8, 0.1], color: 0x334455 },
      { id: 'loose', kind: 'primitive', name: 'Sphere', position: [1, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff },
    ]);
    grouped(d, ['top', 'leg']);
    d.environmentMap = 'studio';

    const { aiDraft, idMap } = toAIDraft(d);
    const out = fromAIDraft(aiDraft, idMap);

    expect(collectParts(out)).toEqual(collectParts(d));
    // The group survives the round trip with its members.
    const group = out.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    expect(group.children.map((c) => (c.kind === 'part' ? c.part.id : ''))).toEqual(['top', 'leg']);
    expect(out.environmentMap).toBe('studio');
    expect(out.joints).toEqual([]);
  });
});

describe('size and semantic names', () => {
  it('exposes absolute size and the semantic name for primitives', () => {
    const d = doc([{ ...box('a'), label: 'tabletop', scale: [1.2, 0.1, 0.8] }]);
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
    expect(collectParts(out)[0]).toMatchObject({ id: 'g-1', name: 'Box', label: 'table top', scale: [1.2, 0.1, 0.8] });
  });

  it('round-trips a uniformly scaled sphere through size', () => {
    const d = doc([{ ...box('a'), name: 'Sphere', scale: [1, 1, 1] }]);
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts[0]).toMatchObject({ shape: 'sphere', size: [0.75] }); // 0.75 radius base
    expect(collectParts(fromAIDraft(aiDraft, idMap))[0].scale).toEqual([1, 1, 1]);
  });

  it('round-trips a semantic group name', () => {
    const d = grouped(doc([box('top'), box('leg')]), ['top', 'leg'], 'table');
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.groups[0]).toMatchObject({ id: 'table', name: 'table' });

    const out = fromAIDraft(aiDraft, idMap);
    const group = out.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    expect(group.name).toBe('table');
    expect(group.children.map((c) => (c.kind === 'part' ? c.part.id : ''))).toEqual(['top', 'leg']);
  });
});
