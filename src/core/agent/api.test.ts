import { describe, it, expect } from 'vitest';
import { describeCatalogue, describeScript, bindName, describeToDocument } from './api.js';
import type { CatalogueEntry, SetPieceEntry } from '../catalogue/types.js';
import type { ScriptDocument } from '../treatment/fountain.js';
import type { AIProvider } from './provider.js';

const character = (id: string, label: string): CatalogueEntry => ({ kind: 'character', id, label, gltfPath: `/m/${id}.glb` });
const setPiece = (id: string, label: string, extra: Omit<Partial<SetPieceEntry>, 'kind' | 'id'> = {}): SetPieceEntry => ({ kind: 'set-piece', id, label, geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0x11aa22 }, ...extra });
const environment = (id: string, label: string): CatalogueEntry => ({ kind: 'environment', id, label, hdriPath: `/env/${id}.hdr` });

function doc(cast: string[], settings: Array<string | undefined>): ScriptDocument {
  return {
    scenes: settings.map((s, i) => ({ heading: `INT. ${s ?? 'UNTITLED'} - DAY`, interior: true, setting: s, timeOfDay: 'DAY', beats: [] })),
    cast,
    diagnostics: [],
  };
}

describe('describeCatalogue', () => {
  it('summarises entries with isSetting classification', () => {
    const entries = [
      character('bob', 'Bob'),
      setPiece('chair', 'Chair'),
      setPiece('pub', 'Pub', { environmentId: 'studio' }),
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

  it('passes the setting schema for kind "setting"', async () => {
    let schema: unknown;
    const provider: AIProvider = { generate: async (_s, _u, s) => { schema = s; return {}; } };
    await describeToDocument(provider, 'setting', 'a cosy pub');
    expect((schema as Record<string, unknown>).properties).toHaveProperty('geometry');
  });
});
