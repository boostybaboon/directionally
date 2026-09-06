import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
  _setDirectoryProvider,
  _resetDirectoryProvider,
  list,
  add,
  remove,
  update,
  findByAssemblyId,
  addSetPiece,
  validateSetPieceMeta,
} from './OPFSCatalogueStore';
import type { SetPieceEntry } from '../catalogue/types.js';
import type { PlacedProp } from '../domain/types.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { resolveSettingSpec } from '../setting/settingSpec.js';

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
    expect(entry.gltfPath).toBe('blob:test-url');
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
    expect(listed[0].gltfPath).toBe('blob:test-url');
    expect(listed[0].userAdded).toBe(true);
  });

  it('add() a set-piece → list() returns it with geometry', async () => {
    const entry = await add(new Blob(['data']), { kind: 'set-piece', label: 'Chair' });

    expect(entry.kind).toBe('set-piece');
    expect(entry.label).toBe('Chair');
    const listed = await list();
    expect(listed).toHaveLength(1);
    expect(listed[0].kind).toBe('set-piece');
    // geometry placeholder is populated when caller omits it
    expect((listed[0] as Extract<typeof listed[0], { kind: 'set-piece' }>).geometry).toBeDefined();
  });

  it('add() a GLB set-piece as a setting → round-trips environmentId and lights', async () => {
    const entry = await add(new Blob(['data']), {
      kind: 'set-piece',
      label: 'Classroom',
      environmentId: 'env-night-sky',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
    });

    expect(entry.kind).toBe('set-piece');
    const piece = entry as Extract<typeof entry, { kind: 'set-piece' }>;
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

describe('OPFSCatalogueStore – sourceAssemblyId', () => {
  it('add() with sourceAssemblyId round-trips through list()', async () => {
    await add(new Blob(['data']), { kind: 'set-piece', label: 'Chair' }, 'asm-001');
    const listed = await list();
    expect(listed[0].sourceAssemblyId).toBe('asm-001');
  });

  it('findByAssemblyId() returns the matching entry', async () => {
    await add(new Blob(['data']), { kind: 'set-piece', label: 'Lamp' }, 'asm-002');
    const found = await findByAssemblyId('asm-002');
    expect(found).not.toBeNull();
    expect(found!.label).toBe('Lamp');
    expect(found!.sourceAssemblyId).toBe('asm-002');
  });

  it('findByAssemblyId() returns null when no entry matches', async () => {
    await add(new Blob(['data']), { kind: 'set-piece', label: 'Table' }, 'asm-003');
    expect(await findByAssemblyId('asm-unknown')).toBeNull();
  });

  it('add() without sourceAssemblyId leaves sourceAssemblyId undefined', async () => {
    await add(new Blob(['data']), { kind: 'set-piece', label: 'Box' });
    const listed = await list();
    expect(listed[0].sourceAssemblyId).toBeUndefined();
  });
});

describe('OPFSCatalogueStore – update', () => {
  it('update() overwrites the GLB and returns the updated entry', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'set-piece', label: 'Chair' }, 'asm-004');
    vi.mocked(URL.createObjectURL).mockReturnValue('blob:updated-url');

    const updated = await update(entry.id, new Blob(['v2']));
    expect(updated).not.toBeNull();
    expect(updated!.gltfPath).toBe('blob:updated-url');
    expect(updated!.label).toBe('Chair'); // label unchanged when not provided
  });

  it('update() with a new label updates it in metadata', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'set-piece', label: 'Old Name' });
    await update(entry.id, new Blob(['v2']), 'New Name');
    const listed = await list();
    expect(listed[0].label).toBe('New Name');
  });

  it('update() preserves sourceAssemblyId', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'set-piece', label: 'Chair' }, 'asm-005');
    await update(entry.id, new Blob(['v2']));
    const listed = await list();
    expect(listed[0].sourceAssemblyId).toBe('asm-005');
  });

  it('update() with unknown id returns null without changing the store', async () => {
    await add(new Blob(['data']), { kind: 'set-piece', label: 'Keep' });
    const result = await update('non-existent-id', new Blob(['new']));
    expect(result).toBeNull();
    expect(await list()).toHaveLength(1);
  });

  it('update() persists environmentId and lights for a re-saved setting', async () => {
    const entry = await add(new Blob(['v1']), { kind: 'set-piece', label: 'Garden' }, 'asm-006');
    await update(entry.id, new Blob(['v2']), 'Garden', {
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

  it('update() clears environmentId and lights when meta omits them', async () => {
    const entry = await add(new Blob(['v1']), {
      kind: 'set-piece',
      label: 'Garden',
      environmentId: 'env-exterior',
      lights: [{ id: 'l1', type: 'point', color: 0xffffff, intensity: 1, position: [0, 2, 0] }],
    }, 'asm-007');

    await update(entry.id, new Blob(['v2']), 'Garden', { environmentId: undefined, lights: undefined });
    const listed = await list();
    const piece = listed[0] as Extract<(typeof listed)[0], { kind: 'set-piece' }>;
    expect(piece.environmentId).toBeUndefined();
    expect(piece.lights).toBeUndefined();
  });
});

describe('OPFSCatalogueStore – addSetPiece (procedural / composite)', () => {
  const composeChair: PlacedProp[] = [
    { name: 'seat', geometry: { type: 'box', width: 0.5, height: 0.1, depth: 0.5 }, material: { color: 0x663311 }, position: [0, 0.45, 0] },
  ];

  it('persists a composite set-piece and lists it with compose (no gltfPath)', async () => {
    const entry = await addSetPiece({ label: 'AI Chair', compose: composeChair });

    expect(entry.kind).toBe('set-piece');
    expect(entry.label).toBe('AI Chair');
    expect('gltfPath' in entry).toBe(false);
    expect((entry as SetPieceEntry).compose).toEqual(composeChair);
    expect(entry.userAdded).toBe(true);

    const listed = await list();
    expect(listed).toHaveLength(1);
    expect((listed[0] as SetPieceEntry).compose).toEqual(composeChair);
  });

  it('persists a procedural leaf set-piece with geometry + material', async () => {
    await addSetPiece({
      label: 'AI Blackboard',
      geometry: { type: 'box', width: 2, height: 1, depth: 0.1 },
      material: { color: 0x112233 },
    });

    const listed = await list();
    expect((listed[0] as SetPieceEntry).geometry).toMatchObject({ type: 'box' });
    expect((listed[0] as SetPieceEntry).material?.color).toBe(0x112233);
    expect('gltfPath' in listed[0]).toBe(false);
  });

  it('rejects invalid metadata', async () => {
    await expect(addSetPiece({ label: '' })).rejects.toThrow('label is required');
    await expect(addSetPiece({ label: 'X' })).rejects.toThrow('compose');
    await expect(addSetPiece({ label: 'X', compose: [{ ref: 'box' }, {} as never] })).rejects.toThrow('ref');
  });

  it('remove() deletes a metadata-only entry', async () => {
    const entry = await addSetPiece({ label: 'Temp', compose: composeChair });
    await remove(entry.id);
    expect(await list()).toHaveLength(0);
  });

  it('composite metadata survives across list() calls', async () => {
    await addSetPiece({ label: 'Persistent Chair', compose: composeChair });
    expect((await list())[0].label).toBe('Persistent Chair');
    expect((await list())[0].label).toBe('Persistent Chair');
  });

  it('a saved composite is reusable by the setting resolver', async () => {
    await addSetPiece({ label: 'AI Chair', compose: composeChair });
    const listed = await list();

    const r = resolveSettingSpec({ props: [{ ref: 'AI Chair' }] }, [...CATALOGUE_ENTRIES, ...listed]);
    expect(r.unresolved).toEqual([]);
    expect(r.set.some((p) => p.name === 'seat')).toBe(true);
  });

  it('round-trips environmentId and lights for a saved setting', async () => {
    await addSetPiece({
      label: 'AI Classroom',
      compose: composeChair,
      environmentId: 'exterior-sky',
      lights: [{ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 1 }],
    });

    const listed = await list();
    const piece = listed[0] as SetPieceEntry;
    expect(piece.environmentId).toBe('exterior-sky');
    expect(piece.lights).toHaveLength(1);
    expect(piece.lights?.[0].id).toBe('sky');
  });
});

describe('validateSetPieceMeta', () => {
  it('accepts a composite and a leaf', () => {
    expect(validateSetPieceMeta({ label: 'Chair', compose: [{ ref: 'box' }] })).toBeNull();
    expect(
      validateSetPieceMeta({ label: 'Board', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0 } }),
    ).toBeNull();
  });

  it('rejects missing label, empty/both shapes, and malformed compose items', () => {
    expect(validateSetPieceMeta({ label: '' })).toBe('label is required');
    expect(validateSetPieceMeta({ label: 'X' })).toContain('compose');
    expect(
      validateSetPieceMeta({ label: 'X', compose: [{ ref: 'box' }], geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0 } }),
    ).toContain('not both');
    expect(validateSetPieceMeta({ label: 'X', compose: [{ ref: 'box' }, {} as never] })).toContain('ref');
  });
});
