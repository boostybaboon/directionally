import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { buildRingGraph, ringWorldPoints, buildRingLoft, loftStrip, splitRingArcs, seamEdgePoints, orderLegRingForHemi, splitKnuckleRing, assembleKnucklePlates } from './ringGraph.js';

function params(name: string) {
  if (name === 'A') return { tubeRadiusX: 4, tubeRadiusZ: 3, tubeOffsetForward: 1, group: 'arm' };
  if (name === 'B') return { tubeRadiusX: 2, tubeRadiusZ: 1.5, tubeOffsetForward: 0.5, group: 'forearm' };
  return null;
}

function handParams(name: string) {
  if (name === 'mixamorigLeftHand') return { tubeRadiusX: 0, tubeRadiusZ: 0, group: 'hand' };
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

describe('palm envelope', () => {
  it('reaches full width by the pinky knuckle so the pinky tube is enclosed', () => {
    const hand = new THREE.Bone();
    hand.name = 'mixamorigLeftHand';

    const mk = (name: string, x: number, y: number, z: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      hand.add(b);
    };
    // Mirrors xbot-walk.glb: middle furthest along +Y, pinky nearest and most lateral.
    mk('mixamorigLeftHandIndex1', -2.26, 9.11, 0.52);
    mk('mixamorigLeftHandMiddle1', 0, 9.53, 0);
    mk('mixamorigLeftHandRing1', 1.87, 9.10, 0.04);
    mk('mixamorigLeftHandPinky1', 3.81, 8.08, 0.49);

    const graph = buildRingGraph([hand], new Map([['mixamorigLeftHand', 0]]), handParams, 5);

    // wrist, mid ×2, pinky knuckle.
    expect(graph.rings.length).toBe(4);

    // Pinky tube outer edge = 3.81 (root) + 1 (tube radius) = 4.81, plus 1 cm
    // margin = 5.81. The palm's pinky edge (xOff + rx) must reach that at the
    // pinky's knuckle Y so it wraps the tube with a visible margin.
    const pinkyRing = graph.rings.find((r) => Math.abs(r.y - 8.08) < 0.001);
    expect(pinkyRing).toBeDefined();
    expect((pinkyRing!.xOff ?? 0) + pinkyRing!.rx).toBeCloseTo(5.81);

    // The end ring is the pinky knuckle at full width; the fan covers the span
    // out to the index/middle/ring knuckles.
    const last = graph.rings[graph.rings.length - 1];
    expect(last.y).toBeCloseTo(8.08);
    expect((last.xOff ?? 0) + last.rx).toBeCloseTo(5.81);
    expect(last.rz).toBeCloseTo(2);
  });
});

describe('splitKnuckleRing', () => {
  it('places three web chords at the X midpoints between adjacent fingers', () => {
    const verts: THREE.Vector3[] = [];
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2;
      verts.push(new THREE.Vector3(5 * Math.cos(a), 0, 5 * Math.sin(a)));
    }
    const fingers = [-2.26, 0, 1.87, 3.81].map((x) => new THREE.Vector3(x, 0, 0));
    const split = splitKnuckleRing(verts, fingers);

    expect(split.webs.length).toBe(3);

    const webXs = [-1.13, 0.935, 2.84];
    split.webs.forEach((web, i) => {
      const front = verts[web.front];
      const back = verts[web.back];
      const xf = front.clone().sub(split.center).dot(split.xAxis);
      const xb = back.clone().sub(split.center).dot(split.xAxis);
      // Seams snap to the nearest ring vertex, so allow one vertex spacing.
      expect(Math.abs(xf - webXs[i])).toBeLessThan(2.5);
      expect(Math.abs(xb - webXs[i])).toBeLessThan(2.5);
      // front and back sit on opposite sides of the X axis
      const zf = front.clone().sub(split.center).dot(split.zAxis);
      const zb = back.clone().sub(split.center).dot(split.zAxis);
      expect(Math.sign(zf)).not.toBe(Math.sign(zb));
    });
  });
});

describe('assembleKnucklePlates', () => {
  it('carves the knuckle ring into four finger plates by the web chords', () => {
    const verts: THREE.Vector3[] = [];
    for (let j = 0; j < 16; j++) {
      const a = (j / 16) * Math.PI * 2;
      verts.push(new THREE.Vector3(5 * Math.cos(a), 0, 5 * Math.sin(a)));
    }
    const fingers = [-2.26, 0, 1.87, 3.81].map((x) => new THREE.Vector3(x, 0, 0));
    const plates = assembleKnucklePlates(verts, fingers);

    expect(plates.length).toBe(4);
    const split = splitKnuckleRing(verts, fingers);
    const xOf = (p: THREE.Vector3) => p.clone().sub(split.center).dot(split.xAxis);
    const webXs = [-1.13, 0.935, 2.84];

    // Seams snap to the nearest vertex, so allow one vertex spacing of slack.
    const snap = 2.0;
    const bounds: Array<[number, number]> = [
      [-Infinity, webXs[0] + snap],
      [webXs[0] - snap, webXs[1] + snap],
      [webXs[1] - snap, webXs[2] + snap],
      [webXs[2] - snap, Infinity],
    ];
    plates.forEach((loop, i) => {
      expect(loop.length).toBeGreaterThan(2);
      const [lo, hi] = bounds[i];
      for (const j of loop) {
        const x = xOf(verts[j]);
        expect(x).toBeGreaterThanOrEqual(lo - 1e-6);
        expect(x).toBeLessThanOrEqual(hi + 1e-6);
      }
    });
  });
});

describe('buildRingLoft hand fan', () => {
  it('welds the palm knuckle ring to the four fingers reusing ring verts', () => {
    const hand = new THREE.Bone();
    hand.name = 'mixamorigLeftHand';
    const mk = (name: string, x: number, y: number, z: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      hand.add(b);
    };
    mk('mixamorigLeftHandIndex1', -2.26, 9.11, 0.52);
    mk('mixamorigLeftHandMiddle1', 0, 9.53, 0);
    mk('mixamorigLeftHandRing1', 1.87, 9.10, 0.04);
    mk('mixamorigLeftHandPinky1', 3.81, 8.08, 0.49);
    hand.updateMatrixWorld(true);

    const bones = [hand, ...hand.children.filter((c) => c instanceof THREE.Bone) as THREE.Bone[]];
    const boneIndex = new Map([
      ['mixamorigLeftHand', 0],
      ['mixamorigLeftHandIndex1', 1],
      ['mixamorigLeftHandMiddle1', 2],
      ['mixamorigLeftHandRing1', 3],
      ['mixamorigLeftHandPinky1', 4],
    ]);
    const params = (name: string) => {
      if (name === 'mixamorigLeftHand') return { tubeRadiusX: 0, tubeRadiusZ: 0, group: 'hand' };
      if (/Hand(Index|Middle|Ring|Pinky)1$/.test(name)) return { tubeRadiusX: 1, tubeRadiusZ: 1, group: 'finger' };
      return null;
    };

    const segments = 16;
    const loft = buildRingLoft(bones, boneIndex, params, segments, 5);

    // The palm now ends at the pinky knuckle: 4 palm rings + 4 finger rings.
    // Each terminal finger also gets one cap apex. The fan reuses the palm's
    // knuckle-ring verts, so it adds NO extra plate verts.
    const expectedVerts = (4 + 4) * segments + 4;
    expect(loft.positions.length / 3).toBe(expectedVerts);

    for (const idx of loft.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(expectedVerts);
    }

    // Winding consistency: each directed edge must appear exactly once. A face
    // wound opposite to its neighbour re-uses the shared edge in the same
    // direction, so a count of 2 (or 0) flags a flip.
    const directed = new Map<string, number>();
    for (let i = 0; i < loft.indices.length; i += 3) {
      const a = loft.indices[i], b = loft.indices[i + 1], c = loft.indices[i + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = `${u}>${v}`;
        directed.set(k, (directed.get(k) ?? 0) + 1);
      }
    }
    for (const [k, count] of directed) {
      expect(count, `directed edge ${k}`).toBe(1);
    }
  });
});

describe('buildRingLoft thumb port', () => {
  it('welds the thumb base ring into a palm side port watertightly', () => {
    const hand = new THREE.Bone();
    hand.name = 'mixamorigLeftHand';
    const mk = (name: string, x: number, y: number, z: number) => {
      const b = new THREE.Bone();
      b.name = name;
      b.position.set(x, y, z);
      hand.add(b);
      return b;
    };
    mk('mixamorigLeftHandIndex1', -2.26, 9.11, 0.52);
    mk('mixamorigLeftHandMiddle1', 0, 9.53, 0);
    mk('mixamorigLeftHandRing1', 1.87, 9.10, 0.04);
    mk('mixamorigLeftHandPinky1', 3.81, 8.08, 0.49);
    // Oblique thumb root: radial side of the palm, angled out from the wrist.
    const thumb1 = mk('mixamorigLeftHandThumb1', -2.68, 2.47, 1.58);
    const thumb2 = new THREE.Bone();
    thumb2.name = 'mixamorigLeftHandThumb2';
    thumb2.position.set(0, 4, 0);
    thumb1.add(thumb2);
    const dir = thumb1.position.clone().normalize();
    thumb1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    hand.updateMatrixWorld(true);

    const bones = [hand, ...hand.children.filter((c) => c instanceof THREE.Bone) as THREE.Bone[], thumb2];
    const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
    const params = (name: string) => {
      if (name === 'mixamorigLeftHand') return { tubeRadiusX: 0, tubeRadiusZ: 0, group: 'hand' };
      if (/Hand(Index|Middle|Ring|Pinky)1$/.test(name)) return { tubeRadiusX: 1, tubeRadiusZ: 1, group: 'finger' };
      if (/HandThumb[12]$/.test(name)) return { tubeRadiusX: 1, tubeRadiusZ: 1, group: 'finger' };
      return null;
    };

    const segments = 16;
    const loft = buildRingLoft(bones, boneIndex, params, segments, 5);
    const vertCount = loft.positions.length / 3;

    for (const idx of loft.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertCount);
    }

    // Watertight: every directed edge appears exactly once (a flip would make a
    // shared edge appear twice in the same direction, or not at all).
    const directed = new Map<string, number>();
    for (let i = 0; i < loft.indices.length; i += 3) {
      const a = loft.indices[i], b = loft.indices[i + 1], c = loft.indices[i + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = `${u}>${v}`;
        directed.set(k, (directed.get(k) ?? 0) + 1);
      }
    }
    for (const [k, count] of directed) {
      expect(count, `directed edge ${k}`).toBe(1);
    }
  });
});

describe('buildRingLoft shoulder port', () => {
  it('welds both arm start rings into chest side ports watertightly', () => {
    const spine2 = new THREE.Bone();
    spine2.name = 'mixamorigSpine2';

    const neck = new THREE.Bone();
    neck.name = 'mixamorigNeck';
    neck.position.set(0, 16.87, 0);

    const mkSide = (shoulderName: string, armName: string, x: number, shoulderQ: THREE.Quaternion) => {
      const shoulder = new THREE.Bone();
      shoulder.name = shoulderName;
      shoulder.position.set(x, 11.20, -0.807);
      shoulder.quaternion.copy(shoulderQ);
      const arm = new THREE.Bone();
      arm.name = armName;
      arm.position.set(0, 10.84, 0);
      shoulder.add(arm);
      return { shoulder, arm };
    };

    const left = mkSide(
      'mixamorigLeftShoulder', 'mixamorigLeftArm', 4.57,
      new THREE.Quaternion(0.4844229221343994, 0.5709704160690308, -0.5261617302894592, 0.4030895531177521),
    );
    const right = mkSide(
      'mixamorigRightShoulder', 'mixamorigRightArm', -4.57,
      new THREE.Quaternion(0.4844307005405426, -0.5709637999534607, 0.5261635780334473, 0.4030871093273163),
    );
    spine2.add(neck, left.shoulder, right.shoulder);
    spine2.updateMatrixWorld(true);

    const bones = [spine2, neck, left.shoulder, left.arm, right.shoulder, right.arm];
    const boneIndex = new Map(bones.map((b, i) => [b.name, i]));
    const params = (name: string) => {
      if (name === 'mixamorigSpine2') return { tubeRadiusX: 16.5, tubeRadiusZ: 11, tubeOffsetForward: 2.5, group: 'spine2' };
      if (name === 'mixamorigNeck') return { tubeRadiusX: 5, tubeRadiusZ: 5, group: 'neck' };
      if (/Arm$/.test(name)) return { tubeRadiusX: 4, tubeRadiusZ: 3.5, group: 'arm' };
      if (/Shoulder$/.test(name)) return { tubeRadiusX: 2, tubeRadiusZ: 2, group: 'shoulder' };
      return null;
    };

    const segments = 32;
    const loft = buildRingLoft(bones, boneIndex, params, segments, 5);
    const vertCount = loft.positions.length / 3;

    for (const idx of loft.indices) {
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(vertCount);
    }

    // The arm rings must be welded, not orphaned: every arm-ring vertex appears
    // in at least one triangle. Positions run spine2 (8 rings) → neck (1 ring) →
    // left arm (1 ring) → right arm (1 ring), so the left arm ring starts at
    // (8 + 1) × segments.
    const used = new Set(loft.indices);
    for (let v = 9 * segments; v < 11 * segments; v++) {
      expect(used.has(v), `arm-ring vertex ${v} welded`).toBe(true);
    }

    // Winding consistency: every directed edge appears exactly once (a flip would
    // make a shared edge appear twice in the same direction, or not at all).
    const directed = new Map<string, number>();
    for (let i = 0; i < loft.indices.length; i += 3) {
      const a = loft.indices[i], b = loft.indices[i + 1], c = loft.indices[i + 2];
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = `${u}>${v}`;
        directed.set(k, (directed.get(k) ?? 0) + 1);
      }
    }
    for (const [k, count] of directed) {
      expect(count, `directed edge ${k}`).toBe(1);
    }
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

describe('buildRingLoft terminal caps', () => {
  it('caps a terminal finger/toe bone with an apex fan', () => {
    const finger = new THREE.Bone();
    finger.name = 'mixamorigLeftHandIndex4';
    finger.updateMatrixWorld(true);

    const bones = [finger];
    const boneIndex = new Map([['mixamorigLeftHandIndex4', 0]]);
    const params = (name: string) => {
      if (name === 'mixamorigLeftHandIndex4') return { tubeRadiusX: 1, tubeRadiusZ: 1, group: 'finger' };
      return null;
    };

    const segments = 8;
    const loft = buildRingLoft(bones, boneIndex, params, segments, 5);

    // 1 ring (8 verts) + 1 apex = 9 verts; 8 cap triangles = 24 indices.
    expect(loft.positions.length / 3).toBe(9);
    expect(loft.indices.length).toBe(8 * 3);

    // apex (vertex 8) is 100% the terminal bone.
    expect(loft.skinIndex[8 * 4]).toBe(0);
    expect(loft.skinWeight[8 * 4]).toBeCloseTo(1);
    expect(loft.skinWeight[8 * 4 + 1]).toBeCloseTo(0);
  });
});

describe('buildRingLoft UVs', () => {
  it('wraps U around each ring and runs V 0→1 along each bone', () => {
    const a = new THREE.Bone();
    a.name = 'A';
    const b = new THREE.Bone();
    b.name = 'B';
    b.position.set(0, 10, 0);
    a.add(b);
    a.updateMatrixWorld(true);

    const loft = buildRingLoft([a, b], new Map([['A', 0], ['B', 1]]), params, 4, 5);

    // One (u, v) pair per vertex.
    expect(loft.uv.length).toBe((loft.positions.length / 3) * 2);

    // Bone A ring 0 (t=0): U = j/4 around the ring, V = 0 at the bone origin.
    expect(loft.uv[0]).toBeCloseTo(0);     // j=0
    expect(loft.uv[1]).toBeCloseTo(0);     // v
    expect(loft.uv[2]).toBeCloseTo(0.25);  // j=1 → U = 1/4

    // Bone A ring 4 (t=0.8, y=8 = top of the bone): V = 1.
    const ring4 = 4 * 4 * 2;               // vertex index 16 → uv offset 32
    expect(loft.uv[ring4 + 1]).toBeCloseTo(1);
  });
});

describe('ring chest relief', () => {
  it('pushes the front of a bust ring forward while leaving the back ellipse intact', () => {
    const bone = new THREE.Bone();
    bone.name = 'mixamorigSpine2';
    bone.updateMatrixWorld(true);

    const ring = {
      boneIndex: 0, boneName: 'mixamorigSpine2', group: 'spine2',
      y: 0, fwd: 2.5, rx: 16, rz: 11, t: 0, bust: 0.2,
    };
    const pts = ringWorldPoints(ring, bone, 32);

    // Front (a = π/2) is index 8; back (a = 3π/2) is index 24.
    expect(pts[8].z).toBeGreaterThan(2.5 + 11); // sternum pushed forward
    expect(pts[24].z).toBeCloseTo(2.5 - 11, 5); // back unchanged
    // The two bumps flank the sternum, so the lateral peak sits forward of centre.
    expect(pts[6].z).toBeGreaterThan(pts[8].z);
  });

  it('is a no-op at bust = 0 (pure ellipse)', () => {
    const bone = new THREE.Bone();
    bone.updateMatrixWorld(true);
    const ring = {
      boneIndex: 0, boneName: 'mixamorigSpine2', group: 'spine2',
      y: 0, fwd: 2.5, rx: 16, rz: 11, t: 0,
    };
    const pts = ringWorldPoints(ring, bone, 32);
    expect(pts[8].z).toBeCloseTo(2.5 + 11, 5);
    expect(pts[24].z).toBeCloseTo(2.5 - 11, 5);
  });

  it('distributes the relief along the spine2 girdle, peaking at nipple level', () => {
    const spine2 = new THREE.Bone();
    spine2.name = 'mixamorigSpine2';
    const neck = new THREE.Bone();
    neck.name = 'mixamorigNeck';
    neck.position.set(0, 16.87, 0);
    spine2.add(neck);
    spine2.updateMatrixWorld(true);

    const bones = [spine2, neck];
    const boneIndex = new Map([['mixamorigSpine2', 0], ['mixamorigNeck', 1]]);
    const params = (name: string) => {
      if (name === 'mixamorigSpine2') return { tubeRadiusX: 16.5, tubeRadiusZ: 11, tubeOffsetForward: 2.5, bust: 0.2, group: 'spine2' };
      if (name === 'mixamorigNeck') return { tubeRadiusX: 5, tubeRadiusZ: 5, group: 'neck' };
      return null;
    };

    const graph = buildRingGraph(bones, boneIndex, params, 5);
    const rings = graph.rings.filter((r) => r.boneName === 'mixamorigSpine2');
    expect(rings.length).toBeGreaterThan(2);

    const peak = rings.reduce((a, b) => ((b.bust ?? 0) > (a.bust ?? 0) ? b : a));
    expect(peak.bust).toBeGreaterThan(0.15); // near the full 0.2 amplitude
    expect(rings[0].bust).toBeLessThan(0.01); // waist ring fades to ~0
    expect(rings[rings.length - 1].bust).toBeLessThan(0.01); // neck ring fades to ~0
  });
});
