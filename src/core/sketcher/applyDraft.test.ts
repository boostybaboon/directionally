import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { SketcherDocument } from './SketcherDocument.js';
import { diffDocument, applyDocumentCommand } from './applyDraft.js';
import { documentFromParts } from './documentTree.js';
import type { PartSeed, SetDocument } from './documentTree.js';
import type { PartDraft } from './types.js';
import type { Transform } from './transform.js';

beforeAll(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
});

function part(id: string, content: Partial<PartDraft> = {}, transform: Partial<Transform> = {}): PartSeed {
  return {
    content: { id, kind: 'primitive', name: 'Box', color: 0xffffff, ...content },
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], ...transform },
  };
}

function doc(seeds: PartSeed[]): SetDocument {
  return documentFromParts(seeds);
}

describe('diffDocument', () => {
  it('detects adds, updates, and removals', () => {
    const d = diffDocument(
      doc([part('a'), part('b', {}, { position: [1, 0, 0] })]),
      doc([part('a'), part('b', {}, { position: [2, 0, 0] }), part('c')]),
    );
    expect(d.add.map((p) => p.content.id)).toEqual(['c']);
    expect(d.update.map((p) => p.content.id)).toEqual(['b']);
    expect(d.remove).toEqual([]);
  });

  it('treats unchanged parts as no-ops, tolerating float noise', () => {
    const d = diffDocument(
      doc([part('a', {}, { quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] })]),
      doc([part('a', {}, { quaternion: [0, Math.SQRT1_2 + 1e-9, 0, Math.SQRT1_2] })]),
    );
    expect(d.update).toEqual([]);
    expect(d.add).toEqual([]);
    expect(d.remove).toEqual([]);
  });

  it('flags a part absent from the target as a removal', () => {
    const d = diffDocument(doc([part('a'), part('b')]), doc([part('a')]));
    expect(d.remove).toEqual(['b']);
  });
});

describe('applyDocumentCommand', () => {
  it('applies add/update as one undoable step', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);

    const seed = sketcher.insertPrimitive('Box')!;
    seed.mesh.position.set(0, 0.5, 0);
    const seedId = seed.id;

    const target = documentFromParts([
      part(seedId, { color: seed.color }, { position: [5, 0.5, 0] }),
      part('new-box', { color: seed.color }, { position: [1, 0.5, 0] }),
    ]);

    doc.execute(applyDocumentCommand(sketcher, target));

    const parts = sketcher.getSession().parts;
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.id === seedId)!.mesh.position.x).toBeCloseTo(5);
    expect(parts.some((p) => p.id !== seedId)).toBe(true);

    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(seedId);
  });
});