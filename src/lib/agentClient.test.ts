import { describe, it, expect, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import { generateAsset } from './agentClient.js';
import { _setDirectoryProvider, _resetDirectoryProvider, list, getDocument } from '../core/storage/OPFSCatalogueStore.js';

// GLTFExporter uses FileReader internally, which is unavailable in Node. Mock it
// so the headless draft → GLB bake performed for generated settings is testable.
vi.mock('three/examples/jsm/exporters/GLTFExporter.js', () => ({
  GLTFExporter: class {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async parseAsync(_input: unknown, _options: unknown): Promise<ArrayBuffer> {
      return new ArrayBuffer(16);
    }
  },
}));

// A stable, in-memory OPFS mock: one `handle` + one `files` map shared across
// all store operations in a test (multi-step flows need state to persist).
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
  _setDirectoryProvider(async () => mock.handle);
});

afterEach(() => {
  _resetDirectoryProvider();
  vi.unstubAllGlobals();
});

describe('generateAsset', () => {
  it('POSTs to /agent/make and persists + binds the returned document', async () => {
    vi.stubGlobal('fetch', async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe('/agent/make');
      expect(JSON.parse(init?.body as string)).toEqual({ kind: 'character', name: 'BERNARD', description: 'BERNARD' });
      return new Response(JSON.stringify({ document: { label: 'Bernard', spec: { build: 0.7 } } }), { status: 200 });
    });

    const result = await generateAsset('character', 'BERNARD', 'BERNARD', {
      userEntries: [],
      castBindings: {},
      settingBindings: {},
    });

    expect(result.boundTo).toBe('BERNARD');
    expect(result.entry.kind).toBe('character');
    expect(result.entry.label).toBe('Bernard');
    expect(result.castBindings.BERNARD).toBe(result.entry.id);
  });

  it('surfaces a server error message', async () => {
    vi.stubGlobal('fetch', async () =>
      new Response(JSON.stringify({ error: 'No DEEPSEEK_API_KEY configured on the server.' }), { status: 503 }),
    );

    await expect(generateAsset('setting', 'PUB', 'PUB')).rejects.toThrow(/No DEEPSEEK_API_KEY/);
  });
});

describe('generateAsset – setting', () => {
  const document = {
    label: 'Classroom',
    parts: [
      { id: 'floor', name: 'floor', kind: 'primitive', shape: 'box', size: [6, 0.2, 8], position: [0, 0, 0], rotation: [0, 0, 0], color: 0x888888 },
      { id: 'desk', name: 'desk', kind: 'primitive', shape: 'box', size: [1.2, 0.8, 0.6], position: [0, 0.5, 1], rotation: [0, 0, 0], color: 0xaa7744 },
    ],
    groups: [
      { id: 'furniture', name: 'classroom furniture', children: ['desk'] },
    ],
  };

  it('publishes a GLB-backed entry with an editable document and partCount', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ document }), { status: 200 }));

    const result = await generateAsset('setting', 'CLASSROOM', 'a classroom');

    expect(result.boundTo).toBe('CLASSROOM');
    expect(result.created).toBe(true);
    expect(result.entry.kind).toBe('set-piece');
    expect(result.entry.label).toBe('Classroom');
    // The generated setting is a GLB bake on the same entry that carries the document.
    expect('gltfPath' in result.entry).toBe(true);
    expect((result.entry as { hasDocument?: boolean }).hasDocument).toBe(true);
    expect((result.entry as { partCount?: number }).partCount).toBe(2);
    expect((result.entry as { isSetting?: boolean }).isSetting).toBe(true);

    const document_ = await getDocument(result.entry.id);
    expect(document_?.root).toHaveLength(2);

    expect(await list()).toHaveLength(1);
  });

  it('resumes by name on re-generation without duplicating', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ document }), { status: 200 }));

    const first = await generateAsset('setting', 'CLASSROOM', 'a classroom');
    const second = await generateAsset('setting', 'CLASSROOM', 'a classroom');

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.entry.label).toBe('Classroom');

    const listed = await list();
    expect(listed).toHaveLength(1);
  });
});

