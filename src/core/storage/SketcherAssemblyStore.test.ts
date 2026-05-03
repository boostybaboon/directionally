import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  _setDirectoryProvider,
  _resetDirectoryProvider,
  list,
  get,
  create,
  save,
  remove,
} from './SketcherAssemblyStore';
import type { SketcherDraft } from '../sketcher/types';

// ── In-memory OPFS mock ───────────────────────────────────────────────────────

function createMockDir() {
  const files = new Map<string, string>();

  const handle = {
    getFileHandle(name: string, options?: { create?: boolean }) {
      if (!options?.create && !files.has(name)) {
        return Promise.reject(new DOMException('Not found', 'NotFoundError'));
      }
      return Promise.resolve({
        getFile: () => Promise.resolve(new Blob([files.get(name) ?? ''])),
        createWritable: () => {
          const chunks: string[] = [];
          return Promise.resolve({
            write: (data: string) => { chunks.push(data); return Promise.resolve(); },
            close: () => { files.set(name, chunks.join('')); return Promise.resolve(); },
          });
        },
      });
    },
    removeEntry: (name: string) => { files.delete(name); return Promise.resolve(); },
  } as unknown as FileSystemDirectoryHandle;

  return { handle, files };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPTY_DRAFT: SketcherDraft = { version: 2, parts: [], joints: [], groups: [] };

// ── Test setup ────────────────────────────────────────────────────────────────

beforeEach(() => {
  const { handle } = createMockDir();
  _setDirectoryProvider(() => Promise.resolve(handle));
});

afterEach(() => {
  _resetDirectoryProvider();
});

// ── list ──────────────────────────────────────────────────────────────────────

describe('SketcherAssemblyStore – list', () => {
  it('returns empty array when nothing has been saved', async () => {
    expect(await list()).toEqual([]);
  });

  it('returns entries sorted by modifiedAt descending', async () => {
    await create('Alpha', EMPTY_DRAFT);
    await create('Beta', EMPTY_DRAFT);
    const entries = await list();
    expect(entries[0].modifiedAt).toBeGreaterThanOrEqual(entries[1].modifiedAt);
  });
});

// ── create + get ──────────────────────────────────────────────────────────────

describe('SketcherAssemblyStore – create + get', () => {
  it('create() returns metadata with expected fields', async () => {
    const meta = await create('My Robot', EMPTY_DRAFT);
    expect(meta.name).toBe('My Robot');
    expect(typeof meta.id).toBe('string');
    expect(meta.id.length).toBeGreaterThan(0);
    expect(meta.createdAt).toBeGreaterThan(0);
    expect(meta.modifiedAt).toBeGreaterThanOrEqual(meta.createdAt);
  });

  it('create() → get() round-trip preserves the draft', async () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [
        {
          id: 'part-1',
          kind: 'primitive',
          name: 'Box',
          position: [1, 2, 3],
          quaternion: [0, 0, 0, 1],
          scale: [1, 1, 1],
          color: 0xff0000,
        },
      ],
      joints: [],
      groups: [],
    };
    const meta = await create('Test', draft);
    const loaded = await get(meta.id);
    expect(loaded).not.toBeNull();
    expect(loaded?.parts).toHaveLength(1);
    expect(loaded?.parts[0].id).toBe('part-1');
    expect(loaded?.parts[0].color).toBe(0xff0000);
  });

  it('get() returns null for unknown id', async () => {
    expect(await get('nonexistent-id')).toBeNull();
  });

  it('create() → list() shows the new entry', async () => {
    await create('My Assembly', EMPTY_DRAFT);
    const entries = await list();
    expect(entries).toHaveLength(1);
    expect(entries[0].name).toBe('My Assembly');
  });
});

// ── save ──────────────────────────────────────────────────────────────────────

describe('SketcherAssemblyStore – save', () => {
  it('save() updates the name and draft', async () => {
    const meta = await create('Draft', EMPTY_DRAFT);
    const updatedDraft: SketcherDraft = {
      version: 2,
      parts: [{ id: 'part-1', kind: 'primitive', name: 'Sphere', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0x00ff00 }],
      joints: [],
    };
    const updated = await save(meta.id, 'Final', updatedDraft);
    expect(updated?.name).toBe('Final');
    expect(updated?.modifiedAt).toBeGreaterThanOrEqual(meta.modifiedAt);

    const loaded = await get(meta.id);
    expect(loaded?.parts[0].name).toBe('Sphere');
  });

  it('save() returns null for unknown id', async () => {
    expect(await save('no-such-id', 'name', EMPTY_DRAFT)).toBeNull();
  });

  it('save() entry still appears in list() with updated name', async () => {
    const meta = await create('Old', EMPTY_DRAFT);
    await save(meta.id, 'New', EMPTY_DRAFT);
    const entries = await list();
    expect(entries[0].name).toBe('New');
  });
});

// ── remove ────────────────────────────────────────────────────────────────────

describe('SketcherAssemblyStore – remove', () => {
  it('remove() deletes the entry from list()', async () => {
    const meta = await create('Temp', EMPTY_DRAFT);
    await remove(meta.id);
    expect(await list()).toHaveLength(0);
  });

  it('get() returns null after remove()', async () => {
    const meta = await create('Temp', EMPTY_DRAFT);
    await remove(meta.id);
    expect(await get(meta.id)).toBeNull();
  });

  it('remove() of unknown id is a no-op', async () => {
    await create('A', EMPTY_DRAFT);
    await remove('nonexistent');
    expect(await list()).toHaveLength(1);
  });
});

// ── metadata persistence ──────────────────────────────────────────────────────

describe('SketcherAssemblyStore – metadata persistence', () => {
  it('multiple create() calls accumulate in list()', async () => {
    await create('First', EMPTY_DRAFT);
    await create('Second', EMPTY_DRAFT);
    await create('Third', EMPTY_DRAFT);
    const entries = await list();
    expect(entries).toHaveLength(3);
    const names = entries.map((e) => e.name);
    expect(names).toContain('First');
    expect(names).toContain('Second');
    expect(names).toContain('Third');
  });

  it('re-instantiating (new provider over same files) still finds metadata', async () => {
    const { handle } = createMockDir();
    _setDirectoryProvider(() => Promise.resolve(handle));
    await create('Persistent', EMPTY_DRAFT);
    // Simulate a "page reload" by re-using the same mock dir handle
    _setDirectoryProvider(() => Promise.resolve(handle));
    const entries = await list();
    expect(entries[0].name).toBe('Persistent');
  });
});
