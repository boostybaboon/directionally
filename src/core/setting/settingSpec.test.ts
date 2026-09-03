import { describe, it, expect } from 'vitest';
import type { CatalogueEntry } from '../catalogue/types.js';
import {
  resolveSettingSpec,
  validateSettingSpec,
  resolveProp,
  resolveEnvironment,
  expandEntry,
  settingSpecToScene,
  sceneToSettingSpec,
  resolveInstance,
  resolveInstances,
} from './settingSpec.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import type { StoredScene } from '../storage/types.js';
import type { SetPiece as SetPieceParam } from '../domain/types.js';

// Controlled fixtures — tests must not depend on real seed data.
const box: CatalogueEntry = { kind: 'set-piece', id: 'box', label: 'Box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0x8844aa } };
const woodFloor: CatalogueEntry = { kind: 'set-piece', id: 'wood-floor', label: 'Wood Floor', geometry: { type: 'plane', width: 8, height: 8 }, material: { color: 0xffffff, textureUrl: '/textures/wood-boards.jpg' }, defaultRotation: [-Math.PI / 2, 0, 0] };
const chair: CatalogueEntry = {
  kind: 'set-piece',
  id: 'chair',
  label: 'Chair',
  compose: [
    { name: 'seat', geometry: { type: 'box', width: 0.5, height: 0.1, depth: 0.5 }, material: { color: 0x663311 }, position: [0, 0.45, 0] },
    { name: 'back', geometry: { type: 'box', width: 0.5, height: 0.5, depth: 0.1 }, material: { color: 0x663311 }, position: [0, 0.7, -0.2] },
  ],
};
const env: CatalogueEntry = { kind: 'environment', id: 'studio-neutral', label: 'Studio (neutral)', hdriPath: '/environments/studio-neutral.hdr' };
const light: CatalogueEntry = { kind: 'light', id: 'directional-light', label: 'Directional Light', config: { type: 'directional', color: 0xffffff, intensity: 1, position: [0, 10, 5] } };

const fixture: CatalogueEntry[] = [box, woodFloor, chair, env, light];

describe('validateSettingSpec', () => {
  it('applies defaults for an empty spec', () => {
    const v = validateSettingSpec({});
    expect(v.name).toBe('');
    expect(v.props).toEqual([]);
    expect(v.backdrops).toEqual([]);
    expect(v.lights).toEqual([]);
    expect(v.floor).toBeDefined();
  });

  it('keeps provided fields intact', () => {
    const v = validateSettingSpec({ name: ' Classroom ' });
    expect(v.name).toBe('Classroom');
  });
});

describe('resolveSettingSpec', () => {
  it('produces a neutral room (default floor + starter lights) for an empty spec', () => {
    const r = resolveSettingSpec({}, []);
    expect(r.environmentMap).toBeUndefined();
    expect(r.set).toHaveLength(1);
    expect(r.set[0].name).toBe('ground');
    expect(r.lights).toHaveLength(2);
    expect(r.unresolved).toEqual([]);
  });

  it('resolves a catalogue set-piece by label (case-insensitive) with placement', () => {
    const r = resolveSettingSpec({ props: [{ ref: 'box', position: [1, 2, 3] }] }, fixture);
    const piece = r.set.find((p) => p.name === 'box');
    expect(piece).toBeDefined();
    expect(piece!.position).toEqual([1, 2, 3]);
    expect(piece!.geometry).toMatchObject({ type: 'box', width: 1 });
  });

  it('bakes a catalogue floor piece with its default rotation', () => {
    const r = resolveSettingSpec({ floor: { ref: 'wood-floor' } }, fixture);
    const floor = r.set.find((p) => p.name === 'wood-floor');
    expect(floor!.rotation).toEqual([-Math.PI / 2, 0, 0]);
  });

  it('flattens a composite catalogue entry and offsets children by placement', () => {
    const r = resolveSettingSpec({ props: [{ ref: 'chair', position: [5, 0, 0] }] }, fixture);
    const seat = r.set.find((p) => p.name === 'seat');
    expect(seat).toBeDefined();
    expect(seat!.position).toEqual([5, 0.45, 0]);
  });

  it('resolves an inline primitive directly', () => {
    const r = resolveSettingSpec({ props: [{ geometry: { type: 'sphere', radius: 0.5 }, material: { color: 0xff0000 } }] }, []);
    expect(r.set.some((p) => p.geometry.type === 'sphere')).toBe(true);
  });

  it('resolves an environment label to its catalogue id', () => {
    const r = resolveSettingSpec({ environment: 'Studio (neutral)' }, fixture);
    expect(r.environmentMap).toBe('studio-neutral');
  });

  it('collects unresolved refs', () => {
    const r = resolveSettingSpec({ props: [{ ref: 'spaceship' }] }, []);
    expect(r.unresolved).toEqual(['spaceship']);
  });

  it('resolves light refs and falls back to starter lights when empty', () => {
    const r = resolveSettingSpec({ lights: ['directional-light'] }, fixture);
    expect(r.lights).toHaveLength(1);
    expect(r.lights[0].type).toBe('directional');
    const empty = resolveSettingSpec({}, []);
    expect(empty.lights).toHaveLength(2);
  });
});

describe('expandEntry', () => {
  it('flattens a composite entry to multiple pieces', () => {
    const chairEntry = resolveProp('chair', fixture)!;
    const pieces = expandEntry(chairEntry, undefined, fixture);
    expect(pieces.map((p) => p.name)).toEqual(['seat', 'back']);
  });

  it('returns a single piece for a leaf entry', () => {
    const boxEntry = resolveProp('box', fixture)!;
    expect(expandEntry(boxEntry, undefined, fixture)).toHaveLength(1);
  });
});

describe('resolveInstance', () => {
  it('returns the piece unchanged when it has no ref', () => {
    const piece: SetPieceParam = { name: 'box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0x888888 } };
    expect(resolveInstance(piece, fixture)).toEqual([piece]);
  });

  it('expands a leaf-entry ref into a single rendered piece at the instance transform', () => {
    const piece: SetPieceParam = { name: 'my-box', ref: 'box', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 }, position: [1, 2, 3] };
    const out = resolveInstance(piece, fixture);
    expect(out).toHaveLength(1);
    expect(out[0].position).toEqual([1, 2, 3]);
    expect(out[0].geometry).toMatchObject({ type: 'box', width: 1 });
  });

  it('expands a composite-entry ref into multiple prefixed children', () => {
    const piece: SetPieceParam = { name: 'chair-1', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 }, position: [5, 0, 0] };
    const out = resolveInstance(piece, fixture);
    expect(out.map((p) => p.name)).toEqual(['chair-1/seat', 'chair-1/back']);
    expect(out[0].position).toEqual([5, 0.45, 0]);
  });

  it('multiple instances of the same Definition produce non-colliding names', () => {
    const piece1: SetPieceParam = { name: 'chair-1', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 } };
    const piece2: SetPieceParam = { name: 'chair-2', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 } };
    const out = [...resolveInstance(piece1, fixture), ...resolveInstance(piece2, fixture)];
    const names = out.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('falls back to the piece itself and records the ref as unresolved when the ref is missing', () => {
    const unresolved: string[] = [];
    const piece: SetPieceParam = { name: 'ghost', ref: 'no-such-entry', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 } };
    const out = resolveInstance(piece, fixture, unresolved);
    expect(out).toEqual([piece]);
    expect(unresolved).toEqual(['no-such-entry']);
  });
});

describe('resolveInstances', () => {
  it('leaves plain pieces alone and expands ref pieces, flattening the whole list', () => {
    const ground: SetPieceParam = { name: 'ground', geometry: { type: 'plane', width: 12, height: 12 }, material: { color: 0x888888 } };
    const chairInstance: SetPieceParam = { name: 'chair-1', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 } };
    const out = resolveInstances([ground, chairInstance], fixture);
    expect(out.map((p) => p.name)).toEqual(['ground', 'chair-1/seat', 'chair-1/back']);
  });
});

describe('resolveProp / resolveEnvironment', () => {
  it('resolves by id then case-insensitive label', () => {
    expect(resolveProp('box', fixture)?.id).toBe('box');
    expect(resolveProp('BOX', fixture)?.id).toBe('box');
    expect(resolveEnvironment('studio-neutral', fixture)?.id).toBe('studio-neutral');
    expect(resolveProp('missing', fixture)).toBeUndefined();
  });
});

describe('CATALOGUE_ENTRIES composite seeds', () => {
  it('bundled composite props resolve without unresolved refs', () => {
    for (const id of ['chair', 'desk', 'bench', 'whiteboard', 'blackboard', 'window-flat', 'door', 'bookshelf', 'cabin-seat']) {
      const r = resolveSettingSpec({ props: [{ ref: id }] }, CATALOGUE_ENTRIES);
      expect(r.unresolved).toEqual([]);
      expect(r.set.length).toBeGreaterThan(0);
    }
  });
});

describe('settingSpecToScene / sceneToSettingSpec', () => {
  it('resolves a spec into a StoredScene', () => {
    const scene = settingSpecToScene({ props: [{ ref: 'box', position: [1, 2, 3] }] }, fixture);
    expect(scene.set.some((p) => p.name === 'box')).toBe(true);
    expect(scene.camera).toBeDefined();
    expect(scene.lights.length).toBeGreaterThan(0);
  });

  it('round-trips a scene through a spec (floor separated from props)', () => {
    const source: StoredScene = {
      camera: { fov: 50, near: 0.1, far: 120, position: [0, 5, 12], lookAt: [0, 1, 0] },
      lights: [{ type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [5, 10, 5] }],
      set: [
        { name: 'ground', geometry: { type: 'plane', width: 12, height: 12 }, material: { color: 0x888888 }, rotation: [-Math.PI / 2, 0, 0] },
        { name: 'box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0x8844aa }, position: [1, 0, 2] },
      ],
      stagedActors: [],
      actions: [],
    };

    const spec = sceneToSettingSpec(source);
    expect(spec.floor).toBeDefined();
    expect(spec.props).toHaveLength(1);

    const back = settingSpecToScene(spec, []);
    expect(back.set.map((p) => p.name)).toEqual(['ground', 'box']);
    expect(back.lights).toHaveLength(1);
    expect(back.lights[0].id).toBe('sun');
  });

  it('accepts inline light configs in the spec', () => {
    const r = resolveSettingSpec({ lights: [{ type: 'directional', id: 'my-sun', color: 0xffffff, intensity: 1, position: [0, 10, 5] }] }, []);
    expect(r.lights).toHaveLength(1);
    expect(r.lights[0].id).toBe('my-sun');
  });
});
