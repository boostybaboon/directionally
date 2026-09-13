import { describe, it, expect } from 'vitest';
import { toAIDraft, fromAIDraft, AI_CONVENTION } from './aiDraft.js';
import type { SketcherDraft } from './types.js';

function draft(overrides: Partial<SketcherDraft> = {}): SketcherDraft {
  return { version: 2, parts: [], joints: [], ...overrides };
}

const box = (id: string, name = 'Box') => ({
  id, kind: 'primitive' as const, name, position: [0, 0, 0] as [number, number, number],
  quaternion: [0, 0, 0, 1] as [number, number, number, number],
  scale: [1, 1, 1] as [number, number, number], color: 0xffffff,
});

describe('toAIDraft', () => {
  it('projects quaternions to Euler degrees', () => {
    const d = draft({ parts: [{ ...box('a'), quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] }] });
    const { aiDraft } = toAIDraft(d);
    expect(aiDraft.parts[0].rotation[0]).toBeCloseTo(0);
    expect(aiDraft.parts[0].rotation[1]).toBeCloseTo(90);
    expect(aiDraft.parts[0].rotation[2]).toBeCloseTo(0);
  });

  it('slugifies names into unique handles and maps them to guids', () => {
    const d = draft({ parts: [box('a'), box('b'), { ...box('c', '  Tree Trunk! ') }] });
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts.map((p) => p.id)).toEqual(['box', 'box-2', 'tree-trunk']);
    expect(idMap).toEqual({ box: 'a', 'box-2': 'b', 'tree-trunk': 'c' });
  });

  it('projects flat group membership into named groups with children handles', () => {
    const d = draft({
      parts: [box('top'), box('leg')],
      groups: [{ partIds: ['top', 'leg'] }],
    });
    const { aiDraft } = toAIDraft(d);
    expect(aiDraft.groups).toHaveLength(1);
    expect(aiDraft.groups[0].id).toBe('group-1');
    expect(aiDraft.groups[0].children).toEqual(['box', 'box-2']);
    expect(aiDraft.parts.find((p) => p.id === 'box')?.group).toBe('group-1');
  });

  it('carries the convention, lights and environment verbatim', () => {
    const d = draft({
      environmentMap: 'studio',
      lights: [{ type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [0, 10, 0] }],
    });
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
    const q = out.parts[0].quaternion;
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
    expect(out.parts[0].id).toBe('existing-guid');

    const fresh = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ ...box('new-thing'), rotation: [0, 0, 0] }],
      groups: [],
    });
    expect(fresh.parts[0].id).toBeTruthy();
  });

  it('rebuilds flat group membership from group children', () => {
    const out = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [
        { ...box('top'), rotation: [0, 0, 0] },
        { ...box('leg'), rotation: [0, 0, 0] },
      ],
      groups: [{ id: 'group-1', children: ['top', 'leg'] }],
    }, { top: 'g-top', leg: 'g-leg' });
    expect(out.groups).toEqual([{ partIds: ['g-top', 'g-leg'] }]);
  });
});

describe('round trip', () => {
  it('toAIDraft then fromAIDraft reproduces the canonical draft (excluding joints)', () => {
    const d = draft({
      parts: [
        { id: 'top', kind: 'primitive', name: 'Box', position: [0, 0.8, 0], quaternion: [0, 0, 0, 1], scale: [1.2, 0.1, 0.8], color: 0x885544, faceColors: [0x885544, 0x885544, 0x885544] },
        { id: 'leg', kind: 'primitive', name: 'Box', position: [-0.4, 0.4, 0], quaternion: [0, 0, 0, 1], scale: [0.1, 0.8, 0.1], color: 0x334455 },
      ],
      groups: [{ partIds: ['top', 'leg'] }],
      environmentMap: 'studio',
    });
    const { aiDraft, idMap } = toAIDraft(d);
    const out = fromAIDraft(aiDraft, idMap);
    expect(out.parts).toEqual(d.parts);
    expect(out.groups).toEqual(d.groups);
    expect(out.environmentMap).toBe('studio');
    expect(out.joints).toEqual([]);
  });
});

describe('size and semantic names', () => {
  it('exposes absolute size and the semantic name for primitives', () => {
    const d = draft({ parts: [{ ...box('a'), label: 'tabletop', scale: [1.2, 0.1, 0.8] }] });
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
    expect(out.parts[0]).toMatchObject({ id: 'g-1', name: 'Box', label: 'table top', scale: [1.2, 0.1, 0.8] });
  });

  it('round-trips a uniformly scaled sphere through size', () => {
    const d = draft({ parts: [{ ...box('a'), name: 'Sphere', scale: [1, 1, 1] }] });
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.parts[0]).toMatchObject({ shape: 'sphere', size: [0.75] }); // 0.75 radius base
    expect(fromAIDraft(aiDraft, idMap).parts[0].scale).toEqual([1, 1, 1]);
  });

  it('round-trips a semantic group name', () => {
    const d = draft({ parts: [box('top'), box('leg')], groups: [{ partIds: ['top', 'leg'], name: 'table' }] });
    const { aiDraft, idMap } = toAIDraft(d);
    expect(aiDraft.groups[0]).toMatchObject({ id: 'table', name: 'table' });
    expect(fromAIDraft(aiDraft, idMap).groups).toEqual([{ partIds: ['top', 'leg'], name: 'table' }]);
  });
});
