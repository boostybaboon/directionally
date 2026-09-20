import { describe, it, expect, vi } from 'vitest';
import { storedSceneToModel } from './storedSceneToModel';
import { PerspectiveCameraAsset } from '../../lib/model/Camera';
import { PointLightAsset } from '../../lib/model/Light';
import type { StoredScene, StoredActor } from './types';
import type { SetPiece } from '../domain/types';
import type { SetDocument, SetNode } from '../sketcher/documentTree';
import type { Transform } from '../sketcher/transform';

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
  it('builds a point light instead of skipping it', () => {
    const scene = baseScene({
      lights: [{ type: 'point', id: 'lamp', color: 0xffeeaa, intensity: 4, distance: 8, decay: 1.5, position: [1, 2, 3] }],
    });

    const model = storedSceneToModel(scene, []);

    expect(model.lights).toHaveLength(1);
    const lamp = model.lights[0];
    expect(lamp).toBeInstanceOf(PointLightAsset);
    expect(lamp.intensity).toBe(4);
    expect((lamp as PointLightAsset).distance).toBe(8);
    expect((lamp as PointLightAsset).decay).toBe(1.5);
    expect(lamp.position.toArray()).toEqual([1, 2, 3]);
  });
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

  it('realises a bundled entry into its document tree, placed by the piece transform', () => {
    const scene = baseScene({
      set: [{ name: 'chair-1', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 }, position: [2, 0, 0] }],
    });
    const model = storedSceneToModel(scene, []);

    expect(model.meshes).toHaveLength(0);
    expect(model.groups.map((g) => g.name)).toEqual(['chair-1/chair']);
    // The piece transform places the whole prop; its parts keep local transforms.
    expect(model.groups[0].position.toArray()).toEqual([2, 0, 0]);
    expect(model.groups[0].threeObject.children).toHaveLength(6);
  });

  it('falls back to the placeholder piece for an unknown catalogue id', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({
      set: [{ name: 'ghost', catalogueId: 'no-such-entry', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0x888888 } }],
    });
    const model = storedSceneToModel(scene, []);

    expect(model.groups).toHaveLength(0);
    expect(model.meshes.map((m) => m.name)).toEqual(['ghost']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no-such-entry'));
    warn.mockRestore();
  });
});

describe('storedSceneToModel – instances inside a document', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  function leaf(id: string): SetNode {
    return {
      id,
      role: 'prop',
      transform: { ...identity },
      children: [],
      content: { id: `${id}-part`, kind: 'primitive', name: 'Box', color: 0x8844aa },
    };
  }

  function instance(id: string, ref: string, position: [number, number, number]): SetNode {
    return { id, role: 'structure', ref, transform: { ...identity, position }, children: [] };
  }

  // legs-item ← chair-item ← classroom: an instance of a Definition that is itself an assembly.
  const legs: SetDocument = { root: [leaf('left'), leaf('right')], joints: [] };
  const chair: SetDocument = { root: [leaf('seat'), instance('chair-legs-item', 'legs-item', [0, -0.4, 0])], joints: [] };
  const classroom: SetDocument = { root: [instance('chair-1', 'chair-item', [1, 0, 0]), leaf('desk')], joints: [] };

  function pieceFor(id: string): SetPiece {
    return {
      name: id,
      catalogueId: id,
      geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 },
      material: { color: 0 },
    };
  }

  it('expands a ref node from the entry list, and the instances inside its Definition', () => {
    const scene = baseScene({ set: [pieceFor('classroom')] });
    const model = storedSceneToModel(scene, [], [
      { kind: 'set-piece', id: 'classroom', hasDocument: true, document: classroom },
      { kind: 'set-piece', id: 'chair-item', hasDocument: true, document: chair },
      { kind: 'set-piece', id: 'legs-item', hasDocument: true, document: legs },
    ]);

    expect(model.meshes).toHaveLength(0);
    const set = model.groups[0].threeObject;
    expect(set.children).toHaveLength(2);
    // The instance stands for its Definition's geometry, at the node's own transform.
    const chairInstance = set.children[0];
    expect(chairInstance.userData).toMatchObject({ isRefNode: true, ref: 'chair-item' });
    expect(chairInstance.position.toArray()).toEqual([1, 0, 0]);
    expect(chairInstance.children).toHaveLength(2);
    // A Definition may hold an instance of its own: one lookup per instance, recursion in the realiser.
    const legInstance = chairInstance.children[1];
    expect(legInstance.userData.ref).toBe('legs-item');
    expect(legInstance.position.y).toBeCloseTo(-0.4);
    expect(legInstance.children).toHaveLength(2);
  });

  it('applies an instance override, and reports one its Definition cannot answer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const overridden: SetDocument = {
      root: [
        {
          ...instance('chair-1', 'chair-item', [1, 0, 0]),
          overrides: [
            { path: 'seat', op: 'remove' },
            { path: 'gone', op: 'set', value: { hidden: true } },
          ],
        },
        leaf('desk'),
      ],
      joints: [],
    };
    const model = storedSceneToModel(baseScene({ set: [pieceFor('classroom')] }), [], [
      { kind: 'set-piece', id: 'classroom', hasDocument: true, document: overridden },
      { kind: 'set-piece', id: 'chair-item', hasDocument: true, document: chair },
      { kind: 'set-piece', id: 'legs-item', hasDocument: true, document: legs },
    ]);

    // The instance stands for the Definition minus its removed seat: the legs remain.
    const chairInstance = model.groups[0].threeObject.children[0];
    expect(chairInstance.children).toHaveLength(1);
    expect(chairInstance.children[0].userData.ref).toBe('legs-item');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"gone"'));
    warn.mockRestore();
  });

  it('renders nothing for an instance whose Definition is missing, and says which', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({ set: [pieceFor('classroom')] });
    const model = storedSceneToModel(scene, [], [
      { kind: 'set-piece', id: 'classroom', hasDocument: true, document: classroom },
      { kind: 'set-piece', id: 'chair-item', hasDocument: true, document: chair },
    ]);

    // The chair is there with its own part; only the missing assembly contributes nothing.
    const chairInstance = model.groups[0].threeObject.children[0];
    expect(chairInstance.children).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"legs-item"'));
    warn.mockRestore();
  });
});

describe('storedSceneToModel – block targets', () => {
  function withBlocks(blocks: StoredScene['blocks']): StoredScene {
    return baseScene({ blocks, lights: [
      { type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2 },
      { type: 'point', id: 'lamp', color: 0xffffff, intensity: 1, position: [0, 2, 0] },
    ] });
  }

  const lightBlock = (lightId: string): NonNullable<StoredScene['blocks']>[number] => ({
    type: 'lightBlock', lightId, startTime: 0, endTime: 1, endIntensity: 0,
  });

  it('says which light a block missed, rather than compiling a track nobody reads', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    storedSceneToModel(withBlocks([lightBlock('classroom/ceiling')]), []);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"classroom/ceiling"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('piece/light'));
    warn.mockRestore();
  });

  it('says nothing for a light the scene has, a setting’s included', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    storedSceneToModel(withBlocks([lightBlock('sky'), lightBlock('lamp')]), []);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('resolves a set-piece block against the pieces the renderer draws, not only the stored ones', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({
      set: [{ name: 'chair-1', ref: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 } }],
      blocks: [{ type: 'setPieceBlock', targetId: 'chair-1/chair', startTime: 0, endTime: 1, endPosition: [2, 0, 0] }],
    });

    // The scene stores the reference; the resolver expands it, and the expanded name is what a block
    // can legitimately target.
    storedSceneToModel(scene, []);

    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('says which set piece a block missed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({
      set: [{ name: 'chair-1', catalogueId: 'chair', geometry: { type: 'box', width: 0.01, height: 0.01, depth: 0.01 }, material: { color: 0 } }],
      blocks: [{ type: 'setPieceBlock', targetId: 'nope', startTime: 0, endTime: 1, endPosition: [2, 0, 0] }],
    });

    storedSceneToModel(scene, []);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope"'));
    warn.mockRestore();
  });
});

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
    root: [
      {
        id: 'cube',
        role: 'prop',
        transform: { position: [0, 0.5, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
        children: [],
        content: { id: 'part-cube', kind: 'primitive', name: 'Box', color: 0x8844aa },
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
    const model = storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true, document }]);

    expect(model.meshes).toHaveLength(0);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].name).toBe('classroom');
    // The piece's placement lands on the whole set; inner parts keep local transforms.
    expect(model.groups[0].position.toArray()).toEqual([0, 1, 0]);
    expect(model.groups[0].threeObject.children).toHaveLength(1);
    expect(model.groups[0].threeObject.children[0].position.toArray()).toEqual([0, 0.5, 0]);
  });

  it('replays a piece’s own overrides over the document — the scene’s dressing', () => {
    const scene = baseScene({
      set: [documentPiece({
        overrides: [{
          path: 'cube',
          op: 'set',
          value: { transform: { position: [0, 2, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
        }],
      })],
    });
    const model = storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true, document }]);

    // The document is the venue; this is what the scene does to it.
    expect(model.groups[0].threeObject.children[0].position.toArray()).toEqual([0, 2, 0]);
  });

  it('reports a dressing override its document no longer answers to', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({ set: [documentPiece({ overrides: [{ path: 'gone', op: 'remove' }] })] });
    storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true, document }]);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('document no longer has'));
    warn.mockRestore();
  });

  it('realises document and plain pieces side by side', () => {
    const scene = baseScene({
      set: [
        documentPiece(),
        { name: 'ground', geometry: { type: 'plane', width: 10, height: 10 }, material: { color: 0x888888 } },
      ],
    });
    const model = storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true, document }]);

    expect(model.groups.map((g) => g.name)).toEqual(['classroom']);
    expect(model.meshes.map((m) => m.name)).toEqual(['ground']);
  });

  it("adds a setting's own lights and environment from its document", () => {
    const lit: SetDocument = {
      ...document,
      root: [
        ...document.root,
        {
          id: 'lamp',
          role: 'light',
          transform: { position: [0, 2, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          children: [],
          // A point light, as the light panel can place one: it used to be skipped at this boundary.
          light: { type: 'point', color: 0xffffff, intensity: 3, distance: 6, decay: 2 },
        },
      ],
      environmentMap: 'exterior-sky',
    };
    const scene = baseScene({ set: [documentPiece()] });
    const model = storedSceneToModel(scene, [], [
      { kind: 'set-piece', id: 'classroom', hasDocument: true, document: lit },
    ]);

    // A setting's light joins the scene's lights — where light animation addresses it —
    // rather than riding inside the realised group as geometry.
    // It is named by the piece that brought it, so two settings can each have their own `lamp`.
    expect(model.lights.map((l) => l.name)).toEqual(['sky', 'classroom/lamp']);
    expect(model.environmentMap).toBe('exterior-sky');
    expect(model.groups[0].threeObject.children).toHaveLength(1);
  });

  it("names a setting's lights by the piece that brought them", () => {
    const lit: SetDocument = {
      root: [
        {
          id: 'ceiling',
          role: 'light',
          transform: { position: [0, 3, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          children: [],
          light: { type: 'directional', color: 0xffffff, intensity: 1 },
        },
      ],
      joints: [],
    };
    const scene = baseScene({
      // The scene's own light is called `sky` too: the two have to stay tellable apart.
      lights: [{ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2 }],
      set: [documentPiece()],
    });

    const model = storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true, document: lit }]);

    expect(model.lights.map((l) => l.name)).toEqual(['sky', 'classroom/ceiling']);
  });

  it("lets the scene's own environment win over the setting's", () => {
    const scene = baseScene({ set: [documentPiece()], environmentMap: 'scene-sky' });
    const model = storedSceneToModel(scene, [], [
      { kind: 'set-piece', id: 'classroom', hasDocument: true, document: { ...document, environmentMap: 'exterior-sky' } },
    ]);

    expect(model.environmentMap).toBe('scene-sky');
  });

  it('falls back to the placeholder piece when no document was materialised', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scene = baseScene({ set: [documentPiece()] });
    const model = storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true }]);

    expect(model.groups).toHaveLength(0);
    expect(model.meshes.map((m) => m.name)).toEqual(['classroom']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('classroom'));
    warn.mockRestore();
  });

  it('leaves a piece without a catalogueId on the mesh path', () => {
    const scene = baseScene({ set: [{ name: 'loose', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0 } }] });
    const model = storedSceneToModel(scene, [], [{ kind: 'set-piece', id: 'classroom', hasDocument: true, document }]);

    expect(model.groups).toHaveLength(0);
    expect(model.meshes.map((m) => m.name)).toEqual(['loose']);
  });
});

