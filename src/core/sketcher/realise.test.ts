import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { realise, realiseDocument } from './realise.js';
import { draftToDocument } from './documentTree.js';
import type { SketcherDraft } from './types.js';

describe('realise', () => {
  it('builds one mesh per part, tagged with sketcherPartId and the part transform', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [
        { id: 'a', kind: 'primitive', name: 'Box', position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [2, 2, 2], color: 0xff0000 },
        { id: 'b', kind: 'primitive', name: 'Sphere', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0x00ff00 },
      ],
      joints: [],
    };

    const group = realise(draft);
    expect(group.children).toHaveLength(2);

    const [m0, m1] = group.children as THREE.Mesh[];
    expect(m0.userData.sketcherPartId).toBe('a');
    expect(m1.userData.sketcherPartId).toBe('b');
    expect(m0.position.toArray()).toEqual([1, 2, 3]);
    expect(m0.scale.toArray()).toEqual([2, 2, 2]);
  });

  it('skips parts it cannot build (unknown preset, sketch without depth)', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [
        { id: 'bad', kind: 'primitive', name: 'Pyramid', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff },
        { id: 'no-depth', kind: 'sketch', name: 'Shape', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff, shapePoints: [[0, 0], [1, 0], [1, 1]] },
      ],
      joints: [],
    };

    expect(realise(draft).children).toHaveLength(0);
  });
});

describe('realiseDocument', () => {
  it('builds a nested scene — group nodes become THREE.Groups, parts stay local', () => {
    const draft: SketcherDraft = {
      version: 2,
      parts: [
        { id: 'top', kind: 'primitive', name: 'Box', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff },
        { id: 'leg-a', kind: 'primitive', name: 'Box', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff },
        { id: 'leg-b', kind: 'primitive', name: 'Box', position: [1, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff },
      ],
      joints: [],
      groups: [{ partIds: ['leg-a', 'leg-b'], name: 'table', position: [5, 2, -3], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] }],
    };

    const root = realiseDocument(draftToDocument(draft));
    expect(root.children).toHaveLength(2); // one ungrouped part + one group

    const groupNode = root.children.find((c) => (c as THREE.Group).isGroup) as THREE.Group;
    expect(groupNode).toBeDefined();
    expect(groupNode.position.toArray()).toEqual([5, 2, -3]);
    expect(groupNode.children).toHaveLength(2);

    // A member's world position composes the group transform with its local transform.
    const member = groupNode.children.find((c) => (c as THREE.Mesh).userData.sketcherPartId === 'leg-b') as THREE.Mesh;
    const world = new THREE.Vector3();
    member.getWorldPosition(world);
    expect(world.x).toBeCloseTo(6); // 5 + 1
    expect(world.y).toBeCloseTo(2);
    expect(world.z).toBeCloseTo(-3);
  });
});
