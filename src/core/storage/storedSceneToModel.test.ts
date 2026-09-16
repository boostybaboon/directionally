import { describe, it, expect, vi } from 'vitest';
import { storedSceneToModel } from './storedSceneToModel';
import { PerspectiveCameraAsset } from '../../lib/model/Camera';
import type { StoredScene, StoredActor } from './types';
import type { SetPiece } from '../domain/types';
import type { SetDocument } from '../sketcher/documentTree';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ROBOT_GLTF = '/models/gltf/RobotExpressive.glb';

function baseScene(overrides: Partial<StoredScene> = {}): StoredScene {
  return {
    camera: { fov: 50, near: 0.1, far: 100, position: [0, 5, 12], lookAt: [0, 1, 0] },
    lights: [
      { type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2 },
    ],
    set: [],
    stagedActors: [],
    actions: [],
    duration: 10,
    ...overrides,
  };
}

const robotActor: StoredActor = { id: 'actor-r', role: 'Robot', catalogueId: 'robot-expressive' };
const actorB: StoredActor = { id: 'actor-b', role: 'Robot B', catalogueId: 'robot-expressive' };

// ── Camera ────────────────────────────────────────────────────────────────────

describe('storedSceneToModel – camera', () => {
  it('passes fov, near, far through to the model camera', () => {
    const model = storedSceneToModel(baseScene(), []);
    const cam = model.camera as PerspectiveCameraAsset;
    expect(cam.fov).toBe(50);
    expect(cam.near).toBe(0.1);
    expect(cam.far).toBe(100);
  });

  it('sets camera position and lookAt', () => {
    const model = storedSceneToModel(baseScene(), []);
    expect(model.camera.position.toArray()).toEqual([0, 5, 12]);
    expect(model.camera.lookAt!.toArray()).toEqual([0, 1, 0]);
  });
});

// ── Lights ────────────────────────────────────────────────────────────────────

describe('storedSceneToModel – lights', () => {
  it('includes all defined lights', () => {
    const scene = baseScene({
      lights: [
        { type: 'hemisphere',  id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2          },
        { type: 'directional', id: 'sun', color: 0xffffff,   intensity: 1,           position: [5, 10, 5] },
      ],
    });
    const model = storedSceneToModel(scene, []);
    expect(model.lights).toHaveLength(2);
  });

  it('produces a model with zero lights when none defined', () => {
    const model = storedSceneToModel(baseScene({ lights: [] }), []);
    expect(model.lights).toHaveLength(0);
  });
});

// ── Set pieces ────────────────────────────────────────────────────────────────

describe('storedSceneToModel – set pieces', () => {
  it('converts set pieces into meshes', () => {
    const scene = baseScene({
      set: [
        {
          name: 'ground',
          geometry: { type: 'plane', width: 30, height: 20 },
          material: { color: 0x888888 },
          rotation: [-Math.PI / 2, 0, 0],
        },
      ],
    });
    const model = storedSceneToModel(scene, []);
    expect(model.meshes).toHaveLength(1);
    expect(model.meshes[0].name).toBe('ground');
  });

  it('applies position and rotation to the mesh', () => {
    const scene = baseScene({
      set: [{
        name: 'block',
        geometry: { type: 'box', width: 1, height: 1, depth: 1 },
        material: { color: 0xff0000 },
        position: [3, 0, -2],
        rotation: [0, 1, 0],
      }],
    });
    const model = storedSceneToModel(scene, []);
    expect(model.meshes[0].position.toArray()).toEqual([3, 0, -2]);
    expect(model.meshes[0].rotation.x).toBeCloseTo(0);
    expect(model.meshes[0].rotation.y).toBeCloseTo(1);
  });

  it('resolves opfs:// set piece gltfPath to the session blob URL from userEntries', () => {
    const scene = baseScene({
      set: [{
        name: 'my-chair',
        gltfPath: 'opfs://user-entry-abc',
        geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 },
        material: { color: 0x000000, metalness: 0, roughness: 1 },
      }],
    });
    const userEntries = [{ id: 'user-entry-abc', gltfPath: 'blob:http://localhost/fake-url' }];
    const model = storedSceneToModel(scene, [], userEntries);
    expect(model.gltfs).toHaveLength(1);
    expect(model.gltfs[0].name).toBe('my-chair');
    expect(model.meshes).toHaveLength(0);
  });

  it('leaves opfs:// gltfPath unresolved (no mesh) when userEntries is empty', () => {
    const scene = baseScene({
      set: [{
        name: 'my-chair',
        gltfPath: 'opfs://user-entry-abc',
        geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 },
        material: { color: 0x000000, metalness: 0, roughness: 1 },
      }],
    });
    // No userEntries — the opfs:// reference cannot be resolved; falls back to mesh.
    const model = storedSceneToModel(scene, [], []);
    expect(model.gltfs).toHaveLength(0);
    expect(model.meshes).toHaveLength(1);
  });
});

// ── Staged actors ─────────────────────────────────────────────────────────────

describe('storedSceneToModel – staged actors', () => {
  it('produces one GLTF per staged actor', () => {
    const scene = baseScene({
      stagedActors: [{ actorId: 'actor-r', startPosition: [-2, 0, 0] }],
    });
    const model = storedSceneToModel(scene, [robotActor]);
    expect(model.gltfs).toHaveLength(1);
    expect(model.gltfs[0].url).toBe(ROBOT_GLTF);
  });

  it('applies startPosition to the GLTF', () => {
    const scene = baseScene({
      stagedActors: [{ actorId: 'actor-r', startPosition: [-2.5, 0, 0] }],
    });
    const model = storedSceneToModel(scene, [robotActor]);
    expect(model.gltfs[0].position.toArray()).toEqual([-2.5, 0, 0]);
  });

  it('uses the correct GLTF URL for each catalogue entry', () => {
    const scene = baseScene({
      stagedActors: [
        { actorId: 'actor-r', startPosition: [-2, 0, 0] },
        { actorId: 'actor-b', startPosition: [ 2, 0, 0] },
      ],
    });
    const model = storedSceneToModel(scene, [robotActor, actorB]);
    expect(model.gltfs[0].url).toBe(ROBOT_GLTF);
    expect(model.gltfs[1].url).toBe(ROBOT_GLTF);
  });

  it('falls back to RobotExpressive for an unknown catalogueId', () => {
    const actor: StoredActor = { id: 'x', role: 'Ghost', catalogueId: 'does-not-exist' };
    const scene = baseScene({ stagedActors: [{ actorId: 'x' }] });
    const model = storedSceneToModel(scene, [actor]);
    expect(model.gltfs[0].url).toBe(ROBOT_GLTF);
  });

  it('does not stage actors that have no matching stagedActors entry', () => {
    // actor is in the cast but not staged — no GLTF should appear
    const model = storedSceneToModel(baseScene(), [robotActor]);
    expect(model.gltfs).toHaveLength(0);
  });
});

// ── Duration ──────────────────────────────────────────────────────────────────

// ── Instance (ref) expansion ──────────────────────────────────────────────────

describe('storedSceneToModel – ref instances', () => {
  it('expands a set piece with a ref against the bundled catalogue into its composite meshes', () => {
    const scene = baseScene({
      set: [
        { name: 'chair-1', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 }, position: [2, 0, 0] },
      ],
    });
    const model = storedSceneToModel(scene, []);
    const names = model.meshes.map((m) => m.name);
    expect(names.length).toBeGreaterThan(1);
    expect(names.every((n) => n.startsWith('chair-1/'))).toBe(true);
  });

  it('leaves a plain (non-ref) set piece unaffected', () => {
    const scene = baseScene({
      set: [{ name: 'ground', geometry: { type: 'plane', width: 10, height: 10 }, material: { color: 0x888888 } }],
    });
    const model = storedSceneToModel(scene, []);
    expect(model.meshes.map((m) => m.name)).toEqual(['ground']);
  });
});

describe('storedSceneToModel – duration', () => {
  it('passes duration through to the model', () => {
    const model = storedSceneToModel(baseScene({ duration: 42 }), []);
    expect(model.duration).toBe(42);
  });

  it('handles absent duration by defaulting to 10', () => {
    const scene = baseScene();
    delete (scene as Partial<StoredScene>).duration;
    const model = storedSceneToModel(scene, []);
    expect(model.duration).toBe(10);
  });
});

// ── Actions ───────────────────────────────────────────────────────────────────

describe('storedSceneToModel – actions', () => {
  it('converts animate actions into model actions', () => {
    const scene = baseScene({
      stagedActors: [{ actorId: 'actor-r' }],
      actions: [
        { type: 'animate', actorId: 'actor-r', animationName: 'Walk', startTime: 2, endTime: 8, loop: 'once' },
      ],
    });
    const model = storedSceneToModel(scene, [robotActor]);
    // Explicit animate action + auto-generated idle track for actor with defaultAnimation.
    expect(model.actions).toHaveLength(2);
    const walkAction = model.actions.find((a) => a.name.includes('Walk'));
    expect(walkAction).toBeDefined();
  });

  it('converts speak actions into speechEntries (not model actions)', () => {
    const scene = baseScene({
      stagedActors: [{ actorId: 'actor-r' }],
      actions: [
        { type: 'speak', actorId: 'actor-r', startTime: 1, text: 'Hello.' },
      ],
    });
    const model = storedSceneToModel(scene, [robotActor]);
    // Speak action → speechEntry, not a model action.
    // Auto-idle track is generated for actor-r (robot-expressive has defaultAnimation).
    const animateActions = model.actions.filter((a) => a.target === 'actor-r');
    expect(animateActions).toHaveLength(1); // auto-idle only
    expect(model.speechEntries).toHaveLength(1);
    expect(model.speechEntries[0].text).toBe('Hello.');
    expect(model.speechEntries[0].actorId).toBe('actor-r');
  });

  it('speak entry inherits the actor voice', () => {
    const scene = baseScene({
      stagedActors: [{ actorId: 'actor-r' }],
      actions: [{ type: 'speak', actorId: 'actor-r', startTime: 1, text: 'Hi.' }],
    });
    const model = storedSceneToModel(scene, [robotActor]);
    // First actor (index 0) gets the female voice (af_heart).
    expect(model.speechEntries[0].voice?.kokoro).toBe('af_heart');
  });

  it('sequences multiple speak entries in stored order', () => {
    const scene = baseScene({
      stagedActors: [
        { actorId: 'actor-r' },
        { actorId: 'actor-b' },
      ],
      actions: [
        { type: 'speak', actorId: 'actor-r', startTime: 1,   text: 'Line one.' },
        { type: 'speak', actorId: 'actor-b', startTime: 3.5, text: 'Line two.' },
      ],
    });
    const model = storedSceneToModel(scene, [robotActor, actorB]);
    expect(model.speechEntries[0].text).toBe('Line one.');
    expect(model.speechEntries[1].text).toBe('Line two.');
  });
});

// ── Placeholder setting (Track CAT, CAT-2) ────────────────────────────────────

describe('storedSceneToModel – placeholder setting', () => {
  it('threads placeholderSetting through to the model', () => {
    const scene = baseScene({ placeholderSetting: 'CLASSROOM' });
    const model = storedSceneToModel(scene, []);

    expect(model.placeholderSetting).toEqual({ label: 'CLASSROOM' });
  });

  it('leaves placeholderSetting undefined when not set', () => {
    const model = storedSceneToModel(baseScene(), []);

    expect(model.placeholderSetting).toBeUndefined();
  });
});

// ── Document-backed set pieces (step 5) ────────────────────────────────────────

describe('storedSceneToModel – document-backed set pieces', () => {
  const document: SetDocument = {
    version: 2,
    root: [
      {
        kind: 'part',
        id: 'cube',
        role: 'prop',
        part: {
          id: 'part-cube',
          kind: 'primitive',
          name: 'Box',
          position: [0, 0.5, 0],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
          color: 0x8844aa,
        },
      },
    ],
    joints: [],
  };

  function documentPiece(overrides: Partial<SetPiece> = {}): SetPiece {
    return {
      name: 'classroom',
      catalogueId: 'classroom',
      geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 },
      material: { color: 0 },
      ...overrides,
    };
  }

  it('realises the entry document into a group instead of a mesh', () => {
    const scene = baseScene({ set: [documentPiece({ position: [0, 1, 0] })] });
    const model = storedSceneToModel(scene, [], [{ id: 'classroom', hasDocument: true, document }]);

    expect(model.meshes).toHaveLength(0);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].name).toBe('classroom');
    // The piece's placement lands on the whole set; inner parts keep local transforms.
    expect(model.groups[0].position.toArray()).toEqual([0, 1, 0]);
    expect(model.groups[0].threeObject.children).toHaveLength(1);
    expect(model.groups[0].threeObject.children[0].position.toArray()).toEqual([0, 0.5, 0]);
  });

  it('realises document and plain pieces side by side', () => {
    const scene = baseScene({
      set: [
        documentPiece(),
        { name: 'ground', geometry: { type: 'plane', width: 10, height: 10 }, material: { color: 0x888888 } },
      ],
    });
    const model = storedSceneToModel(scene, [], [{ id: 'classroom', hasDocument: true, document }]);

    expect(model.groups.map((g) => g.name)).toEqual(['classroom']);
    expect(model.meshes.map((m) => m.name)).toEqual(['ground']);
  });

  it('falls back to the placeholder piece when no document was materialised', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({ set: [documentPiece()] });
    const model = storedSceneToModel(scene, [], [{ id: 'classroom', hasDocument: true }]);

    expect(model.groups).toHaveLength(0);
    expect(model.meshes.map((m) => m.name)).toEqual(['classroom']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('classroom'));
    warn.mockRestore();
  });

  it('leaves a piece without a catalogueId on the mesh path', () => {
    const scene = baseScene({ set: [{ name: 'loose', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0 } }] });
    const model = storedSceneToModel(scene, [], [{ id: 'classroom', hasDocument: true, document }]);

    expect(model.groups).toHaveLength(0);
    expect(model.meshes.map((m) => m.name)).toEqual(['loose']);
  });
});

