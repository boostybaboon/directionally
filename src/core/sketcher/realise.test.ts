import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { realiseDocument } from './realise.js';
import { insertPart, groupParts } from './documentTree.js';
import type { SetDocument } from './documentTree.js';
import type { PartDraft } from './types.js';

function part(id: string, overrides: Partial<PartDraft> = {}): PartDraft {
  return {
    id, kind: 'primitive', name: 'Box', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff,
    ...overrides,
  };
}

describe('realiseDocument', () => {
  it('skips parts it cannot build (unknown preset, sketch without depth)', () => {
    const doc: SetDocument = { version: 2, root: [], joints: [] };
    insertPart(doc, part('bad', { name: 'Pyramid' }));
    insertPart(doc, part('no-depth', { kind: 'sketch', name: 'Shape', shapePoints: [[0, 0], [1, 0], [1, 1]] }));

    expect(realiseDocument(doc).children).toHaveLength(0);
  });

  it('tags each mesh with its part id and local transform', () => {
    const doc: SetDocument = { version: 2, root: [], joints: [] };
    insertPart(doc, part('a', { position: [1, 2, 3], scale: [2, 2, 2] }));

    const [mesh] = realiseDocument(doc).children as THREE.Mesh[];
    expect(mesh.userData.sketcherPartId).toBe('a');
    expect(mesh.position.toArray()).toEqual([1, 2, 3]);
    expect(mesh.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('builds a nested scene — group nodes become THREE.Groups, parts stay local', () => {
    const doc: SetDocument = { version: 2, root: [], joints: [] };
    insertPart(doc, part('top'));
    insertPart(doc, part('leg-a', { position: [5, 2, -3] }));
    insertPart(doc, part('leg-b', { position: [6, 2, -3] }));
    groupParts(doc, ['leg-a', 'leg-b'], 'table', true);
    const groupNode = doc.root.find((n) => n.kind === 'group');
    if (groupNode?.kind !== 'group') throw new Error('expected a group node');

    const root = realiseDocument(doc);
    expect(root.children).toHaveLength(2); // one ungrouped part + one group

    const realisedGroup = root.children.find((c) => (c as THREE.Group).isGroup) as THREE.Group;
    expect(realisedGroup).toBeDefined();
    expect(realisedGroup.position.toArray()).toEqual(groupNode.position);
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