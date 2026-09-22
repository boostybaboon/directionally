import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { SketcherDocument } from './SketcherDocument.js';
import { diffDocument, applyDocumentCommand, applyDraftCommand } from './applyDraft.js';
import { documentFromParts, emptyDocument, insertRef } from './documentTree.js';
import { AI_CONVENTION, fromAIDraft, toAIDraft } from './aiDraft.js';
import type { AIDraft } from './aiDraft.js';
import type { PartSeed, SetDocument } from './documentTree.js';
import type { LightConfig } from '../domain/types.js';
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

/**
 * The shape a model plausibly answers with for a scene-sized instruction: labels, no preset, and a
 * placement for each. Reported from use: sixteen parts planned, every one of them landing at the
 * origin, and the ones whose preset the sketcher could not build landing nowhere at all.
 */
function kitchenDraft(): AIDraft {
  const names = ['Floor', 'Back Wall', 'Left Wall', 'Right Wall', 'Counter', 'Sink', 'Stove', 'Fridge',
    'Upper Cabinet 1', 'Upper Cabinet 2', 'Table', 'Chair 1', 'Chair 2', 'Chair 3', 'Lamp', 'Rug'];
  return {
    convention: AI_CONVENTION,
    parts: names.map((name, i) => ({
      id: `kitchen-${i}`,
      name,
      kind: 'primitive' as const,
      position: [i, 0.5, 0] as [number, number, number],
      rotation: [0, 0, 0] as [number, number, number],
      color: 0xccbbaa,
    })),
    groups: [],
  };
}

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

  it('applies the answer to an edit as one undoable step, keeping the parts it left alone', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const document = new SketcherDocument(sketcher);

    const box = sketcher.insertPrimitive('Box')!;
    const boxId = box.id;

    // What the loop does: read the session, have the model answer with the whole draft, apply it.
    const { aiDraft, idMap } = toAIDraft(sketcher.toDocument());
    const answered = {
      ...aiDraft,
      parts: [
        { ...aiDraft.parts[0], position: [3, 0.5, 0] as [number, number, number] },
        { id: 'extra', name: 'Extra', kind: 'primitive' as const, shape: 'box', size: [1, 1, 1], position: [0, 0.5, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], color: 0xffffff },
      ],
    };

    document.execute(applyDraftCommand(sketcher, answered, idMap));

    const parts = sketcher.getSession().parts;
    expect(parts).toHaveLength(2);
    // The part the AI moved is still the same part, which is the whole point of passing the map.
    expect(parts.find((p) => p.id === boxId)!.mesh.position.x).toBeCloseTo(3);
    expect(parts.some((p) => p.id !== boxId)).toBe(true);

    document.undo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(boxId);
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

describe('lights through an edit', () => {
  const lamp = (id: string, intensity: number): LightConfig => ({
    type: 'point', id, color: 0xffffff, intensity, position: [0, 2, 0],
  });
  const draftWith = (lights: LightConfig[], environmentMap?: string): AIDraft => ({
    convention: AI_CONVENTION,
    parts: [],
    groups: [],
    lights,
    ...(environmentMap !== undefined ? { environmentMap } : {}),
  });

  it('changes a light in place, keeping its place in the list', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);
    sketcher.addLight(lamp('key', 1));
    sketcher.addLight(lamp('fill', 1));

    const target = fromAIDraft(draftWith([lamp('key', 5), lamp('fill', 1)]));
    const diff = diffDocument(sketcher.toDocument(), target);
    expect(diff.lights.update.map((l) => l.id)).toEqual(['key']);
    expect(diff.lights.add).toHaveLength(0);
    expect(diff.lights.remove).toHaveLength(0);

    doc.execute(applyDocumentCommand(sketcher, target));

    // Same light, same position in the list: a brighter key is not a new key.
    expect(sketcher.getLights().map((l) => l.id)).toEqual(['key', 'fill']);
    expect((sketcher.getLights()[0] as { intensity: number }).intensity).toBe(5);

    doc.undo();
    expect((sketcher.getLights()[0] as { intensity: number }).intensity).toBe(1);
  });

  it('adds and removes the lights the draft asks for', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);
    sketcher.addLight(lamp('key', 1));

    const target = fromAIDraft(draftWith([lamp('fill', 2)]));
    const diff = diffDocument(sketcher.toDocument(), target);
    expect(diff.lights.add.map((l) => l.id)).toEqual(['fill']);
    expect(diff.lights.remove).toEqual(['key']);

    doc.execute(applyDocumentCommand(sketcher, target));
    expect(sketcher.getLights().map((l) => l.id)).toEqual(['fill']);

    doc.undo();
    expect(sketcher.getLights().map((l) => l.id)).toEqual(['key']);
  });

  it('changes the environment, and says so only when it moved', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);
    const target = fromAIDraft(draftWith([], 'interior-night'));

    const unchanged = diffDocument(sketcher.toDocument(), sketcher.toDocument());
    expect(unchanged.environment).toBeUndefined();

    const diff = diffDocument(sketcher.toDocument(), target);
    expect(diff.environment).toEqual({ id: 'interior-night' });

    doc.execute(applyDocumentCommand(sketcher, target));
    expect(sketcher.environmentMap).toBe('interior-night');
  });
});

describe('a scene-sized draft', () => {
  it('places every part where the draft put it, not at the origin', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);
    const draft = kitchenDraft();

    doc.execute(applyDraftCommand(sketcher, draft, {}));

    const parts = sketcher.getSession().parts;
    expect(parts).toHaveLength(16);
    // All sixteen present and all sixteen distinct: the overprinting symptom was every placement lost.
    expect(parts.map((p) => p.mesh.position.x)).toEqual(draft.parts.map((p) => p.position[0]));
    expect(sketcher.toDocument().root.map((n) => n.transform.position[0]))
      .toEqual(draft.parts.map((p) => p.position[0]));
  });

  it('builds a part whose preset the sketcher does not have, rather than dropping it', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);

    doc.execute(applyDraftCommand(sketcher, kitchenDraft(), {}));

    // "Sink" and "Stove" are not presets; they are still things the draft asked to have placed.
    expect(sketcher.getSession().parts).toHaveLength(16);
  });

  it('forms the groups the draft asked for', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);
    const draft = kitchenDraft();
    draft.groups = [{ id: 'chairs', name: 'chairs', children: ['kitchen-11', 'kitchen-12', 'kitchen-13'] }];

    doc.execute(applyDraftCommand(sketcher, draft, {}));

    const group = sketcher.toDocument().root.find((n) => n.role === 'structure');
    expect(group).toBeDefined();
    expect(group!.children).toHaveLength(3);
  });
});
