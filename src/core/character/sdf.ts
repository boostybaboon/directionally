import * as THREE from 'three';

/**
 * Signed-distance primitives for the HP-5 body field. Distances are negative
 * inside, positive outside, zero on the surface — the convention marching
 * tetrahedra expects. All units are centimetres, matching `BoneParams`.
 */

/** Allocation-free capsule distance: segment (ax,ay,az)→(bx,by,bz) with radius `r`. */
export function capsuleSDFScalar(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  r: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  const len2 = bax * bax + bay * bay + baz * baz;
  const h = len2 < 1e-12 ? 0 : THREE.MathUtils.clamp((pax * bax + pay * bay + paz * baz) / len2, 0, 1);
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/** Signed distance to a capsule: line segment `a`→`b` with radius `r`. */
export function capsuleSDF(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3, r: number): number {
  return capsuleSDFScalar(p.x, p.y, p.z, a.x, a.y, a.z, b.x, b.y, b.z, r);
}

/** Allocation-free ellipsoid distance (scaled-sphere approximation; exact for a sphere). */
export function ellipsoidSDFScalar(
  px: number, py: number, pz: number,
  cx: number, cy: number, cz: number,
  rx: number, ry: number, rz: number,
): number {
  const dx = (px - cx) / rx, dy = (py - cy) / ry, dz = (pz - cz) / rz;
  const k = Math.min(rx, ry, rz);
  return (Math.sqrt(dx * dx + dy * dy + dz * dz) - 1) * k;
}

/**
 * Signed distance to an ellipsoid. Uses the scaled-sphere approximation
 * (`length((p-c)/r) - 1` scaled by the smallest radius); exact for a sphere,
 * a good cartoon approximation otherwise.
 */
export function ellipsoidSDF(p: THREE.Vector3, c: THREE.Vector3, r: THREE.Vector3): number {
  return ellipsoidSDFScalar(p.x, p.y, p.z, c.x, c.y, c.z, r.x, r.y, r.z);
}

/**
 * Polynomial smooth-min (Inigo Quilez). `k` is the blend radius: fields closer
 * than `k` merge, and the result bulges below the plain min (smooth union).
 * `k = 0` degenerates to `Math.min`.
 */
export function smoothMin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b);
  const h = THREE.MathUtils.clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return h * a + (1 - h) * b - k * h * (1 - h);
}

/**
 * A body primitive — a capsule or ellipsoid owned by a bone. `bone` is the
 * skeleton bone index, used to derive skin weights from the field.
 */
export type SdfPrimitive =
  | { kind: 'capsule'; a: THREE.Vector3; b: THREE.Vector3; radius: number; bone: number }
  | { kind: 'ellipsoid'; center: THREE.Vector3; radius: THREE.Vector3; bone: number };

export function primitiveSDF(p: THREE.Vector3, prim: SdfPrimitive): number {
  if (prim.kind === 'capsule') return capsuleSDF(p, prim.a, prim.b, prim.radius);
  return ellipsoidSDF(p, prim.center, prim.radius);
}

/** Per-primitive signed distances at `p` (parallel to `prims`). */
export function primitiveDistances(p: THREE.Vector3, prims: SdfPrimitive[]): number[] {
  return prims.map((prim) => primitiveSDF(p, prim));
}

/** Smooth union of all primitives — the body's single signed-distance field. */
export function smoothUnionField(p: THREE.Vector3, prims: SdfPrimitive[], k: number): number {
  if (prims.length === 0) return Infinity;
  let d = primitiveSDF(p, prims[0]);
  for (let i = 1; i < prims.length; i++) d = smoothMin(d, primitiveSDF(p, prims[i]), k);
  return d;
}
