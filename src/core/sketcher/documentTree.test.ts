import { describe, it, expect } from 'vitest';
import {
  draftToDocument,
  documentToDraft,
  insertPart,
  removePart,
  groupParts,
  ungroupPart,
  setPartTransform,
  setPartColor,
  addJoint,
  removeJointsTouching,
  addGroupBond,
  removeGroupBondContaining,
  evictFromGroupBonds,
  groupMembersOf,
  mergeIntoGroup,
  rebuildGroups,
} from './documentTree.js';
import { localToWorld } from './transform.js';
import type { SetDocument } from './documentTree.js';
import type { JointSnapshot, PartDraft, SketcherDraft } from './types.js';

function part(id: string, name = 'Box'): PartDraft {
  return { id, kind: 'primitive', name, position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0x8888cc };
}

describe('draftToDocument / documentToDraft', () => {
  it('round-trips an empty draft exactly', () => {
    const draft: SketcherDraft = { version: 2, parts: [], joints: [] };
    expect(documentToDraft(draftToDocument(draft))).toEqual(draft);
  });

  it('round-trips ungrouped parts, lights and environment exactly (order preserved)', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [part('a'), part('b'), part('c')],
      joints: [],
      lights: [{ type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [0, 10, 0] }],
      environmentMap: 'studio',
    };
    expect(documentToDraft(draftToDocument(draft))).toEqual(draft);
  });

  it('groups parts under group nodes and round-trips semantically', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [part('top'), part('leg'), part('loose')],
      joints: [],
      groups: [{ partIds: ['top', 'leg'], name: 'table' }],
    };

    const doc = draftToDocument(draft);
    expect(doc.root).toHaveLength(2); // one loose part + one group
    const groupNode = doc.root.find((n) => n.kind === 'group');
    expect(groupNode).toBeDefined();
    if (groupNode?.kind === 'group') {
      expect(groupNode.name).toBe('table');
      expect(groupNode.children.map((c) => (c.kind === 'part' ? c.part.id : 'x'))).toEqual(['top', 'leg']);
    }

    const back = documentToDraft(doc);
    expect(back.parts.map((p) => p.id).sort()).toEqual(['top', 'leg', 'loose'].sort());
    expect(back.groups).toEqual([{ partIds: ['top', 'leg'], name: 'table' }]);
  });

  it('preserves the isGroup flag', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [part('a'), part('b')],
      joints: [],
      groups: [{ partIds: ['a', 'b'], isGroup: true }],
    };
    expect(documentToDraft(draftToDocument(draft)).groups).toEqual([{ partIds: ['a', 'b'], isGroup: true }]);
  });

  it('assigns parent-unique name-segment ids from label/name', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [
        { ...part('a', 'Box'), label: 'leg' },
        { ...part('b', 'Box'), label: 'leg' }, // duplicate label → deduped within the group
        { ...part('c', 'Box'), label: 'top' },
      ],
      joints: [],
      groups: [{ partIds: ['a', 'b'], name: 'table' }],
    };

    const doc = draftToDocument(draft);
    const groupNode = doc.root.find((n) => n.kind === 'group');
    if (groupNode?.kind !== 'group') throw new Error('expected a group node');
    expect(groupNode.id).toBe('table');
    expect(groupNode.children.map((c) => (c.kind === 'part' ? c.id : ''))).toEqual(['leg', 'leg-2']);

    const rootPart = doc.root.find((n) => n.kind === 'part');
    if (rootPart?.kind !== 'part') throw new Error('expected a root part node');
    expect(rootPart.id).toBe('top');
  });

  it('dedupes name segments among root siblings', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [part('a', 'Box'), part('b', 'Box'), part('c', 'Box')],
      joints: [],
    };
    const doc = draftToDocument(draft);
    expect(doc.root.map((n) => (n.kind === 'part' ? n.id : ''))).toEqual(['box', 'box-2', 'box-3']);
  });

  it('assigns role: prop to parts and role: structure to groups', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [part('a', 'Box'), part('b', 'Box'), part('loose', 'Box')],
      joints: [],
      groups: [{ partIds: ['a', 'b'], name: 'pair' }],
    };
    const doc = draftToDocument(draft);
    const group = doc.root.find((n) => n.kind === 'group');
    if (group?.kind === 'group') expect(group.role).toBe('structure');
    const loose = doc.root.find((n) => n.kind === 'part');
    if (loose?.kind === 'part') expect(loose.role).toBe('prop');
  });
});

describe('tree mutation operations', () => {
  function empty(): SetDocument {
    return { version: 2, root: [], joints: [] };
  }
  function box(id: string, pos: [number, number, number] = [0, 0, 0]): PartDraft {
    return { id, kind: 'primitive', name: 'Box', position: pos, quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0x8888cc };
  }

  it('insertPart adds a leaf (with a name segment) and removePart removes it', () => {
    const doc = empty();
    insertPart(doc, box('a'));
    expect(doc.root).toHaveLength(1);
    expect(doc.root[0].kind).toBe('part');
    if (doc.root[0].kind !== 'part') throw new Error('expected part');
    expect(doc.root[0].part.id).toBe('a');
    expect(doc.root[0].id).toBe('box');

    expect(removePart(doc, 'a')).toBe(true);
    expect(doc.root).toHaveLength(0);
    expect(removePart(doc, 'a')).toBe(false);
  });

  it('groupParts wraps siblings into a group at their centroid, preserving world positions', () => {
    const doc = empty();
    insertPart(doc, box('a', [0, 0, 0]));
    insertPart(doc, box('b', [2, 0, 0]));
    expect(groupParts(doc, ['a', 'b'], 'pair')).toBe(true);

    const group = doc.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    expect(group.position).toEqual([1, 0, 0]);
    expect(group.children.map((c) => (c.kind === 'part' ? c.part.position : null))).toEqual([[-1, 0, 0], [1, 0, 0]]);
  });

  it('ungroupPart promotes children back to their world positions', () => {
    const doc = empty();
    insertPart(doc, box('a', [0, 0, 0]));
    insertPart(doc, box('b', [2, 0, 0]));
    groupParts(doc, ['a', 'b'], 'pair');

    expect(ungroupPart(doc, 'a')).toBe(true);
    expect(doc.root).toHaveLength(2);
    expect(doc.root.map((n) => (n.kind === 'part' ? n.part.position : null))).toEqual([[0, 0, 0], [2, 0, 0]]);
  });

  it('setPartTransform and setPartColor update a leaf', () => {
    const doc = empty();
    insertPart(doc, box('a'));
    expect(setPartTransform(doc, 'a', { position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [2, 2, 2] })).toBe(true);
    expect(setPartColor(doc, 'a', 0xff0000)).toBe(true);
    if (doc.root[0].kind !== 'part') throw new Error('expected part');
    expect(doc.root[0].part.position).toEqual([1, 2, 3]);
    expect(doc.root[0].part.scale).toEqual([2, 2, 2]);
    expect(doc.root[0].part.color).toBe(0xff0000);
  });

  it('group/ungroup round-trips to a consistent flat draft', () => {
    const doc = empty();
    insertPart(doc, box('a', [0, 0, 0]));
    insertPart(doc, box('b', [2, 0, 0]));
    insertPart(doc, box('c', [0, 1, 0]));
    groupParts(doc, ['a', 'b'], 'pair');

    const back = documentToDraft(doc);
    expect(back.parts.find((p) => p.id === 'a')!.position).toEqual([-1, 0, 0]);
    expect(back.groups).toEqual([{ partIds: ['a', 'b'], name: 'pair', position: [1, 0, 0] }]);
  });
});

describe('attach topology', () => {
  function empty(): SetDocument {
    return { version: 2, root: [], joints: [] };
  }
  function box(id: string, pos: [number, number, number] = [0, 0, 0]): PartDraft {
    return { id, kind: 'primitive', name: 'Box', position: pos, quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0x8888cc };
  }
  function jointOf(a: string, b: string): JointSnapshot {
    return {
      type: 'snap',
      partAId: a,
      localPointA: [0, 0.5, 0],
      localNormalA: [0, 1, 0],
      partBId: b,
      localPointB: [0, -0.5, 0],
      localNormalB: [0, -1, 0],
    };
  }
  function populated(): SetDocument {
    const doc = empty();
    insertPart(doc, box('a', [0, 0, 0]));
    insertPart(doc, box('b', [1, 0, 0]));
    insertPart(doc, box('c', [2, 0, 0]));
    return doc;
  }

  it('addJoint() appends and removeJointsTouching() drops both sides', () => {
    const doc = populated();
    addJoint(doc, jointOf('a', 'b'));
    addJoint(doc, jointOf('b', 'c'));
    expect(doc.joints).toHaveLength(2);

    removeJointsTouching(doc, 'b');
    expect(doc.joints).toHaveLength(0);

    addJoint(doc, jointOf('a', 'b'));
    removeJointsTouching(doc, 'c');
    expect(doc.joints).toHaveLength(1);
  });

  it('groupMembersOf() covers the enclosing group, or just the part', () => {
    const doc = populated();
    expect(groupMembersOf(doc, 'a')).toEqual(['a']);

    groupParts(doc, ['a', 'b'], 'pair');
    expect(groupMembersOf(doc, 'a').sort()).toEqual(['a', 'b']);
    expect(groupMembersOf(doc, 'c')).toEqual(['c']);
  });

  it('group bonds merge on overlap and split off on removal', () => {
    const doc = populated();
    addGroupBond(doc, ['a', 'b']);
    expect(doc.groupComponents).toEqual([['a', 'b']]);

    // Grouping D into the A+B group folds the old bond in.
    removePart(doc, 'c');
    insertPart(doc, box('d', [3, 0, 0]));
    addGroupBond(doc, ['a', 'b', 'd']);
    expect(doc.groupComponents).toEqual([['a', 'b', 'd']]);

    removeGroupBondContaining(doc, 'b');
    expect(doc.groupComponents).toBeUndefined();
  });

  it('evictFromGroupBonds() prunes a bond that shrinks below two members', () => {
    const doc = populated();
    addGroupBond(doc, ['a', 'b', 'c']);
    evictFromGroupBonds(doc, 'a');
    expect(doc.groupComponents).toEqual([['b', 'c']]);

    evictFromGroupBonds(doc, 'b');
    expect(doc.groupComponents).toBeUndefined();
  });

  it('mergeIntoGroup() dissolves member groups and keeps world positions', () => {
    const doc = populated();
    groupParts(doc, ['a', 'b'], 'pair');
    addGroupBond(doc, ['a', 'b']);

    expect(mergeIntoGroup(doc, ['a', 'b', 'c'])).toBe(true);

    const groups = doc.root.filter((n) => n.kind === 'group');
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (group.kind !== 'group') throw new Error('expected a group node');
    expect(group.isGroup).toBe(false);
    expect(group.children.map((child) => (child.kind === 'part' ? child.part.id : ''))).toEqual(['a', 'b', 'c']);
    // The bond survives the merge — only the topology changed.
    expect(doc.groupComponents).toEqual([['a', 'b']]);
    // World positions are unchanged.
    const worldA = localToWorld(
      { position: group.children[0].kind === 'part' ? group.children[0].part.position : [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
      { position: group.position ?? [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    );
    expect(worldA.position).toEqual([0, 0, 0]);
  });

  it('rebuildGroups() splits a chain and recovers a bonded pure group', () => {
    const doc = populated();
    groupParts(doc, ['a', 'b'], 'pair');
    addGroupBond(doc, ['a', 'b']);
    mergeIntoGroup(doc, ['a', 'b', 'c']);
    addJoint(doc, jointOf('a', 'b'));
    addJoint(doc, jointOf('b', 'c'));

    // Detaching the middle part leaves no joints at all…
    removeJointsTouching(doc, 'b');
    rebuildGroups(doc, ['a', 'b', 'c']);

    // …so A and B come back as their bonded pure group, and C stands alone.
    const groups = doc.root.filter((n) => n.kind === 'group');
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (group.kind !== 'group') throw new Error('expected a group node');
    expect(group.isGroup).toBe(true);
    expect(group.children.map((child) => (child.kind === 'part' ? child.part.id : ''))).toEqual(['a', 'b']);
    expect(doc.root.some((n) => n.kind === 'part' && n.part.id === 'c')).toBe(true);
  });

  it('rebuildGroups() keeps a jointed component as an attach assembly', () => {
    const doc = populated();
    mergeIntoGroup(doc, ['a', 'b', 'c']);
    addJoint(doc, jointOf('a', 'b'));
    addJoint(doc, jointOf('b', 'c'));

    removeJointsTouching(doc, 'c');
    rebuildGroups(doc, ['a', 'b', 'c']);

    const group = doc.root.find((n) => n.kind === 'group');
    if (group?.kind !== 'group') throw new Error('expected a group node');
    expect(group.isGroup).toBe(false);
    expect(group.children.map((child) => (child.kind === 'part' ? child.part.id : ''))).toEqual(['a', 'b']);
  });
});
