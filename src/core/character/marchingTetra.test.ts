import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { marchingTetra } from './marchingTetra.js';
import { capsuleSDF, smoothMin } from './sdf.js';

interface Mesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/** Number of connected components via union-find over triangle edges. */
function countComponents(mesh: Mesh): number {
  const n = mesh.positions.length / 3;
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
  for (let t = 0; t < mesh.indices.length; t += 3) {
    union(mesh.indices[t], mesh.indices[t + 1]);
    union(mesh.indices[t + 1], mesh.indices[t + 2]);
  }
  const roots = new Set<number>();
  for (let i = 0; i < n; i++) roots.add(find(i));
  return roots.size;
}

/** True when every triangle edge is shared by exactly two triangles (watertight). */
function isClosed(mesh: Mesh): boolean {
  const counts = new Map<string, number>();
  const key = (a: number, b: number): string => `${Math.min(a, b)}_${Math.max(a, b)}`;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const i0 = mesh.indices[t];
    const i1 = mesh.indices[t + 1];
    const i2 = mesh.indices[t + 2];
    for (const [a, b] of [[i0, i1], [i1, i2], [i2, i0]] as const) {
      const k = key(a, b);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
  }
  for (const v of counts.values()) if (v !== 2) return false;
  return true;
}

describe('marchingTetra', () => {
  it('meshes a sphere: a closed shell with outward normals', () => {
    const sphere = (p: THREE.Vector3): number => p.length() - 5;
    const mesh = marchingTetra(sphere, new THREE.Vector3(-8, -8, -8), new THREE.Vector3(8, 8, 8), 24);

    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions.length).toBe(mesh.normals.length);

    for (let i = 0; i < mesh.positions.length; i += 3) {
      const x = mesh.positions[i];
      const y = mesh.positions[i + 1];
      const z = mesh.positions[i + 2];
      const r = Math.hypot(x, y, z);
      expect(r).toBeGreaterThan(3);
      expect(r).toBeLessThan(7);
      // Normals point outward for a sphere centred at the origin.
      const dot = (x * mesh.normals[i] + y * mesh.normals[i + 1] + z * mesh.normals[i + 2]) / r;
      expect(dot).toBeGreaterThan(0.5);
    }

    expect(isClosed(mesh)).toBe(true);
    expect(countComponents(mesh)).toBe(1);
  });

  it('smooth-min bridges a gap that a hard union leaves split', () => {
    const a = new THREE.Vector3(-5, 0, 0);
    const b = new THREE.Vector3(-2, 0, 0);
    const c = new THREE.Vector3(2, 0, 0);
    const d = new THREE.Vector3(5, 0, 0);
    const bounds = { min: new THREE.Vector3(-7, -3, -3), max: new THREE.Vector3(7, 3, 3) };

    const hard = marchingTetra(
      (p) => Math.min(capsuleSDF(p, a, b, 1), capsuleSDF(p, c, d, 1)),
      bounds.min, bounds.max, 24,
    );
    const soft = marchingTetra(
      (p) => smoothMin(capsuleSDF(p, a, b, 1), capsuleSDF(p, c, d, 1), 5),
      bounds.min, bounds.max, 24,
    );

    expect(countComponents(hard)).toBe(2);
    expect(countComponents(soft)).toBe(1);
  });
});
