import * as THREE from 'three';

const DEFAULT_DEPTH = 1;
const DRAG_FPS_CAP = 1000 / 30; // ms between live rebuilds while dragging

/**
 * Renders a draggable yellow sphere at the centroid of a just-closed shape.
 * Dragging the sphere up/down controls the extrusion depth and rebuilds
 * ExtrudeGeometry live (throttled to 30 fps). Fires onExtrusionComplete
 * when the user releases the handle.
 *
 * The extruded mesh is placed in the XZ plane with the extrusion running along +Y.
 * The shape origin is the centroid so the mesh is centred under the handle.
 */
export class ExtrusionHandle {
  /** The draggable handle sphere. Add this to the scene. */
  readonly handle: THREE.Mesh;
  /** The current extruded mesh. Add this to the scene; replaced on each rebuild. */
  mesh: THREE.Mesh;

  onExtrusionComplete?: (mesh: THREE.Mesh, depth: number) => void;

  private shape: THREE.Shape;
  private centroid: THREE.Vector3;
  private depth: number = DEFAULT_DEPTH;
  private dragging = false;
  private dragStartY = 0;
  private depthAtDragStart = DEFAULT_DEPTH;
  private lastRebuildTime = 0;

  constructor(shape: THREE.Shape, centroid: THREE.Vector3) {
    this.shape    = shape;
    this.centroid = centroid.clone();

    // Yellow sphere handle
    const handleGeo = new THREE.SphereGeometry(0.12, 12, 8);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, metalness: 0, roughness: 0.4 });
    this.handle = new THREE.Mesh(handleGeo, handleMat);
    this.handle.position.set(centroid.x, DEFAULT_DEPTH, centroid.z);
    this.handle.renderOrder = 1;

    // Initial mesh
    this.mesh = this._buildMesh(DEFAULT_DEPTH);
  }

  /**
   * Call from a pointerdown handler when the raycasted hit object is this.handle.
   * worldY is the world-space Y-coordinate of the pointer-down hit.
   */
  startDrag(worldY: number): void {
    this.dragging = true;
    this.dragStartY = worldY;
    this.depthAtDragStart = this.depth;
  }

  /**
   * Call from a pointermove handler while dragging.
   * worldY is the current world-space Y under the pointer.
   * Returns the new mesh if a rebuild occurred, null otherwise.
   */
  onDrag(worldY: number): THREE.Mesh | null {
    if (!this.dragging) return null;
    const now = performance.now();
    if (now - this.lastRebuildTime < DRAG_FPS_CAP) return null;
    this.lastRebuildTime = now;

    const delta = worldY - this.dragStartY;
    this.depth = Math.max(0.05, this.depthAtDragStart + delta);
    this.handle.position.y = this.depth;
    const newMesh = this._buildMesh(this.depth);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh = newMesh;
    return newMesh;
  }

  /** Call from a pointerup handler to commit the current depth. */
  endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.onExtrusionComplete?.(this.mesh, this.depth);
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  dispose(): void {
    this.handle.geometry.dispose();
    (this.handle.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }

  private _buildMesh(depth: number): THREE.Mesh {
    const geo = new THREE.ExtrudeGeometry(this.shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize:      0.04,
      bevelSegments:  2,
    });
    // Rotate so the shape lies in the XZ plane extruding upward along +Y.
    // ExtrudeGeometry extrudes along +Z by default, so rotate -90° around X.
    // After rotation: group 1 cap faces +Y (Top), group 2 cap faces -Y (Bottom).
    geo.rotateX(-Math.PI / 2);
    geo.translate(this.centroid.x, 0, this.centroid.z);
    geo.userData.faceGroups = [
      { normal: new THREE.Vector3(1, 0, 0),  label: 'Side' },
      { normal: new THREE.Vector3(0, 1, 0),  label: 'Top' },
      { normal: new THREE.Vector3(0, -1, 0), label: 'Bottom' },
    ];

    const mat = new THREE.MeshStandardMaterial({ color: 0xaaddff, metalness: 0.1, roughness: 0.6 });
    return new THREE.Mesh(geo, mat);
  }
}
