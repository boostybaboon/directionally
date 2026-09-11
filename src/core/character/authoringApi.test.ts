import { describe, it, expect } from 'vitest';
import { normalizeCharacterInput, createCharacter, CHARACTER_JSON_SCHEMA } from './authoringApi.js';
import { _setDirectoryProvider, _resetDirectoryProvider, list } from '../storage/OPFSCatalogueStore.js';

describe('CHARACTER_JSON_SCHEMA', () => {
  it('is a JSON-serialisable object with a label contract', () => {
    const json = JSON.stringify(CHARACTER_JSON_SCHEMA);
    expect(JSON.parse(json)).toEqual(CHARACTER_JSON_SCHEMA);
    expect((CHARACTER_JSON_SCHEMA.properties as Record<string, unknown>).label).toEqual({ type: 'string' });
  });
});

describe('normalizeCharacterInput', () => {
  it('normalises a label + clamps/defaults the spec', () => {
    const out = normalizeCharacterInput({ label: '  Bernard  ', spec: { build: 5, age: 0.6 } });
    expect(out.label).toBe('Bernard');
    expect(out.spec.build).toBe(1);        // clamped to [-1, 1]
    expect(out.spec.age).toBe(0.6);
    expect(out.spec.height).toBe(0.5);     // defaulted
    expect(out.spec.skinTone).toBe('Light'); // defaulted
  });

  it('rejects a missing label', () => {
    expect(() => normalizeCharacterInput({})).toThrow('label');
  });

  it('rejects a non-object', () => {
    expect(() => normalizeCharacterInput(null)).toThrow('character must be an object');
  });

  it('accepts an empty spec (defaults to neutral)', () => {
    const out = normalizeCharacterInput({ label: 'Bernard' });
    expect(out.spec.build).toBe(0);
    expect(out.spec.age).toBe(0.5);
  });
});

describe('createCharacter', () => {
  it('persists a validated spec-backed character and returns the created entry', async () => {
    const files = new Map<string, Blob>();
    const dir = {
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
    _setDirectoryProvider(async () => dir);

    const entry = await createCharacter({ label: 'Bernard', spec: { build: 0.6, skinTone: 'Deep' } });

    expect(entry.kind).toBe('character');
    expect(entry.label).toBe('Bernard');
    if (entry.kind === 'character') {
      expect(entry.spec).toBeTruthy();
      expect(entry.gltfPath).toBeUndefined();
    }
    expect((await list())).toHaveLength(1);
    _resetDirectoryProvider();
  });
});
