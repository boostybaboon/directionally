import { describe, it, expect } from 'vitest';
import { describeCatalogue, describeDefinition, describeScript, bindName, describeToDocument } from './api.js';
import type { CatalogueEntry, SetPieceEntry } from '../catalogue/types.js';
import { addLightNode, documentFromParts, groupNodes, insertRef } from '../sketcher/documentTree.js';
import type { SetDocument } from '../sketcher/documentTree.js';
import type { PartDraft } from '../sketcher/types.js';
import type { Transform } from '../sketcher/transform.js';
import type { ScriptDocument } from '../treatment/fountain.js';
import type { AIProvider } from './provider.js';

const character = (id: string, label: string): CatalogueEntry => ({ kind: 'character', id, label, gltfPath: `/m/${id}.glb` });
const setPiece = (id: string, label: string, extra: Omit<Partial<SetPieceEntry>, 'kind' | 'id'> = {}): SetPieceEntry => ({ kind: 'set-piece', id, label, document: testSetDocument(), ...extra });

/** A one-part set-piece document — the bundled library's authoring form. */
function testSetDocument(): SetDocument {
  return documentFromParts([{
    content: {
      id: 'box',
      kind: 'catalogue',
      name: 'Box',
      geometry: { type: 'box', width: 1, height: 1, depth: 1 },
      material: { color: 0x11aa22 },
      color: 0x11aa22,
    },
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  }]);
}
const environment = (id: string, label: string): CatalogueEntry => ({ kind: 'environment', id, label, hdriPath: `/env/${id}.hdr` });

function doc(cast: string[], settings: Array<string | undefined>): ScriptDocument {
  return {
    scenes: settings.map((s, i) => ({ heading: `INT. ${s ?? 'UNTITLED'} - DAY`, interior: true, setting: s, timeOfDay: 'DAY', beats: [] })),
    cast,
    diagnostics: [],
  };
}

describe('describeDefinition', () => {
  const part = (id: string, content: Partial<PartDraft>, transform: Partial<Transform> = {}) => ({
    content: { id, kind: 'primitive' as const, name: 'Box', color: 0xffffff, ...content },
    transform: { position: [0, 0, 0] as [number, number, number], quaternion: [0, 0, 0, 1] as [number, number, number, number], scale: [1, 1, 1] as [number, number, number], ...transform },
  });

  /** A classroom: a desk, a wall of two chairs (one hidden), a light, and an environment. */
  function classroom(): SetDocument {
    const doc = documentFromParts([
      part('desk', {}, { position: [0, 0.5, 0] }),
      part('chair-a', { label: 'Chair A' }, { position: [-1, 0.25, 0] }),
      part('chair-b', { label: 'Chair B' }, { position: [1, 0.25, 0] }),
    ]);
    groupNodes(doc, ['chair-a', 'chair-b'], 'row', true);
    const row = doc.root.find((node) => node.role === 'structure')!;
    row.children[1].hidden = true;
    insertRef(doc, { id: 'shelf', ref: 'shelf-item', name: 'Shelf', transform: { position: [0, 0, -2], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } });
    addLightNode(doc, { type: 'directional', id: 'ceiling', color: 0xffffff, intensity: 1, position: [0, 3, 0] });
    doc.environmentMap = 'studio-neutral';
    return doc;
  }

  const entries = (): CatalogueEntry[] => [
    { kind: 'set-piece', id: 'classroom', label: 'Classroom', document: classroom() },
    { kind: 'set-piece', id: 'empty', label: 'Empty' },
    { kind: 'character', id: 'bob', label: 'Bob' },
  ];

  it('names every node, with the path an override would address', () => {
    const described = describeDefinition('classroom', entries())!;

    expect(described.label).toBe('Classroom');
    expect(described.nodes.map((n) => [n.path, n.name, n.body])).toEqual([
      ['box', 'Box', 'part'],
      ['row', 'row', 'group'],
      ['row/chair-a', 'Chair A', 'part'],
      ['row/chair-b', 'Chair B', 'part'],
      ['shelf', 'Shelf', 'instance'],
      ['ceiling', 'ceiling', 'light'],
    ]);
    expect(described.partCount).toBe(3);
    expect(described.environmentMap).toBe('studio-neutral');
  });

  it('reports world placements, absolute sizes, references and hidden nodes', () => {
    const described = describeDefinition('classroom', entries())!;
    const byPath = new Map(described.nodes.map((n) => [n.path, n]));

    // The row's members are placed relative to the group; what a reader is told is where they stand.
    expect(byPath.get('box')!.position).toEqual([0, 0.5, 0]);
    expect(byPath.get('box')!.shape).toBe('box');
    expect(byPath.get('box')!.size).toEqual([1, 1, 1]);
    expect(byPath.get('row/chair-b')!.hidden).toBe(true);
    expect(byPath.get('shelf')!.ref).toBe('shelf-item');
    // Where the chairs stand, not where their parent puts them: the row's members are 1 m to each side.
    expect(byPath.get('row/chair-a')!.position[0]).toBeCloseTo(-1);
    expect(byPath.get('row/chair-b')!.position[0]).toBeCloseTo(1);
  });

  it('reports the Definition lights, which is how a script can name one', () => {
    const described = describeDefinition('classroom', entries())!;
    expect(described.lights.map((l) => l.id)).toEqual(['ceiling']);
  });

  it('returns null for an entry with no document, and for a non-set-piece', () => {
    expect(describeDefinition('empty', entries())).toBeNull();
    expect(describeDefinition('bob', entries())).toBeNull();
    expect(describeDefinition('nothing', entries())).toBeNull();
  });
});

describe('describeCatalogue', () => {
  it('summarises entries with isSetting classification', () => {
    const entries = [
      character('bob', 'Bob'),
      setPiece('chair', 'Chair'),
      setPiece('pub', 'Pub', { isSetting: true }),
      environment('studio', 'Studio'),
    ];
    const out = describeCatalogue(entries);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ id: 'bob', kind: 'character', isSetting: false, summary: 'character' });
    expect(out[1]).toMatchObject({ id: 'chair', kind: 'set-piece', isSetting: false, summary: 'set-piece (prop)' });
    expect(out[2]).toMatchObject({ id: 'pub', kind: 'set-piece', isSetting: true, summary: 'set-piece (scenery)' });
    expect(out[3]).toMatchObject({ id: 'studio', kind: 'environment', isSetting: true, summary: 'environment (HDRI)' });
  });
});

describe('describeScript', () => {
  it('reports bound, ambiguous, and unresolved cast names', () => {
    const d = doc(['BOB', 'ALICE', 'TWINS'], []);
    const entries = [character('bob-1', 'BOB'), character('twin-a', 'TWINS'), character('twin-b', 'TWINS')];
    const out = describeScript(d, entries);
    expect(out.cast).toEqual([
      { name: 'BOB', status: { state: 'bound', catalogueId: 'bob-1', label: 'BOB' } },
      { name: 'ALICE', status: { state: 'unresolved' } },
      { name: 'TWINS', status: { state: 'ambiguous', matches: 2 } },
    ]);
  });

  it('reports bound, ambiguous, and unresolved settings, deduped across scenes', () => {
    const d = doc([], ['PUB', 'CLASSROOM', 'GARDEN', 'GARDEN']);
    const entries = [setPiece('pub-1', 'PUB'), setPiece('garden-a', 'GARDEN'), setPiece('garden-b', 'GARDEN')];
    const out = describeScript(d, entries);
    expect(out.settings).toEqual([
      { name: 'PUB', status: { state: 'bound', catalogueId: 'pub-1', label: 'PUB' } },
      { name: 'CLASSROOM', status: { state: 'unresolved' } },
      { name: 'GARDEN', status: { state: 'ambiguous', matches: 2 } },
    ]);
  });

  it('honours an explicit binding over label match', () => {
    const d = doc(['BOB'], []);
    const out = describeScript(d, [character('other', 'Not Bob')], { cast: { BOB: 'other' } });
    expect(out.cast[0].status).toEqual({ state: 'bound', catalogueId: 'other', label: 'Not Bob' });
  });
});

describe('bindName', () => {
  it('sets, overwrites, and clears bindings while preserving others', () => {
    const start = { BOB: 'bob-1', ALICE: 'alice-1' };
    expect(bindName('BOB', 'bob-2', start)).toEqual({ BOB: 'bob-2', ALICE: 'alice-1' });
    expect(bindName('BOB', null, start)).toEqual({ ALICE: 'alice-1' });
    expect(bindName('CAROL', 'carol-1', start)).toEqual({ BOB: 'bob-1', ALICE: 'alice-1', CAROL: 'carol-1' });
  });

  it('does not mutate the input map and keys by uppercase name', () => {
    const start = { BOB: 'bob-1' };
    const next = bindName('bob', 'bob-2', start);
    expect(next).toEqual({ BOB: 'bob-2' });
    expect(start).toEqual({ BOB: 'bob-1' });
  });
});

describe('describeToDocument', () => {
  it('passes the character schema for kind "character"', async () => {
    let schema: unknown;
    const provider: AIProvider = { generate: async (_s, _u, s) => { schema = s; return {}; } };
    await describeToDocument(provider, 'character', 'a portly gentleman');
    expect((schema as Record<string, unknown>).properties).toHaveProperty('spec');
  });

  it('passes the AI Draft schema for kind "setting"', async () => {
    let schema: unknown;
    const provider: AIProvider = { generate: async (_s, _u, s) => { schema = s; return {}; } };
    await describeToDocument(provider, 'setting', 'a cosy pub');
    expect((schema as Record<string, unknown>).properties).toHaveProperty('parts');
  });
});
