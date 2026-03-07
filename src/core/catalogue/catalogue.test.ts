import { describe, it, expect } from 'vitest';
import { getCharacters, getSetPieces, getById } from './catalogue';
import type { CatalogueEntry, CharacterEntry, SetPieceEntry } from './types';

// Controlled fixture — tests must not depend on real seed data so they
// remain green even when entries.ts changes.
const robot: CharacterEntry = {
  kind: 'character',
  id: 'robot-a',
  label: 'Robot A',
  gltfPath: '/models/gltf/RobotExpressive.glb',
  animationClips: ['Idle', 'Walking'],
};

const box: SetPieceEntry = {
  kind: 'set-piece',
  id: 'box-1',
  label: 'Box',
  geometry: { type: 'box', width: 1, height: 1, depth: 1 },
  material: { color: 0x888888 },
};

const sphere: SetPieceEntry = {
  kind: 'set-piece',
  id: 'sphere-1',
  label: 'Sphere',
  geometry: { type: 'sphere', radius: 0.5 },
  material: { color: 0x4488cc },
};

const cylinder: SetPieceEntry = {
  kind: 'set-piece',
  id: 'cylinder-1',
  label: 'Cylinder',
  geometry: { type: 'cylinder', radiusTop: 0.5, radiusBottom: 0.5, height: 1 },
  material: { color: 0xaa6644 },
};

const fixture: CatalogueEntry[] = [robot, box, sphere, cylinder];

describe('getCharacters', () => {
  it('returns only entries with kind === character', () => {
    const result = getCharacters(fixture);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(robot);
  });

  it('returns empty array when no characters exist', () => {
    expect(getCharacters([box, sphere])).toEqual([]);
  });

  it('returns multiple characters when present', () => {
    const second: CharacterEntry = { ...robot, id: 'robot-b', label: 'Robot B' };
    const result = getCharacters([robot, second, box]);
    expect(result).toHaveLength(2);
  });
});

describe('getSetPieces', () => {
  it('returns only entries with kind === set-piece', () => {
    const result = getSetPieces(fixture);
    expect(result).toHaveLength(3);
    expect(result.every(e => e.kind === 'set-piece')).toBe(true);
  });

  it('returns empty array when no set pieces exist', () => {
    expect(getSetPieces([robot])).toEqual([]);
  });
});

describe('getById', () => {
  it('finds an entry by id', () => {
    expect(getById('robot-a', fixture)).toBe(robot);
    expect(getById('box-1', fixture)).toBe(box);
  });

  it('returns undefined for unknown id', () => {
    expect(getById('does-not-exist', fixture)).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getById('Robot-A', fixture)).toBeUndefined();
  });
});
