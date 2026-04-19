import * as THREE from 'three';
import type { FaceGroupInfo } from './types.js';

const DEFAULT_DEPTH = 1;
const DRAG_FPS_CAP = 1000 / 30; // ms between live rebuilds while dragging

function disposeMaterials(m: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(m)) m.forEach((mat) => mat.dispose());
  else m.dispose();
}

/**
 * Build ExtrudeGeometry for a sketch shape with per-edge draw groups and no bevel.
 * Three.js ExtrudeGeometry (bevelEnabled:false, steps:1) produces 2 groups:
 *   group 0: both caps combined (materialIndex 0)
 *   group 1: all N wall faces (materialIndex 1)
 * We reassign materialIndices so each wall edge i → materialIndex i and the
 * combined caps → materialIndex N, giving N+1 draw groups total.
 */
export function buildExtrusionGeometry(shape: THREE.Shape, depth: number): THREE.BufferGeometry {
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  // Rotate so the shape lies in the XZ plane extruding upward along +Y.
  // Shape coords are centroid-relative, so geometry is centred at local origin;
  // mesh.position carries the world centroid offset.
  geo.rotateX(-Math.PI / 2);
  // Shift geometry so local Y spans -depth/2..+depth/2, placing the pivot at
  // the vertical centre. mesh.position.y = depth/2 keeps the bottom on Y=0.
  geo.translate(0, -depth / 2, 0);

  const pts = shape.getPoints();
  const N = pts.length;

  // Capture the two default group ranges before clearing.
  // group 0 = caps (bottom+top, count = 2*(N-2)*3)
  // group 1 = walls (count = N*6, 6 indices per edge)
  const capsStart = geo.groups[0].start;  // = 0
  const capsCount = geo.groups[0].count;
  const wallStart = geo.groups[1].start;  // = capsCount

  geo.clearGroups();
  // Per-edge walls: materialIndex 0…N-1
  for (let i = 0; i < N; i++) {
    geo.addGroup(wallStart + i * 6, 6, i);
  }
  // Combined caps (bottom+top): materialIndex N
  geo.addGroup(capsStart, capsCount, N);

  // Per-edge side normals. With centroid-relative Z-corrected shape coords,
  // dz = b.y - a.y = -(world Z diff), so outward normal = (-dz/len, 0, -dx/len).
  const faceGroups: FaceGroupInfo[] = pts.map((a, i) => {
    const b = pts[(i + 1) % N];
    const dx = b.x - a.x;
    const dz = b.y - a.y;
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    return { normal: new THREE.Vector3(-dz / len, 0, -dx / len), label: `side-${i}`, materialIndex: i };
  });
  faceGroups.push({ normal: new THREE.Vector3(0, 1, 0), label: 'caps', materialIndex: N });
  geo.userData.faceGroups = faceGroups;
  return geo;
}

/**
 * Renders a draggable arrow handle at the centroid of a just-closed shape.
 * Dragging the arrow up/down controls the extrusion depth and rebuilds
 * ExtrudeGeometry live (throttled to 30 fps). Fires onExtrusionComplete
 * when the user releases the handle.
 *
 * The extruded mesh is placed in the XZ plane with the extrusion running along +Y.
 * The shape origin is the centroid so the mesh is centred under the handle.
 */
export class ExtrusionHandle {
  /** The draggable arrow handle. Add this to the scene. */
  readonly handle: THREE.Mesh;
  /** The current extruded mesh. Add this to the scene; replaced on each rebuild. */
  mesh: THREE.Mesh;

  onExtrusionComplete?: (mesh: THREE.Mesh, depth: number) => void;
  /** Called whenever the extrusion depth changes during a drag. */
  onDepthChanged?: (depth: number) => void;

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

    // Arrow handle: thin cylinder shaft with double-headed cones indicating drag direction.
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xffdd00, metalness: 0, roughness: 0.4 });
    const shaftGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.55, 10);
    this.handle = new THREE.Mesh(shaftGeo, handleMat);
    this.handle.position.set(centroid.x, DEFAULT_DEPTH, centroid.z);
    this.handle.renderOrder = 1;

    const coneGeo = new THREE.ConeGeometry(0.10, 0.22, 10);
    const coneTop = new THREE.Mesh(coneGeo, handleMat);
    coneTop.position.y = 0.38;   // tip points up (+Y)
    this.handle.add(coneTop);

    const coneBot = new THREE.Mesh(coneGeo, handleMat);
    coneBot.position.y = -0.38;  // flip 180° so tip points down (-Y)
    coneBot.rotation.z = Math.PI;
    this.handle.add(coneBot);

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
    this.onDepthChanged?.(this.depth);
    const newMesh = this._buildMesh(this.depth);
    this.mesh.geometry.dispose();
    disposeMaterials(this.mesh.material);
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

  /** Current extrusion depth. Useful for displaying a live HUD overlay. */
  get currentDepth(): number {
    return this.depth;
  }

  /**
   * Programmatically set the extrusion depth (e.g. from a numeric input field).
   * Rebuilds the mesh and fires onDepthChanged.
   * Returns the new mesh so the caller can update the scene.
   */
  setDepth(d: number): THREE.Mesh {
    d = Math.max(0.05, d);
    this.depth = d;
    this.handle.position.y = d;
    this.onDepthChanged?.(d);
    const newMesh = this._buildMesh(d);
    this.mesh.geometry.dispose();
    disposeMaterials(this.mesh.material);
    this.mesh = newMesh;
    return newMesh;
  }

  dispose(): void {
    this.handle.geometry.dispose();
    this.handle.children.forEach((c) => (c as THREE.Mesh).geometry?.dispose());
    (this.handle.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
    disposeMaterials(this.mesh.material);
  }

  private _buildMesh(depth: number): THREE.Mesh {
    const geo = buildExtrusionGeometry(this.shape, depth);
    const materials = Array.from({ length: geo.groups.length }, () =>
      new THREE.MeshStandardMaterial({ color: 0x8888cc, metalness: 0.1, roughness: 0.6 })
    );
    const mesh = new THREE.Mesh(geo, materials);
    // Place the mesh at the world centroid so geometry vertices land at the
    // drawn polygon positions, and the selection gizmo lands on the shape.
    mesh.position.set(this.centroid.x, depth / 2, this.centroid.z);
    return mesh;
  }
}
