import { describe, it, expect, afterEach } from 'vitest';
import { make } from './api.js';
import type { AIProvider } from './provider.js';
import { _setDirectoryProvider, _resetDirectoryProvider } from '../storage/OPFSCatalogueStore.js';

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

afterEach(() => _resetDirectoryProvider());

describe('make', () => {
  it('creates and binds a character when no same-label entry exists', async () => {
    _setDirectoryProvider(async () => mockDir());
    const result = await make('character', 'BERNARD', { label: 'Bernard', spec: { build: 0.6 } }, { userEntries: [], castBindings: {} });

    expect(result.created).toBe(true);
    expect(result.boundTo).toBe('BERNARD');
    expect(result.entry.kind).toBe('character');
    expect(result.entry.label).toBe('Bernard');
    expect(result.castBindings.BERNARD).toBe(result.entry.id);
    expect(result.settingBindings).toEqual({});
    expect(result.warnings).toEqual([]);
  });

  it('reuses an existing same-label entry instead of duplicating', async () => {
    _setDirectoryProvider(async () => mockDir());
    const first = await make('character', 'BERNARD', { label: 'Bernard', spec: { build: 0.6 } }, { userEntries: [], castBindings: {} });
    const second = await make('character', 'BERNARD', { label: 'Bernard', spec: { build: 0.2 } }, { userEntries: [first.entry], castBindings: first.castBindings });

    expect(second.created).toBe(false);
    expect(second.entry.id).toBe(first.entry.id);
    expect(second.warnings).toHaveLength(1);
  });

  it('creates and binds a setting', async () => {
    _setDirectoryProvider(async () => mockDir());
    const result = await make('setting', 'PUB', { label: 'Pub', geometry: { type: 'box', width: 4, height: 3, depth: 4 }, material: { color: 0x8b5a2b } }, { userEntries: [], settingBindings: {} });

    expect(result.created).toBe(true);
    expect(result.boundTo).toBe('PUB');
    expect(result.entry.kind).toBe('set-piece');
    expect(result.settingBindings.PUB).toBe(result.entry.id);
  });

  it('uses the script name as the label when the document omits one', async () => {
    _setDirectoryProvider(async () => mockDir());
    const result = await make('character', 'BERNARD', { spec: { build: 0.6 } }, { userEntries: [], castBindings: {} });

    expect(result.entry.label).toBe('BERNARD');
    expect(result.boundTo).toBe('BERNARD');
  });

  it('builds the spec from a description via a provider, then creates and binds', async () => {
    _setDirectoryProvider(async () => mockDir());
    const provider: AIProvider = {
      generate: async (_system, _user, schema) => {
        expect((schema as Record<string, unknown>).properties).toBeDefined();
        return { label: 'Bernard', spec: { build: 0.7 } };
      },
    };
    const result = await make('character', 'BERNARD', 'middle-aged portly gentleman', { userEntries: [], castBindings: {}, provider });

    expect(result.created).toBe(true);
    expect(result.entry.kind).toBe('character');
    expect(result.entry.label).toBe('Bernard');
    expect(result.castBindings.BERNARD).toBe(result.entry.id);
  });
});
