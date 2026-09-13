import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { FaceGroupInfo } from './types.js';

// Pure geometry/material helpers, shared by the Realiser (`realise.ts`) and the
// interactive Sketcher. No Sketcher state lives here — only Document → THREE.

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function withFaceGroups(geo: THREE.BufferGeometry, groups: FaceGroupInfo[]): THREE.BufferGeometry {
  geo.userData.faceGroups = groups;
  // Geometries like SphereGeometry and CapsuleGeometry have no built-in draw
  // groups. THREE.Mesh renders nothing when given a material array but an empty
  // groups array, so add one covering group here.
  if (geo.groups.length === 0) {
    const indexCount = geo.index ? geo.index.count : geo.attributes.position.count;
    geo.addGroup(0, indexCount, 0);
  }
  return geo;
}

type PrimitivePreset = { name: string; geometry: () => THREE.BufferGeometry };

const PRIMITIVE_PRESETS: PrimitivePreset[] = [
  {
    name: 'Box',
    geometry: () => withFaceGroups(new THREE.BoxGeometry(1, 1, 1), [
      { normal: V(1, 0, 0),  label: '+X',        materialIndex: 0 },
      { normal: V(-1, 0, 0), label: '−X',        materialIndex: 1 },
      { normal: V(0, 1, 0),  label: 'Top',       materialIndex: 2 },
      { normal: V(0, -1, 0), label: 'Bottom',    materialIndex: 3 },
      { normal: V(0, 0, 1),  label: '+Z',        materialIndex: 4 },
      { normal: V(0, 0, -1), label: '−Z',        materialIndex: 5 },
    ]),
  },
  {
    name: 'Sphere',
    geometry: () => withFaceGroups(new THREE.SphereGeometry(0.75, 16, 12), [
      { normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 },
    ]),
  },
  {
    name: 'Cylinder',
    geometry: () => withFaceGroups(new THREE.CylinderGeometry(0.3, 0.3, 2, 16), [
      { normal: V(1, 0, 0),  label: 'Barrel',     materialIndex: 0 },
      { normal: V(0, 1, 0),  label: 'Top cap',    materialIndex: 1 },
      { normal: V(0, -1, 0), label: 'Bottom cap', materialIndex: 2 },
    ]),
  },
  {
    name: 'Capsule',
    geometry: () => withFaceGroups(new THREE.CapsuleGeometry(0.3, 1, 4, 8), [
      { normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 },
    ]),
  },
  {
    name: 'Cone',
    // ConeGeometry is CylinderGeometry with radiusTop=0. Three.js skips the top
    // cap group but still assigns materialIndex=2 to the bottom cap, so the
    // material array must cover indices 0–2 even though index 1 is unused.
    geometry: () => withFaceGroups(new THREE.ConeGeometry(0.5, 2, 16), [
      { normal: V(1, 0, 0),  label: 'Barrel',     materialIndex: 0 },
      { normal: V(0, -1, 0), label: 'Bottom cap', materialIndex: 2 },
    ]),
  },
  {
    name: 'Torus',
    geometry: () => withFaceGroups(new THREE.TorusGeometry(0.5, 0.2, 12, 24), [
      { normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 },
    ]),
  },
];

/** Lookup by lowercase name for the UI insert action. */
const PRESET_BY_NAME = new Map(PRIMITIVE_PRESETS.map((p) => [p.name.toLowerCase(), p]));

/**
 * Build a flat cap polygon for a partial-angle lathe geometry.
 * Profile points are (r, h) 2D coords; phi is the sweep angle where the cap sits.
 * Cap at phi=0: no winding flip — CCW (r,h) winding produces outward normal (-1,0,0).
 * Cap at phi=phiLength: flip winding — produces outward normal (cos φ, 0, −sin φ).
 */
/** Rewrite the V channel of LatheGeometry UVs so V = (world.y - yMin) / yRange.
 *  LatheGeometry assigns V = profilePointIndex / (numPoints - 1), which flips when the
 *  profile is drawn top-to-bottom. Normalising to world Y makes V always 0 at the bottom
 *  and 1 at the top, matching the cap UV convention. */
function _normalizeLatheV(geo: THREE.BufferGeometry): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < yMin) yMin = y;
    if (y > yMax) yMax = y;
  }
  const yRange = yMax - yMin || 1;
  for (let i = 0; i < uv.count; i++) uv.setY(i, (pos.getY(i) - yMin) / yRange);
  uv.needsUpdate = true;
}

function buildCapGeometry(profilePts: THREE.Vector2[], phi: number, flipWinding: boolean): THREE.BufferGeometry {
  const sinPhi = Math.sin(phi);
  const cosPhi = Math.cos(phi);
  const positions: number[] = [];
  for (const p of profilePts) {
    positions.push(p.x * sinPhi, p.y, p.x * cosPhi);
  }
  const indices2d = THREE.ShapeUtils.triangulateShape(profilePts, []);
  const indexArray: number[] = [];
  for (const [a, b, c] of indices2d) {
    if (flipWinding) {
      indexArray.push(a, c, b);
    } else {
      indexArray.push(a, b, c);
    }
  }
  // Planar UVs: U = radial distance normalised to [0,1], V = height normalised to [0,1].
  // Both caps use the same profile bounding box so V is consistent with the lathe surface.
  let xMax = 0, yMin = Infinity, yMax = -Infinity;
  for (const p of profilePts) {
    if (p.x > xMax) xMax = p.x;
    if (p.y < yMin) yMin = p.y;
    if (p.y > yMax) yMax = p.y;
  }
  const xRange = xMax || 1;
  const yRange = yMax - yMin || 1;
  const uvArray: number[] = [];
  for (const p of profilePts) uvArray.push(p.x / xRange, (p.y - yMin) / yRange);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvArray, 2));
  geo.setIndex(indexArray);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build a LatheGeometry from a centroid-relative profile (clamps negative x to 0).
 * The profile is revolved around the Y axis; x=radial distance, y=height along Y.
 * For phiLength < 2π, two flat end caps are merged in as separate draw groups.
 */
function buildLatheGeometry(profilePoints: [number, number][], phiLength = Math.PI * 2): THREE.BufferGeometry {
  // Clamp negative radii to 0.
  let pts = profilePoints.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y));
  // Remove consecutive duplicates produced by clamping.
  const deduped: THREE.Vector2[] = [];
  for (const p of pts) {
    const prev = deduped[deduped.length - 1];
    if (!prev || Math.abs(p.x - prev.x) >= 1e-6 || Math.abs(p.y - prev.y) >= 1e-6) deduped.push(p);
  }
  if (deduped.length < 2) {
    return withFaceGroups(new THREE.CylinderGeometry(0.1, 0.1, 1, 32), [
      { normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 },
    ]);
  }

  // Build a separate point list for LatheGeometry that explicitly closes the
  // profile when both endpoints have positive radius (hollow shape away from the
  // axis). THREE.Shape.getPoints() never includes a closing duplicate, so without
  // this LatheGeometry misses the inner-wall segment.
  // We do NOT mutate `deduped` — caps receive the open profile to avoid passing
  // a duplicate endpoint to ShapeUtils.triangulateShape (which produces NaN UVs).
  const lathePts = [...deduped];
  if (lathePts.length > 1) {
    const first = lathePts[0], last = lathePts[lathePts.length - 1];
    const alreadyClosed = Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6;
    if (!alreadyClosed && first.x > 1e-4 && last.x > 1e-4) {
      lathePts.push(first.clone());
    }
  }

  const latheGeo = new THREE.LatheGeometry(lathePts, 32, 0, phiLength);
  // Normalise V so it always runs 0 (bottom) → 1 (top) regardless of sketch draw direction.
  _normalizeLatheV(latheGeo);
  if (phiLength >= Math.PI * 2 - 1e-6) {
    // Full 360°: profile segments close the solid; no caps needed.
    return withFaceGroups(latheGeo, [
      { normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 },
    ]);
  }
  // Partial sweep: caps use the open profile (deduped, not lathePts) so
  // ShapeUtils.triangulateShape never receives a duplicate closing vertex.
  const cap0 = buildCapGeometry(deduped, 0, false);
  const capEnd = buildCapGeometry(deduped, phiLength, true);
  latheGeo.addGroup(0, latheGeo.index!.count, 0);
  const merged = mergeGeometries([latheGeo, cap0, capEnd], true);
  if (!merged) {
    return withFaceGroups(latheGeo, [{ normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 }]);
  }
  return withFaceGroups(merged, [
    { normal: V(0, 1, 0),                                     label: 'Surface',   materialIndex: 0 },
    { normal: V(-1, 0, 0),                                    label: 'Cap start', materialIndex: 1 },
    { normal: V(Math.cos(phiLength), 0, -Math.sin(phiLength)), label: 'Cap end',  materialIndex: 2 },
  ]);
}

/** Create one MeshStandardMaterial per draw group, covering all materialIndex values in geometry.groups. */
function buildMaterials(geo: THREE.BufferGeometry, color: number, defaultSide: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial[] {
  const holeStart: number = geo.userData.holeWallMaterialStart ?? Infinity;
  const holeEnd: number = geo.userData.holeWallMaterialEnd ?? -1;
  const count = geo.groups.length > 0
    ? Math.max(...geo.groups.map((g) => g.materialIndex ?? 0)) + 1
    : 1;
  return Array.from({ length: count }, (_, i) => {
    const side = (i >= holeStart && i <= holeEnd) ? THREE.DoubleSide : defaultSide;
    return new THREE.MeshStandardMaterial({ color, side });
  });
}

export { V, PRIMITIVE_PRESETS, PRESET_BY_NAME, buildLatheGeometry, buildMaterials };


