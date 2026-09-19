import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { SketcherDocument } from './SketcherDocument.js';
import { diffDocument, applyDocumentCommand } from './applyDraft.js';
import { documentFromParts, emptyDocument, insertRef } from './documentTree.js';
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

function instanceDoc(id: string, ref: string, transform: Partial<Transform> = {}): SetDocument {
  const d = emptyDocument();
  insertRef(d, {
    id,
    ref,
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], ...transform },
  });
  return d;
}

const CHAIR = documentFromParts([part('seat', { name: 'Seat', color: 0x663311 })]);

describe('diffDocument instances', () => {
  it('diffs an added instance instead of ignoring the node', () => {
    const d = diffDocument(emptyDocument(), instanceDoc('chair-1', 'chair'));
    expect(d.addRefs).toEqual([
      {
        id: 'chair-1',
        ref: 'chair',
        name: undefined,
        transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      },
    ]);
    expect(d.removeRefs).toEqual([]);
  });

  it('diffs a dropped instance', () => {
    const d = diffDocument(instanceDoc('chair-1', 'chair'), emptyDocument());
    expect(d.removeRefs).toEqual(['chair-1']);
    expect(d.addRefs).toEqual([]);
  });

  it('diffs a moved instance as a placement change', () => {
    const d = diffDocument(
      instanceDoc('chair-1', 'chair'),
      instanceDoc('chair-1', 'chair', { position: [3, 0, 1] }),
    );
    expect(d.moveRefs).toEqual([
      { id: 'chair-1', transform: { position: [3, 0, 1], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
    ]);
  });

  it('diffs a re-pointed instance as a drop and a place, keeping the node id', () => {
    const d = diffDocument(instanceDoc('chair-1', 'chair'), instanceDoc('chair-1', 'stool'));
    expect(d.removeRefs).toEqual(['chair-1']);
    expect(d.addRefs.map((seed) => [seed.id, seed.ref])).toEqual([['chair-1', 'stool']]);
  });

  it('leaves an untouched instance alone', () => {
    const d = diffDocument(instanceDoc('chair-1', 'chair'), instanceDoc('chair-1', 'chair'));
    expect(d.addRefs).toEqual([]);
    expect(d.removeRefs).toEqual([]);
    expect(d.moveRefs).toEqual([]);
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

  it('applies an AI turn that adds, moves and drops an instance', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    sketcher.setRefResolver((ref) => (ref === 'chair' ? CHAIR : null));
    const doc = new SketcherDocument(sketcher);

    doc.execute(applyDocumentCommand(sketcher, instanceDoc('chair-1', 'chair')));
    expect(sketcher.getSession().parts).toHaveLength(0);
    expect(sketcher.nodeObject('chair-1')).not.toBeNull();

    // The AI moves the instance and places a second one.
    const target = instanceDoc('chair-1', 'chair', { position: [4, 0, 0] });
    insertRef(target, { id: 'chair-2', ref: 'chair', transform: { position: [0, 0, 2], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } });
    doc.execute(applyDocumentCommand(sketcher, target));

    expect(sketcher.nodeObject('chair-1')!.position.toArray()).toEqual([4, 0, 0]);
    expect(sketcher.nodeObject('chair-2')).not.toBeNull();
    expect(sketcher.toDocument().root.map((node) => node.id)).toEqual(['chair-1', 'chair-2']);

    // Undo returns the whole turn, including both instances.
    doc.undo();
    expect(sketcher.toDocument().root.map((node) => node.id)).toEqual(['chair-1']);
  });

  it('drops a nested instance by id, though its path carries the group', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    sketcher.setRefResolver((ref) => (ref === 'chair' ? CHAIR : null));
    const doc = new SketcherDocument(sketcher);

    sketcher.loadDocument({
      root: [
        {
          id: 'row',
          role: 'structure',
          transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
          children: [
            { id: 'chair-1', role: 'prop', ref: 'chair', transform: { position: [1, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }, children: [] },
          ],
        },
      ],
      joints: [],
    });
    expect(sketcher.nodeObject('chair-1')).not.toBeNull();

    doc.execute(applyDocumentCommand(sketcher, emptyDocument()));

    // The instance is gone; the group it sat in is the AI's business, not the instance's.
    expect(sketcher.nodeObject('chair-1')).toBeNull();
    expect(sketcher.toDocument().root.map((node) => node.id)).toEqual(['row']);
  });
});