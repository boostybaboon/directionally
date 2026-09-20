import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { storedSceneToModelAsync } from './storedSceneToModel.js';
import {
  _setDirectoryProvider,
  _resetDirectoryProvider,
  createSetPieceDocument,
} from './OPFSCatalogueStore.js';
import type { SetDocument } from '../sketcher/documentTree.js';
import type { StoredScene, StoredActor } from './types.js';

// The browser-only GLB materialisation (GLTFLoader.loadAsync + URL.createObjectURL)
// can't run in Node; mock it so we can verify the async wrapper turns a spec into
// a gltfPath and delegates to the sync deserialiser correctly.
vi.mock('../character/specCharacter.js', () => ({
  specCharacterToGlbUrl: async () => 'blob:mock-spec-character',
}));

/** In-memory OPFS mock — enough for reading back a stored document. */
function createMockDir() {
  const files = new Map<string, Blob>();
  const handle = {
    getFileHandle(name: string, options?: { create?: boolean }) {
      if (!options?.create && !files.has(name)) {
        return Promise.reject(new DOMException('Not found', 'NotFoundError'));
      }
      return Promise.resolve({
        getFile: () => Promise.resolve(files.get(name) ?? new Blob()),
        createWritable: () => {
          const chunks: BlobPart[] = [];
          return Promise.resolve({
            write: (data: BlobPart) => { chunks.push(data); return Promise.resolve(); },
            close: () => { files.set(name, new Blob(chunks)); return Promise.resolve(); },
          });
        },
      });
    },
    removeEntry: (name: string) => { files.delete(name); return Promise.resolve(); },
  } as unknown as FileSystemDirectoryHandle;
  return { handle, files };
}

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

describe('storedSceneToModelAsync – document-backed sets (step 5)', () => {
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

  beforeEach(() => {
    const mock = createMockDir();
    _setDirectoryProvider(async () => mock.handle);
  });

  afterEach(() => _resetDirectoryProvider());

  it('loads the entry document from OPFS and realises it', async () => {
    const entry = await createSetPieceDocument('Classroom', { document });
    const piece = {
      name: entry.id,
      catalogueId: entry.id,
      geometry: { type: 'box' as const, width: 0.01, height: 0.01, depth: 0.01 },
      material: { color: 0 },
    };

    const model = await storedSceneToModelAsync(baseScene({ set: [piece] }), [], [
      { id: entry.id, kind: 'set-piece', hasDocument: true },
    ]);

    expect(model.meshes).toHaveLength(0);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].threeObject.children).toHaveLength(1);
  });

  it('realises a bundled entry — inline document, no OPFS read', async () => {
    const piece = {
      name: 'bundled',
      catalogueId: 'bundled',
      geometry: { type: 'box' as const, width: 0.01, height: 0.01, depth: 0.01 },
      material: { color: 0 },
    };

    const model = await storedSceneToModelAsync(baseScene({ set: [piece] }), [], [
      { id: 'bundled', kind: 'set-piece', document },
    ]);

    expect(model.meshes).toHaveLength(0);
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].threeObject.children).toHaveLength(1);
  });

  it('loads the Definitions a document refers to, at any depth', async () => {
    const leaf = (id: string) => ({
      id,
      role: 'prop' as const,
      transform: { position: [0, 0, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number] },
      children: [],
      content: { id: `${id}-part`, kind: 'primitive' as const, name: 'Box', color: 0x8844aa },
    });
    const chair = await createSetPieceDocument('Chair item', {
      document: { root: [leaf('seat'), leaf('back')], joints: [] },
    });
    const classroom = await createSetPieceDocument('Classroom', {
      document: {
        root: [
          { ...leaf('chair-slot'), ref: chair.id, content: undefined },
          leaf('desk'),
        ],
        joints: [],
      },
    });

    const piece = {
      name: classroom.id,
      catalogueId: classroom.id,
      geometry: { type: 'box' as const, width: 0.01, height: 0.01, depth: 0.01 },
      material: { color: 0 },
    };
    // Only the classroom is listed: its instance of the chair is a second entry, read from OPFS.
    const model = await storedSceneToModelAsync(baseScene({ set: [piece] }), [], [
      { id: classroom.id, kind: 'set-piece', hasDocument: true },
    ]);

    const instance = model.groups[0].threeObject.children[0];
    expect(instance.userData).toMatchObject({ isRefNode: true, ref: chair.id });
    expect(instance.children).toHaveLength(2);
  });
});
