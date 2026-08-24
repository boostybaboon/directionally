/**
 * Derives per-vertex bone weights from per-primitive signed distances (HP-5).
 *
 * The body is a smooth-min union of bone primitives; a vertex on the union
 * surface near two bones gets blended weight between them, while a mid-shaft
 * vertex is single-bone. Each primitive's distance is passed through a softmax
 * (clamped at zero so interior points saturate), aggregated per bone (a bone
 * may own several primitives, e.g. the two chest ellipsoids of a bust), and
 * reduced to the 4 strongest influences — matching the skinIndex/skinWeight
 * channel width.
 */
export function deriveFieldWeights(
  distances: number[],
  boneOf: number[],
  sigma: number,
): { indices: number[]; weights: number[] } {
  const perBone = new Map<number, number>();
  for (let i = 0; i < distances.length; i++) {
    const w = Math.exp(-Math.max(0, distances[i]) / sigma);
    perBone.set(boneOf[i], (perBone.get(boneOf[i]) ?? 0) + w);
  }
  const top = Array.from(perBone.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  const sum = top.reduce((s, e) => s + e[1], 0) || 1;

  const indices = new Array<number>(4).fill(0);
  const weights = new Array<number>(4).fill(0);
  for (let i = 0; i < top.length; i++) {
    indices[i] = top[i][0];
    weights[i] = top[i][1] / sum;
  }
  return { indices, weights };
}
