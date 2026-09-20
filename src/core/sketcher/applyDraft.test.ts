import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { SketcherDocument } from './SketcherDocument.js';
import { diffDocument, applyDocumentCommand } from './applyDraft.js';
import { documentFromParts, emptyDocument, insertRef } from './documentTree.js';
import { AI_CONVENTION, fromAIDraft } from './aiDraft.js';
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

  it('wraps a new group around the nodes it names, wherever they already stand', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    sketcher.setRefResolver((ref) => (ref === 'chair' ? CHAIR : null));
    const doc = new SketcherDocument(sketcher);

    // Turn one: an instance at the root, as the AI saw it.
    doc.execute(applyDocumentCommand(sketcher, fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ id: 'chair-1', name: 'chair-1', ref: 'chair', position: [2, 0, 0], rotation: [0, 0, 0] }],
      groups: [],
    })));
    expect(sketcher.toDocument().root.map((n) => n.id)).toEqual(['chair-1']);

    // Turn two: the same instance, a second one, and a group naming both.
    const target = fromAIDraft({
      convention: AI_CONVENTION,
      parts: [
        { id: 'chair-1', name: 'chair-1', ref: 'chair', position: [2, 0, 0], rotation: [0, 0, 0] },
        { id: 'chair-2', name: 'chair-2', ref: 'chair', position: [4, 0, 0], rotation: [0, 0, 0] },
      ],
      groups: [{ id: 'row', name: 'row', children: ['chair-1', 'chair-2'] }],
    });
    doc.execute(applyDocumentCommand(sketcher, target));

    const document = sketcher.toDocument();
    // Both instances are in the group, at the places they were: the group wraps them where they
    // stand rather than dragging them onto the document root's idea of their transform.
    expect(document.root.map((n) => n.id)).toEqual(['row']);
    expect(document.root[0].isGroup).toBe(true);
    expect(document.root[0].children.map((n) => n.id)).toEqual(['chair-1', 'chair-2']);
    expect(document.root[0].transform.position).toEqual([3, 0, 0]);
    expect(document.root[0].children[1].transform.position).toEqual([1, 0, 0]);
    expect(sketcher.nodeObject('row/chair-2')).not.toBeNull();
  });

  it('moves a member in and out of a group that stays', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    sketcher.setRefResolver((ref) => (ref === 'chair' ? CHAIR : null));
    const doc = new SketcherDocument(sketcher);

    const draft = (children: string[]) => fromAIDraft({
      convention: AI_CONVENTION,
      parts: ['chair-1', 'chair-2'].map((name, i) => ({
        id: name,
        name,
        ref: 'chair',
        position: [1 + (i * 2), 0, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
      })),
      groups: [{ id: 'row', name: 'row', children }],
    });

    doc.execute(applyDocumentCommand(sketcher, draft(['chair-1', 'chair-2'])));
    doc.execute(applyDocumentCommand(sketcher, draft(['chair-1'])));

    // chair-2 leaves with its world position: it was at x = 3, and x = 3 is where it still is. It
    // takes the group's slot in the root, which is as much order as a membership change says.
    const document = sketcher.toDocument();
    expect(document.root.map((n) => n.id)).toEqual(['chair-2', 'row']);
    expect(document.root.find((n) => n.id === 'row')!.children.map((n) => n.id)).toEqual(['chair-1']);
    expect(document.root.find((n) => n.id === 'chair-2')!.transform.position[0]).toBeCloseTo(3);

    doc.execute(applyDocumentCommand(sketcher, draft(['chair-1', 'chair-2'])));
    expect(sketcher.toDocument().root.map((n) => n.id)).toEqual(['row']);
    expect(sketcher.toDocument().root[0].children.map((n) => n.id)).toEqual(['chair-1', 'chair-2']);
  });

  it('dissolves a group the edit no longer names', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    sketcher.setRefResolver((ref) => (ref === 'chair' ? CHAIR : null));
    const doc = new SketcherDocument(sketcher);

    const draft = (groups: { id: string; name: string; children: string[] }[]) => fromAIDraft({
      convention: AI_CONVENTION,
      parts: [{ id: 'chair-1', name: 'chair-1', ref: 'chair', position: [2, 0, 0], rotation: [0, 0, 0] }],
      groups,
    });

    doc.execute(applyDocumentCommand(sketcher, draft([{ id: 'row', name: 'row', children: ['chair-1'] }])));
    expect(sketcher.toDocument().root.map((n) => n.id)).toEqual(['row']);

    doc.execute(applyDocumentCommand(sketcher, draft([])));

    expect(sketcher.toDocument().root.map((n) => n.id)).toEqual(['chair-1']);
    expect(sketcher.nodeObject('chair-1')!.position.toArray()).toEqual([2, 0, 0]);
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