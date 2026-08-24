import * as THREE from 'three';
import { tubeSkinWeights, smoothstep01 } from './skinning.js';

/**
 * Ease the cross-section ramp so a bone holds its own radius for most of its
 * length and tapers only near the child joint (the shoulder-plate-into-neck
 * shape), instead of coning linearly along the whole bone.
 */
function holdThenTaper(t: number): number {
  const hold = 0.7;
  if (t <= hold) return 0;
  const x = (t - hold) / (1 - hold);
  return x * x * (3 - 2 * x);
}

/**
 * The local rings for one bone. The hips bone is a special "girdle" envelope:
 * two wide rings below its origin (the crotch, so the legs have something to
 * emerge from) plus the normal up-ramp to the spine. Every other bone uses the
 * plain hold-then-taper ramp to its child.
 */
function buildBoneRings(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  params: (name: string) => BoneRingParams | null,
  ringsPerBone: number,
): BodyRing[] {
  const child = bone.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
  const childBp = child ? params(child.name) : null;
  const cRx = childBp?.tubeRadiusX ?? bp.tubeRadiusX;
  const cRz = childBp?.tubeRadiusZ ?? bp.tubeRadiusZ;
  const cFwd = childBp?.tubeOffsetForward ?? 0;
  const length = child ? child.position.length() : 0;

  const rings: BodyRing[] = [];

  if (bone.name === 'mixamorigHips') {
    // The girdle is the whole pelvis + buttocks: a single cross-section from the
    // waist, widening to the hips at the hip joint, then narrowing to the crotch
    // where the legs split. The split ring sits at the crotch, not the joint, so
    // the leg split happens below the widest point (not as a flat plate).
    const upLeg = bone.children.find((c) => c instanceof THREE.Bone && /UpLeg/.test(c.name)) as THREE.Bone | undefined;
    const upLegChild = upLeg?.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
    const jointY = upLeg ? upLeg.position.y : -7;
    const upLegLen = upLegChild ? upLegChild.position.length() : 40;
    const crotchY = jointY - upLegLen * 0.15;
    const waistRx = bp.tubeRadiusX;
    const hipsRx = waistRx + 2;
    const below: Array<[number, number]> = [
      // Written bottom-to-top (crotch → waist) so the loft stitches the girdle
      // as one continuous run into the up-ramp, with no jump back up to the waist.
      [crotchY, waistRx + 1],
      [(jointY + crotchY) / 2, (hipsRx + waistRx + 1) / 2],
      [jointY, hipsRx],
      [jointY / 2, waistRx + 1],
    ];
    for (const [y, rx] of below) {
      rings.push({
        boneIndex: bi, boneName: bone.name, group: bp.group,
        y, fwd: bp.tubeOffsetForward ?? 0, rx, rz: bp.tubeRadiusZ, t: 0,
      });
    }
  }

  if (/UpLeg$/.test(bone.name)) {
    // The upper leg's skin starts at the crotch (~1/4 down the femur) with dense
    // rings at the top so the thigh emerges smoothly from the girdle; the rest
    // tapers toward the knee as usual.
    for (const t of [0.25, 0.32, 0.4, 0.5, 0.65, 0.8]) {
      const e = holdThenTaper(t);
      // Top rings blend toward the hips (parent), fading to 0 by t=0.4 so the
      // rest of the leg blends toward the knee (child) as usual.
      const parentWeight = t < 0.4 ? 0.5 * smoothstep01((0.4 - t) / 0.15) : undefined;
      rings.push({
        boneIndex: bi, boneName: bone.name, group: bp.group,
        y: t * length,
        fwd: THREE.MathUtils.lerp(bp.tubeOffsetForward ?? 0, cFwd, e),
        rx: THREE.MathUtils.lerp(bp.tubeRadiusX, cRx, e),
        rz: THREE.MathUtils.lerp(bp.tubeRadiusZ, cRz, e),
        t,
        parentWeight,
      });
    }
    return rings;
  }

  const count = child ? ringsPerBone : 1;
  for (let i = 0; i < count; i++) {
    const t = i / ringsPerBone;
    const e = holdThenTaper(t);
    rings.push({
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y: t * length,
      fwd: THREE.MathUtils.lerp(bp.tubeOffsetForward ?? 0, cFwd, e),
      rx: THREE.MathUtils.lerp(bp.tubeRadiusX, cRx, e),
      rz: THREE.MathUtils.lerp(bp.tubeRadiusZ, cRz, e),
      t,
    });
  }

  return rings;
}

/**
 * One cross-section ring of the ring-graph skin, stored in the owning bone's
 * LOCAL frame: +Y is the bone axis, X/Z are the cross-section. Callers
 * transform to world via `ringWorldPoints` (using the bone's matrixWorld), so
 * the ring is always orthogonal to the bone and follows it when animated.
 */
export interface BodyRing {
  boneIndex: number;
  boneName: string;
  group: string;
  y: number;   // local Y along the bone (cm)
  fwd: number; // local Z forward offset (cm)
  rx: number;  // local X half-width (cm)
  rz: number;  // local Z half-depth (cm)
  t: number;   // parametric position (0..1) along the bone, for skin weights
  /** Blend toward the PARENT bone, applied directionally: zero at the ring's
   *  front (so the quads stay on the femur), ramping to this maximum at the
   *  back (hamstring/gluteal fold). Used by the upper-leg top rings. */
  parentWeight?: number;
}

export interface RingGraph {
  rings: BodyRing[];
}

export interface BoneRingParams {
  tubeRadiusX: number;
  tubeRadiusZ: number;
  tubeOffsetForward?: number;
  group: string;
}

/**
 * Build the shared-ring graph in each bone's local frame. Each bone
 * contributes a start ring at its own tube radius, then (if it has a child
 * bone) interior rings that ramp linearly to the child's tube radius, stopping
 * short of the joint — the child's start ring sits there. So there is one ring
 * per joint, and no coplanar pair at different radii.
 */
export function buildRingGraph(
  bones: THREE.Bone[],
  boneIndex: Map<string, number>,
  params: (name: string) => BoneRingParams | null,
  ringsPerBone = 5,
): RingGraph {
  const rings: BodyRing[] = [];

  for (const bone of bones) {
    const bp = params(bone.name);
    if (!bp) continue;
    const bi = boneIndex.get(bone.name) ?? 0;
    rings.push(...buildBoneRings(bone, bi, bp, params, ringsPerBone));
  }

  return { rings };
}

/**
 * World-space ellipse points for a ring, computed through the bone's current
 * matrixWorld so the ring is correctly oriented against the bone and follows
 * it when the skeleton animates.
 */
export function ringWorldPoints(ring: BodyRing, bone: THREE.Bone, segments = 16): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const local = new THREE.Vector3();
  for (let j = 0; j < segments; j++) {
    const a = (j / segments) * Math.PI * 2;
    local.set(ring.rx * Math.cos(a), ring.y, ring.fwd + ring.rz * Math.sin(a));
    pts.push(local.applyMatrix4(bone.matrixWorld).clone());
  }
  return pts;
}

export interface RingLoft {
  positions: number[];
  indices: number[];
  skinIndex: number[];
  skinWeight: number[];
}

/**
 * Loft two ordered vertex sequences (open polylines) into a triangle strip.
 * `a` and `b` are arrays of vertex indices; each sequence runs from one open
 * boundary to the other (e.g. the two seam points of a bifurcation). Emits
 * triangles with the same winding as the ring-to-ring loft, so normals stay
 * outward when both sequences run in the same rotational direction.
 */
export function loftStrip(a: number[], b: number[], indices: number[]): void {
  const m = a.length;
  const n = b.length;
  if (m < 2 || n < 2) return;
  let i = 0;
  let j = 0;
  while (i < m - 1 || j < n - 1) {
    if (i === m - 1) {
      indices.push(a[i], b[j], b[j + 1]);
      j++;
    } else if (j === n - 1) {
      indices.push(a[i], b[j], a[i + 1]);
      i++;
    } else if ((i + 1) / m <= (j + 1) / n) {
      indices.push(a[i], b[j], a[i + 1]);
      i++;
    } else {
      indices.push(a[i], b[j], b[j + 1]);
      j++;
    }
  }
}

export interface RingSplit {
  /** Vertex indices on the +axis side (ordered along the ring's circular order). */
  pos: number[];
  /** Vertex indices on the -axis side. */
  neg: number[];
  /** The two shared seam vertex indices (front/back extremes). */
  seams: [number, number];
}

/**
 * Split a convex ring (world points in circular order) into two arcs along an
 * axis through its centroid. The two vertices closest to the axis are the seam
 * points shared by both arcs — the first step of a bifurcation (e.g. the girdle
 * bottom ring splitting into the two upper-leg rings). Assumes the axis roughly
 * bisects the ring so the two closest vertices sit on opposite sides.
 */
export function splitRingArcs(
  verts: THREE.Vector3[],
  center: THREE.Vector3,
  axis: THREE.Vector3,
): RingSplit {
  const n = verts.length;
  const s = new Array<number>(n);
  for (let j = 0; j < n; j++) s[j] = verts[j].clone().sub(center).dot(axis);

  const order = verts.map((_, j) => j).sort((a, b) => Math.abs(s[a]) - Math.abs(s[b]));
  const seamA = Math.min(order[0], order[1]);
  const seamB = Math.max(order[0], order[1]);

  const arcAsc: number[] = [];
  for (let j = seamA; j <= seamB; j++) arcAsc.push(j);
  const arcWrap: number[] = [];
  for (let j = seamB; j < n; j++) arcWrap.push(j);
  for (let j = 0; j <= seamA; j++) arcWrap.push(j);

  const midAsc = arcAsc[Math.floor(arcAsc.length / 2)];
  const pos = s[midAsc] >= 0 ? arcAsc : arcWrap;
  const neg = s[midAsc] >= 0 ? arcWrap : arcAsc;

  return { pos, neg, seams: [order[0], order[1]] };
}

/**
 * Points along the straight seam chord that closes a hemi-disk: the line from
 * one seam vertex to the other, subdivided into `interior` interior points plus
 * the two endpoints. The curved arc contributes `segments/2 + 1` vertices, so
 * `interior = segments/2 - 1` makes the closed hemi-disk loop carry exactly
 * `segments` vertices — the same count as the leg ring it will receive, so the
 * stitch is a 1:1 closed-loop loft.
 */
export function seamEdgePoints(a: THREE.Vector3, b: THREE.Vector3, interior: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const n = interior + 1;
  for (let k = 0; k <= n; k++) pts.push(a.clone().lerp(b, k / n));
  return pts;
}

/**
 * Re-order a leg ring's vertices (given in circular order) to match a hemi-disk
 * built from `hemiCurve` (the girdle arc, seamA → seamB) closed by its seam
 * chord. Returns 16 leg-vertex indices: the first 9 are the leg's outer half
 * (mapping to the curved edge), the last 7 are the inner half's interior
 * (mapping to the chord interior). The two seams attach to the leg vertices
 * nearest them, and the outer half is the arc through the side facing away from
 * the pelvis.
 */
export function orderLegRingForHemi(
  hemiCurve: THREE.Vector3[],
  legVerts: THREE.Vector3[],
  legCenter: THREE.Vector3,
  pelvisCenter: THREE.Vector3,
): number[] {
  const n = legVerts.length;
  const seamA = hemiCurve[0];
  const seamB = hemiCurve[hemiCurve.length - 1];

  let attachA = 0;
  let attachB = 0;
  let bestA = Infinity;
  let bestB = Infinity;
  for (let j = 0; j < n; j++) {
    const dA = legVerts[j].distanceToSquared(seamA);
    const dB = legVerts[j].distanceToSquared(seamB);
    if (dA < bestA) { bestA = dA; attachA = j; }
    if (dB < bestB) { bestB = dB; attachB = j; }
  }

  const outward = legCenter.clone().sub(pelvisCenter).normalize();
  const d = new Array<number>(n);
  let maxJ = 0;
  for (let j = 0; j < n; j++) {
    d[j] = legVerts[j].clone().sub(legCenter).dot(outward);
    if (d[j] > d[maxJ]) maxJ = j;
  }

  const forward: number[] = [];
  for (let j = attachA; ; j = (j + 1) % n) {
    forward.push(j);
    if (j === attachB) break;
  }
  const backward: number[] = [];
  for (let j = attachA; ; j = (j - 1 + n) % n) {
    backward.push(j);
    if (j === attachB) break;
  }

  const outer = forward.includes(maxJ) ? forward : backward;
  const inner = forward.includes(maxJ) ? backward : forward;
  const innerRev = [...inner].reverse();

  const order: number[] = [...outer];
  for (let k = 1; k < innerRev.length - 1; k++) order.push(innerRev[k]);
  return order;
}

function readRing(positions: number[], base: number, segments: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let j = 0; j < segments; j++) {
    pts.push(new THREE.Vector3(positions[(base + j) * 3], positions[(base + j) * 3 + 1], positions[(base + j) * 3 + 2]));
  }
  return pts;
}

function ringCentroid(pts: THREE.Vector3[]): THREE.Vector3 {
  const c = new THREE.Vector3();
  for (const p of pts) c.add(p);
  return c.multiplyScalar(1 / pts.length);
}

/**
 * Fan the girdle's bottom ring into the two upper-leg top rings (the crotch).
 * Each leg gets a "D"-shaped hemi-disk — the girdle arc plus the shared seam
 * chord — lofted 1:1 to its leg ring. The chord vertices (the crotch line) are
 * added here, weighted hips + both uplegs, and the girdle arc vertices are
 * re-weighted so the front follows the leg (groin) while the back stays on the
 * pelvis (buttock).
 */
function buildLegFans(
  boneIndex: Map<string, number>,
  ringBases: Map<string, number[]>,
  positions: number[],
  skinIndex: number[],
  skinWeight: number[],
  indices: number[],
  segments: number,
): void {
  const hipsBases = ringBases.get('mixamorigHips');
  const leftBases = ringBases.get('mixamorigLeftUpLeg');
  const rightBases = ringBases.get('mixamorigRightUpLeg');
  if (!hipsBases || !leftBases || !rightBases) return;

  const hipsBi = boneIndex.get('mixamorigHips') ?? 0;
  const leftBi = boneIndex.get('mixamorigLeftUpLeg') ?? 0;
  const rightBi = boneIndex.get('mixamorigRightUpLeg') ?? 0;

  const hipsBase = hipsBases[0];
  const leftBase = leftBases[0];
  const rightBase = rightBases[0];

  const gv = readRing(positions, hipsBase, segments);
  const lv = readRing(positions, leftBase, segments);
  const rv = readRing(positions, rightBase, segments);
  const gCenter = ringCentroid(gv);
  const lCenter = ringCentroid(lv);
  const rCenter = ringCentroid(rv);
  const axis = rCenter.clone().sub(lCenter).normalize();
  const split = splitRingArcs(gv, gCenter, axis);
  const interior = segments / 2 - 1;

  // Shared seam chord interior verts (the crotch line), from seam[0] to seam[1].
  const [s0, s1] = split.seams;
  const chordPts = seamEdgePoints(gv[s0], gv[s1], interior);
  const chordNew: number[] = [];
  for (let k = 1; k < chordPts.length - 1; k++) {
    const v = positions.length / 3;
    positions.push(chordPts[k].x, chordPts[k].y, chordPts[k].z);
    skinIndex.push(hipsBi, leftBi, rightBi, 0);
    skinWeight.push(0.5, 0.25, 0.25, 0);
    chordNew.push(v);
  }

  const legs = [
    { base: leftBase, verts: lv, center: lCenter, bi: leftBi },
    { base: rightBase, verts: rv, center: rCenter, bi: rightBi },
  ];

  for (const leg of legs) {
    const arc = leg.center.clone().sub(gCenter).dot(axis) >= 0 ? split.pos : split.neg;
    const arcVerts = arc.map((j) => gv[j]);
    const legOrder = orderLegRingForHemi(arcVerts, leg.verts, leg.center, gCenter);

    // Chord interior, oriented to close this arc (arc[last] → arc[0]).
    const chordInterior = arc[arc.length - 1] === s0 ? chordNew : [...chordNew].reverse();

    const hemiLoop: number[] = [];
    for (const j of arc) hemiLoop.push(hipsBase + j);
    for (const v of chordInterior) hemiLoop.push(v);

    const legLoop: number[] = legOrder.map((j) => leg.base + j);

    const n = hemiLoop.length;
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      indices.push(legLoop[j], hemiLoop[j], legLoop[j1], legLoop[j1], hemiLoop[j], hemiLoop[j1]);
    }

    // Re-weight the girdle arc verts: front follows the leg, back stays hips.
    for (const j of arc) {
      const a = (j / segments) * Math.PI * 2;
      const uplegWeight = 0.4 * ((1 + Math.sin(a)) / 2);
      const v = hipsBase + j;
      skinIndex[v * 4] = hipsBi;
      skinIndex[v * 4 + 1] = leg.bi;
      skinIndex[v * 4 + 2] = 0;
      skinIndex[v * 4 + 3] = 0;
      skinWeight[v * 4] = 1 - uplegWeight;
      skinWeight[v * 4 + 1] = uplegWeight;
      skinWeight[v * 4 + 2] = 0;
      skinWeight[v * 4 + 3] = 0;
    }
  }
}

/**
 * Loft the shared-ring graph into a single triangle tube. Each bone's rings are
 * stitched in order, then its last ring is stitched to its child's start ring
 * (the shared weld), so the result is watertight along every 1-D chain.
 * Per-vertex skin weights come from each ring's position along its bone
 * (`tubeSkinWeights`). Callers compute normals via `computeVertexNormals`.
 */
export function buildRingLoft(
  bones: THREE.Bone[],
  boneIndex: Map<string, number>,
  params: (name: string) => BoneRingParams | null,
  segments = 16,
  ringsPerBone = 5,
): RingLoft {
  const positions: number[] = [];
  const indices: number[] = [];
  const skinIndex: number[] = [];
  const skinWeight: number[] = [];

  const ringBases = new Map<string, number[]>();

  for (const bone of bones) {
    const bp = params(bone.name);
    if (!bp) continue;
    const bi = boneIndex.get(bone.name) ?? 0;

    const child = bone.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
    const childBi = child ? boneIndex.get(child.name) : undefined;
    const parentBi = bone.parent instanceof THREE.Bone ? boneIndex.get(bone.parent.name) : undefined;

    const bases: number[] = [];
    for (const ring of buildBoneRings(bone, bi, bp, params, ringsPerBone)) {
      const base = positions.length / 3;
      for (const p of ringWorldPoints(ring, bone, segments)) positions.push(p.x, p.y, p.z);

      const useParent = ring.parentWeight !== undefined && parentBi !== undefined;
      const childW: [number, number] = useParent ? [0, 0] : tubeSkinWeights(ring.t, 0.3);
      const pBi = parentBi ?? 0;
      const pw = ring.parentWeight ?? 0;
      for (let j = 0; j < segments; j++) {
        if (useParent) {
          // Directional: strongest at the back of the ring (hamstring/gluteal
          // fold), zero at the front (quads follow the femur).
          const backness = (1 - Math.sin((j / segments) * Math.PI * 2)) / 2;
          const w = pw * backness;
          skinIndex.push(pBi, bi, 0, 0);
          skinWeight.push(w, 1 - w, 0, 0);
        } else {
          skinIndex.push(bi, childBi ?? bi, 0, 0);
          skinWeight.push(childW[0], childW[1], 0, 0);
        }
      }
      bases.push(base);
    }
    ringBases.set(bone.name, bases);
  }

  for (const bone of bones) {
    const bases = ringBases.get(bone.name);
    if (!bases || bases.length === 0) continue;
    const child = bone.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
    const childStart = child ? ringBases.get(child.name)?.[0] : undefined;

    const stops = [...bases];
    if (childStart !== undefined) stops.push(childStart);

    for (let i = 0; i + 1 < stops.length; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      for (let j = 0; j < segments; j++) {
        const j1 = (j + 1) % segments;
        indices.push(a + j, b + j, a + j1, a + j1, b + j, b + j1);
      }
    }
  }

  // Fan the girdle bottom into the two legs (the crotch weld).
  buildLegFans(boneIndex, ringBases, positions, skinIndex, skinWeight, indices, segments);

  return { positions, indices, skinIndex, skinWeight };
}

