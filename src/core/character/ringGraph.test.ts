import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildRingGraph, ringWorldPoints, buildRingLoft, loftStrip, splitRingArcs, seamEdgePoints, orderLegRingForHemi } from './ringGraph.js';

function params(name: string) {
  if (name === 'A') return { tubeRadiusX: 4, tubeRadiusZ: 3, tubeOffsetForward: 1, group: 'arm' };
  if (name === 'B') return { tubeRadiusX: 2, tubeRadiusZ: 1.5, tubeOffsetForward: 0.5, group: 'forearm' };
  return null;
}

describe('buildRingGraph', () => {
  it('ramps each bone from its own radius to the child radius in the local frame', () => {
    const a = new THREE.Bone();
    const b = new THREE.Bone();
    a.name = 'A';
    b.name = 'B';
    b.position.set(0, 10, 0);
    a.add(b);

    const graph = buildRingGraph([a, b], new Map([['A', 0], ['B', 1]]), params, 5);

    // A (with child B) contributes 5 rings; terminal B contributes 1.
    expect(graph.rings.length).toBe(6);

    const a0 = graph.rings[0];
    expect(a0.rx).toBeCloseTo(4);
    expect(a0.rz).toBeCloseTo(3);
    expect(a0.y).toBeCloseTo(0);
    expect(a0.fwd).toBeCloseTo(1);

    // hold-then-taper: rings up to t=0.6 hold the start radius.
    expect(graph.rings[1].rx).toBeCloseTo(4);
    expect(graph.rings[2].rx).toBeCloseTo(4);
    expect(graph.rings[3].rx).toBeCloseTo(4);

    // last ring (t=0.8) has begun tapering toward the child radius.
    const aLast = graph.rings[4];
    expect(aLast.rx).toBeLessThan(4);
    expect(aLast.rx).toBeGreaterThan(2);
    expect(aLast.y).toBeCloseTo(8);

    const b0 = graph.rings[5];
    expect(b0.rx).toBeCloseTo(2);
    expect(b0.rz).toBeCloseTo(1.5);
    expect(b0.y).toBeCloseTo(0);
    expect(b0.fwd).toBeCloseTo(0.5);
  });
});

describe('ringWorldPoints', () => {
  it('orients the ring orthogonally to the bone through its matrixWorld', () => {
    // Rotate the bone 90° about Z so its +Y axis points -X; the ring's local
    // X/Z plane must then lie in world Y/Z (vertical), not stay horizontal.
    const bone = new THREE.Bone();
    bone.rotation.z = Math.PI / 2;
    bone.updateMatrixWorld(true);

    const ring = { boneIndex: 0, boneName: 'A', group: 'arm', y: 0, fwd: 0, rx: 2, rz: 1, t: 0 };
    const pts = ringWorldPoints(ring, bone, 4);

    // angle 0: local (2, 0, 0) → world (0, 2, 0)
    expect(pts[0].x).toBeCloseTo(0);
    expect(pts[0].y).toBeCloseTo(2);
    expect(pts[0].z).toBeCloseTo(0);
    // angle 90°: local (0, 0, 1) → world (0, 0, 1) (Z axis unchanged by Z rotation)
    expect(pts[1].x).toBeCloseTo(0);
    expect(pts[1].y).toBeCloseTo(0);
    expect(pts[1].z).toBeCloseTo(1);
  });
});

describe('loftStrip', () => {
  it('matches the ring-to-ring winding for equal-length sequences', () => {
    const idx: number[] = [];
    loftStrip([0, 1], [2, 3], idx);
    expect(idx).toEqual([0, 2, 1, 1, 2, 3]);
  });

  it('emits a non-degenerate strip for unequal lengths', () => {
    const idx: number[] = [];
    loftStrip([0, 1, 2], [3, 4, 5, 6, 7], idx);
    // (m - 1) + (n - 1) triangles = 2 + 4 = 6 → 18 indices.
    expect(idx.length).toBe(18);
    for (let k = 0; k < idx.length; k += 3) {
      const x = idx[k];
      const y = idx[k + 1];
      const z = idx[k + 2];
      expect(x).not.toBe(y);
      expect(y).not.toBe(z);
      expect(z).not.toBe(x);
    }
  });
});

describe('splitRingArcs', () => {
  it('partitions an 8-vertex circle into two arcs sharing two seam verts', () => {
    const verts: THREE.Vector3[] = [];
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      verts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    const split = splitRingArcs(verts, new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0));

    expect(split.seams.slice().sort((a, b) => a - b)).toEqual([2, 6]);
    // +X half {0,1,7} plus seams {2,6}; -X half {3,4,5} plus seams.
    expect(split.pos.slice().sort((a, b) => a - b)).toEqual([0, 1, 2, 6, 7]);
    expect(split.neg.slice().sort((a, b) => a - b)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe('seamEdgePoints', () => {
  it('subdivides the chord into interior + 2 points', () => {
    const pts = seamEdgePoints(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10), 3);
    expect(pts).toHaveLength(5);
    expect(pts[0].z).toBeCloseTo(0);
    expect(pts[2].z).toBeCloseTo(5);
    expect(pts[4].z).toBeCloseTo(10);
  });
});

describe('orderLegRingForHemi', () => {
  it('maps the hemi curve to the leg ring with attach points at the seams', () => {
    // Leg circle centered at origin (radius 1); pelvis to the -X side → outward +X.
    const legVerts: THREE.Vector3[] = [];
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2;
      legVerts.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
    }
    // Hemi curve: +X half of a radius-2 circle (seamA front +Z → seamB back -Z).
    const hemiCurve: THREE.Vector3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI / 2 - (k / 8) * Math.PI;
      hemiCurve.push(new THREE.Vector3(2 * Math.cos(a), 0, 2 * Math.sin(a)));
    }

    const order = orderLegRingForHemi(
      hemiCurve,
      legVerts,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(-1, 0, 0),
    );

    expect(order).toHaveLength(16);
    expect(new Set(order).size).toBe(16);
    expect(order[0]).toBe(4); // leg vert nearest the front seam (+Z)
    expect(order[8]).toBe(12); // leg vert nearest the back seam (-Z)
  });
});

describe('buildRingLoft', () => {
  it('lofts a chain watertightly with per-ring skin weights', () => {
    const a = new THREE.Bone();
    const b = new THREE.Bone();
    a.name = 'A';
    b.name = 'B';
    b.position.set(0, 10, 0);
    a.add(b);
    a.updateMatrixWorld(true);

    const bones = [a, b];
    const boneIndex = new Map([['A', 0], ['B', 1]]);
    const loft = buildRingLoft(bones, boneIndex, params, 4, 5);

    // A contributes 5 rings, terminal B contributes 1 → 6 rings × 4 segments.
    expect(loft.positions.length).toBe(6 * 4 * 3);
    // A lofts 5 strips (A0..A4 → B0); 4 segments → 5 × 4 × 2 × 3.
    expect(loft.indices.length).toBe(5 * 4 * 2 * 3);
    expect(loft.skinIndex.length).toBe(6 * 4 * 4);
    expect(loft.skinWeight.length).toBe(6 * 4 * 4);

    // A0 (t=0): full A.
    expect(loft.skinWeight[0]).toBeCloseTo(1);
    expect(loft.skinWeight[1]).toBeCloseTo(0);
    expect(loft.skinIndex[0]).toBe(0);
    expect(loft.skinIndex[1]).toBe(1);

    // B0 (terminal): full B, no child bone index.
    const b0 = 5 * 4 * 4;
    expect(loft.skinIndex[b0]).toBe(1);
    expect(loft.skinWeight[b0]).toBeCloseTo(1);
    expect(loft.skinWeight[b0 + 1]).toBeCloseTo(0);
  });
});

describe('buildRingLoft parent blend', () => {
  it('blends the upper-leg top rings toward the hips and the bottom toward the leg', () => {
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    const upLeg = new THREE.Bone();
    upLeg.name = 'mixamorigLeftUpLeg';
    const leg = new THREE.Bone();
    leg.name = 'mixamorigLeftLeg';
    upLeg.position.set(8, -6, -1);
    leg.position.set(0, -40, 0);
    hips.add(upLeg);
    upLeg.add(leg);
    hips.updateMatrixWorld(true);

    const bones = [hips, upLeg, leg];
    const boneIndex = new Map([['mixamorigHips', 0], ['mixamorigLeftUpLeg', 1], ['mixamorigLeftLeg', 2]]);
    const params = (name: string) => {
      if (name === 'mixamorigHips') return { tubeRadiusX: 15, tubeRadiusZ: 10, tubeOffsetForward: 1, group: 'hips' };
      if (name === 'mixamorigLeftUpLeg') return { tubeRadiusX: 7, tubeRadiusZ: 5.5, group: 'upleg' };
      if (name === 'mixamorigLeftLeg') return { tubeRadiusX: 5, tubeRadiusZ: 4, group: 'leg' };
      return null;
    };

    const segments = 4;
    const loft = buildRingLoft(bones, boneIndex, params, segments, 5);

    // hips contributes 4 girdle rings + 5 up-ramp rings = 9 rings.
    const upLegTop = 9 * segments; // t=0.25, max parent weight 0.5 at the back
    // front vert (j=1, a=π/2): quads follow the leg → 0 hips weight.
    expect(loft.skinIndex[(upLegTop + 1) * 4]).toBe(0);
    expect(loft.skinWeight[(upLegTop + 1) * 4]).toBeCloseTo(0);
    expect(loft.skinWeight[(upLegTop + 1) * 4 + 1]).toBeCloseTo(1);
    // back vert (j=3, a=3π/2): hamstring blends 50/50 with the hips.
    expect(loft.skinIndex[(upLegTop + 3) * 4]).toBe(0);
    expect(loft.skinWeight[(upLegTop + 3) * 4]).toBeCloseTo(0.5);
    expect(loft.skinWeight[(upLegTop + 3) * 4 + 1]).toBeCloseTo(0.5);

    // last upper-leg ring (t=0.8) blends toward the leg (child).
    const upLegLast = (9 + 5) * segments;
    expect(loft.skinIndex[upLegLast * 4]).toBe(1);
    expect(loft.skinIndex[upLegLast * 4 + 1]).toBe(2);
    expect(loft.skinWeight[upLegLast * 4] + loft.skinWeight[upLegLast * 4 + 1]).toBeCloseTo(1);
    expect(loft.skinWeight[upLegLast * 4]).toBeGreaterThan(0.5); // mostly upleg
  });
});

describe('buildRingLoft leg fan', () => {
  it('welds the girdle bottom into the two legs with a shared crotch chord', () => {
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    const lu = new THREE.Bone();
    lu.name = 'mixamorigLeftUpLeg';
    const ru = new THREE.Bone();
    ru.name = 'mixamorigRightUpLeg';
    const ll = new THREE.Bone();
    ll.name = 'mixamorigLeftLeg';
    const rl = new THREE.Bone();
    rl.name = 'mixamorigRightLeg';
    lu.position.set(-8, -6, -1);
    ru.position.set(8, -6, -1);
    ll.position.set(0, -40, 0);
    rl.position.set(0, -40, 0);
    hips.add(lu, ru);
    lu.add(ll);
    ru.add(rl);
    hips.updateMatrixWorld(true);

    const bones = [hips, lu, ru, ll, rl];
    const boneIndex = new Map([
      ['mixamorigHips', 0], ['mixamorigLeftUpLeg', 1], ['mixamorigRightUpLeg', 2],
      ['mixamorigLeftLeg', 3], ['mixamorigRightLeg', 4],
    ]);
    const params = (name: string) => {
      if (name === 'mixamorigHips') return { tubeRadiusX: 15, tubeRadiusZ: 10, tubeOffsetForward: 1, group: 'hips' };
      if (name === 'mixamorigLeftUpLeg' || name === 'mixamorigRightUpLeg') return { tubeRadiusX: 7, tubeRadiusZ: 5.5, group: 'upleg' };
      if (name === 'mixamorigLeftLeg' || name === 'mixamorigRightLeg') return { tubeRadiusX: 5, tubeRadiusZ: 4, group: 'leg' };
      return null;
    };

    const segments = 8;
    const loft = buildRingLoft(bones, boneIndex, params, segments, 5);

    // 23 rings × 8 segments + (8/2 - 1) = 3 shared chord verts = 187 verts.
    expect(loft.positions.length / 3).toBe(187);

    // Chord verts (184..186) get hips + both uplegs.
    expect(loft.skinIndex[184 * 4]).toBe(0);
    expect(loft.skinIndex[184 * 4 + 1]).toBe(1);
    expect(loft.skinIndex[184 * 4 + 2]).toBe(2);
    expect(loft.skinWeight[184 * 4]).toBeCloseTo(0.5);
    expect(loft.skinWeight[184 * 4 + 1]).toBeCloseTo(0.25);
    expect(loft.skinWeight[184 * 4 + 2]).toBeCloseTo(0.25);

    // All indices in range.
    for (const idx of loft.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(187);
    }
  });
});
