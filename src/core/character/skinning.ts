import * as THREE from 'three';

/**
 * Procedural linear-blend skinning weights (HP-0.5, "zero → first order" step).
 *
 * The body is generated, so per-vertex bone weights can be computed directly
 * from each vertex's parametric position along its tube — no weight painting and
 * no heat-diffusion solver. A tube spans bone A (t=0) to bone B (t=1); vertices
 * are owned by bone A except near the far end, where they blend onto bone B so
 * adjacent tubes share the joint and the seam closes.
 */

/** Clamped smoothstep — 0 at x≤0, 1 at x≥1, C1-smooth in between. */
export function smoothstep01(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * Bone weights for a vertex at parametric position `t` along a tube spanning
 * bone A (t=0) to bone B (t=1). Mid-segment vertices are single-bone (A); the
 * far end blends to B over the last `influence` fraction of the segment. Always
 * sums to 1.
 */
export function tubeSkinWeights(t: number, influence = 0.3): [number, number] {
  const start = 1 - influence;
  const wB = t <= start ? 0 : smoothstep01((t - start) / influence);
  return [1 - wB, wB];
}

/**
 * Assigns per-vertex `skinIndex` / `skinWeight` attributes to a unit cylinder's
 * vertices (radius 1, height 1, Y from -0.5 to +0.5). The bottom rim (t=0) maps
 * to `boneA`, the top rim (t=1) to `boneB`. Channels 2 and 3 stay zero — each
 * vertex has at most two influences.
 */
export function assignTubeWeights(
  geometry: THREE.CylinderGeometry,
  boneA: number,
  boneB: number,
  influence = 0.3,
): { skinIndex: Float32Array; skinWeight: Float32Array } {
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const count = pos.count;
  const skinIndex = new Float32Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const t = pos.getY(i) + 0.5;
    const [wA, wB] = tubeSkinWeights(t, influence);
    skinIndex[i * 4] = boneA;
    skinIndex[i * 4 + 1] = boneB;
    skinWeight[i * 4] = wA;
    skinWeight[i * 4 + 1] = wB;
  }
  return { skinIndex, skinWeight };
}
