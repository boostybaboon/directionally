import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { capsuleSDF, smoothMin } from './sdf.js';
import { marchingTetra } from './marchingTetra.js';
import { deriveFieldWeights } from './fieldSkinning.js';

/** Number of connected components via union-find over triangle edges. */
function countComponents(positions: Float32Array, indices: Uint32Array): number {
  const n = positions.length / 3;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (a: number, b: number): void => {
    parent[find(a)] = find(b);
  };
  for (let t = 0; t < indices.length; t += 3) {
    union(indices[t], indices[t + 1]);
    union(indices[t + 1], indices[t + 2]);
  }
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}

describe('HP-5 spike: SDF limb', () => {
  const a0 = new THREE.Vector3(0, 0, 0);
  const b0 = new THREE.Vector3(8, 0, 0);
  const a1 = new THREE.Vector3(8, 0, 0);
  const b1 = new THREE.Vector3(8, 8, 0);
  const radius = 2;

  const field = (p: THREE.Vector3): number =>
    smoothMin(capsuleSDF(p, a0, b0, radius), capsuleSDF(p, a1, b1, radius), 2.5);

  it('meshes an L-shaped joint as one connected surface', () => {
    const mesh = marchingTetra(field, new THREE.Vector3(-4, -4, -4), new THREE.Vector3(12, 12, 4), 28);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(countComponents(mesh.positions, mesh.indices)).toBe(1);

    // Every vertex lies on the surface (field ≈ 0).
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = new THREE.Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
      expect(Math.abs(field(p))).toBeLessThan(1.5);
    }
  });

  it('derives single-bone weights mid-shaft and blended weights at the elbow', () => {
    const mesh = marchingTetra(field, new THREE.Vector3(-4, -4, -4), new THREE.Vector3(12, 12, 4), 28);
    let sawSingle = false;
    let sawBlend = false;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = new THREE.Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
      const d = [capsuleSDF(p, a0, b0, radius), capsuleSDF(p, a1, b1, radius)];
      const { weights } = deriveFieldWeights(d, [0, 1], 1.5);
      expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      if (weights[0] > 0.99 || weights[1] > 0.99) sawSingle = true;
      if (weights[0] > 0.1 && weights[1] > 0.1) sawBlend = true;
    }
    expect(sawSingle).toBe(true);
    expect(sawBlend).toBe(true);
  });

  it('skins a straight limb to a 2-bone chain and bends without tearing', () => {
    const sa = new THREE.Vector3(0, 0, 0);
    const sb = new THREE.Vector3(8, 0, 0);
    const fa = new THREE.Vector3(8, 0, 0);
    const fb = new THREE.Vector3(16, 0, 0);
    const straight = (p: THREE.Vector3): number =>
      smoothMin(capsuleSDF(p, sa, sb, radius), capsuleSDF(p, fa, fb, radius), 2.5);

    const mesh = marchingTetra(straight, new THREE.Vector3(-4, -4, -4), new THREE.Vector3(20, 4, 4), 32);

    const allIndices: number[][] = [];
    const allWeights: number[][] = [];
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p = new THREE.Vector3(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
      const d = [capsuleSDF(p, sa, sb, radius), capsuleSDF(p, fa, fb, radius)];
      const w = deriveFieldWeights(d, [0, 1], 1.5);
      allIndices.push(w.indices);
      allWeights.push(w.weights);
    }

    // Bind pose: bone 0 at origin, bone 1 as child at the elbow (8,0,0).
    const bone0 = new THREE.Bone();
    const bone1 = new THREE.Bone();
    bone1.position.set(8, 0, 0);
    bone0.add(bone1);
    bone0.updateMatrixWorld(true);
    const bindInverse = [bone0.matrixWorld.clone().invert(), bone1.matrixWorld.clone().invert()];

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(mesh.normals, 3));
    const si = new Float32Array(mesh.positions.length);
    const sw = new Float32Array(mesh.positions.length);
    for (let v = 0; v < allIndices.length; v++) {
      for (let c = 0; c < 4; c++) {
        si[v * 4 + c] = allIndices[v][c];
        sw[v * 4 + c] = allWeights[v][c];
      }
    }
    geo.setAttribute('skinIndex', new THREE.Float32BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(new THREE.BufferAttribute(mesh.indices, 1));

    const skinned = new THREE.SkinnedMesh(geo, new THREE.MeshBasicMaterial());
    const skeleton = new THREE.Skeleton([bone0, bone1]);
    skinned.bind(skeleton);
    expect(skeleton.boneInverses.length).toBe(2);

    // Bend the forearm 90° around the elbow and re-apply LBS by hand.
    bone1.rotation.z = Math.PI / 2;
    bone0.updateMatrixWorld(true);

    let maxEdge = 0;
    const p = new THREE.Vector3();
    const da = new THREE.Vector3();
    const db = new THREE.Vector3();
    const deform = (vi: number, out: THREE.Vector3): void => {
      out.set(0, 0, 0);
      p.set(mesh.positions[vi * 3], mesh.positions[vi * 3 + 1], mesh.positions[vi * 3 + 2]);
      for (let c = 0; c < 4; c++) {
        if (allWeights[vi][c] === 0) continue;
        const bone = allIndices[vi][c];
        const tmp = new THREE.Vector3()
          .copy(p)
          .applyMatrix4(bindInverse[bone])
          .applyMatrix4(bone === 0 ? bone0.matrixWorld : bone1.matrixWorld)
          .multiplyScalar(allWeights[vi][c]);
        out.add(tmp);
      }
    };
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const v0 = mesh.indices[t];
      const v1 = mesh.indices[t + 1];
      const v2 = mesh.indices[t + 2];
      for (const [va, vb] of [[v0, v1], [v1, v2], [v2, v0]] as const) {
        deform(va, da);
        deform(vb, db);
        maxEdge = Math.max(maxEdge, da.distanceTo(db));
      }
    }
    expect(Number.isFinite(maxEdge)).toBe(true);
    expect(maxEdge).toBeLessThan(5); // a torn seam would open edges of ~8+
  });
});

