import { describe, it, expect } from 'vitest';
import { getCharacters, getSetPieces, getById, isSettingEntry } from './catalogue';
import { CATALOGUE_ENTRIES } from './entries';
import type { CatalogueEntry, CharacterEntry, SetPieceEntry } from './types';

// Controlled fixture — tests must not depend on real seed data so they
// remain green even when entries.ts changes.
const robot: CharacterEntry = {
  kind: 'character',
  id: 'robot-a',
  label: 'Robot A',
  gltfPath: '/models/gltf/RobotExpressive.glb',
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

describe('isSettingEntry', () => {
  const environment: CatalogueEntry = { kind: 'environment', id: 'studio', label: 'Studio', hdriPath: '/env/studio.hdr' };
  const light: CatalogueEntry = { kind: 'light', id: 'sun', label: 'Sun', config: { type: 'directional', color: 0xffffff, intensity: 1, position: [0, 10, 5] } };

  it('treats environments as settings', () => {
    expect(isSettingEntry(environment)).toBe(true);
  });

  it('treats a bare set-piece as a component by default', () => {
    expect(isSettingEntry(box)).toBe(false);
  });

  it('infers a set-piece is a setting when it captured environment/lights', () => {
    expect(isSettingEntry({ ...box, id: 'venue', environmentId: 'studio' })).toBe(true);
    expect(isSettingEntry({ ...box, id: 'lit-venue', lights: [{ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 1 }] })).toBe(true);
  });

  it('honours an explicit isSetting flag over the default', () => {
    expect(isSettingEntry({ ...box, id: 'explicit-venue', isSetting: true })).toBe(true);
    expect(isSettingEntry({ ...box, id: 'explicit-prop', isSetting: false })).toBe(false);
  });

  it('returns false for characters and lights', () => {
    expect(isSettingEntry(robot)).toBe(false);
    expect(isSettingEntry(light)).toBe(false);
  });
});

describe('CATALOGUE_ENTRIES seed data — Phase 9.B set pieces', () => {
  const pieces = getSetPieces(CATALOGUE_ENTRIES);
  const ids = pieces.map((p) => p.id);

  it.each(['wall-flat', 'stage-deck', 'studio-backdrop', 'table', 'step'])(
    'includes %s',
    (id) => expect(ids).toContain(id),
  );

  it('wall-flat is a box with correct proportions', () => {
    const p = getById('wall-flat', CATALOGUE_ENTRIES) as SetPieceEntry | undefined;
    expect(p?.geometry).toMatchObject({ type: 'box', width: 4, height: 3, depth: 0.15 });
  });

  it('stage-deck is a plane', () => {
    const p = getById('stage-deck', CATALOGUE_ENTRIES) as SetPieceEntry | undefined;
    expect(p?.geometry?.type).toBe('plane');
  });
});

describe('CATALOGUE_ENTRIES seed data — CAT-0 generic-human character', () => {
  it('includes a generic-human character entry alongside the robot', () => {
    const characters = getCharacters(CATALOGUE_ENTRIES);
    const ids = characters.map((c) => c.id);
    expect(ids).toContain('robot-expressive');
    expect(ids).toContain('generic-human');
  });

  it('generic-human resolves via getById and has a real gltfPath + idle animation', () => {
    const entry = getById('generic-human', CATALOGUE_ENTRIES) as CharacterEntry | undefined;
    expect(entry?.kind).toBe('character');
    expect(entry?.gltfPath).toBe('/models/gltf/generic-human.glb');
    expect(entry?.defaultAnimation).toBeTruthy();
  });

  it('declares per-character locomotion clips (walkAnimation)', () => {
    const robot = getById('robot-expressive', CATALOGUE_ENTRIES) as CharacterEntry | undefined;
    const human = getById('generic-human', CATALOGUE_ENTRIES) as CharacterEntry | undefined;
    expect(robot?.walkAnimation).toBe('Walking');
    expect(human?.walkAnimation).toBe('walk');
  });
});

