import { describe, it, expect, afterEach, vi } from 'vitest';
import { generateAsset } from './agentClient.js';
import { _setDirectoryProvider, _resetDirectoryProvider } from '../core/storage/OPFSCatalogueStore.js';

function mockDir(): FileSystemDirectoryHandle {
  const files = new Map<string, Blob>();
  return {
    getFileHandle: async (name: string, opts?: { create?: boolean }) => {
      if (!opts?.create && !files.has(name)) throw new Error('not found');
      return {
        getFile: async () => files.get(name) ?? new Blob(),
        createWritable: async () => {
          const chunks: BlobPart[] = [];
          return {
            write: (d: BlobPart) => { chunks.push(d); return Promise.resolve(); },
            close: () => { files.set(name, new Blob(chunks)); return Promise.resolve(); },
          };
        },
      };
    },
    removeEntry: async () => {},
  } as unknown as FileSystemDirectoryHandle;
}

afterEach(() => {
  _resetDirectoryProvider();
  vi.unstubAllGlobals();
});

describe('generateAsset', () => {
  it('POSTs to /agent/make and persists + binds the returned document', async () => {
    _setDirectoryProvider(async () => mockDir());
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
