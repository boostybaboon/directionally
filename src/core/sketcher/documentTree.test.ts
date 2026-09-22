import { describe, it, expect, vi } from 'vitest';
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
  collectRefs,
  normalizeDocument,
  insertRef,
  nodeAt,
  removeTreeNode,
  extractDefinition,
  collectPartNodes,
  applyOverrides,
  adoptIntoGroup,
  releaseFromGroup,
  childOfGroupHolding,
} from './documentTree.js';
import { isPartNode } from './documentTree.js';
import { localToWorld } from './transform.js';
import type { Transform } from './transform.js';
import type { NodeOverride, OrphanedOverride, PartSeed, SetDocument, SetNode } from './documentTree.js';
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
    expect(groupNodes(doc, ['a', 'b'], 'pair')).not.toBeNull();

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

  it('collectLights() omits a hidden light, so a variation can switch one off', () => {
    const doc: SetDocument = { root: [], joints: [] };
    addLightNode(doc, sun);

    doc.root[0].hidden = true;

    expect(collectLights(doc)).toEqual([]);
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
    expect(groupNodes(doc, ['top', 'leg'], 'table')).not.toBeNull();

    // The table group and the loose chair are siblings, so grouping them nests the table.
    const tablePath = pathOfPart(doc, 'top')!.split('/')[0];
    expect(groupNodes(doc, [tablePath, 'chair'], 'room')).not.toBeNull();

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
    expect(groupNodes(doc, ['top', 'loose'], 'nope')).toBeNull();
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

  it('groupNodes() refuses to group a node with its own ancestor', () => {
    const doc = empty();
    insertPart(doc, box('top'));
    insertPart(doc, box('leg'));
    insertPart(doc, box('loose'));
    groupNodes(doc, ['top', 'leg'], 'table');
    const tablePath = pathOfPart(doc, 'top')!.split('/')[0];

    // `table` holds `top`, so the pair collapses to `top` alone: nothing to group, and the
    // table group is left intact rather than dissolved on the way to a common parent.
    expect(groupNodes(doc, [tablePath, 'top'], 'nope')).toBeNull();
    expect(doc.root.map((n) => n.id)).toEqual(['table', 'box-3']);
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

describe('instances', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
  const instance = (id: string, ref: string, children: SetNode[] = []): SetNode =>
    ({ id, role: 'prop', ref, transform: { ...identity }, children });

  it('collectRefs() reports the distinct Definitions, in tree order', () => {
    const doc: SetDocument = {
      root: [instance('a', 'chair'), instance('b', 'table', [instance('inner', 'lamp')]), instance('c', 'chair')],
      joints: [],
    };
    expect(collectRefs(doc)).toEqual(['chair', 'table', 'lamp']);
    expect(collectRefs({ root: [], joints: [] })).toEqual([]);
  });

  it('normalizeDocument() keeps an instance, which carries no payload', () => {
    const doc = normalizeDocument({
      root: [{ id: 'a', role: 'prop', ref: 'chair', transform: identity, children: [] }],
      joints: [],
    });
    expect(doc.root).toHaveLength(1);
    expect(doc.root[0].ref).toBe('chair');
    expect(doc.root[0].transform.position).toEqual([0, 0, 0]);
  });

  it('insertRef() places under the seed id when it has one', () => {
    const doc: SetDocument = { root: [], joints: [] };
    insertRef(doc, { id: 'chair-7', ref: 'chair', name: 'Chair' });
    expect(doc.root[0].id).toBe('chair-7');
  });

  it('insertRef() keeps the name it was given, not only the id derived from it', () => {
    const doc: SetDocument = { root: [], joints: [] };
    insertRef(doc, { ref: 'chair', name: 'Chair by the door' });

    expect(doc.root[0].id).toBe('chair-by-the-door');
    expect(doc.root[0].name).toBe('Chair by the door');
  });

  it('removes a nested instance addressed by its id, though its path carries the group', () => {
    const doc: SetDocument = {
      root: [
        { id: 'row', role: 'structure', transform: { ...identity }, children: [instance('chair-1', 'chair')] },
      ],
      joints: [],
    };

    // A path is unambiguous, an id is not — it resolves to the first match in tree order.
    expect(nodeAt(doc, 'chair-1')).not.toBeNull();
    expect(removeTreeNode(doc, 'chair-1')).toBe(true);
    expect(doc.root[0].children).toHaveLength(0);
    expect(removeTreeNode(doc, 'chair-1')).toBe(false);
  });

  it('normalizeDocument() still drops a prop with neither content nor ref', () => {
    const doc = normalizeDocument({ root: [{ id: 'a', role: 'prop', children: [] }], joints: [] });
    expect(doc.root).toHaveLength(0);
  });

  it('normalizeDocument() keeps the overrides that can be replayed', () => {
    const patch = { ...identity, position: [0, 0.9, 0] as [number, number, number] };
    const doc = normalizeDocument({
      root: [{
        id: 'chair-1',
        role: 'prop',
        ref: 'chair',
        transform: identity,
        children: [],
        overrides: [
          { path: 'legs/right', op: 'remove' },
          { path: 'seat', op: 'set', value: { transform: patch, hidden: true } },
        ],
      }],
      joints: [],
    });

    expect(doc.root[0].overrides).toEqual([
      { path: 'legs/right', op: 'remove' },
      { path: 'seat', op: 'set', value: { transform: patch, hidden: true } },
    ]);
  });

  it('normalizeDocument() fills in the fields a patch transform leaves out', () => {
    const doc = normalizeDocument({
      root: [{
        id: 'chair-1',
        role: 'prop',
        ref: 'chair',
        transform: identity,
        children: [],
        overrides: [{ path: 'seat', op: 'set', value: { transform: { position: [0, 0.9, 0] } } }],
      }],
      joints: [],
    });

    expect(doc.root[0].overrides?.[0]).toEqual({
      path: 'seat',
      op: 'set',
      value: { transform: { position: [0, 0.9, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
    });
  });

  it('normalizeDocument() drops an override nothing can replay, and says which', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = normalizeDocument({
      root: [{
        id: 'chair-1',
        role: 'prop',
        ref: 'chair',
        transform: identity,
        children: [],
        overrides: [
          { path: '', op: 'remove' },
          { op: 'remove' },
          { path: 'seat', op: 'flip' },
          { path: 'seat', op: 'set', value: {} },
          { path: 'seat', op: 'set', value: { hidden: true } },
        ],
      }],
      joints: [],
    });

    expect(doc.root[0].overrides).toEqual([{ path: 'seat', op: 'set', value: { hidden: true } }]);
    const issues = warn.mock.calls.map((c) => String(c[0]));
    expect(issues.some((i) => i.includes('has no path'))).toBe(true);
    expect(issues.some((i) => i.includes('unknown op "flip"'))).toBe(true);
    expect(issues.some((i) => i.includes('sets nothing'))).toBe(true);
    warn.mockRestore();
  });

  it('normalizeDocument() reports overrides on a node that is not an instance', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = normalizeDocument({
      root: [{
        id: 'seat',
        role: 'prop',
        transform: identity,
        children: [],
        content: { id: 'seat', kind: 'primitive', name: 'Box', color: 0xffffff },
        overrides: [{ path: 'seat', op: 'remove' }],
      }],
      joints: [],
    });

    // Kept, but inert: overrides are replayed over a Definition, and this node has none.
    expect(doc.root[0].overrides).toBeUndefined();
    expect(warn.mock.calls.some((c) => String(c[0]).includes('not an instance'))).toBe(true);
    warn.mockRestore();
  });

  it('insertRef() carries the seed overrides', () => {
    const doc: SetDocument = { root: [], joints: [] };
    const node = insertRef(doc, { ref: 'chair', overrides: [{ path: 'seat', op: 'remove' }] });
    expect(node.overrides).toEqual([{ path: 'seat', op: 'remove' }]);
  });
});

describe('a truncated transform', () => {
  const leaf = (transform: unknown) => ({
    id: 'seat',
    role: 'prop',
    transform,
    children: [],
    content: { id: 'seat', kind: 'primitive', name: 'Box', color: 0xffffff },
  });

  it('normalizeDocument() reads an unreadable transform at rest instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A guard that throws on the file it exists to catch is worse than no guard: a transform of `{}`
    // used to raise "source.position is not iterable" and take the whole load with it. An empty
    // transform reads the same as an absent one, so nothing is reported — there was nothing to read.
    const doc = normalizeDocument({ root: [leaf({})], joints: [] });

    expect(doc.root).toHaveLength(1);
    expect(doc.root[0].transform).toEqual({ position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] });
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('normalizeDocument() reports a field it cannot read, and puts it at rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const doc = normalizeDocument({ root: [leaf({ position: [1, 2], scale: [2, 2, 2] })], joints: [] });

    expect(doc.root[0].transform.position).toEqual([0, 0, 0]);
    expect(doc.root[0].transform.scale).toEqual([2, 2, 2]);
    expect(warn.mock.calls.some((c) => String(c[0]).includes('unreadable position'))).toBe(true);
    warn.mockRestore();
  });

  it('normalizeDocument() keeps the fields it can read and defaults the ones that are absent', () => {
    const doc = normalizeDocument({ root: [leaf({ position: [1, 2, 3] })], joints: [] });

    expect(doc.root[0].transform.position).toEqual([1, 2, 3]);
    expect(doc.root[0].transform.scale).toEqual([1, 1, 1]);
  });
});

describe('extractDefinition', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
  const jointOf = (a: string, b: string): JointSnapshot => ({
    type: 'snap',
    partAId: a,
    localPointA: [0, 0.5, 0],
    localNormalA: [0, 1, 0],
    partBId: b,
    localPointB: [0, -0.5, 0],
    localNormalB: [0, -1, 0],
  });
  function chair(): SetDocument {
    const doc: SetDocument = { root: [], joints: [] };
    insertPart(doc, {
      content: { id: 'seat', kind: 'primitive', name: 'Box', color: 0x663311 },
      transform: { ...identity, position: [0, 0.45, 0] },
    });
    insertPart(doc, {
      content: { id: 'back', kind: 'primitive', name: 'Box', color: 0x663311 },
      transform: { ...identity, position: [0, 0.7, -0.2] },
    });
    return doc;
  }

  it('promotes a group: the children move into the Definition, the node keeps its placement', () => {
    const doc = chair();
    const before = collectPartNodes(doc).map((node) => localToWorld(node.transform, identity).position);
    const group = groupNodes(doc, ['seat', 'back'], 'Chair')!;
    const placement = structuredClone(group.transform);

    const definition = extractDefinition(doc, group, 'chair-item')!;

    // The Definition holds what the group held and the instance keeps the group's placement, so
    // every part is still exactly where it was.
    expect(definition.root.map((node) => (isPartNode(node) ? node.content.id : null))).toEqual(['seat', 'back']);
    const after = definition.root.map((node) => localToWorld(node.transform, placement).position);
    after.forEach((position, i) => position.forEach((value, axis) => expect(value).toBeCloseTo(before[i][axis])));
    // The node is an instance now: its id, its placement, nothing of its own inside.
    expect(group.ref).toBe('chair-item');
    expect(group.children).toEqual([]);
    expect(group.transform).toEqual(placement);
    expect(doc.root).toEqual([group]);
    expect(collectPartNodes(doc)).toHaveLength(0);
  });

  it('promotes a part leaf into a one-part Definition at identity', () => {
    const doc = chair();

    const definition = extractDefinition(doc, 'seat', 'seat-item')!;

    expect(definition.root).toHaveLength(1);
    expect(definition.root.map((node) => (isPartNode(node) ? node.content.id : null))).toEqual(['seat']);
    expect(definition.root[0].transform.position).toEqual([0, 0, 0]);
    expect(doc.root[0].ref).toBe('seat-item');
    expect(isPartNode(doc.root[0])).toBe(false);
    expect(isPartNode(doc.root[1]) ? doc.root[1].content.id : null).toBe('back');
  });

  it('carries inside joints and bonds, and drops what crosses the boundary', () => {
    const doc = chair();
    addJoint(doc, jointOf('seat', 'back'));
    addGroupBond(doc, ['seat', 'back']);
    const group = groupNodes(doc, ['seat', 'back'], 'Chair')!;
    addJoint(doc, jointOf('back', 'lamp-post'));

    const definition = extractDefinition(doc, group, 'chair-item')!;

    expect(definition.joints).toHaveLength(1);
    expect(definition.joints[0].partBId).toBe('back');
    expect(definition.groupComponents).toEqual([['seat', 'back']]);
    // The joint to a part that stayed behind cannot be represented: it is dropped here, not kept
    // dangling. The bond that stayed behind keeps what is left of it.
    expect(doc.joints).toHaveLength(0);
    expect(doc.groupComponents).toBeUndefined();
  });
});

describe('group membership', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  /** A group at x = 5 holding one of two members, so a move has somewhere to happen. */
  function scene(): SetDocument {
    const doc: SetDocument = { root: [], joints: [] };
    insertPart(doc, { content: { id: 'a', kind: 'primitive', name: 'Box', color: 0xffffff }, transform: { ...identity, position: [4, 0, 0] } });
    insertPart(doc, { content: { id: 'b', kind: 'primitive', name: 'Box', color: 0xffffff }, transform: { ...identity, position: [6, 0, 0] } });
    groupNodes(doc, ['a'], undefined, true);
    const group = doc.root.find((n) => n.role === 'structure')!;
    group.transform = { ...identity, position: [5, 0, 0] };
    group.children[0].transform = { ...identity, position: [-1, 0, 0] };
    return doc;
  }

  // Parts are named by their content id, nodes by theirs: the fixture says which it means.
  const nameOf = (node: SetNode): string => node.content?.id ?? node.id;
  const nodeNamed = (doc: SetDocument, id: string): SetNode =>
    doc.root.flatMap((n) => [n, ...n.children]).find((n) => nameOf(n) === id)!;

  it('adoptIntoGroup() moves a node in without moving it in the world', () => {
    const doc = scene();

    expect(adoptIntoGroup(doc, 'group', ['b'])).toBe(true);

    const group = doc.root.find((n) => n.id === 'group')!;
    expect(group.children.map(nameOf)).toEqual(['a', 'b']);
    expect(doc.root.map(nameOf)).toEqual(['group']);
    // b stood at x = 6; relative to a group at 5 that is 1.
    expect(nodeNamed(doc, 'b').transform.position).toEqual([1, 0, 0]);
  });

  it('adoptIntoGroup() leaves a member that is already there, and refuses an ancestor', () => {
    const doc = scene();

    expect(adoptIntoGroup(doc, 'group', ['a'])).toBe(false);
    expect(adoptIntoGroup(doc, 'group', ['group'])).toBe(false);
    expect(doc.root.map(nameOf)).toEqual(['group', 'b']);
  });

  it('releaseFromGroup() lifts a node out, leaving the group and the world where they were', () => {
    const doc = scene();

    expect(releaseFromGroup(doc, ['a'])).toBe(true);

    const group = doc.root.find((n) => n.id === 'group')!;
    expect(group.children).toEqual([]);
    expect(doc.root.map(nameOf)).toEqual(['a', 'group', 'b']);
    // a was at x = 4 inside a group at 5; it is still at x = 4.
    expect(nodeNamed(doc, 'a').transform.position).toEqual([4, 0, 0]);
  });

  it('childOfGroupHolding() answers with the group’s own direct child', () => {
    const doc: SetDocument = { root: [], joints: [] };
    for (const id of ['a', 'deep', 'b']) {
      insertPart(doc, { content: { id, kind: 'primitive', name: 'Box', color: 0xffffff } });
    }
    groupNodes(doc, ['a', 'deep'], 'inner', true);
    groupNodes(doc, ['inner', 'b'], 'group', true);

    // `deep` is two levels down: what can leave the outer group is `inner`, which holds it.
    expect(childOfGroupHolding(doc, 'group', 'deep')?.id).toBe('inner');
    expect(nameOf(childOfGroupHolding(doc, 'group', 'b')!)).toBe('b');
  });
});

describe('applyOverrides', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  function tree(): SetNode[] {
    return [
      { id: 'seat', role: 'prop', transform: { ...identity }, children: [], content: { id: 'seat', kind: 'primitive', name: 'Box', color: 0xffffff } },
      {
        id: 'legs',
        role: 'structure',
        isGroup: true,
        transform: { ...identity },
        children: [
          { id: 'left', role: 'prop', transform: { ...identity }, children: [], content: { id: 'left', kind: 'primitive', name: 'Box', color: 0xffffff } },
        ],
      },
    ];
  }

  it('leaves the Definition alone and returns the patched copy', () => {
    const root = tree();

    const patched = applyOverrides(root, [{ path: 'seat', op: 'remove' }]);

    expect(patched.map((n) => n.id)).toEqual(['legs']);
    expect(root.map((n) => n.id)).toEqual(['seat', 'legs']);
  });

  it('replays in list order, so the last write to a node wins', () => {
    const patched = applyOverrides(tree(), [
      { path: 'legs/left', op: 'set', value: { hidden: true } },
      { path: 'legs/left', op: 'set', value: { hidden: false, transform: { ...identity, position: [1, 0, 0] } } },
    ]);

    const left = patched[1].children[0];
    expect(left.hidden).toBe(false);
    expect(left.transform.position).toEqual([1, 0, 0]);
  });

  it('removes a node the earlier entries patched, without resurrecting it', () => {
    const patched = applyOverrides(tree(), [
      { path: 'legs/left', op: 'set', value: { hidden: true } },
      { path: 'legs/left', op: 'remove' },
    ]);

    expect(patched[1].children).toEqual([]);
  });

  it('reports an override that matched nothing and keeps going', () => {
    const orphans: OrphanedOverride[] = [];

    const patched = applyOverrides(
      tree(),
      [
        { path: 'legs/gone', op: 'remove' },
        { path: 'nothing/here', op: 'set', value: { hidden: true } },
        { path: 'seat', op: 'remove' },
      ],
      (orphan) => orphans.push({ ...orphan }),
    );

    expect(orphans).toEqual([
      { path: 'legs/gone', op: 'remove' },
      { path: 'nothing/here', op: 'set' },
    ]);
    expect(patched.map((n) => n.id)).toEqual(['legs']);
  });
});

