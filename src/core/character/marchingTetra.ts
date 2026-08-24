import * as THREE from 'three';

export interface MarchingResult {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

/** The 6-tetra decomposition of a cube along its body diagonal (corner 0 → 6). */
const CUBE_TETS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 1, 2, 6],
  [0, 2, 3, 6],
  [0, 3, 7, 6],
  [0, 7, 4, 6],
  [0, 4, 5, 6],
  [0, 5, 1, 6],
];

/** The 6 edges of a tetra, as local vertex-index pairs. */
const TET_EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 0],
  [0, 3],
  [1, 3],
  [2, 3],
];

/**
 * Polygonizes a signed-distance field (negative inside, zero on the surface)
 * into an indexed triangle mesh using marching tetrahedra. Each grid cell
 * splits into 6 tets along its body diagonal; surface vertices are shared per
 * corner-pair, so the result is watertight. Normals are the central-difference
 * gradient of the field (outward for a distance field).
 */
function polygonize(
  sdf: (p: THREE.Vector3) => number,
  min: THREE.Vector3,
  max: THREE.Vector3,
  nx: number,
  ny: number,
  nz: number,
): MarchingResult {
  const sx = (max.x - min.x) / nx;
  const sy = (max.y - min.y) / ny;
  const sz = (max.z - min.z) / nz;
  const cx = nx + 1;
  const cy = ny + 1;
  const cz = nz + 1;

  const corners: THREE.Vector3[] = new Array(cx * cy * cz);
  const field = new Float32Array(cx * cy * cz);
  {
    const p = new THREE.Vector3();
    let i = 0;
    for (let iz = 0; iz < cz; iz++) {
      for (let iy = 0; iy < cy; iy++) {
        for (let ix = 0; ix < cx; ix++) {
          p.set(min.x + ix * sx, min.y + iy * sy, min.z + iz * sz);
          corners[i] = p.clone();
          field[i] = sdf(p);
          i++;
        }
      }
    }
  }

  const cornerIndex = (ix: number, iy: number, iz: number): number => (iz * cy + iy) * cx + ix;

  const totalCorners = cx * cy * cz;
  const vertexByEdge = new Map<number, number>();
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];

  const eps = 0.5 * Math.min(sx, sy, sz);

  const edgeVertex = (ci: number, cj: number): number => {
    const lo = Math.min(ci, cj);
    const hi = Math.max(ci, cj);
    const key = lo * totalCorners + hi;
    const found = vertexByEdge.get(key);
    if (found !== undefined) return found;

    const fi = field[ci];
    const fj = field[cj];
    const t = Math.abs(fj - fi) < 1e-12 ? 0.5 : fi / (fi - fj);
    const a = corners[ci];
    const b = corners[cj];
    const px = a.x + (b.x - a.x) * t;
    const py = a.y + (b.y - a.y) * t;
    const pz = a.z + (b.z - a.z) * t;

    // Outward normal = normalised central-difference gradient of the field.
    const g = new THREE.Vector3();
    const gx = sdf(g.set(px + eps, py, pz)) - sdf(g.set(px - eps, py, pz));
    const gy = sdf(g.set(px, py + eps, pz)) - sdf(g.set(px, py - eps, pz));
    const gz = sdf(g.set(px, py, pz + eps)) - sdf(g.set(px, py, pz - eps));
    let nx = gx;
    let ny = gy;
    let nz = gz;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 0;
      nz = 1;
    }

    const vi = positions.length / 3;
    positions.push(px, py, pz);
    normals.push(nx, ny, nz);
    vertexByEdge.set(key, vi);
    return vi;
  };

  for (let iz = 0; iz < nz; iz++) {
    for (let iy = 0; iy < ny; iy++) {
      for (let ix = 0; ix < nx; ix++) {
        const c = [
          cornerIndex(ix, iy, iz),
          cornerIndex(ix + 1, iy, iz),
          cornerIndex(ix + 1, iy + 1, iz),
          cornerIndex(ix, iy + 1, iz),
          cornerIndex(ix, iy, iz + 1),
          cornerIndex(ix + 1, iy, iz + 1),
          cornerIndex(ix + 1, iy + 1, iz + 1),
          cornerIndex(ix, iy + 1, iz + 1),
        ];

        for (const tet of CUBE_TETS) {
          let mask = 0;
          for (let k = 0; k < 4; k++) {
            if (field[c[tet[k]]] < 0) mask |= 1 << k;
          }
          if (mask === 0 || mask === 15) continue;

          // Crossing edges (one endpoint inside, the other outside).
          const crossing: Array<{ a: number; b: number; vi: number }> = [];
          for (const [ea, eb] of TET_EDGES) {
            const insideA = (mask >> ea) & 1;
            const insideB = (mask >> eb) & 1;
            if (insideA !== insideB) {
              crossing.push({ a: ea, b: eb, vi: edgeVertex(c[tet[ea]], c[tet[eb]]) });
            }
          }

          if (crossing.length === 3) {
            indices.push(crossing[0].vi, crossing[1].vi, crossing[2].vi);
          } else {
            // Four crossing edges form a quad; order into a loop and fan it.
            const ordered = [crossing[0]];
            const rest = crossing.slice(1);
            let current = crossing[0].b;
            while (rest.length > 0) {
              const idx = rest.findIndex((e) => e.a === current || e.b === current);
              const e = rest.splice(idx, 1)[0];
              ordered.push(e);
              current = e.a === current ? e.b : e.a;
            }
            indices.push(ordered[0].vi, ordered[1].vi, ordered[2].vi);
            indices.push(ordered[0].vi, ordered[2].vi, ordered[3].vi);
          }
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
  };
}

/** Polygonize with a uniform grid resolution on all three axes. */
export function marchingTetra(
  sdf: (p: THREE.Vector3) => number,
  min: THREE.Vector3,
  max: THREE.Vector3,
  resolution: number,
): MarchingResult {
  return polygonize(sdf, min, max, resolution, resolution, resolution);
}

/** Polygonize with a per-axis cell count derived from a target grid step (cm). */
export function marchingTetraByStep(
  sdf: (p: THREE.Vector3) => number,
  min: THREE.Vector3,
  max: THREE.Vector3,
  step: number,
): MarchingResult {
  const nx = Math.max(1, Math.ceil((max.x - min.x) / step));
  const ny = Math.max(1, Math.ceil((max.y - min.y) / step));
  const nz = Math.max(1, Math.ceil((max.z - min.z) / step));
  return polygonize(sdf, min, max, nx, ny, nz);
}
