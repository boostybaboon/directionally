import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EYELID_NAMES, findEyelids, buildBlinkClip } from './blink.js';

function buildHead(): THREE.Object3D {
  const root = new THREE.Object3D();
  root.name = 'actor';
  const head = new THREE.Object3D();
  head.name = 'mixamorigHead';
  root.add(head);
  for (const name of EYELID_NAMES) {
    const lid = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 4), new THREE.MeshBasicMaterial());
    lid.name = name;
    lid.rotation.x = name.startsWith('eyeLidUpper') ? (0.35 - 0.5) * Math.PI : (0.30 - 0.5) * Math.PI;
    head.add(lid);
  }
  // A named non-mesh object must not be picked up as a lid.
  const pivot = new THREE.Object3D();
  pivot.name = 'eyePivotL';
  head.add(pivot);
  return root;
}

describe('findEyelids', () => {
  it('returns the four named eyelid meshes', () => {
    const lids = findEyelids(buildHead());
    expect(lids.map((l) => l.name)).toEqual([...EYELID_NAMES]);
  });

  it('returns an empty array when no lids are named', () => {
    const root = new THREE.Object3D();
    root.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
    expect(findEyelids(root)).toEqual([]);
  });
});

describe('buildBlinkClip', () => {
  it('builds a 4s clip with one track per lid', () => {
    const lids = findEyelids(buildHead());
    const clip = buildBlinkClip('actor', lids);
    expect(clip.duration).toBe(4);
    expect(clip.tracks).toHaveLength(4);
    expect(clip.tracks.map((t) => t.name)).toEqual([
      'eyeLidUpperL.rotation[x]',
      'eyeLidUpperR.rotation[x]',
      'eyeLidLowerL.rotation[x]',
      'eyeLidLowerR.rotation[x]',
    ]);
  });

  it('animates rotation.x open → closed → open → open', () => {
    const lids = findEyelids(buildHead());
    const clip = buildBlinkClip('actor', lids);
    const upper = clip.tracks.find((t) => t.name === 'eyeLidUpperL.rotation[x]') as THREE.NumberKeyframeTrack;
    const open = (0.35 - 0.5) * Math.PI;

    expect(Array.from(upper.times).map((t) => Number(t.toFixed(5)))).toEqual([0, 0.15, 0.3, 4]);
    expect(Array.from(upper.values)[0]).toBeCloseTo(open);
    expect(Array.from(upper.values)[1]).toBeCloseTo(0);
    expect(Array.from(upper.values)[2]).toBeCloseTo(open);
    expect(Array.from(upper.values)[3]).toBeCloseTo(open);
  });
});
