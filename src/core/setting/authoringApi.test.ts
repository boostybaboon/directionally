import { describe, it, expect } from 'vitest';
import { normalizeSetPieceInput, createSetPiece, SET_PIECE_JSON_SCHEMA } from './authoringApi.js';
import { _setDirectoryProvider, _resetDirectoryProvider, list } from '../storage/OPFSCatalogueStore.js';

describe('SET_PIECE_JSON_SCHEMA', () => {
  it('is a JSON-serialisable object with a label contract', () => {
    const json = JSON.stringify(SET_PIECE_JSON_SCHEMA);
    expect(JSON.parse(json)).toEqual(SET_PIECE_JSON_SCHEMA);
    expect((SET_PIECE_JSON_SCHEMA.properties as Record<string, unknown>).label).toEqual({ type: 'string' });
  });
});

describe('normalizeSetPieceInput', () => {
  it('normalises a leaf (geometry + material)', () => {
    const out = normalizeSetPieceInput({
      label: '  Box  ',
      geometry: { type: 'box', width: 1, height: 2, depth: 3 },
      material: { color: 0x8844aa, roughness: 0.5 },
    });
    expect(out.label).toBe('Box');
    expect(out.geometry).toEqual({ type: 'box', width: 1, height: 2, depth: 3 });
    expect(out.material?.color).toBe(0x8844aa);
  });

  it('normalises a composite with inline geometry children and assigns localIds', () => {
    const out = normalizeSetPieceInput({
      label: 'Chair',
      compose: [
        { name: 'seat', geometry: { type: 'box', width: 0.5, height: 0.1, depth: 0.5 }, material: { color: 0x663311 }, position: [0, 0.45, 0] },
        { name: 'back', geometry: { type: 'box', width: 0.5, height: 0.5, depth: 0.1 }, material: { color: 0x663311 }, position: [0, 0.7, -0.2] },
      ],
    });
    expect(out.compose).toHaveLength(2);
    for (const p of out.compose!) expect(p.localId).toBeDefined();
  });

  it('normalises a composite with ref children (reuse of catalogue items)', () => {
    const out = normalizeSetPieceInput({
      label: 'Table setting',
      compose: [
        { ref: 'chair', position: [1, 0, 0] },
        { ref: 'table' },
      ],
    });
    expect(out.compose).toHaveLength(2);
    expect(out.compose![0]).toMatchObject({ ref: 'chair', position: [1, 0, 0] });
    expect(out.compose![1]).toMatchObject({ ref: 'table' });
  });

  it('normalises a setting (compose + lights + environmentId + defaultRotation)', () => {
    const out = normalizeSetPieceInput({
      label: 'Classroom',
      compose: [{ ref: 'floor-plane' }],
      environmentId: 'studio-neutral',
      defaultRotation: [-Math.PI / 2, 0, 0],
      lights: [{ type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [5, 10, 5] }],
    });
    expect(out.environmentId).toBe('studio-neutral');
    expect(out.defaultRotation).toEqual([-Math.PI / 2, 0, 0]);
    expect(out.lights).toHaveLength(1);
  });

  it('rejects a missing/empty label', () => {
    expect(() => normalizeSetPieceInput({ geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0 } })).toThrow('label');
    expect(() => normalizeSetPieceInput({ label: '   ' })).toThrow('label');
  });

  it('rejects when both compose and geometry are present', () => {
    expect(() => normalizeSetPieceInput({
      label: 'X', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0 }, compose: [],
    })).toThrow('either');
  });

  it('rejects when neither compose nor geometry is present', () => {
    expect(() => normalizeSetPieceInput({ label: 'X' })).toThrow('either');
  });

  it('rejects an unknown geometry type', () => {
    expect(() => normalizeSetPieceInput({ label: 'X', geometry: { type: 'torus' }, material: { color: 0 } })).toThrow('geometry type');
  });

  it('rejects an unknown light type', () => {
    expect(() => normalizeSetPieceInput({ label: 'X', compose: [{ ref: 'box' }], lights: [{ type: 'laser' }] })).toThrow('light type');
  });

  it('rejects non-object input', () => {
    expect(() => normalizeSetPieceInput(null)).toThrow('object');
    expect(() => normalizeSetPieceInput('chair')).toThrow('object');
  });
});

describe('createSetPiece', () => {
  it('persists a validated composite and returns the created entry', async () => {
    const files = new Map<string, Blob>();
    const dir = {
      getFileHandle: async (name: string, opts?: { create?: boolean }) => {
        if (!opts?.create && !files.has(name)) throw new Error('not found');
        return {
          getFile: async () => files.get(name) ?? new Blob(),
          createWritable: async () => {
            const chunks: BlobPart[] = [];
            return { write: (d: BlobPart) => { chunks.push(d); return Promise.resolve(); }, close: () => { files.set(name, new Blob(chunks)); return Promise.resolve(); } };
          },
        };
      },
      removeEntry: async () => {},
    } as unknown as FileSystemDirectoryHandle;
    _setDirectoryProvider(async () => dir);

    const entry = await createSetPiece({
      label: 'AI Chair',
      compose: [{ name: 'seat', geometry: { type: 'box', width: 0.5, height: 0.1, depth: 0.5 }, material: { color: 0x663311 } }],
    });

    expect(entry.kind).toBe('set-piece');
    expect(entry.label).toBe('AI Chair');
    expect((await list())).toHaveLength(1);
    _resetDirectoryProvider();
  });
});
