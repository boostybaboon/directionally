import { describe, it, expect } from 'vitest';
import { normalizeAIDraft, AI_DRAFT_JSON_SCHEMA } from './aiDraftSchema.js';
import { fromAIDraft } from './aiDraft.js';
import { collectParts } from './documentTree.js';

const validDocument = {
  label: 'Classroom',
  parts: [
    { id: 'floor', name: 'floor', kind: 'primitive', shape: 'box', size: [6, 0.2, 8], position: [0, 0, 0], rotation: [0, 0, 0], color: 0x888888 },
    { id: 'desk', name: 'desk', kind: 'primitive', shape: 'box', size: [1.2, 0.8, 0.6], position: [0, 0.5, 1], rotation: [0, 0, 0], color: 0xaa7744 },
  ],
  groups: [{ id: 'furniture', name: 'classroom furniture', children: ['desk'] }],
};

describe('AI_DRAFT_JSON_SCHEMA', () => {
  it('is a JSON Schema object with a parts array contract', () => {
    expect(AI_DRAFT_JSON_SCHEMA.type).toBe('object');
    expect((AI_DRAFT_JSON_SCHEMA.required as string[])).toContain('parts');
    expect((AI_DRAFT_JSON_SCHEMA.properties as Record<string, unknown>).parts).toBeDefined();
  });
});

describe('normalizeAIDraft', () => {
  it('normalises a valid document and rebuilds groups, labels, and sizes via fromAIDraft', () => {
    const aiDraft = normalizeAIDraft(validDocument);
    expect(aiDraft.label).toBe('Classroom');
    expect(aiDraft.parts).toHaveLength(2);
    expect(aiDraft.groups).toHaveLength(1);
    expect(aiDraft.groups[0]).toEqual({ id: 'furniture', name: 'classroom furniture', children: ['desk'] });

    const doc = fromAIDraft(aiDraft);
    const parts = collectParts(doc);
    expect(parts).toHaveLength(2);
    const floor = parts.find((p) => p.label === 'floor')!;
    expect(floor).toMatchObject({ name: 'Box', label: 'floor', scale: [6, 0.2, 8] });

    const group = doc.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    expect(group.name).toBe('classroom furniture');
    expect(group.children.map((c) => (c.kind === 'part' ? c.part.id : ''))).toEqual([parts.find((p) => p.label === 'desk')!.id]);
  });

  it('defaults missing position/rotation/color and kind', () => {
    const aiDraft = normalizeAIDraft({
      parts: [{ id: 'a', name: 'block', shape: 'box', size: [1, 1, 1] }],
    });
    expect(aiDraft.parts[0]).toMatchObject({
      kind: 'primitive',
      position: [0, 0, 0],
      rotation: [0, 0, 0],
      color: 0x8888cc,
      shape: 'box',
      size: [1, 1, 1],
    });
  });

  it('rejects non-object and missing parts', () => {
    expect(() => normalizeAIDraft(null)).toThrow('must be an object');
    expect(() => normalizeAIDraft({})).toThrow('parts');
    expect(() => normalizeAIDraft({ parts: [] })).toThrow('parts');
  });

  it('rejects unknown shapes and wrong size lengths', () => {
    expect(() => normalizeAIDraft({ parts: [{ id: 'a', name: 'x', shape: 'pyramid', size: [1, 1, 1] }] }))
      .toThrow('shape must be one of');
    expect(() => normalizeAIDraft({ parts: [{ id: 'a', name: 'x', shape: 'sphere', size: [1, 2] }] }))
      .toThrow('size must be 1 number');
  });
});
