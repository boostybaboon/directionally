import { describe, it, expect, vi } from 'vitest';
import { storedSceneToModelAsync } from './storedSceneToModel.js';
import type { StoredScene, StoredActor } from './types.js';

// The browser-only GLB materialisation (GLTFLoader.loadAsync + URL.createObjectURL)
// can't run in Node; mock it so we can verify the async wrapper turns a spec into
// a gltfPath and delegates to the sync deserialiser correctly.
vi.mock('../character/specCharacter.js', () => ({
  specCharacterToGlbUrl: async () => 'blob:mock-spec-character',
}));

function baseScene(overrides: Partial<StoredScene> = {}): StoredScene {
  return {
    camera: { fov: 50, near: 0.1, far: 100, position: [0, 5, 12], lookAt: [0, 1, 0] },
    lights: [{ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2 }],
    set: [],
    stagedActors: [],
    actions: [],
    duration: 10,
    ...overrides,
  };
}

describe('storedSceneToModelAsync', () => {
  it('materialises a spec-backed character into a GLB url before delegating', async () => {
    const scene = baseScene({ stagedActors: [{ actorId: 'actor-bernard', startPosition: [0, 0, 0] }] });
    const bernard: StoredActor = { id: 'actor-bernard', role: 'Bernard', catalogueId: 'char-1' };
    const specEntry = { id: 'char-1', kind: 'character', spec: { build: 0.6 }, defaultAnimation: 'idle' };

    const model = await storedSceneToModelAsync(scene, [bernard], [specEntry]);

    expect(model.gltfs).toHaveLength(1);
    expect(model.gltfs[0].url).toBe('blob:mock-spec-character');
  });

  it('leaves a GLB-backed character untouched', async () => {
    const scene = baseScene({ stagedActors: [{ actorId: 'actor-robot', startPosition: [0, 0, 0] }] });
    const robot: StoredActor = { id: 'actor-robot', role: 'Robot', catalogueId: 'robot-expressive' };

    const model = await storedSceneToModelAsync(scene, [robot], []);

    expect(model.gltfs).toHaveLength(1);
    expect(model.gltfs[0].url).toBe('/models/gltf/RobotExpressive.glb');
  });
});
