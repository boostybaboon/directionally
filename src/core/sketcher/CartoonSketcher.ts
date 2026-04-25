import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PolygonSketcher } from './PolygonSketcher.js';
import { ExtrusionHandle, buildExtrusionGeometry } from './ExtrusionHandle.js';
import { GlueManager } from './GlueManager.js';
import type { FaceGroupInfo, PartSnapshot, JointSnapshot, WeldGroupSnapshot, PartDraft, SessionSnapshot, SketcherDraft, SketcherPart, SketcherSession, AssemblyGroup, SketchMode } from './types.js';

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

const DEFAULT_COLOR = 0x8888cc;

/**
 * Build a flat cap polygon for a partial-angle lathe geometry.
 * Profile points are (r, h) 2D coords; phi is the sweep angle where the cap sits.
 * Cap at phi=0: no winding flip — CCW (r,h) winding produces outward normal (-1,0,0).
 * Cap at phi=phiLength: flip winding — produces outward normal (cos φ, 0, −sin φ).
 */
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
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  // Dummy UVs so mergeGeometries can combine with LatheGeometry (which has UVs).
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(profilePts.length * 2).fill(0), 2));
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
  // Clamp negative radii to 0, remove leading closing duplicate.
  let pts = profilePoints.map(([x, y]) => new THREE.Vector2(Math.max(0, x), y));
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (Math.abs(first.x - last.x) < 1e-6 && Math.abs(first.y - last.y) < 1e-6) pts = pts.slice(0, -1);
  }
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
  const latheGeo = new THREE.LatheGeometry(deduped, 32, 0, phiLength);
  if (phiLength >= Math.PI * 2 - 1e-6) {
    // Full 360°: profile segments close the solid; no caps needed.
    return withFaceGroups(latheGeo, [
      { normal: V(0, 1, 0), label: 'Surface', materialIndex: 0 },
    ]);
  }
  // Partial sweep: add a flat cap at each cut face.
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
function buildMaterials(geo: THREE.BufferGeometry, color: number, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial[] {
  const count = geo.groups.length > 0
    ? Math.max(...geo.groups.map((g) => g.materialIndex ?? 0)) + 1
    : 1;
  return Array.from({ length: count }, () => new THREE.MeshStandardMaterial({ color, side }));
}

type Phase = 'idle' | 'drawing' | 'pending-holes' | 'hole-drawing' | 'extruding' | 'revolve-drawing' | 'pending-revolve';

/**
 * Wires the PolygonSketcher → ExtrusionHandle pipeline into a complete
 * cartoon-style 3D sketching session.
 *
 * Usage:
 *   const sketcher = new CartoonSketcher(scene, camera);
 *   sketcher.startNewSketch();
 *   // … wire mouse events via onMouseMove / onClick / onPointerDown / onPointerUp
 *   sketcher.clearSession();
 *
 * The scene is mutated directly (Three.js helpers, preview meshes, completed parts).
 * The caller is responsible for the render loop.
 */
export class CartoonSketcher {
  private phase: Phase = 'idle';
  private readonly parts: SketcherPart[] = [];
  private _gridSnapSize = 0.1;
  /**
   * All parts ever created in this session, including those currently absent
   * from the scene (removed via removePart). Geometry and material are kept
   * alive here so restoreSnapshot() can reinsert them without re-creating GPU
   * resources. Cleared (and disposed) on clearSession().
   */
  private readonly allParts = new Map<string, SketcherPart>();
  private polygonSketcher: PolygonSketcher | null = null;
  private extrusionHandle: ExtrusionHandle | null = null;
  private outerOutline: THREE.Line | null = null;
  private pendingShape: THREE.Shape | null = null;
  private pendingCentroid: THREE.Vector3 | null = null;
  private nextId = 1;
  private readonly glue: GlueManager;

  /** Called whenever the extrusion depth changes during a drag (phase === 'extruding'). */
  onExtrusionDepthChanged?: (depth: number) => void;
  /** Called when a polygon is closed and the extrusion phase begins. */
  onExtrusionStarted?: () => void;
  /** Called when the outer polygon is closed and the shape is ready for optional holes. */
  onShapeReadyForHoles?: () => void;
  /** Called when the revolve profile polygon is closed and ready to commit. */
  onRevolveReady?: () => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.glue = new GlueManager(scene);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Begin a new polygon-drawing stroke.
   * @param mode   Drawing mode: 'polygon', 'rectangle', or 'circle'.
   * @param circleSegments  N-gon approximation quality for circle mode (default 32).
   */
  startNewSketch(mode: SketchMode = 'polygon', circleSegments = 32): void {
    this._endCurrentSketch();
    this.phase = 'drawing';
    this.polygonSketcher = new PolygonSketcher();
    this.polygonSketcher.snapSize = this._gridSnapSize;
    this.polygonSketcher.mode = mode;
    this.polygonSketcher.circleSegments = circleSegments;
    this.polygonSketcher.onShapeClosed = (shape, centroid) => {
      this._outerShapeClosed(shape, centroid);
    };
    this.scene.add(this.polygonSketcher.line);
    this.scene.add(this.polygonSketcher.rubberBand);
    this.scene.add(this.polygonSketcher.closureMarker);
  }

  /**
   * Begin a revolve-profile drawing stroke on the XY plane.
   * The Y axis (x=0) is the revolution axis. After the polygon closes,
   * onRevolveReady fires and the phase becomes 'pending-revolve'.
   * Call confirmLathe to commit the part or cancelPendingRevolve to discard.
   */
  startRevolveSketch(): void {
    this._endCurrentSketch();
    this.phase = 'revolve-drawing';
    this.polygonSketcher = new PolygonSketcher();
    this.polygonSketcher.snapSize = this._gridSnapSize;
    this.polygonSketcher.drawPlane = 'xy';
    this.polygonSketcher.onShapeClosed = (shape, centroid) => {
      this._revolutionShapeClosed(shape, centroid);
    };
    this.scene.add(this.polygonSketcher.line);
    this.scene.add(this.polygonSketcher.rubberBand);
    this.scene.add(this.polygonSketcher.closureMarker);
  }

  /**
   * Cancel an in-progress revolve sketch and return to idle.
   * No-op if not currently in the revolve-drawing phase.
   */
  cancelRevolveSketch(): void {
    if (this.phase !== 'revolve-drawing') return;
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /**
   * Cancel the pending revolve profile and return to idle.
   * No-op unless in pending-revolve phase.
   */
  cancelPendingRevolve(): void {
    if (this.phase !== 'pending-revolve') return;
    this.pendingShape = null;
    this.pendingCentroid = null;
    this.phase = 'idle';
  }

  /**
   * Cancel an in-progress polygon sketch and return to idle.
   * No-op if not currently in the drawing phase.
   */
  cancelSketch(): void {
    if (this.phase !== 'drawing') return;
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /**
   * Begin drawing a hole polygon for the currently-pending outer shape.
   * No-op unless in pending-holes phase.
   */
  addHole(): void {
    if (this.phase !== 'pending-holes') return;
    const holeSketcher = new PolygonSketcher();
    holeSketcher.snapSize = this._gridSnapSize;
    holeSketcher.onShapeClosed = (holeShape, holeCentroid) => {
      this._holeClosed(holeShape, holeCentroid);
    };
    this.polygonSketcher = holeSketcher;
    this.scene.add(holeSketcher.line);
    this.scene.add(holeSketcher.rubberBand);
    this.scene.add(holeSketcher.closureMarker);
    this.phase = 'hole-drawing';
  }

  /**
   * Confirm the pending outer shape (with any holes added so far) and enter
   * the extrusion phase. No-op unless in pending-holes phase.
   */
  confirmShape(): void {
    if (this.phase !== 'pending-holes' || !this.pendingShape || !this.pendingCentroid) return;
    const shape = this.pendingShape;
    const centroid = this.pendingCentroid;
    this.pendingShape = null;
    this.pendingCentroid = null;
    this._beginExtrusion(shape, centroid);
  }

  /**
   * Confirm the pending revolve profile as a solid of revolution.
   * Immediately commits a part — no depth-drag step. The profile drawn in
   * XY mode already has x=radial distance, y=height, so no rotation is applied.
   * No-op unless in pending-revolve phase.
   * @param phiLengthDeg Sweep angle in degrees (1–360). Default 360 = full revolution.
   */
  confirmLathe(phiLengthDeg = 360): void {
    if (this.phase !== 'pending-revolve' || !this.pendingShape || !this.pendingCentroid) return;
    const shape = this.pendingShape;
    const centroid = this.pendingCentroid;
    this.pendingShape = null;
    this.pendingCentroid = null;
    this.phase = 'idle';

    const phiLength = Math.max(1, Math.min(360, phiLengthDeg)) * Math.PI / 180;
    const profilePoints: [number, number][] = shape.getPoints().map((p) => [p.x, p.y]);
    const geo = buildLatheGeometry(profilePoints, phiLength);
    // centroid is (0,0,0) for XY-plane profiles; floor-snap on Y only.
    geo.computeBoundingBox();
    const minY = geo.boundingBox!.min.y;
    const materials = buildMaterials(geo, DEFAULT_COLOR, THREE.DoubleSide);
    const faceColors = Array<number>(geo.groups.length).fill(DEFAULT_COLOR);
    const faceTextures = Array<null>(geo.groups.length).fill(null);
    const mesh = new THREE.Mesh(geo, materials);
    mesh.position.set(centroid.x, -minY, centroid.z);
    this.scene.add(mesh);
    const part: SketcherPart = {
      id: `part-${this.nextId++}`,
      mesh,
      depth: 0,
      centroid: centroid.clone(),
      name: 'Lathe',
      color: DEFAULT_COLOR,
      shapePoints: null,
      holes: null,
      lathePoints: profilePoints,
      lathePhiLength: phiLength,
      faceColors,
      faceTextures,
    };
    this.parts.push(part);
    this.allParts.set(part.id, part);
  }

  /**
   * Cancel the current hole drawing and return to the pending-holes state.
   * No-op unless in hole-drawing phase.
   */
  cancelHole(): void {
    if (this.phase !== 'hole-drawing') return;
    this._endHoleSketcher();
    this.phase = 'pending-holes';
    this.onShapeReadyForHoles?.();
  }

  /**
   * Discard the pending outer shape and return to idle.
   * No-op unless in pending-holes phase.
   */
  cancelPendingShape(): void {
    if (this.phase !== 'pending-holes') return;
    this.pendingShape = null;
    this.pendingCentroid = null;
    this.phase = 'idle';
  }

  /** Remove all parts, joints, and groups, then reset to idle. */
  clearSession(): void {
    this.glue.dispose();
    for (const part of this.parts) {
      part.mesh.removeFromParent();
    }
    this.parts.length = 0;
    // Dispose ALL parts including those hibernated by removePart.
    for (const part of this.allParts.values()) {
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
    this.allParts.clear();
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /**
   * Insert a preset primitive by name (case-insensitive).
   * Returns the new part so the caller can auto-select it, or null if name is unknown.
   */
  insertPrimitive(name: string): SketcherPart | null {
    const preset = PRESET_BY_NAME.get(name.toLowerCase());
    if (!preset) return null;
    const geometry = preset.geometry();
    const materials = buildMaterials(geometry, DEFAULT_COLOR);
    const mesh = new THREE.Mesh(geometry, materials);
    // Sit the primitive on the floor (y = 0 ground plane).
    geometry.computeBoundingBox();
    mesh.position.y = -(geometry.boundingBox!.min.y);
    const part: SketcherPart = {
      id: `part-${this.nextId++}`,
      mesh,
      depth: 0,
      centroid: new THREE.Vector3(),
      name: preset.name,
      color: DEFAULT_COLOR,
      shapePoints: null,
      holes: null,
      lathePoints: null,
      lathePhiLength: null,
      faceColors: materials.map(() => DEFAULT_COLOR),
      faceTextures: materials.map(() => null),
    };
    this.scene.add(mesh);
    this.parts.push(part);
    this.allParts.set(part.id, part);
    return part;
  }

  /** All available preset names, in display order. */
  static get presetNames(): string[] {
    return PRIMITIVE_PRESETS.map((p) => p.name);
  }

  /** Update a part's colour, resetting all face colours to a uniform value. */
  setPartColor(id: string, color: number): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    part.color = color;
    part.faceColors.fill(color);
    (part.mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => m.color.setHex(color));
  }

  /** Update the colour of a single draw group. Does not change part.color. */
  setFaceColor(id: string, materialIndex: number, color: number): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    if (materialIndex < 0 || materialIndex >= part.faceColors.length) return;
    part.faceColors[materialIndex] = color;
    (part.mesh.material as THREE.MeshStandardMaterial[])[materialIndex].color.setHex(color);
  }

  /**
   * Assign a texture (data URL) to a single draw group, replacing any previous
   * texture on that slot. Pass null to clear the texture.
   */
  setFaceTexture(id: string, materialIndex: number, dataUrl: string | null): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    if (materialIndex < 0 || materialIndex >= part.faceTextures.length) return;
    const mat = (part.mesh.material as THREE.MeshStandardMaterial[])[materialIndex];
    // Dispose the existing texture before replacing it.
    if (mat.map) { mat.map.dispose(); mat.map = null; }
    part.faceTextures[materialIndex] = dataUrl;
    if (dataUrl) {
      mat.map = new THREE.TextureLoader().load(dataUrl);
      // Set color to white so the texture displays unmodified (MeshStandardMaterial multiplies color × map).
      mat.color.set(0xffffff);
    } else {
      // Restore the face's solid color when the texture is removed.
      mat.color.setHex(part.faceColors[materialIndex]);
    }
    mat.needsUpdate = true;
  }

  /**
   * Duplicate a part. The clone is offset by +1 on X and auto-returned so the
   * caller can select it. Returns null if the part is not found.
   */
  duplicatePart(id: string): SketcherPart | null {
    const src = this.parts.find((p) => p.id === id);
    if (!src) return null;
    const geo = src.mesh.geometry.clone();
    const mats = (src.mesh.material as THREE.MeshStandardMaterial[]).map((m) => m.clone());
    const mesh = new THREE.Mesh(geo, mats);
    mesh.position.copy(src.mesh.position);
    mesh.position.x += 1;
    mesh.rotation.copy(src.mesh.rotation);
    mesh.scale.copy(src.mesh.scale);
    // Create new textures from stored data URLs (do not share Texture instances).
    mats.forEach((m, i) => {
      if (m.map) { m.map.dispose(); m.map = null; }
      const url = src.faceTextures[i];
      if (url) { m.map = new THREE.TextureLoader().load(url); m.needsUpdate = true; }
    });
    const part: SketcherPart = {
      id: `part-${this.nextId++}`,
      mesh,
      depth: src.depth,
      centroid: src.centroid.clone(),
      name: src.name,
      color: src.color,
      shapePoints: src.shapePoints,
      holes: src.holes,
      lathePoints: src.lathePoints,
      lathePhiLength: src.lathePhiLength,
      faceColors: [...src.faceColors],
      faceTextures: [...src.faceTextures],
    };
    this.scene.add(mesh);
    this.parts.push(part);
    this.allParts.set(part.id, part);
    return part;
  }

  /**
   * Remove a single part by id.
   * Geometry and material are NOT disposed — the part stays in allParts so
   * SketcherDocument.undo() can reinsert it via restoreSnapshot() without
   * recreating GPU resources.
   */
  removePart(id: string): void {
    const idx = this.parts.findIndex((p) => p.id === id);
    if (idx === -1) return;
    // Unglue before removing from the parts list so BFS can still find neighbours.
    this.glue.unglueAll(id, this.parts);
    // Clean up residual group membership (for groups that stayed connected after unglue).
    this.glue.evictFromGroup(id, this.parts);
    const [part] = this.parts.splice(idx, 1);
    part.mesh.removeFromParent();
    // part remains in allParts for potential undo restoration.
  }

  /**
   * Translate a part (or its entire assembly group) downward so its lowest
   * vertex sits exactly on y = 0.
   *
   * mode 'group' (default): moves the whole group — or the standalone mesh —
   * so no joint re-evaluation is needed (the entire assembly moved uniformly).
   *
   * mode 'member': snaps only this mesh in group-edit mode, then calls
   * resolveConstraints so glue neighbours re-snap. Correct for non-rotated
   * groups (the group's Y offset is accounted for by the world-space box).
   */
  snapToFloor(id: string, mode: 'group' | 'member' = 'group'): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    if (mode === 'member') {
      const box = new THREE.Box3().setFromObject(part.mesh);
      part.mesh.position.y -= box.min.y;
      part.mesh.updateWorldMatrix(false, true);
      this.glue.resolveConstraints([id], this.parts);
    } else {
      const ag = this.glue.groupForPart(id);
      const root: THREE.Object3D = ag ? ag.group : part.mesh;
      const box = new THREE.Box3().setFromObject(root);
      root.position.y -= box.min.y;
    }
  }

  /**
   * Weld the given parts into a single rigid weld group at their current world
   * positions. All parts must be standalone (not already in any assembly group).
   * Returns the new AssemblyGroup, or null if the input is invalid.
   */
  weld(partIds: string[]): AssemblyGroup | null {
    if (partIds.length < 2) return null;
    const parts = partIds
      .map((id) => this.parts.find((p) => p.id === id))
      .filter((p): p is SketcherPart => p !== undefined);
    if (parts.length < 2) return null;
    // Reject if any part is already in an assembly group.
    for (const p of parts) {
      if (this.glue.groupForPart(p.id)) return null;
    }
    return this.glue.createWeldGroup(parts);
  }

  /**
   * Dissolve the weld group that contains the given part, returning all members
   * to the scene root at their current world positions.
   * No-op if the part is not in a weld group.
   */
  unweld(partId: string): void {
    if (!this.glue.isWeldGroup(partId)) return;
    const ag = this.glue.groupForPart(partId);
    if (!ag) return;
    this.glue.dissolveWeldGroup(ag.id, this.parts);
  }

  /** Return a snapshot of the current session. */
  getSession(): SketcherSession {
    return {
      parts: [...this.parts],
      joints: [...this.glue.getJoints()],
      assemblyGroups: [...this.glue.getAssemblyGroups()],
    };
  }

  /**
   * Expose the GlueManager so the page can call commitGlue, replayJoints,
   * unglue, getConnectedIds, and groupForPart directly.
   */
  get glueManager(): GlueManager {
    return this.glue;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** Number of holes added to the pending shape so far. 0 when not in pending-holes state. */
  get pendingHoleCount(): number {
    return this.pendingShape?.holes.length ?? 0;
  }

  /**
   * Set the grid snap size used by the polygon sketcher.
   * Takes effect on the current sketch (if active) and all future sketches.
   */
  set gridSnapSize(n: number) {
    this._gridSnapSize = n;
    if (this.polygonSketcher) this.polygonSketcher.snapSize = n;
  }

  get gridSnapSize(): number {
    return this._gridSnapSize;
  }

  /**
   * Programmatically set the extrusion depth (e.g. from a numeric input).
   * No-op when not in the extruding phase.
   */
  setExtrusionDepth(d: number): void {
    if (!this.extrusionHandle || this.phase !== 'extruding') return;
    const oldMesh = this.extrusionHandle.mesh;
    const newMesh = this.extrusionHandle.setDepth(d);
    this.scene.remove(oldMesh);
    this.scene.add(newMesh);
  }

  // ── Mouse event handlers (NDC coords) ──────────────────────────────────────

  onMouseMove(ndcX: number, ndcY: number): void {
    if (this.phase === 'drawing' || this.phase === 'hole-drawing' || this.phase === 'revolve-drawing') {
      this.polygonSketcher?.onMouseMove(ndcX, ndcY, this.camera);
    }
  }

  onClick(ndcX: number, ndcY: number): void {
    if (this.phase === 'drawing' || this.phase === 'hole-drawing' || this.phase === 'revolve-drawing') {
      this.polygonSketcher?.onClick(ndcX, ndcY, this.camera);
    }
  }

  /**
   * Call from a pointerdown event. Returns true if the extrusion handle
   * consumed the event (caller should suppress orbit controls for this gesture).
   */
  onPointerDown(ndcX: number, ndcY: number): boolean {
    if (this.phase !== 'extruding' || !this.extrusionHandle) return false;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = raycaster.intersectObject(this.extrusionHandle.handle, true);
    if (hits.length === 0) return false;
    this.extrusionHandle.startDrag(hits[0].point.y);
    return true;
  }

  /**
   * Call from a pointermove event while a drag may be active.
   * Returns the updated mesh if a rebuild occurred.
   */
  onPointerMove(ndcX: number, ndcY: number): THREE.Mesh | null {
    if (this.phase !== 'extruding' || !this.extrusionHandle?.isDragging) return null;
    // Project mouse onto a vertical plane at the handle's world X/Z to track Y.
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const handlePos = this.extrusionHandle.handle.position;
    const vertPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion).normalize(), 0);
    vertPlane.constant = -vertPlane.normal.dot(handlePos);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(vertPlane, hit)) return null;
    const oldMesh = this.extrusionHandle.mesh;
    const newMesh = this.extrusionHandle.onDrag(hit.y);
    if (newMesh) {
      this.scene.remove(oldMesh);
      this.scene.add(newMesh);
    }
    return newMesh;
  }

  /** Call from a pointerup event to commit the extrusion. */
  onPointerUp(): void {
    if (this.phase !== 'extruding' || !this.extrusionHandle) return;
    this.extrusionHandle.endDrag();
  }

  dispose(): void {
    this.glue.dispose();
    this.clearSession();
  }

  /**
   * Capture a plain-data snapshot of the current session.
   * Uses world-space transforms so positions are correct regardless of group
   * parentage. Joints are recorded in local space (unchanged by group transforms).
   * Weld groups are captured by part-id lists so they can be re-created on restore.
   */
  takeSnapshot(): SessionSnapshot {
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    const parts: PartSnapshot[] = this.parts.map((p) => {
      p.mesh.updateWorldMatrix(true, false);
      p.mesh.matrixWorld.decompose(wp, wq, ws);
      return {
        id: p.id,
        worldPosition: [wp.x, wp.y, wp.z],
        worldQuaternionXYZW: [wq.x, wq.y, wq.z, wq.w],
        worldScale: [ws.x, ws.y, ws.z],
        color: p.color,
        faceColors: [...p.faceColors],
        faceTextures: [...p.faceTextures],
      };
    });
    const joints: JointSnapshot[] = this.glue.getJoints().map((j) => ({
      partAId: j.partAId,
      localPointA: [j.localPointA.x, j.localPointA.y, j.localPointA.z],
      localNormalA: [j.localNormalA.x, j.localNormalA.y, j.localNormalA.z],
      partBId: j.partBId,
      localPointB: [j.localPointB.x, j.localPointB.y, j.localPointB.z],
      localNormalB: [j.localNormalB.x, j.localNormalB.y, j.localNormalB.z],
    }));
    // Capture ALL assembly groups (weld and glue) so undo/redo restores grouped state.
    const weldGroups: WeldGroupSnapshot[] = this.glue.getAssemblyGroups()
      .map((ag) => ({ partIds: [...ag.partIds], isWeld: this.glue.isWeldGroup(ag.partIds[0]) }));
    return { parts, joints, weldGroups };
  }

  /**
   * Rebuild the Three.js scene to match a plain-data snapshot.
   * All currently-present meshes are removed; the correct subset from allParts
   * is re-added at their snapshotted world positions; joints are re-registered
   * (no repositioning — world positions already reflect the glued state).
   */
  restoreSnapshot(snap: SessionSnapshot): void {
    // Remove all current meshes from their parents (group or scene root).
    for (const part of this.parts) {
      part.mesh.removeFromParent();
    }
    // Dissolve all groups and clear the joint list.
    this.glue.dispose();
    this.parts.length = 0;

    // Restore part meshes at world-space transforms from the snapshot.
    for (const ps of snap.parts) {
      const part = this.allParts.get(ps.id);
      if (!part) continue;
      part.mesh.position.set(ps.worldPosition[0], ps.worldPosition[1], ps.worldPosition[2]);
      part.mesh.quaternion.set(
        ps.worldQuaternionXYZW[0], ps.worldQuaternionXYZW[1],
        ps.worldQuaternionXYZW[2], ps.worldQuaternionXYZW[3],
      );
      part.mesh.scale.set(ps.worldScale[0], ps.worldScale[1], ps.worldScale[2]);
      part.mesh.updateWorldMatrix(false, true);
      part.color = ps.color;
      part.faceColors = [...ps.faceColors];
      part.faceTextures = [...ps.faceTextures];
      (part.mesh.material as THREE.MeshStandardMaterial[]).forEach((m, i) => {
        m.color.setHex(ps.faceColors[i] ?? ps.color);
        if (m.map) { m.map.dispose(); m.map = null; }
        const url = ps.faceTextures[i] ?? null;
        if (url) { m.map = new THREE.TextureLoader().load(url); }
        m.needsUpdate = true;
      });
      this.scene.add(part.mesh);
      this.parts.push(part);
    }

    // Re-register joints (no group creation here — groups are rebuilt below).
    for (const js of snap.joints) {
      const partA = this.parts.find((p) => p.id === js.partAId);
      const partB = this.parts.find((p) => p.id === js.partBId);
      if (partA && partB) {
        this.glue.registerJoint(
          partA,
          new THREE.Vector3(js.localPointA[0], js.localPointA[1], js.localPointA[2]),
          new THREE.Vector3(js.localNormalA[0], js.localNormalA[1], js.localNormalA[2]),
          partB,
          new THREE.Vector3(js.localPointB[0], js.localPointB[1], js.localPointB[2]),
          new THREE.Vector3(js.localNormalB[0], js.localNormalB[1], js.localNormalB[2]),
        );
      }
    }

    // Rebuild all assembly groups from snapshot data (preserves weld/glue types).
    this.glue.rebuildGroupsFromSnapshot(snap.weldGroups ?? [], this.parts);
  }

  /**
   * Serialise the current session to a plain-data JSON-safe draft.
   * Call on every mutation (debounced) and write to localStorage to survive page refresh.
   */
  toDraft(): SketcherDraft {
    const wp = new THREE.Vector3();
    const wq = new THREE.Quaternion();
    const ws = new THREE.Vector3();
    const parts: PartDraft[] = this.parts.map((p) => {
      p.mesh.updateWorldMatrix(true, false);
      p.mesh.matrixWorld.decompose(wp, wq, ws);
      const draft: PartDraft = {
        id: p.id,
        kind: p.shapePoints !== null ? 'sketch' : (p.lathePoints !== null ? 'lathed' : 'primitive'),
        name: p.name,
        position: [wp.x, wp.y, wp.z],
        quaternion: [wq.x, wq.y, wq.z, wq.w],
        scale: [ws.x, ws.y, ws.z],
        color: p.color,
        faceColors: [...p.faceColors],
        faceTextures: [...p.faceTextures],
      };
      if (p.shapePoints !== null) {
        draft.shapePoints = p.shapePoints;
        draft.depth = p.depth;
        if (p.holes && p.holes.length > 0) draft.holes = p.holes;
      }
      if (p.lathePoints !== null) {
        draft.lathePoints = p.lathePoints;
        if (p.lathePhiLength !== null && p.lathePhiLength < Math.PI * 2 - 1e-6) {
          draft.phiLength = p.lathePhiLength;
        }
      }
      return draft;
    });
    const joints: JointSnapshot[] = this.glue.getJoints().map((j) => ({
      partAId: j.partAId,
      localPointA: [j.localPointA.x, j.localPointA.y, j.localPointA.z],
      localNormalA: [j.localNormalA.x, j.localNormalA.y, j.localNormalA.z],
      partBId: j.partBId,
      localPointB: [j.localPointB.x, j.localPointB.y, j.localPointB.z],
      localNormalB: [j.localNormalB.x, j.localNormalB.y, j.localNormalB.z],
    }));
    const weldGroups: WeldGroupSnapshot[] = this.glue.getAssemblyGroups().map((ag) => ({
      partIds: [...ag.partIds],
      isWeld: this.glue.isWeldGroup(ag.partIds[0]),
    }));
    return { version: 2, parts, joints, weldGroups };
  }

  /**
   * Reconstruct the Three.js scene from a plain-data draft (the inverse of toDraft).
   * Clears the current session first. Part ids are preserved so the nextId counter
   * is advanced past the highest restored id to avoid collisions.
   */
  loadDraft(draft: SketcherDraft): void {
    this.clearSession();
    this.nextId = 1;

    for (const pd of draft.parts) {
      let geometry: THREE.BufferGeometry;
      let shapePoints: [number, number][] | null = null;
      let lathePoints: [number, number][] | null = null;
      let lathePhiLength: number | null = null;
      let depth = 0;
      let centroid = new THREE.Vector3();

      if (pd.kind === 'primitive') {
        const preset = PRESET_BY_NAME.get(pd.name.toLowerCase());
        if (!preset) continue;
        geometry = preset.geometry();
      } else if (pd.kind === 'lathed') {
        if (!pd.lathePoints) continue;
        lathePoints = pd.lathePoints;
        lathePhiLength = pd.phiLength ?? Math.PI * 2;
        geometry = buildLatheGeometry(pd.lathePoints, lathePhiLength);
      } else {
        if (!pd.shapePoints || !pd.depth) continue;
        shapePoints = pd.shapePoints;
        depth = pd.depth;
        const pts = pd.shapePoints.map(([x, y]) => new THREE.Vector2(x, y));
        const shape = new THREE.Shape(pts);
        if (pd.holes) {
          for (const holePts of pd.holes) {
            shape.holes.push(new THREE.Path(holePts.map(([x, y]) => new THREE.Vector2(x, y))));
          }
        }
        geometry = buildExtrusionGeometry(shape, depth);
      }

      const materials = buildMaterials(geometry, pd.color, lathePoints !== null ? THREE.DoubleSide : THREE.FrontSide);
      const faceColors = pd.faceColors ? [...pd.faceColors] : materials.map(() => pd.color);
      faceColors.forEach((c, i) => { if (i < materials.length) materials[i].color.setHex(c); });
      const faceTextures = pd.faceTextures ? [...pd.faceTextures] : materials.map(() => null);
      faceTextures.forEach((url, i) => {
        if (url && i < materials.length) {
          materials[i].map = new THREE.TextureLoader().load(url);
          materials[i].needsUpdate = true;
        }
      });
      const mesh = new THREE.Mesh(geometry, materials);
      mesh.position.set(pd.position[0], pd.position[1], pd.position[2]);
      mesh.quaternion.set(pd.quaternion[0], pd.quaternion[1], pd.quaternion[2], pd.quaternion[3]);
      mesh.scale.set(pd.scale[0], pd.scale[1], pd.scale[2]);
      mesh.updateWorldMatrix(false, true);

      const part: SketcherPart = { id: pd.id, mesh, depth, centroid, name: pd.name, color: pd.color, shapePoints, holes: pd.holes ? pd.holes : null, lathePoints, lathePhiLength, faceColors, faceTextures };
      this.scene.add(mesh);
      this.parts.push(part);
      this.allParts.set(part.id, part);

      const num = parseInt(pd.id.replace('part-', ''), 10);
      if (!isNaN(num) && num >= this.nextId) this.nextId = num + 1;
    }

    for (const js of draft.joints) {
      const partA = this.parts.find((p) => p.id === js.partAId);
      const partB = this.parts.find((p) => p.id === js.partBId);
      if (partA && partB) {
        this.glue.registerJoint(
          partA,
          new THREE.Vector3(js.localPointA[0], js.localPointA[1], js.localPointA[2]),
          new THREE.Vector3(js.localNormalA[0], js.localNormalA[1], js.localNormalA[2]),
          partB,
          new THREE.Vector3(js.localPointB[0], js.localPointB[1], js.localPointB[2]),
          new THREE.Vector3(js.localNormalB[0], js.localNormalB[1], js.localNormalB[2]),
        );
      }
    }

    this.glue.rebuildGroupsFromSnapshot(draft.weldGroups ?? [], this.parts);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

   private _beginExtrusion(shape: THREE.Shape, centroid: THREE.Vector3): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }

    this.phase = 'extruding';
    const shapePoints: [number, number][] = shape.getPoints().map((v) => [v.x, v.y]);
    const holePoints: [number, number][][] = shape.holes.map((h) => h.getPoints().map((v) => [v.x, v.y]));
    const handle = new ExtrusionHandle(shape, centroid);
    handle.onExtrusionComplete = (mesh, depth) => {
      this._commitPart(mesh, depth, centroid, shapePoints, holePoints);
    };
    handle.onDepthChanged = (depth) => { this.onExtrusionDepthChanged?.(depth); };
    this.extrusionHandle = handle;
    this.scene.add(handle.handle);
    this.scene.add(handle.mesh);
    this.onExtrusionStarted?.();
  }

  private _commitPart(mesh: THREE.Mesh, depth: number, centroid: THREE.Vector3, shapePoints: [number, number][], holes: [number, number][][] = []): void {
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.extrusionHandle.handle.geometry.dispose();
      this.extrusionHandle.handle.children.forEach((c) => ((c as THREE.Mesh).geometry as THREE.BufferGeometry)?.dispose());
      (this.extrusionHandle.handle.material as THREE.Material).dispose();
      this.extrusionHandle = null;
    }
    const faceColors = Array<number>(mesh.geometry.groups.length).fill(DEFAULT_COLOR);
    const faceTextures = Array<null>(mesh.geometry.groups.length).fill(null);
    this.parts.push({ id: `part-${this.nextId++}`, mesh, depth, centroid: centroid.clone(), name: 'Shape', color: DEFAULT_COLOR, shapePoints, holes: holes.length > 0 ? holes : null, lathePoints: null, lathePhiLength: null, faceColors, faceTextures });
    const part = this.parts[this.parts.length - 1];
    this.allParts.set(part.id, part);
    this.phase = 'idle';
  }

  private _endCurrentSketch(): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
    if (this.outerOutline) {
      this.scene.remove(this.outerOutline);
      this.outerOutline.geometry.dispose();
      (this.outerOutline.material as THREE.Material).dispose();
      this.outerOutline = null;
    }
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.scene.remove(this.extrusionHandle.mesh);
      this.extrusionHandle.dispose();
      this.extrusionHandle = null;
    }
    this.pendingShape = null;
    this.pendingCentroid = null;
  }

  private _endHoleSketcher(): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
  }

  private _revolutionShapeClosed(shape: THREE.Shape, centroid: THREE.Vector3): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
    this.pendingShape = shape;
    this.pendingCentroid = centroid;
    this.phase = 'pending-revolve';
    this.onRevolveReady?.();
  }

  private _outerShapeClosed(shape: THREE.Shape, centroid: THREE.Vector3): void {
    // Keep the closed outline visible as a context guide during hole drawing.
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      // Hold a reference to the line so we can remove it later; dispose only the other resources.
      this.outerOutline = this.polygonSketcher.line;
      this.polygonSketcher.rubberBand.geometry.dispose();
      this.polygonSketcher.closureMarker.geometry.dispose();
      (this.polygonSketcher.rubberBand.material as THREE.Material).dispose();
      (this.polygonSketcher.closureMarker.material as THREE.Material).dispose();
      this.polygonSketcher = null;
    }
    this.pendingShape = shape;
    this.pendingCentroid = centroid;
    this.phase = 'pending-holes';
    this.onShapeReadyForHoles?.();
  }

  private _holeClosed(holeShape: THREE.Shape, holeCentroid: THREE.Vector3): void {
    this._endHoleSketcher();
    this.phase = 'pending-holes';

    if (!this.pendingShape || !this.pendingCentroid) {
      this.onShapeReadyForHoles?.();
      return;
    }

    // Translate hole points from hole-centroid-relative space to outer-centroid-relative space.
    // _closeShape maps: shape.x = world.x - cx, shape.y = cz - world.z
    // So hole.x + (hcx - cx) and hole.y + (cz - hcz) gives outer space.
    const cx = this.pendingCentroid.x;
    const cz = this.pendingCentroid.z;
    const hcx = holeCentroid.x;
    const hcz = holeCentroid.z;
    const dx = hcx - cx;
    const dy = cz - hcz;
    const translatedPts = holeShape.getPoints().map((p) => new THREE.Vector2(p.x + dx, p.y + dy));

    // Bounding-box pre-check: skip holes that obviously extend outside the outer shape.
    const outerPts = this.pendingShape.getPoints();
    const outerMinX = Math.min(...outerPts.map((p) => p.x));
    const outerMaxX = Math.max(...outerPts.map((p) => p.x));
    const outerMinY = Math.min(...outerPts.map((p) => p.y));
    const outerMaxY = Math.max(...outerPts.map((p) => p.y));
    const holeMinX = Math.min(...translatedPts.map((p) => p.x));
    const holeMaxX = Math.max(...translatedPts.map((p) => p.x));
    const holeMinY = Math.min(...translatedPts.map((p) => p.y));
    const holeMaxY = Math.max(...translatedPts.map((p) => p.y));
    if (holeMinX < outerMinX || holeMaxX > outerMaxX || holeMinY < outerMinY || holeMaxY > outerMaxY) {
      // Hole extends outside the outer shape; discard silently.
      this.onShapeReadyForHoles?.();
      return;
    }

    const holePath = new THREE.Path(translatedPts);
    this.pendingShape.holes.push(holePath);
    this.onShapeReadyForHoles?.();
  }
}
