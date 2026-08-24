import { describe, it, expect } from 'vitest';
import { loftRings, projectToSurface, boneRings } from './loft.js';
import { capsuleSDFScalar, smoothMin } from './sdf.js';

describe('loftRings', () => {
  it('stitches elliptical rings into a tube with outward normals', () => {
    const mesh = loftRings([
      { y: 0, z: 0, rx: 2, rz: 1 },
      { y: 1, z: 0, rx: 2, rz: 1 },
      { y: 2, z: 0, rx: 2, rz: 1 },
    ], 16);

    expect(mesh.positions.length).toBe(3 * 16 * 3);
    expect(mesh.indices.length).toBe((3 - 1) * 16 * 2 * 3);

    // Middle ring, segment 0 (angle 0) → (rx, y, z), outward normal +X.
    const base = 16 * 3;
    expect(mesh.positions[base]).toBeCloseTo(2, 5);
    expect(mesh.positions[base + 1]).toBeCloseTo(1, 5);
    expect(mesh.positions[base + 2]).toBeCloseTo(0, 5);
    expect(mesh.normals[base]).toBeCloseTo(1, 5);

    // Every face normal points outward (dot with its X/Z centroid > 0).
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const ia = mesh.indices[t] * 3, ib = mesh.indices[t + 1] * 3, ic = mesh.indices[t + 2] * 3;
      const ux = mesh.positions[ib] - mesh.positions[ia];
      const uy = mesh.positions[ib + 1] - mesh.positions[ia + 1];
      const uz = mesh.positions[ib + 2] - mesh.positions[ia + 2];
      const vx = mesh.positions[ic] - mesh.positions[ia];
      const vy = mesh.positions[ic + 1] - mesh.positions[ia + 1];
      const vz = mesh.positions[ic + 2] - mesh.positions[ia + 2];
      const nx = uy * vz - uz * vy;
      const nz = uz * vx - ux * vz;
      const cx = (mesh.positions[ia] + mesh.positions[ib] + mesh.positions[ic]) / 3;
      const cz = (mesh.positions[ia + 2] + mesh.positions[ib + 2] + mesh.positions[ic + 2]) / 3;
      expect(nx * cx + nz * cz).toBeGreaterThan(0);
    }
  });
});

describe('boneRings', () => {
  it('uses the tube cross-section for every ring', () => {
    const rings = boneRings({ tubeRadiusX: 4, tubeRadiusZ: 3.5, tubeOffsetForward: 2 }, 10, 5);
    for (const r of rings) {
      expect(r.rx).toBeCloseTo(4);
      expect(r.rz).toBeCloseTo(3.5);
      expect(r.z).toBeCloseTo(2);
    }
    expect(rings[0].y).toBeCloseTo(0);
    expect(rings[rings.length - 1].y).toBeCloseTo(10);
  });
});

describe('projectToSurface', () => {
  it('pulls points onto a smooth-min junction surface', () => {
    // Elbow: upper-arm capsule along +X meets forearm capsule along +Y.
    const sdf = (x: number, y: number, z: number) => smoothMin(
      capsuleSDFScalar(x, y, z, 0, 0, 0, 8, 0, 0, 2),
      capsuleSDFScalar(x, y, z, 8, 0, 0, 8, 8, 0, 2),
      2,
    );
    const positions = new Float32Array([7.9, 0.5, 0, 8.2, 0.5, 0, 8, 0.5, 0.5]);
    projectToSurface(positions, sdf, 6, 0.01);
    for (let i = 0; i < positions.length; i += 3) {
      expect(Number.isFinite(positions[i] + positions[i + 1] + positions[i + 2])).toBe(true);
      expect(Math.abs(sdf(positions[i], positions[i + 1], positions[i + 2]))).toBeLessThan(0.05);
    }
  });
});
