import * as THREE from 'three';
import { PolygonSketcher } from './PolygonSketcher.js';
import { ExtrusionHandle } from './ExtrusionHandle.js';
import type { SketcherPart, SketcherSession } from './types.js';

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

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {}

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

  /** Remove all parts and reset to idle. */
  clearSession(): void {
    for (const part of this.parts) {
      this.scene.remove(part.mesh);
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.Material).dispose();
    }
    this.parts.length = 0;
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /** Return a snapshot of the current session (parts completed so far). */
  getSession(): SketcherSession {
    return { parts: [...this.parts] };
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
    this.parts.push({ id: `part-${this.nextId++}`, mesh, depth, centroid: centroid.clone() });
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
