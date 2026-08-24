/**
 * Elliptical lofting for the HP-6 body (Part 5). A bone is a stack of
 * cross-section rings (ellipses in the bone's X/Z plane) stitched into a tube.
 * Junctions are handled by projecting the near-junction rings onto a local
 * smooth-min field — see `projectToSurface` — rather than meshing the field
 * globally.
 */

export interface LoftRing {
  /** Centre Y along the bone axis. */
  y: number;
  /** Centre Z offset (character-forward). */
  z: number;
  /** X half-width. */
  rx: number;
  /** Z half-depth. */
  rz: number;
}

export interface LoftMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/**
 * Stitch a stack of elliptical rings into a triangle tube. `segments` is the
 * number of points per ring; normals are the analytic elliptical-cylinder
 * outward normal in the ring's local frame.
 */
export function loftRings(rings: LoftRing[], segments = 16): LoftMesh {
  const ringCount = rings.length;
  const positions = new Float32Array(ringCount * segments * 3);
  const normals = new Float32Array(ringCount * segments * 3);
  const indices: number[] = [];

  for (let i = 0; i < ringCount; i++) {
    const r = rings[i];
    for (let j = 0; j < segments; j++) {
      const a = (j / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      const p = (i * segments + j) * 3;
      positions[p] = r.rx * c;
      positions[p + 1] = r.y;
      positions[p + 2] = r.z + r.rz * s;
      let nx = c / r.rx;
      let nz = s / r.rz;
      const len = Math.hypot(nx, nz) || 1;
      normals[p] = nx / len;
      normals[p + 1] = 0;
      normals[p + 2] = nz / len;
    }
  }

  for (let i = 0; i < ringCount - 1; i++) {
    const a = i * segments;
    const b = (i + 1) * segments;
    for (let j = 0; j < segments; j++) {
      const j1 = (j + 1) % segments;
      indices.push(a + j, b + j, a + j1, a + j1, b + j, b + j1);
    }
  }

  return { positions, normals, indices: new Uint32Array(indices) };
}

/** Newton-project a single point onto the zero level-set of `sdf`. */
export function projectPointToSurface(
  x: number,
  y: number,
  z: number,
  sdf: (x: number, y: number, z: number) => number,
  iterations = 4,
  eps = 0.02,
): [number, number, number] {
  for (let k = 0; k < iterations; k++) {
    const f = sdf(x, y, z);
    const gx = (sdf(x + eps, y, z) - sdf(x - eps, y, z)) / (2 * eps);
    const gy = (sdf(x, y + eps, z) - sdf(x, y - eps, z)) / (2 * eps);
    const gz = (sdf(x, y, z + eps) - sdf(x, y, z - eps)) / (2 * eps);
    const n2 = gx * gx + gy * gy + gz * gz;
    if (n2 < 1e-12) break;
    x -= (f * gx) / n2;
    y -= (f * gy) / n2;
    z -= (f * gz) / n2;
  }
  return [x, y, z];
}

/**
 * Newton-project each vertex onto the zero level-set of `sdf` (negative
 * inside). Used to knit lofted tubes into a junction: near a junction, project
 * the rings onto `smoothMin` of the meeting tubes so the surface blends
 * instead of creasing. Converges in a few iterations because a well-formed SDF
 * has near-unit gradient.
 */
export function projectToSurface(
  positions: Float32Array,
  sdf: (x: number, y: number, z: number) => number,
  iterations = 4,
  eps = 0.02,
): void {
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = projectPointToSurface(positions[i], positions[i + 1], positions[i + 2], sdf, iterations, eps);
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
  }
}

/** The cross-section radii of a bone's tube (a subset of `BoneParams`). */
export interface BoneShape {
  tubeRadiusX: number;
  tubeRadiusZ: number;
  tubeOffsetForward?: number;
}

/**
 * Rings along a bone, using the tube cross-section (not the ball joint) for
 * every ring — the rings follow the cylinder, and the junctions are knitted
 * separately. `length` is the distance to the child bone.
 */
export function boneRings(shape: BoneShape, length: number, ringCount = 5): LoftRing[] {
  const fwd = shape.tubeOffsetForward ?? 0;
  const rings: LoftRing[] = [];
  for (let i = 0; i < ringCount; i++) {
    const t = ringCount === 1 ? 0 : i / (ringCount - 1);
    rings.push({ y: t * length, z: fwd, rx: shape.tubeRadiusX, rz: shape.tubeRadiusZ });
  }
  return rings;
}
