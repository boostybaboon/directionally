import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { realiseDocument } from './realise.js';
import type { RefResolver } from './realise.js';
import { collectPartNodes, documentFromParts, insertPart, groupNodes } from './documentTree.js';
import type { NodeOverride, PartNode, PartSeed, SetDocument } from './documentTree.js';
import type { PartDraft } from './types.js';
import type { Transform } from './transform.js';

function part(id: string, content: Partial<PartDraft> = {}, transform: Partial<Transform> = {}): PartSeed {
  return {
    content: { id, kind: 'primitive', name: 'Box', color: 0xffffff, ...content },
    transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], ...transform },
  };
}

describe('realiseDocument', () => {
  it('skips parts it cannot build (unknown preset, sketch without depth)', () => {
    const doc: SetDocument = { root: [], joints: [] };
    insertPart(doc, part('bad', { name: 'Pyramid' }));
    insertPart(doc, part('no-depth', { kind: 'sketch', name: 'Shape', shapePoints: [[0, 0], [1, 0], [1, 1]] }));

    expect(realiseDocument(doc).children).toHaveLength(0);
  });

  it('tags each mesh with its part id and local transform', () => {
    const doc: SetDocument = { root: [], joints: [] };
    insertPart(doc, part('a', {}, { position: [1, 2, 3], scale: [2, 2, 2] }));

    const [mesh] = realiseDocument(doc).children as THREE.Mesh[];
    expect(mesh.userData.sketcherPartId).toBe('a');
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('builds a nested scene — group nodes become THREE.Groups, parts stay local', () => {
    const doc: SetDocument = { root: [], joints: [] };
    insertPart(doc, part('top'));
    insertPart(doc, part('leg-a', {}, { position: [5, 2, -3] }));
    insertPart(doc, part('leg-b', {}, { position: [6, 2, -3] }));
    groupNodes(doc, ['leg-a', 'leg-b'], 'table', true);
    const groupNode = doc.root.find((n) => n.role === 'structure');
    if (!groupNode) throw new Error('expected a group node');

    const root = realiseDocument(doc);
    expect(root.children).toHaveLength(2); // one ungrouped part + one group

    const realisedGroup = root.children.find((c) => (c as THREE.Group).isGroup) as THREE.Group;
    expect(realisedGroup).toBeDefined();
    expect(realisedGroup.position.toArray()).toEqual(groupNode.transform.position);
    expect(realisedGroup.children).toHaveLength(2);

    // A member's world position composes the group transform with its local transform:
    // leg-b sat at x = 6 before grouping and still does.
    const member = realisedGroup.children.find((c) => (c as THREE.Mesh).userData.sketcherPartId === 'leg-b') as THREE.Mesh;
    const world = new THREE.Vector3();
    member.getWorldPosition(world);
    expect(world.x).toBeCloseTo(6);
    expect(world.y).toBeCloseTo(2);
    expect(world.z).toBeCloseTo(-3);
  });
});

describe('instances', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };
  const chair = documentFromParts([
    part('seat', {}, { position: [0, 0.45, 0] }),
    part('back', {}, { position: [0, 0.7, -0.2] }),
  ]);

  /** A document whose root is one instance of `ref`, at `position`. */
  function host(ref: string, position: [number, number, number] = [0, 0, 0]): SetDocument {
    return {
      root: [{ id: `${ref}-1`, role: 'prop', ref, transform: { ...identity, position }, children: [] }],
      joints: [],
    };
  }

  it('expands a referenced Definition under the instance transform', () => {
    const resolve: RefResolver = (ref) => (ref === 'chair' ? chair : null);

    const root = realiseDocument(host('chair', [3, 0, 0]), resolve);
    const instance = root.children[0] as THREE.Group;
    expect(instance.name).toBe('chair');
    expect(instance.position.toArray()).toEqual([3, 0, 0]);
    // The Definition's own nodes are the instance's children, at their own transforms.
    expect(instance.children).toHaveLength(2);
    expect((instance.children[0] as THREE.Mesh).userData.sketcherPartId).toBe('seat');
  });

  it('contributes nothing without a resolver or a known Definition', () => {
    expect(realiseDocument(host('chair')).children).toHaveLength(0);
    expect(realiseDocument(host('chair'), () => null).children).toHaveLength(0);
  });

  it('expands a Definition that contains an instance of another', () => {
    const table: SetDocument = {
      root: [{ id: 'chair-1', role: 'prop', ref: 'chair', transform: { ...identity }, children: [] }],
      joints: [],
    };
    const resolve: RefResolver = (ref) => (ref === 'chair' ? chair : ref === 'table' ? table : null);

    const instance = realiseDocument(host('table'), resolve).children[0] as THREE.Group;
    expect(instance.name).toBe('table');
    const nested = instance.children[0] as THREE.Group;
    expect(nested.name).toBe('chair');
    expect(nested.children).toHaveLength(2);
  });

  it('stops expanding a Definition that refers to itself', () => {
    const loop: SetDocument = {
      root: [{ id: 'self', role: 'prop', ref: 'loop', transform: { ...identity }, children: [] }],
      joints: [],
    };
    const resolve: RefResolver = (ref) => (ref === 'loop' ? loop : null);

    expect(() => realiseDocument(host('loop'), resolve)).not.toThrow();
  });
});
describe('instance overrides', () => {
  const identity: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

  /** A part leaf whose node id is its own, so an override's path reads as the tree does. */
  const leaf = (id: string, position: [number, number, number]): PartNode => ({
    id,
    role: 'prop',
    transform: { ...identity, position },
    children: [],
    content: { id, kind: 'primitive', name: 'Box', color: 0xffffff },
  });

  function chair(): SetDocument {
    return {
      root: [
        leaf('seat', [0, 0.45, 0]),
        {
          id: 'legs',
          role: 'structure',
          isGroup: true,
          transform: { ...identity },
          children: [leaf('legleft', [-0.3, 0, 0]), leaf('legright', [0.3, 0, 0])],
        },
      ],
      joints: [],
    };
  }

  const resolve: RefResolver = (ref) => (ref === 'chair' ? chair() : null);

  function host(overrides: NodeOverride[], ref = 'chair'): SetDocument {
    return {
      root: [{ id: 'chair-1', role: 'prop', ref, transform: { ...identity }, children: [], overrides }],
      joints: [],
    };
  }

  function instance(overrides: NodeOverride[]): THREE.Group {
    return realiseDocument(host(overrides), resolve).children[0] as THREE.Group;
  }

  const partIds = (group: THREE.Group): (string | undefined)[] =>
    group.children.map((c) => (c as THREE.Mesh).userData.sketcherPartId);

  it('removes a node inside the Definition', () => {
    const [, legs] = instance([{ path: 'legs/legright', op: 'remove' }]).children;

    expect(partIds(legs as THREE.Group)).toEqual(['legleft']);
  });

  it('sets a node transform, leaving the Definition at its own placement', () => {
    const [seat] = instance([
      { path: 'seat', op: 'set', value: { transform: { ...identity, position: [0, 0.9, 0] } } },
    ]).children as THREE.Mesh[];

    expect(seat.position.toArray()).toEqual([0, 0.9, 0]);
  });

  it('hides a node with its subtree', () => {
    const root = instance([{ path: 'legs', op: 'set', value: { hidden: true } }]);

    expect(root.children).toHaveLength(1);
    expect(partIds(root)).toEqual(['seat']);
  });

  it('un-hides a node the Definition hides, since hidden is a flag a patch can set either way', () => {
    const hidden: SetDocument = {
      root: [{
        id: 'seat',
        role: 'prop',
        hidden: true,
        transform: { ...identity },
        children: [],
        content: { id: 'seat', kind: 'primitive', name: 'Box', color: 0xffffff },
      }],
      joints: [],
    };
    const resolveHidden: RefResolver = (ref) => (ref === 'hidden-def' ? hidden : null);

    const plain = realiseDocument(host([], 'hidden-def'), resolveHidden).children[0] as THREE.Group;
    const shown = realiseDocument(
      host([{ path: 'seat', op: 'set', value: { hidden: false } }], 'hidden-def'),
      resolveHidden,
    ).children[0] as THREE.Group;

    expect(plain.children).toHaveLength(0);
    expect(shown.children).toHaveLength(1);
  });

  it('reports an override that matches nothing, and replays the rest', () => {
    const reported: string[] = [];
    const root = realiseDocument(
      host([{ path: 'legs/gone', op: 'remove' }, { path: 'legs/legleft', op: 'remove' }]),
      resolve,
      (ref, orphan) => reported.push(`${ref}:${orphan.path}:${orphan.op}`),
    ).children[0] as THREE.Group;

    expect(reported).toEqual(['chair:legs/gone:remove']);
    expect(partIds(root.children[1] as THREE.Group)).toEqual(['legright']);
  });

  it('never writes an override into the Definition it replays over', () => {
    const definition = chair();
    realiseDocument(host([{ path: 'seat', op: 'remove' }]), () => definition);

    // Two instances of one Definition vary independently because the replay works on a copy.
    expect(collectPartNodes(definition)).toHaveLength(3);
    expect(definition.root).toHaveLength(2);
  });
});
