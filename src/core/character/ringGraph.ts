import * as THREE from 'three';
import { tubeSkinWeights, smoothstep01 } from './skinning.js';
import {
  GIRDLE_CROTCH_FRACTION,
  GIRDLE_HIP_WIDENING,
  GIRDLE_WAIST_PADDING,
  PALM_MARGIN,
  PALM_RZ,
  PALM_STOPS,
  PALM_THUMB_BRACKET_T,
  PALM_WRIST_RX,
  PALM_WRIST_RZ,
  PORT_SPECS,
  RING_ENVELOPE_SPECS,
  SHOULDER_GIRDLE_JOINT_FALLBACK_T,
  SHOULDER_GIRDLE_RING_COUNT,
  SHOULDER_GIRDLE_SIGMA,
  SHOULDER_PORT_BRACKET_COUNT,
  TAPER_HOLD,
  THUMB_START_OFFSET_FACTOR,
  THUMB_START_OFFSET_MAX_FRACTION,
  TUBE_WEIGHT_INFLUENCE,
  UPLEG_PARENT_FADE_SPAN,
  UPLEG_PARENT_FADE_T,
  UPLEG_PARENT_MAX_WEIGHT,
  UPLEG_STOPS,
} from './ringSurface.js';
import type { EnvelopeShape, LegFanSpec, SidePortSpec } from './ringSurface.js';

/**
 * Ease the cross-section ramp so a bone holds its own radius for most of its
 * length and tapers only near the child joint (the shoulder-plate-into-neck
 * shape), instead of coning linearly along the whole bone.
 */
function holdThenTaper(t: number): number {
  const hold = TAPER_HOLD;
  if (t <= hold) return 0;
  const x = (t - hold) / (1 - hold);
  return x * x * (3 - 2 * x);
}

/**
 * The local rings for one bone, selected by its group's envelope spec. Each
 * shape has a dedicated builder below; groups not in `RING_ENVELOPE_SPECS`
 * (and shapes that decline) fall back to the generic hold-then-taper ramp.
 */
function buildBoneRings(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  params: (name: string) => BoneRingParams | null,
  ringsPerBone: number,
): BodyRing[] {
  const target = childTarget(bone, bp, params);
  switch (envelopeShapeFor(bp.group, bone.name)) {
    case 'hips': return buildHipsEnvelope(bone, bi, bp, target, ringsPerBone);
    case 'upleg': return buildUpLegEnvelope(bone, bi, bp, target);
    case 'palm': {
      const palm = buildPalmEnvelope(bone, bi, bp, params);
      if (palm) return palm;
      break;
    }
    case 'thumb': {
      const thumb = buildThumbEnvelope(bone, bi, bp, target, ringsPerBone);
      if (thumb) return thumb;
      break;
    }
    case 'spine2': return buildSpine2Envelope(bone, bi, bp, params);
    case 'absorbed': return [];
  }
  return buildGenericEnvelope(bone, bi, bp, target, ringsPerBone);
}

/** The child bone's cross-section + length — the target the generic ramp tapers toward. */
interface ChildTarget {
  cRx: number;
  cRz: number;
  cFwd: number;
  length: number;
  hasChild: boolean;
}

function childTarget(bone: THREE.Bone, bp: BoneRingParams, params: (name: string) => BoneRingParams | null): ChildTarget {
  const child = bone.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
  const childBp = child ? params(child.name) : null;
  return {
    cRx: childBp?.tubeRadiusX ?? bp.tubeRadiusX,
    cRz: childBp?.tubeRadiusZ ?? bp.tubeRadiusZ,
    cFwd: childBp?.tubeOffsetForward ?? 0,
    length: child ? child.position.length() : 0,
    hasChild: child !== undefined,
  };
}

/** The envelope shape for a bone, from `RING_ENVELOPE_SPECS` (default `generic`). */
function envelopeShapeFor(group: string, name: string): EnvelopeShape {
  for (const spec of RING_ENVELOPE_SPECS) {
    if (spec.group === group && (!spec.name || spec.name.test(name))) return spec.shape;
  }
  return 'generic';
}

/** Plain hold-then-taper ramp from the bone's radius to its child's. */
function buildGenericEnvelope(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  target: ChildTarget,
  ringsPerBone: number,
): BodyRing[] {
  const rings: BodyRing[] = [];
  const count = target.hasChild ? ringsPerBone : 1;
  for (let i = 0; i < count; i++) {
    const t = i / ringsPerBone;
    const e = holdThenTaper(t);
    rings.push({
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y: t * target.length,
      fwd: THREE.MathUtils.lerp(bp.tubeOffsetForward ?? 0, target.cFwd, e),
      rx: THREE.MathUtils.lerp(bp.tubeRadiusX, target.cRx, e),
      rz: THREE.MathUtils.lerp(bp.tubeRadiusZ, target.cRz, e),
      t,
    });
  }
  return rings;
}

/** The pelvis girdle: wide rings below the origin (crotch → waist) + the generic up-ramp. */
function buildHipsEnvelope(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  target: ChildTarget,
  ringsPerBone: number,
): BodyRing[] {
  const rings: BodyRing[] = [];
  // The girdle is the whole pelvis + buttocks: a single cross-section from the
  // waist, widening to the hips at the hip joint, then narrowing to the crotch
  // where the legs split. The split ring sits at the crotch, not the joint, so
  // the leg split happens below the widest point (not as a flat plate).
  const upLeg = bone.children.find((c) => c instanceof THREE.Bone && /UpLeg/.test(c.name)) as THREE.Bone | undefined;
  const upLegChild = upLeg?.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
  const jointY = upLeg ? upLeg.position.y : -7;
  const upLegLen = upLegChild ? upLegChild.position.length() : 40;
  const crotchY = jointY - upLegLen * GIRDLE_CROTCH_FRACTION;
  const waistRx = bp.tubeRadiusX;
  const hipsRx = waistRx + GIRDLE_HIP_WIDENING;
  const below: Array<[number, number]> = [
    // Written bottom-to-top (crotch → waist) so the loft stitches the girdle
    // as one continuous run into the up-ramp, with no jump back up to the waist.
    [crotchY, waistRx + GIRDLE_WAIST_PADDING],
    [(jointY + crotchY) / 2, (hipsRx + waistRx + GIRDLE_WAIST_PADDING) / 2],
    [jointY, hipsRx],
    [jointY / 2, waistRx + GIRDLE_WAIST_PADDING],
  ];
  for (const [y, rx] of below) {
    rings.push({
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y, fwd: bp.tubeOffsetForward ?? 0, rx, rz: bp.tubeRadiusZ, t: 0,
    });
  }
  return [...rings, ...buildGenericEnvelope(bone, bi, bp, target, ringsPerBone)];
}

/** Upper leg: dense rings near the crotch, blended toward the hips at the top. */
function buildUpLegEnvelope(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  target: ChildTarget,
): BodyRing[] {
  const rings: BodyRing[] = [];
  // The upper leg's skin starts at the crotch (~1/4 down the femur) with dense
  // rings at the top so the thigh emerges smoothly from the girdle; the rest
  // tapers toward the knee as usual.
  for (const t of UPLEG_STOPS) {
    const e = holdThenTaper(t);
    // Top rings blend toward the hips (parent), fading to 0 by t=UPLEG_PARENT_FADE_T
    // so the rest of the leg blends toward the knee (child) as usual.
    const parentWeight = t < UPLEG_PARENT_FADE_T
      ? UPLEG_PARENT_MAX_WEIGHT * smoothstep01((UPLEG_PARENT_FADE_T - t) / UPLEG_PARENT_FADE_SPAN)
      : undefined;
    rings.push({
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y: t * target.length,
      fwd: THREE.MathUtils.lerp(bp.tubeOffsetForward ?? 0, target.cFwd, e),
      rx: THREE.MathUtils.lerp(bp.tubeRadiusX, target.cRx, e),
      rz: THREE.MathUtils.lerp(bp.tubeRadiusZ, target.cRz, e),
      t,
      parentWeight,
    });
  }
  return rings;
}

/** Palm: a flattened, asymmetric wedge from the wrist to the knuckles (null → generic). */
function buildPalmEnvelope(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  params: (name: string) => BoneRingParams | null,
): BodyRing[] | null {
  const fingerChildren = bone.children.filter((c) => c instanceof THREE.Bone) as THREE.Bone[];
  const fingers = fingerChildren.filter((c) => /(Index|Middle|Ring|Pinky)1$/.test(c.name));
  if (fingers.length === 0) return null;

  const rings: BodyRing[] = [];
  // Palm envelope: a flattened, asymmetric wedge from the wrist to the
  // knuckles. The hand's local +Y points along the middle finger, and the
  // pinky root sits further laterally (and more proximally) than the index, so
  // the tube's cross-section is offset in X and sized from the finger tubes'
  // outer edges. It reaches full width at the pinky's knuckle Y (then holds),
  // so the pinky tube is enclosed. The fingers fan into its knuckle ring.
  const fingerR = (f: THREE.Bone) => params(f.name)?.tubeRadiusX ?? 1;
  // Extra lateral padding beyond the finger tube radius, so the palm visibly
  // wraps the finger bases instead of tangentially touching them.
  const margin = PALM_MARGIN;
  const palmLen = fingers.reduce((m, c) => Math.max(m, c.position.y), 0);
  const pinkyY = fingers.reduce((m, c) => Math.min(m, c.position.y), Infinity);
  const minX = fingers.reduce((m, c) => Math.min(m, c.position.x - fingerR(c) - margin), Infinity);
  const maxX = fingers.reduce((m, c) => Math.max(m, c.position.x + fingerR(c) + margin), -Infinity);
  const xOffEnd = (minX + maxX) / 2;
  const rxEnd = (maxX - minX) / 2;

  const wristRx = PALM_WRIST_RX;
  const wristRz = PALM_WRIST_RZ;
  const palmRz = PALM_RZ;
  // The palm must already be full-width at the pinky's knuckle (the most
  // proximal finger), so ramp the cross-section to `fullT` then hold.
  const fullT = palmLen > 0 ? Math.min(1, pinkyY / palmLen) : 1;

  const palmRingAt = (y: number): BodyRing => {
    const t = palmLen > 0 ? y / palmLen : 0;
    const w = fullT > 0 ? Math.min(1, t / fullT) : 1;
    return {
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y,
      fwd: 0,
      rx: THREE.MathUtils.lerp(wristRx, rxEnd, w),
      rz: THREE.MathUtils.lerp(wristRz, palmRz, w),
      xOff: xOffEnd * w,
      t: 0,
    };
  };

  const ys = new Set<number>();
  for (const t of [...new Set([...PALM_STOPS, fullT])]) ys.add(t * palmLen);

  // Thumb side-port: add the middle bracket ring at t=0.2 (the widest part
  // of the junction) so the port spans wrist → t=0.2 → t=0.4 as a hexagon.
  if (fingerChildren.some((c) => /Thumb1$/.test(c.name))) {
    ys.add(PALM_THUMB_BRACKET_T * palmLen);
  }

  for (const y of [...ys].sort((a, b) => a - b)) rings.push(palmRingAt(y));
  return rings;
}

/** Thumb: start just outside the palm surface (distally offset) instead of at the joint. */
function buildThumbEnvelope(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  target: ChildTarget,
  ringsPerBone: number,
): BodyRing[] | null {
  if (target.length <= 0) return null;
  const rings: BodyRing[] = [];
  // The thumb skin starts just outside the palm surface (not at the joint) so
  // the tube doesn't pierce the hand; the thumb side-port welds this first
  // ring to the palm port instead of the joint ring.
  const startOffset = Math.min(bp.tubeRadiusX * THUMB_START_OFFSET_FACTOR, target.length * THUMB_START_OFFSET_MAX_FRACTION);
  const count = target.hasChild ? ringsPerBone : 1;
  for (let i = 0; i < count; i++) {
    const t = i / ringsPerBone;
    const e = holdThenTaper(t);
    rings.push({
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y: startOffset + t * (target.length - startOffset),
      fwd: THREE.MathUtils.lerp(bp.tubeOffsetForward ?? 0, target.cFwd, e),
      rx: THREE.MathUtils.lerp(bp.tubeRadiusX, target.cRx, e),
      rz: THREE.MathUtils.lerp(bp.tubeRadiusZ, target.cRz, e),
      t,
    });
  }
  return rings;
}

/** Spine2 shoulder girdle: widen AND deepen at the shoulder joint, taper to the neck. */
function buildSpine2Envelope(
  bone: THREE.Bone,
  bi: number,
  bp: BoneRingParams,
  params: (name: string) => BoneRingParams | null,
): BodyRing[] {
  const rings: BodyRing[] = [];
  // Shoulder girdle: widen AND deepen at the shoulder joint so the arms exit
  // through the girdle surface instead of a shallow "shoulder plate". Tapers
  // to the neck (not to whichever child happens to be first).
  const neck = bone.children.find((c) => c instanceof THREE.Bone && c.name === 'mixamorigNeck') as THREE.Bone | undefined;
  const neckBp = neck ? params(neck.name) : null;
  const neckRx = neckBp?.tubeRadiusX ?? bp.tubeRadiusX;
  const neckRz = neckBp?.tubeRadiusZ ?? bp.tubeRadiusZ;
  const neckFwd = neckBp?.tubeOffsetForward ?? 0;
  const spineLen = neck ? neck.position.length() : 0;

  const shoulder = bone.children.find((c) => c instanceof THREE.Bone && /Shoulder$/.test(c.name)) as THREE.Bone | undefined;
  const arm = shoulder?.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
  const fwd = bp.tubeOffsetForward ?? 0;
  let jointY = spineLen * SHOULDER_GIRDLE_JOINT_FALLBACK_T;
  let deepRz = bp.tubeRadiusZ;
  if (shoulder && arm) {
    const joint = shoulder.position.clone().add(arm.position.clone().applyQuaternion(shoulder.quaternion));
    jointY = joint.y;
    const dx = Math.abs(joint.x);
    const dz = Math.abs(joint.z - fwd);
    const inside = 1 - (dx / bp.tubeRadiusX) ** 2;
    if (inside > 1e-6) deepRz = Math.max(bp.tubeRadiusZ, dz / Math.sqrt(inside));
  }

  const count = SHOULDER_GIRDLE_RING_COUNT;
  const sigma = SHOULDER_GIRDLE_SIGMA;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const e = holdThenTaper(t);
    const y = t * spineLen;
    const bulge = Math.exp(-((y - jointY) ** 2) / (2 * sigma * sigma));
    rings.push({
      boneIndex: bi, boneName: bone.name, group: bp.group,
      y,
      fwd: THREE.MathUtils.lerp(fwd, neckFwd, e),
      rx: THREE.MathUtils.lerp(bp.tubeRadiusX, neckRx, e),
      rz: THREE.MathUtils.lerp(bp.tubeRadiusZ, neckRz, e) + (deepRz - bp.tubeRadiusZ) * bulge,
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
  /** Local X offset of the ring centre (cm), for asymmetric cross-sections such
   *  as the palm (the pinky side extends further than the thumb side). */
  xOff?: number;
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
    local.set(ring.rx * Math.cos(a) + (ring.xOff ?? 0), ring.y, ring.fwd + ring.rz * Math.sin(a));
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

export interface KnuckleWeb {
  /** Ring vertex index of the palm-side (+Z) seam. */
  front: number;
  /** Ring vertex index of the back-of-hand-side (−Z) seam. */
  back: number;
}

export interface KnuckleSplit {
  center: THREE.Vector3;
  xAxis: THREE.Vector3;
  zAxis: THREE.Vector3;
  /** Ring-plane normal (Newell), along the hand's +Y axis. */
  normal: THREE.Vector3;
  /** Three web chords (index↔middle, middle↔ring, ring↔pinky), front→back. */
  webs: KnuckleWeb[];
}

/**
 * Split a knuckle ring into finger plates by three straight web chords — the
 * hand analogue of the leg fan's crotch chord. Each web runs front→back at the
 * X midpoint between two adjacent fingers; the seams are the ring points the
 * chord attaches to. The four plates (index cap, middle quad, ring quad, pinky
 * cap) are assembled from these seams in the weld step.
 */
export function splitKnuckleRing(
  verts: THREE.Vector3[],
  fingerCenters: THREE.Vector3[],
): KnuckleSplit {
  const n = verts.length;
  const center = ringCentroid(verts);
  const normal = ringNormal(verts);

  const xDir = fingerCenters[fingerCenters.length - 1].clone().sub(fingerCenters[0]);
  xDir.addScaledVector(normal, -xDir.dot(normal));
  const xAxis = xDir.lengthSq() > 1e-9 ? xDir.normalize() : new THREE.Vector3(1, 0, 0);
  const zAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();

  const xOf = (p: THREE.Vector3) => p.clone().sub(center).dot(xAxis);
  const zOf = (p: THREE.Vector3) => p.clone().sub(center).dot(zAxis);

  const fingerXs = fingerCenters.map(xOf);
  const webXs: number[] = [];
  for (let i = 0; i + 1 < fingerXs.length; i++) webXs.push((fingerXs[i] + fingerXs[i + 1]) / 2);

  const seamAt = (wx: number, sign: number): number => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < n; i++) {
      if (zOf(verts[i]) * sign < 0) continue;
      const d = Math.abs(xOf(verts[i]) - wx);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  };

  const webs = webXs.map((wx) => ({ front: seamAt(wx, 1), back: seamAt(wx, -1) }));

  return { center, xAxis, zAxis, normal, webs };
}

/**
 * Assemble the knuckle ring into four closed finger plates — the hand analogue
 * of the leg fan's hemi-disks. Each plate is an ordered loop of ring-vertex
 * indices: index and pinky are end caps (one arc + one chord edge); middle and
 * ring are quads (palm arc + back arc + two chord edges). The chord is the
 * straight edge closing each loop, shared with the neighbouring plate.
 */
export function assembleKnucklePlates(
  verts: THREE.Vector3[],
  fingerCenters: THREE.Vector3[],
): number[][] {
  const split = splitKnuckleRing(verts, fingerCenters);
  if (split.webs.length < 3) return [];
  const n = verts.length;
  const [w0, w1, w2] = split.webs;

  const walk = (aIdx: number, bIdx: number, dir: 1 | -1): number[] => {
    const pts: number[] = [];
    if (dir > 0) {
      for (let i = aIdx; ; i = (i + 1) % n) {
        pts.push(i);
        if (i === bIdx) break;
      }
    } else {
      for (let i = aIdx; ; i = (i - 1 + n) % n) {
        pts.push(i);
        if (i === bIdx) break;
      }
    }
    return pts;
  };

  // index cap: front seam 0 → left extreme → back seam 0 (chord 0 closes it).
  // Reversed so all four plates wind the same way (matching the quads below).
  const indexLoop = walk(w0.front, w0.back, 1).reverse();
  // middle quad: palm arc (f0→f1) + back arc (b1→b0), chords 0/1 close it.
  const middleLoop = [...walk(w0.front, w1.front, -1), ...walk(w1.back, w0.back, -1)];
  // ring quad: palm arc (f1→f2) + back arc (b2→b1), chords 1/2 close it.
  const ringLoop = [...walk(w1.front, w2.front, -1), ...walk(w2.back, w1.back, -1)];
  // pinky cap: back seam 2 → right extreme → front seam 2 (chord 2 closes it).
  // Reversed so all four plates wind the same way (matching the quads above).
  const pinkyLoop = walk(w2.back, w2.front, 1).reverse();

  return [indexLoop, middleLoop, ringLoop, pinkyLoop];
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

function ringNormal(pts: THREE.Vector3[]): THREE.Vector3 {
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.lengthSq() > 1e-12 ? n.normalize() : new THREE.Vector3(0, 0, 1);
}

/**
 * Find the finger-ring vertex ordering that best aligns to a plate arc. The
 * winding is fixed by comparing the loops' Newell normals; the search then
 * resolves the rotational offset by minimising the distance from each finger
 * vertex to the nearest point along the plate arc.
 */
export function bestFingerRotation(plate: THREE.Vector3[], finger: THREE.Vector3[]): number[] {
  const n = finger.length;
  const m = plate.length;
  const reversed = ringNormal(plate).dot(ringNormal(finger)) < 0;

  let bestK = 0;
  let bestCost = Infinity;
  for (let k = 0; k < n; k++) {
    let cost = 0;
    for (let j = 0; j < n; j++) {
      const pi = Math.min(m - 1, Math.floor((j / n) * m));
      const raw = (j + k) % n;
      const idx = reversed ? n - 1 - raw : raw;
      cost += plate[pi].distanceToSquared(finger[idx]);
    }
    if (cost < bestCost) { bestCost = cost; bestK = k; }
  }

  const order: number[] = [];
  for (let j = 0; j < n; j++) {
    const raw = (j + bestK) % n;
    order.push(reversed ? n - 1 - raw : raw);
  }
  return order;
}

/**
 * Loft two closed vertex loops (possibly different lengths) into a tube. The
 * fan closes the palm's open end, so its winding is opposite the tube loft —
 * flip each triangle as it is emitted.
 */
function loftClosedLoops(a: number[], b: number[], indices: number[]): void {
  const strip: number[] = [];
  loftStrip([...a, a[0]], [...b, b[0]], strip);
  for (let i = 0; i < strip.length; i += 3) {
    indices.push(strip[i], strip[i + 2], strip[i + 1]);
  }
}

/**
 * Fan the girdle's bottom ring into the two upper-leg top rings (the crotch).
 * Each leg gets a "D"-shaped hemi-disk — the girdle arc plus the shared seam
 * chord — lofted 1:1 to its leg ring. The chord vertices (the crotch line) are
 * added here, weighted hips + both uplegs, and the girdle arc vertices are
 * re-weighted so the front follows the leg (groin) while the back stays on the
 * pelvis (buttock).
 */
function buildLegFan(
  spec: LegFanSpec,
  hips: THREE.Bone,
  upLegs: THREE.Bone[],
  boneIndex: Map<string, number>,
  ringBases: Map<string, number[]>,
  positions: number[],
  skinIndex: number[],
  skinWeight: number[],
  indices: number[],
  segments: number,
): void {
  if (upLegs.length < 2) return;
  const hipsBases = ringBases.get(hips.name);
  const leftBases = ringBases.get(upLegs[0].name);
  const rightBases = ringBases.get(upLegs[1].name);
  if (!hipsBases || !leftBases || !rightBases) return;

  const hipsBi = boneIndex.get(hips.name) ?? 0;
  const leftBi = boneIndex.get(upLegs[0].name) ?? 0;
  const rightBi = boneIndex.get(upLegs[1].name) ?? 0;

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
    skinWeight.push(...spec.chordWeights, 0);
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
      const uplegWeight = spec.arcMaxWeight * ((1 + Math.sin(a)) / 2);
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
 * Fan the palm's knuckle ring into the four finger start rings (the hand's
 * crotch-weld analogue). The knuckle ring's existing vertices are reused for the
 * plate arcs (so the fan is watertight with the palm tube), and each arc is
 * lofted onto its finger ring. The finger ring's vertices keep their finger
 * weights.
 */
function buildHandFan(
  hand: THREE.Bone,
  fingers: THREE.Bone[],
  ringBases: Map<string, number[]>,
  positions: number[],
  indices: number[],
  segments: number,
): void {
  const handBases = ringBases.get(hand.name);
  if (!handBases || handBases.length === 0) return;
  const knuckleBase = handBases[handBases.length - 1];

  const fingerBases = fingers
    .map((f) => ringBases.get(f.name)?.[0])
    .filter((f): f is number => f !== undefined);
  if (fingerBases.length < 4) return;

  const kv = readRing(positions, knuckleBase, segments);
  const fingerVerts = fingerBases.map((f) => readRing(positions, f, segments));
  const fingerCenters = fingerVerts.map(ringCentroid);
  const plates = assembleKnucklePlates(kv, fingerCenters);
  if (plates.length < 4) return;

  for (let i = 0; i < 4; i++) {
    const platePoints = plates[i].map((j) => kv[j]);
    const fingerOrder = bestFingerRotation(platePoints, fingerVerts[i]);
    const plateLoop = plates[i].map((j) => knuckleBase + j);
    const fingerLoop = fingerOrder.map((j) => fingerBases[i] + j);
    loftClosedLoops(plateLoop, fingerLoop, indices);
  }
}

/**
 * Cut a tight port around the thumb tube for each bracket ring, measured in the
 * hand's local X/Z plane (the palm's cross-section plane). Each ring gets its own
 * half-width so the port bulges in the middle (the thumb's fleshy base) and
 * tapers at the wrist and knuckle ends. Every cut is centred on the thumb root,
 * so the seam chains stay in line with the thumb instead of slanting.
 */
export function thumbPortCuts(
  rings: THREE.Vector3[][],
  inv: THREE.Matrix4,
  thumbLocal: THREE.Vector3,
  halfWidths: number[],
): {
  cuts: number[][];
  residuals: number[][];
  starts: number[];
  ends: number[];
} {
  const n = rings[0].length;
  const cuts: number[][] = [];
  const residuals: number[][] = [];
  const starts: number[] = [];
  const ends: number[] = [];

  for (let k = 0; k < rings.length; k++) {
    const ring = rings[k];
    const half = halfWidths[k];
    const inCut = new Array<boolean>(n);
    let first = -1;
    for (let j = 0; j < n; j++) {
      const p = ring[j].clone().applyMatrix4(inv);
      const dx = p.x - thumbLocal.x;
      const dz = p.z - thumbLocal.z;
      inCut[j] = dx * dx + dz * dz <= half * half;
      if (first === -1 && inCut[j]) first = j;
    }

    if (first === -1) {
      // No vertex in range: fall back to the single nearest vertex so the port
      // still closes (degenerate, but watertight).
      let best = 0;
      let bestD = Infinity;
      for (let j = 0; j < n; j++) {
        const p = ring[j].clone().applyMatrix4(inv);
        const d = (p.x - thumbLocal.x) ** 2 + (p.z - thumbLocal.z) ** 2;
        if (d < bestD) { bestD = d; best = j; }
      }
      cuts.push([best]);
      residuals.push(walkArc((best + 1) % n, best, n));
      starts.push(best);
      ends.push(best);
      continue;
    }

    let start = first;
    while (inCut[(start - 1 + n) % n]) {
      start = (start - 1 + n) % n;
      if (start === first) break;
    }
    let end = first;
    while (inCut[(end + 1) % n]) {
      end = (end + 1) % n;
      if (end === first) break;
    }

    cuts.push(walkArc(start, end, n));
    residuals.push(walkArc(end, start, n));
    starts.push(start);
    ends.push(end);
  }

  return { cuts, residuals, starts, ends };
}

function walkArc(aIdx: number, bIdx: number, n: number): number[] {
  const pts: number[] = [];
  for (let i = aIdx; ; i = (i + 1) % n) {
    pts.push(i);
    if (i === bIdx) break;
  }
  return pts;
}

/**
 * The contiguous hand-ring run the thumb port spans: from the wrist ring (the
 * proximal edge) up through the ring just above the thumb root (the distal
 * edge). The thumb is shallow to the hand, so its junction is an elongated slit
 * along the hand axis — the port uses every ring in this run, not just the two
 * that straddle the thumb root.
 */
export function thumbBracketRings(handLocalYs: number[], thumbLocalY: number): number[] {
  const order = handLocalYs.map((_, i) => i).sort((a, b) => handLocalYs[a] - handLocalYs[b]);
  if (order.length === 0) return [];
  let top = order.length - 1;
  for (let i = 0; i < order.length; i++) {
    if (thumbLocalY < handLocalYs[order[i]]) { top = i; break; }
  }
  return order.slice(0, top + 1);
}

/**
 * The consecutive ring run centred on a target Y — the bracket rings for a
 * perpendicular side port (arm → chest), whose hole is roughly circular rather
 * than the thumb's elongated slit.
 */
export function bracketRingsAround(localYs: number[], targetY: number, count: number): number[] {
  const order = localYs.map((_, i) => i).sort((a, b) => localYs[a] - localYs[b]);
  if (order.length === 0) return [];
  let below = 0;
  for (let i = 0; i < order.length; i++) {
    if (localYs[order[i]] > targetY) break;
    below = i;
  }
  const start = Math.max(0, Math.min(order.length - count, below - Math.floor((count - 1) / 2)));
  return order.slice(start, start + count);
}

/**
 * Bones in `bones` that are descendants of `root` and match `pattern`, ordered
 * left→right along the parent's X axis so fans/side-ports weld deterministically
 * (index→pinky, left→right).
 */
function childrenOf(root: THREE.Bone, pattern: RegExp, bones: THREE.Bone[]): THREE.Bone[] {
  const matches: THREE.Bone[] = [];
  for (const b of bones) {
    if (b === root || !pattern.test(b.name)) continue;
    for (let p = b.parent; p; p = p.parent) {
      if (p === root) { matches.push(b); break; }
    }
  }
  matches.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).x - b.getWorldPosition(new THREE.Vector3()).x);
  return matches;
}

/**
 * Cut side ports across a run of parent bracket rings and weld one or more
 * child rings to them (thumb → palm, arms → chest). The run is selected by
 * `spec.bracket`; each ring is split into per-child cut arcs and residual arcs
 * between consecutive holes, which re-loft the parent around the holes. Each
 * child ring welds to its own boundary loop (cut arcs + seam chains).
 */
function buildSidePorts(
  spec: SidePortSpec,
  parent: THREE.Bone,
  children: THREE.Bone[],
  ringBases: Map<string, number[]>,
  positions: number[],
  indices: number[],
  segments: number,
  params: (name: string) => BoneRingParams | null,
): void {
  const parentBases = ringBases.get(parent.name);
  if (!parentBases || children.length === 0) return;

  const inv = parent.matrixWorld.clone().invert();
  const localYs = parentBases.map((base) => ringCentroid(readRing(positions, base, segments)).applyMatrix4(inv).y);

  const childEntries = children
    .map((child) => {
      const childBase = ringBases.get(child.name)?.[0];
      return childBase === undefined ? null : {
        childBase,
        local: child.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv),
      };
    })
    .filter((e): e is { childBase: number; local: THREE.Vector3 } => e !== null);
  if (childEntries.length === 0) return;

  const run = spec.bracket === 'thumb'
    ? thumbBracketRings(localYs, childEntries[0].local.y)
    : bracketRingsAround(localYs, childEntries[0].local.y, spec.bracketCount ?? SHOULDER_PORT_BRACKET_COUNT);
  if (run.length < 2) return;
  const bases = run.map((i) => parentBases[i]);
  const rings = bases.map((base) => readRing(positions, base, segments));

  const childR = params(children[0].name)?.tubeRadiusX ?? spec.fallbackRadius;
  const halfWidths = bases.map((_, k) => childR * (
    spec.bracket === 'thumb'
      ? (k === 0 || k === bases.length - 1 ? spec.endWidth : spec.middleWidth)
      : (k === 1 && bases.length > 2 ? spec.middleWidth : spec.endWidth)
  ));

  const ports = childEntries.map((e) => thumbPortCuts(rings, inv, e.local, halfWidths));
  if (ports.some((p) => p.cuts[0].length < 2)) return;

  // Re-loft the residual arcs: with one hole per child, each ring's residual is
  // the arcs between consecutive holes (in circular order). For one child that
  // is the single complement arc; for two, the front and back arcs.
  const last = bases.length - 1;
  const order = ports.map((_, i) => i).sort((a, b) => ports[a].starts[0] - ports[b].starts[0]);
  const nPorts = ports.length;
  for (let g = 0; g < nPorts; g++) {
    const a = order[g];
    const b = order[(g + 1) % nPorts];
    for (let k = 0; k + 1 < bases.length; k++) {
      loftStrip(
        walkArc(ports[a].ends[k], ports[b].starts[k], segments).map((j) => bases[k] + j),
        walkArc(ports[a].ends[k + 1], ports[b].starts[k + 1], segments).map((j) => bases[k + 1] + j),
        indices,
      );
    }
  }

  // Weld each child ring to its own boundary loop (cut arcs + seam chains).
  for (let ci = 0; ci < childEntries.length; ci++) {
    const port = ports[ci];
    const portLoop: number[] = [];
    for (const j of [...port.cuts[0]].reverse()) portLoop.push(bases[0] + j);
    for (let k = 1; k < last; k++) portLoop.push(bases[k] + port.starts[k]);
    for (const j of port.cuts[last]) portLoop.push(bases[last] + j);
    for (let k = last - 1; k >= 1; k--) portLoop.push(bases[k] + port.ends[k]);

    const portPts = portLoop.map((v) => new THREE.Vector3(positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]));
    const childVerts = readRing(positions, childEntries[ci].childBase, segments);
    const childOrder = bestFingerRotation(portPts, childVerts);
    loftClosedLoops(portLoop, childOrder.map((j) => childEntries[ci].childBase + j), indices);
  }
}

/**
 * Weld every junction port configured by `PORT_SPECS`: resolve each spec's
 * parent and descendant-child bones, then dispatch to the fan or side-port
 * builder. The geometry lives in the builders; the bone wiring lives in the
 * table.
 */
function buildPorts(
  bones: THREE.Bone[],
  boneIndex: Map<string, number>,
  ringBases: Map<string, number[]>,
  positions: number[],
  skinIndex: number[],
  skinWeight: number[],
  indices: number[],
  segments: number,
  params: (name: string) => BoneRingParams | null,
): void {
  for (const spec of PORT_SPECS) {
    const parents = bones.filter((b) => spec.parent.test(b.name));
    for (const parent of parents) {
      const children = childrenOf(parent, spec.child, bones);
      if (children.length === 0) continue;
      if (spec.kind === 'fan') {
        if (spec.fan === 'leg') {
          buildLegFan(spec, parent, children, boneIndex, ringBases, positions, skinIndex, skinWeight, indices, segments);
        } else {
          buildHandFan(parent, children, ringBases, positions, indices, segments);
        }
      } else {
        buildSidePorts(spec, parent, children, ringBases, positions, indices, segments, params);
      }
    }
  }
}

/**
 * Cap the open ends of terminal finger/toe bones with a small dome: a fan from
 * the ring perimeter to a single apex vertex along the bone's +Y axis, so the
 * mesh has no open boundaries at the extremities. Other terminal bones (neck,
 * wrist) stay open because the head/hand ellipsoids cover them.
 */
function capTerminalEnds(
  bones: THREE.Bone[],
  boneIndex: Map<string, number>,
  ringBases: Map<string, number[]>,
  params: (name: string) => BoneRingParams | null,
  positions: number[],
  skinIndex: number[],
  skinWeight: number[],
  indices: number[],
  segments: number,
): void {
  for (const bone of bones) {
    if (bone.children.find((c) => c instanceof THREE.Bone)) continue; // terminal only
    const bp = params(bone.name);
    if (!bp || (bp.group !== 'finger' && bp.group !== 'toe')) continue;
    const bases = ringBases.get(bone.name);
    if (!bases || bases.length === 0) continue;
    const base = bases[0];
    const bi = boneIndex.get(bone.name) ?? 0;

    const capDistance = Math.min(bp.tubeRadiusX, bp.tubeRadiusZ);
    const apex = new THREE.Vector3(0, capDistance, 0).applyMatrix4(bone.matrixWorld);
    const apexIdx = positions.length / 3;
    positions.push(apex.x, apex.y, apex.z);
    skinIndex.push(bi, bi, 0, 0);
    skinWeight.push(1, 0, 0, 0);

    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      indices.push(base + j, apexIdx, base + j1);
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
      const childW: [number, number] = useParent ? [0, 0] : tubeSkinWeights(ring.t, TUBE_WEIGHT_INFLUENCE);
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

    // Spine2 tapers into the neck; its shoulder children are girdle branches
    // welded separately, so don't stitch the chain to whichever child is first.
    let child = bone.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
    if (params(bone.name)?.group === 'spine2') {
      child = (bone.children.find((c) => c instanceof THREE.Bone && c.name === 'mixamorigNeck') as THREE.Bone | undefined) ?? child;
    }
    const childStart = child ? ringBases.get(child.name)?.[0] : undefined;

    const stops = [...bases];
    // The hand's knuckle ring is fanned to the fingers (HP-8), not stitched
    // linearly to its first child.
    if (childStart !== undefined && params(bone.name)?.group !== 'hand') stops.push(childStart);

    // Side ports replace the parent strips across their bracket-ring runs, so
    // those strips are emitted by buildPorts instead of the generic loft.
    const skipStrips = new Set<number>();
    if (params(bone.name)?.group === 'hand') {
      const thumb = bone.children.find((c) => c instanceof THREE.Bone && /Thumb1$/.test(c.name)) as THREE.Bone | undefined;
      if (thumb) {
        const inv = bone.matrixWorld.clone().invert();
        const thumbLocalY = thumb.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y;
        const handLocalYs = bases.map((base) => ringCentroid(readRing(positions, base, segments)).applyMatrix4(inv).y);
        for (const k of thumbBracketRings(handLocalYs, thumbLocalY).slice(0, -1)) skipStrips.add(k);
      }
    } else if (params(bone.name)?.group === 'spine2') {
      const inv = bone.matrixWorld.clone().invert();
      const spine2LocalYs = bases.map((base) => ringCentroid(readRing(positions, base, segments)).applyMatrix4(inv).y);
      const shoulders = bone.children.filter((c) => c instanceof THREE.Bone && /Shoulder$/.test(c.name)) as THREE.Bone[];
      for (const shoulder of shoulders) {
        const arm = shoulder.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
        if (!arm) continue;
        const jointLocalY = arm.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv).y;
        for (const k of bracketRingsAround(spine2LocalYs, jointLocalY, SHOULDER_PORT_BRACKET_COUNT).slice(0, -1)) skipStrips.add(k);
      }
    }

    for (let i = 0; i + 1 < stops.length; i++) {
      if (skipStrips.has(i)) continue;
      const a = stops[i];
      const b = stops[i + 1];
      for (let j = 0; j < segments; j++) {
        const j1 = (j + 1) % segments;
        indices.push(a + j, b + j, a + j1, a + j1, b + j, b + j1);
      }
    }
  }

  // Weld the junction ports (legs, fingers, thumbs, arms) as configured by
  // PORT_SPECS.
  buildPorts(bones, boneIndex, ringBases, positions, skinIndex, skinWeight, indices, segments, params);

  // Cap the open finger/toe ends.
  capTerminalEnds(bones, boneIndex, ringBases, params, positions, skinIndex, skinWeight, indices, segments);

  return { positions, indices, skinIndex, skinWeight };
}

