import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import {
  _setDirectoryProvider,
  _resetDirectoryProvider,
  list,
  add,
  remove,
  update,
  findByAssemblyId,
} from './OPFSCatalogueStore';

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
});
