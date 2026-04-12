import * as THREE from 'three';
import { PolygonSketcher } from './PolygonSketcher.js';
import { ExtrusionHandle, buildExtrusionGeometry } from './ExtrusionHandle.js';
import { GlueManager } from './GlueManager.js';
import type { FaceGroupInfo, PartSnapshot, JointSnapshot, WeldGroupSnapshot, PartDraft, SessionSnapshot, SketcherDraft, SketcherPart, SketcherSession, AssemblyGroup } from './types.js';

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
];

/** Lookup by lowercase name for the UI insert action. */
const PRESET_BY_NAME = new Map(PRIMITIVE_PRESETS.map((p) => [p.name.toLowerCase(), p]));

const DEFAULT_COLOR = 0x8888cc;

/** Create one MeshStandardMaterial per draw group, covering all materialIndex values in geometry.groups. */
function buildMaterials(geo: THREE.BufferGeometry, color: number): THREE.MeshStandardMaterial[] {
  const count = geo.groups.length > 0
    ? Math.max(...geo.groups.map((g) => g.materialIndex ?? 0)) + 1
    : 1;
  return Array.from({ length: count }, () => new THREE.MeshStandardMaterial({ color }));
}

type Phase = 'idle' | 'drawing' | 'extruding';

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
  /**
   * All parts ever created in this session, including those currently absent
   * from the scene (removed via removePart). Geometry and material are kept
   * alive here so restoreSnapshot() can reinsert them without re-creating GPU
   * resources. Cleared (and disposed) on clearSession().
   */
  private readonly allParts = new Map<string, SketcherPart>();
  private polygonSketcher: PolygonSketcher | null = null;
  private extrusionHandle: ExtrusionHandle | null = null;
  private nextId = 1;
  private readonly glue: GlueManager;

  /** Called whenever the extrusion depth changes during a drag (phase === 'extruding'). */
  onExtrusionDepthChanged?: (depth: number) => void;
  /** Called when a polygon is closed and the extrusion phase begins. */
  onExtrusionStarted?: () => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.glue = new GlueManager(scene);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Begin a new polygon-drawing stroke. */
  startNewSketch(): void {
    this._endCurrentSketch();
    this.phase = 'drawing';
    this.polygonSketcher = new PolygonSketcher();
    this.polygonSketcher.onShapeClosed = (shape, centroid) => {
      this._beginExtrusion(shape, centroid);
    };
    this.scene.add(this.polygonSketcher.line);
    this.scene.add(this.polygonSketcher.rubberBand);
    this.scene.add(this.polygonSketcher.closureMarker);
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
   * Translate a part (or its entire glue group) downward so its lowest vertex
   * sits exactly on y = 0.
   *
   * For a grouped part the bounding box is computed from the THREE.Group so
   * every part in the assembly contributes, regardless of individual transforms.
   * For a standalone part the box is computed from the part's mesh directly.
   */
  snapToFloor(id: string): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    const ag = this.glue.groupForPart(id);
    const root: THREE.Object3D = ag ? ag.group : part.mesh;
    const box = new THREE.Box3().setFromObject(root);
    root.position.y -= box.min.y;
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

  // ── Mouse event handlers (NDC coords) ──────────────────────────────────────

  onMouseMove(ndcX: number, ndcY: number): void {
    if (this.phase === 'drawing') {
      this.polygonSketcher?.onMouseMove(ndcX, ndcY, this.camera);
    }
  }

  onClick(ndcX: number, ndcY: number): void {
    if (this.phase === 'drawing') {
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
    // Capture weld group membership so undo/redo restores the grouped state.
    const weldGroups: WeldGroupSnapshot[] = this.glue.getAssemblyGroups()
      .filter((ag) => ag.partIds.length > 0 && this.glue.isWeldGroup(ag.partIds[0]))
      .map((ag) => ({ partIds: [...ag.partIds] }));
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

    // Re-register joints without repositioning (merges parts into groups).
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

    // Re-create weld groups. Parts are already at their correct world positions
    // in the scene, so group.attach() will compute correct local transforms.
    for (const wg of snap.weldGroups ?? []) {
      const weldParts = wg.partIds
        .map((id) => this.parts.find((p) => p.id === id))
        .filter((p): p is SketcherPart => p !== undefined);
      if (weldParts.length >= 2) {
        this.glue.createWeldGroup(weldParts);
      }
    }
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
        kind: p.shapePoints !== null ? 'sketch' : 'primitive',
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
      let depth = 0;
      let centroid = new THREE.Vector3();

      if (pd.kind === 'primitive') {
        const preset = PRESET_BY_NAME.get(pd.name.toLowerCase());
        if (!preset) continue;
        geometry = preset.geometry();
      } else {
        if (!pd.shapePoints || !pd.depth) continue;
        shapePoints = pd.shapePoints;
        depth = pd.depth;
        const pts = pd.shapePoints.map(([x, y]) => new THREE.Vector2(x, y));
        const shape = new THREE.Shape(pts);
        geometry = buildExtrusionGeometry(shape, depth);
      }

      const materials = buildMaterials(geometry, pd.color);
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

      const part: SketcherPart = { id: pd.id, mesh, depth, centroid, name: pd.name, color: pd.color, shapePoints, faceColors, faceTextures };
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

    for (const wg of draft.weldGroups ?? []) {
      const weldParts = wg.partIds
        .map((id) => this.parts.find((p) => p.id === id))
        .filter((p): p is SketcherPart => p !== undefined);
      if (weldParts.length >= 2) {
        this.glue.createWeldGroup(weldParts);
      }
    }
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
    const handle = new ExtrusionHandle(shape, centroid);
    handle.onExtrusionComplete = (mesh, depth) => {
      this._commitPart(mesh, depth, centroid, shapePoints);
    };
    handle.onDepthChanged = (depth) => { this.onExtrusionDepthChanged?.(depth); };
    this.extrusionHandle = handle;
    this.scene.add(handle.handle);
    this.scene.add(handle.mesh);
    this.onExtrusionStarted?.();
  }

  private _commitPart(mesh: THREE.Mesh, depth: number, centroid: THREE.Vector3, shapePoints: [number, number][]): void {
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.extrusionHandle.handle.geometry.dispose();
      this.extrusionHandle.handle.children.forEach((c) => ((c as THREE.Mesh).geometry as THREE.BufferGeometry)?.dispose());
      (this.extrusionHandle.handle.material as THREE.Material).dispose();
      this.extrusionHandle = null;
    }
    const faceColors = Array<number>(mesh.geometry.groups.length).fill(DEFAULT_COLOR);
    const faceTextures = Array<null>(mesh.geometry.groups.length).fill(null);
    this.parts.push({ id: `part-${this.nextId++}`, mesh, depth, centroid: centroid.clone(), name: 'Shape', color: DEFAULT_COLOR, shapePoints, faceColors, faceTextures });
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
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.scene.remove(this.extrusionHandle.mesh);
      this.extrusionHandle.dispose();
      this.extrusionHandle = null;
    }
  }
}
