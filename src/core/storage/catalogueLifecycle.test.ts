import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import {
  _setDirectoryProvider as _setCatalogueDir,
  _resetDirectoryProvider as _resetCatalogueDir,
  add,
  list,
} from './OPFSCatalogueStore.js';
import {
  _setDirectoryProvider as _setAssemblyDir,
  _resetDirectoryProvider as _resetAssemblyDir,
  create,
  list as listAssemblies,
} from './SketcherAssemblyStore.js';
import { deleteCatalogueEntry, deleteAssemblyAndEntry } from './catalogueLifecycle.js';
import type { SketcherDraft } from '../sketcher/types.js';

const emptyDraft: SketcherDraft = { version: 2, parts: [], joints: [] };

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

beforeAll(() => {
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:test-url');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

let mock: ReturnType<typeof createMockDir>;

beforeEach(() => {
  mock = createMockDir();
  _setCatalogueDir(async () => mock.handle);
  _setAssemblyDir(async () => mock.handle);
});

afterEach(() => {
  _resetCatalogueDir();
  _resetAssemblyDir();
  vi.restoreAllMocks();
});

describe('deleteCatalogueEntry', () => {
  it('cascades to the backing assembly', async () => {
    const asm = await create('Chair', emptyDraft);
    const entry = await add(new Blob(['glb']), { kind: 'set-piece', label: 'Chair' }, asm.id);

    await deleteCatalogueEntry(entry.id);

    expect(await list()).toHaveLength(0);
    expect(await listAssemblies()).toHaveLength(0);
  });

  it('leaves unrelated assemblies intact when the entry has no source', async () => {
    const other = await create('Draft', emptyDraft);
    const entry = await add(new Blob(['glb']), { kind: 'set-piece', label: 'Chair' });

    await deleteCatalogueEntry(entry.id);

    expect(await list()).toHaveLength(0);
    expect((await listAssemblies()).map((a) => a.id)).toEqual([other.id]);
  });

  it('clears the last-opened pointer when it matches the removed source', async () => {
    const store = new Map<string, string>([['sketcher-assembly-id', 'asm-x']]);
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
    });

    const entry = await add(new Blob(['glb']), { kind: 'set-piece', label: 'X' }, 'asm-x');
    await deleteCatalogueEntry(entry.id);
    expect(store.get('sketcher-assembly-id')).toBeUndefined();
  });
});

describe('deleteAssemblyAndEntry', () => {
  it('cascades to the published entry', async () => {
    const asm = await create('Chair', emptyDraft);
    await add(new Blob(['glb']), { kind: 'set-piece', label: 'Chair' }, asm.id);

    await deleteAssemblyAndEntry(asm.id);

    expect(await listAssemblies()).toHaveLength(0);
    expect(await list()).toHaveLength(0);
  });

  it('leaves unrelated catalogue entries intact', async () => {
    const asm = await create('Draft', emptyDraft);
    const entry = await add(new Blob(['glb']), { kind: 'set-piece', label: 'Keep' });

    await deleteAssemblyAndEntry(asm.id);

    expect(await listAssemblies()).toHaveLength(0);
    expect((await list()).map((e) => e.id)).toEqual([entry.id]);
  });
});
