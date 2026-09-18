import { describe, it, expect } from 'vitest';
import {
  insertPart,
  removePart,
  groupNodes,
  ungroupNode,
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
  addLightNode,
  removeLightNode,
  collectLights,
  pathOfPart,
} from './documentTree.js';
import { isPartNode } from './documentTree.js';
import { localToWorld } from './transform.js';
import type { PartSeed, SetDocument } from './documentTree.js';
import type { JointSnapshot } from './types.js';
import type { LightConfig } from '../domain/types.js';

describe('tree mutation operations', () => {
  function empty(): SetDocument {
    return { root: [], joints: [] };
  }
  function box(id: string, pos: [number, number, number] = [0, 0, 0]): PartSeed {
    return {
      content: { id, kind: 'primitive', name: 'Box', color: 0x8888cc },
      transform: { position: pos, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    };
  }

  it('insertPart adds a leaf (with a name segment) and removePart removes it', () => {
    const doc = empty();
    insertPart(doc, box('a'));
    expect(doc.root).toHaveLength(1);
    expect(doc.root[0].role).toBe('prop');
    if (!isPartNode(doc.root[0])) throw new Error('expected part');
    expect(doc.root[0].content.id).toBe('a');
    expect(doc.root[0].id).toBe('box');

    expect(removePart(doc, 'a')).toBe(true);
    expect(doc.root).toHaveLength(0);
    expect(removePart(doc, 'a')).toBe(false);
  });

  it('groupNodes() wraps siblings into a group at their centroid, preserving world positions', () => {
    const doc = empty();
    insertPart(doc, box('a', [0, 0, 0]));
    insertPart(doc, box('b', [2, 0, 0]));
    expect(groupNodes(doc, ['a', 'b'], 'pair')).toBe(true);

    const group = doc.root.find((n) => n.role === 'structure');
    if (!group) throw new Error('expected a group node');
    expect(group.transform.position).toEqual([1, 0, 0]);
    expect(group.children.map((c) => (isPartNode(c) ? c.transform.position : null))).toEqual([[-1, 0, 0], [1, 0, 0]]);
  });

  it('ungroupNode() promotes children back to their world positions', () => {
    const doc = empty();
    insertPart(doc, box('a', [0, 0, 0]));
    insertPart(doc, box('b', [2, 0, 0]));
    groupNodes(doc, ['a', 'b'], 'pair');

    expect(ungroupNode(doc, 'a')).toBe(true);
    expect(doc.root).toHaveLength(2);
    expect(doc.root.map((n) => (isPartNode(n) ? n.transform.position : null))).toEqual([[0, 0, 0], [2, 0, 0]]);
  });

  it('setPartTransform and setPartColor update a leaf', () => {
    const doc = empty();
    insertPart(doc, box('a'));
    expect(setPartTransform(doc, 'a', { position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [2, 2, 2] })).toBe(true);
    expect(setPartColor(doc, 'a', 0xff0000)).toBe(true);
    if (!isPartNode(doc.root[0])) throw new Error('expected part');
    expect(doc.root[0].transform.position).toEqual([1, 2, 3]);
    expect(doc.root[0].transform.scale).toEqual([2, 2, 2]);
    expect(doc.root[0].content.color).toBe(0xff0000);
  });
});

describe('attach topology', () => {
  function empty(): SetDocument {
    return { root: [], joints: [] };
  }
  function box(id: string, pos: [number, number, number] = [0, 0, 0]): PartSeed {
    return {
      content: { id, kind: 'primitive', name: 'Box', color: 0x8888cc },
      transform: { position: pos, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    };
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

    groupNodes(doc, ['a', 'b'], 'pair');
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
    groupNodes(doc, ['a', 'b'], 'pair');
    addGroupBond(doc, ['a', 'b']);

    expect(mergeIntoGroup(doc, ['a', 'b', 'c'])).toBe(true);

    const groups = doc.root.filter((n) => n.role === 'structure');
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (!group) throw new Error('expected a group node');
    expect(group.isGroup).toBe(false);
    expect(group.children.map((child) => (isPartNode(child) ? child.content.id : ''))).toEqual(['a', 'b', 'c']);
    // The bond survives the merge — only the topology changed.
    expect(doc.groupComponents).toEqual([['a', 'b']]);
    // World positions are unchanged.
    // Every node carries its own transform, so the world position is one call.
    const worldA = localToWorld(group.children[0].transform, group.transform);
    expect(worldA.position).toEqual([0, 0, 0]);
  });

  it('rebuildGroups() splits a chain and recovers a bonded pure group', () => {
    const doc = populated();
    groupNodes(doc, ['a', 'b'], 'pair');
    addGroupBond(doc, ['a', 'b']);
    mergeIntoGroup(doc, ['a', 'b', 'c']);
    addJoint(doc, jointOf('a', 'b'));
    addJoint(doc, jointOf('b', 'c'));

    // Detaching the middle part leaves no joints at all…
    removeJointsTouching(doc, 'b');
    rebuildGroups(doc, ['a', 'b', 'c']);

    // …so A and B come back as their bonded pure group, and C stands alone.
    const groups = doc.root.filter((n) => n.role === 'structure');
    expect(groups).toHaveLength(1);
    const group = groups[0];
    if (!group) throw new Error('expected a group node');
    expect(group.isGroup).toBe(true);
    expect(group.children.map((child) => (isPartNode(child) ? child.content.id : ''))).toEqual(['a', 'b']);
    expect(doc.root.some((n) => isPartNode(n) && n.content.id === 'c')).toBe(true);
  });

  it('rebuildGroups() keeps a jointed component as an attach assembly', () => {
    const doc = populated();
    mergeIntoGroup(doc, ['a', 'b', 'c']);
    addJoint(doc, jointOf('a', 'b'));
    addJoint(doc, jointOf('b', 'c'));

    removeJointsTouching(doc, 'c');
    rebuildGroups(doc, ['a', 'b', 'c']);

    const group = doc.root.find((n) => n.role === 'structure');
    if (!group) throw new Error('expected a group node');
    expect(group.isGroup).toBe(false);
    expect(group.children.map((child) => (isPartNode(child) ? child.content.id : ''))).toEqual(['a', 'b']);
  });
});

describe('lights', () => {
  const sun: LightConfig = {
    type: 'directional', id: 'sun', color: 0xffffff, intensity: 2, position: [5, 10, 5],
  };

  it('addLightNode() stores a light as a node that owns its id and position', () => {
    const doc: SetDocument = { root: [], joints: [] };
    addLightNode(doc, sun);

    const node = doc.root[0];
    expect(node.role).toBe('light');
    expect(node.id).toBe('sun');
    expect(node.transform.position).toEqual([5, 10, 5]);
    expect(node.light).toMatchObject({ type: 'directional', intensity: 2, color: 0xffffff });
    // Identity and placement live on the node, so the payload repeats neither.
    expect(node.light && 'id' in node.light).toBe(false);
    expect(node.light && 'position' in node.light).toBe(false);
  });

  it('collectLights() rebuilds the renderer configs, and a removed light drops out', () => {
    const doc: SetDocument = { root: [], joints: [] };
    addLightNode(doc, sun);
    expect(collectLights(doc)).toEqual([sun]);

    expect(removeLightNode(doc, 'sun')).toBe(true);
    expect(collectLights(doc)).toEqual([]);
    expect(removeLightNode(doc, 'sun')).toBe(false);
  });

  it('keeps a taken light id by suffixing it', () => {
    const doc: SetDocument = { root: [], joints: [] };
    addLightNode(doc, sun);
    addLightNode(doc, { ...sun, position: [0, 0, 0] });
    expect(doc.root.map((n) => n.id)).toEqual(['sun', 'sun-2']);
  });
});

describe('nesting and paths', () => {
  const empty = (): SetDocument => ({ root: [], joints: [] });
  const box = (id: string, pos: [number, number, number] = [0, 0, 0]): PartSeed => ({
    content: { id, kind: 'primitive', name: 'Box', color: 0x8888cc },
    transform: { position: pos, quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
  });
  // Decomposition can hand back -0, which is not 0 to toEqual.
  const round = (t: { position: number[] }) => t.position.map((n) => {
    const r = Math.round(n * 1e6) / 1e6;
    return Object.is(r, -0) ? 0 : r;
  });

  it('pathOfPart() reports the node path, which stays unique as groups nest', () => {
    const doc = empty();
    insertPart(doc, box('a'));
    insertPart(doc, box('b', [2, 0, 0]));
    groupNodes(doc, ['a', 'b'], 'pair');

    expect(pathOfPart(doc, 'a')).toBe('pair/box');
    expect(pathOfPart(doc, 'b')).toBe('pair/box-2');
    expect(pathOfPart(doc, 'nope')).toBeNull();
  });

  it('groupNodes() wraps a group and a part into a group-of-groups', () => {
    const doc = empty();
    insertPart(doc, box('top', [0, 1, 0]));
    insertPart(doc, box('leg', [-0.4, 0.5, 0]));
    insertPart(doc, box('chair', [2, 0, 0]));
    expect(groupNodes(doc, ['top', 'leg'], 'table')).toBe(true);

    // The table group and the loose chair are siblings, so grouping them nests the table.
    const tablePath = pathOfPart(doc, 'top')!.split('/')[0];
    expect(groupNodes(doc, [tablePath, 'chair'], 'room')).toBe(true);

    const room = doc.root[0];
    expect(room.id).toBe('room');
    // A part child is named by its guid, a group child by its node id.
    expect(room.children.map((c) => (isPartNode(c) ? c.content.id : c.id)).sort()).toEqual(['chair', 'table']);

    // World positions survive both levels of localisation.
    const table = room.children.find((c) => c.id === 'table')!;
    const top = table.children[0];
    expect(round(localToWorld(top.transform, localToWorld(table.transform, room.transform)))).toEqual([0, 1, 0]);
  });

  it('groupNodes() refuses members that are not siblings', () => {
    const doc = empty();
    insertPart(doc, box('top'));
    insertPart(doc, box('leg'));
    insertPart(doc, box('loose'));
    groupNodes(doc, ['top', 'leg'], 'table');

    // `top` sits inside `table` while `loose` is at the root.
    expect(groupNodes(doc, ['top', 'loose'], 'nope')).toBe(false);
    expect(doc.root).toHaveLength(2);
  });

  it('ungroupNode() promotes a nested group into its parent, not the root', () => {
    const doc = empty();
    insertPart(doc, box('top'));
    insertPart(doc, box('leg'));
    insertPart(doc, box('chair', [2, 0, 0]));
    groupNodes(doc, ['top', 'leg'], 'table');
    const tablePath = pathOfPart(doc, 'top')!.split('/')[0];
    groupNodes(doc, [tablePath, 'chair'], 'room');

    // A part's guid addresses the group that owns it, at whatever depth it now sits.
    expect(ungroupNode(doc, 'top')).toBe(true);
    expect(doc.root).toHaveLength(1);
    expect(doc.root[0].id).toBe('room');
    expect(doc.root[0].children.map((c) => c.id).sort()).toEqual(['box', 'box-2', 'box-3']);
  });

  it('addresses a group by its absolute path, which a re-parent changes', () => {
    const doc = empty();
    insertPart(doc, box('top'));
    insertPart(doc, box('leg'));
    insertPart(doc, box('chair', [2, 0, 0]));
    groupNodes(doc, ['top', 'leg'], 'table');
    const tablePath = pathOfPart(doc, 'top')!.split('/')[0];
    expect(tablePath).toBe('table');

    groupNodes(doc, [tablePath, 'chair'], 'room');

    const nested = pathOfPart(doc, 'top')!.split('/').slice(0, -1).join('/');
    expect(nested).toBe('room/table');
    expect(ungroupNode(doc, nested)).toBe(true);
    expect(doc.root[0].children.map((c) => c.id).sort()).toEqual(['box', 'box-2', 'box-3']);
  });
});
