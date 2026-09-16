import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
  _setDirectoryProvider,
  _resetDirectoryProvider,
  list,
  listDocuments,
  add,
  remove,
  update,
  findBySourceDesignId,
  findByLabel,
  createSetPieceDocument,
  getDocument,
  saveDocument,
  updateSetPieceMeta,
} from './OPFSCatalogueStore';
import type { SetDocument } from '../sketcher/documentTree.js';
import type { UserCatalogueEntry } from './OPFSCatalogueStore.js';

// ── In-memory OPFS mock ───────────────────────────────────────────────────────

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

/** gltfPath is character-only: a set-piece is document-backed (step 8). */
function characterGltfPath(entry: UserCatalogueEntry): string | undefined {
  return entry.kind === 'character' ? entry.gltfPath : undefined;
}

// ── Test setup ────────────────────────────────────────────────────────────────

// URL.createObjectURL is a browser-only API; stub it for Node
beforeAll(() => {
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:test-url');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

let mockDir: ReturnType<typeof createMockDir>;

beforeEach(() => {
  mockDir = createMockDir();
  _setDirectoryProvider(() => Promise.resolve(mockDir.handle));
  vi.mocked(URL.createObjectURL).mockReturnValue('blob:test-url');
});

afterEach(() => {
  _resetDirectoryProvider();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OPFSCatalogueStore – list', () => {
  it('returns empty array when no assets have been saved', async () => {
    expect(await list()).toEqual([]);
  });
});

describe('OPFSCatalogueStore – add + list', () => {
  it('add() a character → list() returns it with expected fields', async () => {
    const blob = new Blob(['glb-data'], { type: 'model/gltf-binary' });
    const entry = await add(blob, { kind: 'character', label: 'My Robot' });

    expect(entry.kind).toBe('character');
    expect(entry.label).toBe('My Robot');
    expect(characterGltfPath(entry)).toBe('blob:test-url');
    expect(entry.userAdded).toBe(true);
    expect(typeof entry.id).toBe('string');
    expect(entry.id.length).toBeGreaterThan(0);
    expect(entry.addedAt).toBeGreaterThan(0);
  });

  it('add() a character → list() returns it', async () => {
    const entry = await add(new Blob(['data']), { kind: 'character', label: 'Bob' });
    const listed = await list();

    expect(listed).toHaveLength(1);
    expect(listed[0].id).toBe(entry.id);
    expect(listed[0].kind).toBe('character');
    expect(listed[0].label).toBe('Bob');
    expect(characterGltfPath(listed[0])).toBe('blob:test-url');
    expect(listed[0].userAdded).toBe(true);
  });

  it('a set-piece is created from its document and joins the catalogue straight away', async () => {
    const entry = await createSetPieceDocument('Chair');

    expect(entry.kind).toBe('set-piece');
    expect(entry.label).toBe('Chair');
    expect(entry.hasDocument).toBe(true);
    // The document *is* the artefact: no bake, no publish step.
    expect(mockDir.files.has(`${entry.id}.glb`)).toBe(false);
    const listed = await list();
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe('set-piece');
    expect(listed[0].label).toBe('Chair');
  });

  it('createSetPieceDocument() captures the setting metadata', async () => {
    const entry = await createSetPieceDocument('Classroom', {
      isSetting: true,
      environmentId: 'env-night-sky',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
    });

    expect(entry.kind).toBe('set-piece');
    const piece = entry as Extract<typeof entry, { kind: 'set-piece' }>;
    expect(piece.isSetting).toBe(true);
    expect(piece.environmentId).toBe('env-night-sky');
    expect(piece.lights).toEqual([
      { id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] },
    ]);

    const listed = await list();
    expect(listed).toHaveLength(1);
    const listedPiece = listed[0] as Extract<(typeof listed)[0], { kind: 'set-piece' }>;
    expect(listedPiece.environmentId).toBe('env-night-sky');
    expect(listedPiece.lights).toEqual(piece.lights);
  });

  it('add() preserves optional character fields', async () => {
    const entry = await add(new Blob(['data']), {
      kind: 'character',
      label: 'Guard',
      defaultAnimation: 'Idle',
      defaultScale: 1.5,
      defaultRotation: [0, Math.PI, 0],
    });

    expect(entry.kind).toBe('character');
    const char = entry as Extract<typeof entry, { kind: 'character' }>;
    expect(char.defaultAnimation).toBe('Idle');
    expect(char.defaultScale).toBe(1.5);
    expect(char.defaultRotation).toEqual([0, Math.PI, 0]);
  });

  it('add() multiple assets → list() returns all', async () => {
    await add(new Blob(['a']), { kind: 'character', label: 'A' });
    await add(new Blob(['b']), { kind: 'character', label: 'B' });
    expect(await list()).toHaveLength(2);
  });
});

describe('OPFSCatalogueStore – remove', () => {
  it('remove() an entry → list() no longer returns it', async () => {
    const entry = await add(new Blob(['data']), { kind: 'character', label: 'Temp' });
    await remove(entry.id);
    expect(await list()).toHaveLength(0);
  });

  it('remove() with unknown id is a no-op', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Keep' });
    await remove('non-existent-id');
    expect(await list()).toHaveLength(1);
  });

  it('remove() one of many leaves others intact', async () => {
    const a = await add(new Blob(['a']), { kind: 'character', label: 'A' });
    await add(new Blob(['b']), { kind: 'character', label: 'B' });
    await remove(a.id);
    const listed = await list();
    expect(listed).toHaveLength(1);
    expect(listed[0].label).toBe('B');
  });
});

describe('OPFSCatalogueStore – metadata persistence', () => {
  it('metadata survives across separate list() calls on the same backing store', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Persistent' });
    const first = await list();
    const second = await list();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0].id).toBe(first[0].id);
  });

  it('stale metadata entry is silently skipped when OPFS file is missing', async () => {
    const entry = await add(new Blob(['data']), { kind: 'character', label: 'Gone' });
    // Manually delete the GLB file but leave metadata intact
    mockDir.files.delete(`${entry.id}.glb`);
    const listed = await list();
    expect(listed).toHaveLength(0);
  });
});

describe('OPFSCatalogueStore – sourceDesignId', () => {
  it('add() with sourceDesignId round-trips through list()', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Bernard' }, 'design-001');
    const listed = await list();
    expect(listed[0].sourceDesignId).toBe('design-001');
  });

  it('findBySourceDesignId() returns the matching entry', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Sonny' }, 'design-002');
    const found = await findBySourceDesignId('design-002');
    expect(found).not.toBeNull();
    expect(found!.label).toBe('Sonny');
    expect(found!.sourceDesignId).toBe('design-002');
  });

  it('findBySourceDesignId() returns null when no entry matches', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'C3PO' }, 'design-003');
    expect(await findBySourceDesignId('design-unknown')).toBeNull();
  });

  it('add() without sourceDesignId leaves sourceDesignId undefined', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Anonymous' });
    const listed = await list();
    expect(listed[0].sourceDesignId).toBeUndefined();
  });
});

describe('OPFSCatalogueStore – update (character bake)', () => {
  it('update() overwrites the GLB and returns the updated entry', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'character', label: 'Chair' });
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:updated-url');

    const updated = await update(entry.id, new Blob(['v2']));
    expect(updated).not.toBeNull();
    expect(characterGltfPath(updated!)).toBe('blob:updated-url');
    expect(updated!.label).toBe('Chair'); // label unchanged when not provided
  });

  it('update() with a new label updates it in metadata', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'character', label: 'Old Name' });
    await update(entry.id, new Blob(['v2']), 'New Name');
    const listed = await list();
    expect(listed[0].label).toBe('New Name');
  });

  it('update() preserves sourceDesignId', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'character', label: 'Bernard' }, 'design-005');
    await update(entry.id, new Blob(['v2']));
    const listed = await list();
    expect(listed[0].sourceDesignId).toBe('design-005');
  });

  it('update() with unknown id returns null without changing the store', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Keep' });
    const result = await update('non-existent-id', new Blob(['new']));
    expect(result).toBeNull();
    expect(await list()).toHaveLength(1);
  });

  it('saveDocument() persists environmentId and lights for a re-saved setting', async () => {
    const entry = await createSetPieceDocument('Garden');
    await saveDocument(entry.id, { version: 2, root: [], joints: [] }, {
      environmentId: 'env-exterior',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
    });

    const listed = await list();
    const piece = listed[0] as Extract<(typeof listed)[0], { kind: 'set-piece' }>;
    expect(piece.environmentId).toBe('env-exterior');
    expect(piece.lights).toEqual([
      { id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] },
    ]);
  });

  it('saveDocument() clears environmentId and lights when meta omits them', async () => {
    const entry = await createSetPieceDocument('Garden', {
      environmentId: 'env-exterior',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
    });

    await saveDocument(entry.id, { version: 2, root: [], joints: [] }, { environmentId: undefined, lights: undefined });
    const listed = await list();
    const piece = listed[0] as Extract<(typeof listed)[0], { kind: 'set-piece' }>;
    expect(piece.environmentId).toBeUndefined();
    expect(piece.lights).toBeUndefined();
  });

  it('saveDocument() writes metadata with the document in one pass', async () => {
    const entry = await createSetPieceDocument('AI Chair');
    const document: SetDocument = { version: 2, root: [], joints: [] };

    const updated = await saveDocument(entry.id, document, { partCount: 1 });
    expect(updated).not.toBeNull();
    expect(updated!.hasDocument).toBe(true);
    expect(updated!.partCount).toBe(1);

    const listed = await list();
    const piece = listed[0] as Extract<(typeof listed)[0], { kind: 'set-piece' }>;
    expect(piece.id).toBe(entry.id);
    expect(piece.label).toBe('AI Chair');
    expect(await getDocument(entry.id)).toEqual(document);
  });
});

describe('OPFSCatalogueStore – updateSetPieceMeta', () => {
  it('renames a set without touching its document', async () => {
    const document: SetDocument = { version: 2, root: [], joints: [] };
    const entry = await createSetPieceDocument('Draft');
    await saveDocument(entry.id, document);

    const renamed = await updateSetPieceMeta(entry.id, { label: '  Renamed  ' });
    expect(renamed).not.toBeNull();
    expect(renamed!.label).toBe('Renamed');
    expect(await getDocument(entry.id)).toEqual(document);
    // The document is what keeps a set in the catalogue: a rename can't drop it.
    const listed = await list();
    expect(listed).toHaveLength(1);
    expect(listed[0].label).toBe('Renamed');
  });

  it('flips the scenery/prop classification in place', async () => {
    const entry = await createSetPieceDocument('Chair', { isSetting: true });

    await updateSetPieceMeta(entry.id, { isSetting: false });
    const asProp = (await listDocuments())[0] as Extract<(typeof entry), { kind: 'set-piece' }>;
    expect(asProp.isSetting).toBe(false);

    await updateSetPieceMeta(entry.id, { isSetting: true });
    const asScenery = (await listDocuments())[0] as Extract<(typeof entry), { kind: 'set-piece' }>;
    expect(asScenery.isSetting).toBe(true);
  });

  it('leaves fields the caller omits alone', async () => {
    const entry = await createSetPieceDocument('Garden', {
      environmentId: 'env-exterior',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
      partCount: 3,
    });

    await updateSetPieceMeta(entry.id, { label: 'Yard' });
    const piece = (await listDocuments())[0] as Extract<(typeof entry), { kind: 'set-piece' }>;
    expect(piece.label).toBe('Yard');
    expect(piece.environmentId).toBe('env-exterior');
    expect(piece.lights).toHaveLength(1);
    expect(piece.partCount).toBe(3);
  });

  it('clears baseline lighting when the caller passes undefined', async () => {
    const entry = await createSetPieceDocument('Garden', {
      environmentId: 'env-exterior',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
    });

    await updateSetPieceMeta(entry.id, { environmentId: undefined, lights: undefined });
    const piece = (await listDocuments())[0] as Extract<(typeof entry), { kind: 'set-piece' }>;
    expect(piece.environmentId).toBeUndefined();
    expect(piece.lights).toBeUndefined();
  });

  it('marks the entry modified so a renamed set floats to the top of the column', async () => {
    vi.useFakeTimers();
    try {
      const older = await createSetPieceDocument('Older');
      vi.advanceTimersByTime(1000);
      const newer = await createSetPieceDocument('Newer');
      expect((await listDocuments())[0].id).toBe(newer.id);

      vi.advanceTimersByTime(1000);
      await updateSetPieceMeta(older.id, { label: 'Older set' });
      expect((await listDocuments())[0].id).toBe(older.id);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns null for a character entry and for an unknown id', async () => {
    const character = await add(new Blob(['data']), { kind: 'character', label: 'Nan' });
    expect(await updateSetPieceMeta(character.id, { label: 'Nope' })).toBeNull();
    expect((await list())[0].label).toBe('Nan');
    expect(await updateSetPieceMeta('non-existent-id', { label: 'Nope' })).toBeNull();
  });
});

describe('OPFSCatalogueStore – findByLabel', () => {
  it('findByLabel() returns an unpublished set case-insensitively', async () => {
    await createSetPieceDocument('Classroom');
    const found = await findByLabel('classroom');
    expect(found).not.toBeNull();
    expect(found!.label).toBe('Classroom');
  });

  it('findByLabel() returns null when no entry matches', async () => {
    expect(await findByLabel('missing')).toBeNull();
  });

  it('findByLabel() returns a GLB-backed character too', async () => {
    await add(new Blob(['data']), { kind: 'character', label: 'Baked' });
    const found = await findByLabel('baked');
    expect(found).not.toBeNull();
    expect(found!.label).toBe('Baked');
    expect('gltfPath' in found!).toBe(true);
  });
});
