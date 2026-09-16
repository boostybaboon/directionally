import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { createSetPiece } from './authoringApi.js';
import {
  _setDirectoryProvider,
  _resetDirectoryProvider,
  getDocument,
  list,
  listDocuments,
} from '../storage/OPFSCatalogueStore.js';

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

beforeAll(() => {
  (URL as unknown as Record<string, unknown>).createObjectURL = vi.fn(() => 'blob:test-url');
  (URL as unknown as Record<string, unknown>).revokeObjectURL = vi.fn();
});

let dir: ReturnType<typeof createMockDir>;

beforeEach(() => {
  dir = createMockDir();
  _setDirectoryProvider(async () => dir.handle);
});

afterEach(() => _resetDirectoryProvider());

// ── Fixtures ──────────────────────────────────────────────────────────────────

const draft = {
  label: 'Classroom',
  parts: [
    { id: 'floor', name: 'floor', kind: 'primitive', shape: 'box', size: [6, 0.2, 8], position: [0, 0, 0], rotation: [0, 0, 0], color: 0x888888 },
    { id: 'desk', name: 'desk', kind: 'primitive', shape: 'box', size: [1.2, 0.8, 0.6], position: [0, 0.5, 1], rotation: [0, 0, 0], color: 0xaa7744 },
  ],
};

describe('createSetPiece', () => {
  it('turns an AI Draft into a document-backed scenery entry', async () => {
    const { entry, created } = await createSetPiece(draft);
    const piece = entry as Extract<typeof entry, { kind: 'set-piece' }>;

    expect(created).toBe(true);
    expect(entry.kind).toBe('set-piece');
    expect(entry.label).toBe('Classroom');
    expect(entry.hasDocument).toBe(true);
    expect(entry.partCount).toBe(2);
    expect(piece.isSetting).toBe(true);
    // The draft's parts become the entry's tree document (one leaf per part).
    expect((await getDocument(entry.id))?.root).toHaveLength(2);
  });

  it('captures the draft lights and environment on the entry', async () => {
    const { entry } = await createSetPiece({
      ...draft,
      environmentMap: 'studio-neutral',
      lights: [{ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 1 }],
    });
    const piece = entry as Extract<typeof entry, { kind: 'set-piece' }>;

    expect(piece.environmentId).toBe('studio-neutral');
    expect(piece.lights).toHaveLength(1);
  });

  it('resumes a same-label entry in place instead of duplicating it', async () => {
    const first = await createSetPiece(draft);
    const second = await createSetPiece(draft);

    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(await listDocuments()).toHaveLength(1);
  });

  it('leaves the entry unpublished until it carries a bake', async () => {
    await createSetPiece(draft);
    expect(await list()).toHaveLength(0);
  });

  it('rejects a draft with no parts', async () => {
    await expect(createSetPiece({ label: 'Empty', parts: [] })).rejects.toThrow('parts');
  });
});
