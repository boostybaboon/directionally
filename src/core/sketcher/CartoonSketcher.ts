import * as THREE from 'three';
import { PolygonSketcher } from './PolygonSketcher.js';
import { ExtrusionHandle } from './ExtrusionHandle.js';
import { GlueManager } from './GlueManager.js';
import type { FaceGroupInfo, SketcherPart, SketcherSession } from './types.js';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function withFaceGroups(geo: THREE.BufferGeometry, groups: FaceGroupInfo[]): THREE.BufferGeometry {
  geo.userData.faceGroups = groups;
  return geo;
}

type PrimitivePreset = { name: string; geometry: () => THREE.BufferGeometry };

const PRIMITIVE_PRESETS: PrimitivePreset[] = [
  {
    name: 'Box',
    geometry: () => withFaceGroups(new THREE.BoxGeometry(1, 1, 1), [
      { normal: V(1, 0, 0),  label: '+X' },
      { normal: V(-1, 0, 0), label: '−X' },
      { normal: V(0, 1, 0),  label: 'Top' },
      { normal: V(0, -1, 0), label: 'Bottom' },
      { normal: V(0, 0, 1),  label: '+Z' },
      { normal: V(0, 0, -1), label: '−Z' },
    ]),
  },
  {
    name: 'Sphere',
    geometry: () => withFaceGroups(new THREE.SphereGeometry(0.75, 16, 12), [
      { normal: V(0, 1, 0), label: 'Surface' },
    ]),
  },
  {
    name: 'Cylinder',
    geometry: () => withFaceGroups(new THREE.CylinderGeometry(0.3, 0.3, 2, 16), [
      { normal: V(1, 0, 0),  label: 'Barrel' },
      { normal: V(0, 1, 0),  label: 'Top cap' },
      { normal: V(0, -1, 0), label: 'Bottom cap' },
    ]),
  },
  {
    name: 'Capsule',
    geometry: () => withFaceGroups(new THREE.CapsuleGeometry(0.3, 1, 4, 8), [
      { normal: V(0, 1, 0), label: 'Surface' },
    ]),
  },
  {
    name: 'Cone',
    geometry: () => withFaceGroups(new THREE.ConeGeometry(0.5, 2, 16), [
      { normal: V(1, 0, 0),  label: 'Barrel' },
      { normal: V(0, 1, 0),  label: 'Top cap' },
      { normal: V(0, -1, 0), label: 'Bottom cap' },
    ]),
  },
];

/** Lookup by lowercase name for the UI insert action. */
const PRESET_BY_NAME = new Map(PRIMITIVE_PRESETS.map((p) => [p.name.toLowerCase(), p]));

const DEFAULT_COLOR = 0x8888cc;

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
  private polygonSketcher: PolygonSketcher | null = null;
  private extrusionHandle: ExtrusionHandle | null = null;
  private nextId = 1;
  private readonly glue: GlueManager;

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
  }

  /** Remove all parts, joints, and groups, then reset to idle. */
  clearSession(): void {
    this.glue.dispose();
    for (const part of this.parts) {
      this.scene.remove(part.mesh);
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
    }
    this.parts.length = 0;
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
    const material = new THREE.MeshStandardMaterial({ color: DEFAULT_COLOR });
    const mesh = new THREE.Mesh(geometry, material);
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
    };
    this.scene.add(mesh);
    this.parts.push(part);
    return part;
  }

  /** All available preset names, in display order. */
  static get presetNames(): string[] {
    return PRIMITIVE_PRESETS.map((p) => p.name);
  }

  /** Update a part's colour. Syncs mesh material immediately. */
  setPartColor(id: string, color: number): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    part.color = color;
    (part.mesh.material as THREE.MeshStandardMaterial).color.setHex(color);
  }

  /**
   * Duplicate a part. The clone is offset by +1 on X and auto-returned so the
   * caller can select it. Returns null if the part is not found.
   */
  duplicatePart(id: string): SketcherPart | null {
    const src = this.parts.find((p) => p.id === id);
    if (!src) return null;
    const geo = src.mesh.geometry.clone();
    const mat = (src.mesh.material as THREE.MeshStandardMaterial).clone();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(src.mesh.position).x += 1;
    mesh.rotation.copy(src.mesh.rotation);
    mesh.scale.copy(src.mesh.scale);
    const part: SketcherPart = {
      id: `part-${this.nextId++}`,
      mesh,
      depth: src.depth,
      centroid: src.centroid.clone(),
      name: src.name,
      color: src.color,
    };
    this.scene.add(mesh);
    this.parts.push(part);
    return part;
  }

  /** Remove a single part by id. */
  removePart(id: string): void {
    const idx = this.parts.findIndex((p) => p.id === id);
    if (idx === -1) return;
    // Unglue before removing from the parts list so BFS can still find neighbours.
    this.glue.unglueAll(id, this.parts);
    // Clean up residual group membership (for groups that stayed connected after unglue).
    this.glue.evictFromGroup(id, this.parts);
    const [part] = this.parts.splice(idx, 1);
    part.mesh.removeFromParent();
    part.mesh.geometry.dispose();
    (part.mesh.material as THREE.Material).dispose();
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
    const hits = raycaster.intersectObject(this.extrusionHandle.handle);
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
    const newMesh = this.extrusionHandle.onDrag(hit.y);
    if (newMesh) {
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

  // ── Private ─────────────────────────────────────────────────────────────────

  private _beginExtrusion(shape: THREE.Shape, centroid: THREE.Vector3): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }

    this.phase = 'extruding';
    const handle = new ExtrusionHandle(shape, centroid);
    handle.onExtrusionComplete = (mesh, depth) => {
      this._commitPart(mesh, depth, centroid);
    };
    this.extrusionHandle = handle;
    this.scene.add(handle.handle);
    this.scene.add(handle.mesh);
  }

  private _commitPart(mesh: THREE.Mesh, depth: number, centroid: THREE.Vector3): void {
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.extrusionHandle.handle.geometry.dispose();
      (this.extrusionHandle.handle.material as THREE.Material).dispose();
      this.extrusionHandle = null;
    }
    this.parts.push({ id: `part-${this.nextId++}`, mesh, depth, centroid: centroid.clone(), name: 'Shape', color: DEFAULT_COLOR });
    this.phase = 'idle';
  }

  private _endCurrentSketch(): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
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
