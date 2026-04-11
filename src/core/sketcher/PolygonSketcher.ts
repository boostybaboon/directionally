import * as THREE from 'three';

const GRID_SNAP = 0.1;
const CLOSURE_THRESHOLD = GRID_SNAP * 2;
const MARKER_COLOR_NORMAL = 0x00ffff;
const MARKER_COLOR_HOT    = 0xffdd00;

function snap(v: number): number {
  return Math.round(v / GRID_SNAP) * GRID_SNAP;
}

/**
 * Handles the polygon-drawing phase of the sketcher.
 * Raycasts mouse events onto a horizontal THREE.Plane, snaps to a 0.1-unit grid,
 * and fires onShapeClosed when the user closes the polygon by clicking near the
 * first vertex.
 *
 * Does NOT mount itself to the DOM — the caller passes pre-converted NDC coords
 * so this class has no browser/renderer dependency and is easily unit-tested.
 */
export class PolygonSketcher {
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private points: THREE.Vector3[] = [];
  private previewPoint: THREE.Vector3 | null = null;

  /** Line showing committed points */
  readonly line: THREE.Line;
  /** Rubber-band line from last committed point to cursor */
  readonly rubberBand: THREE.Line;
  /**
   * Small sphere placed on the first committed vertex.
   * Turns yellow when the cursor is close enough to close the shape,
   * signalling the next click will close rather than extend.
   * Visible only after the first point is placed.
   */
  readonly closureMarker: THREE.Mesh;

  /** True when the cursor is within closure distance of the first vertex (≥3 points). */
  closureHot = false;

  onShapeClosed?: (shape: THREE.Shape, centroid: THREE.Vector3) => void;

  constructor() {
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
    this.line       = new THREE.Line(new THREE.BufferGeometry(), mat);
    this.rubberBand = new THREE.Line(new THREE.BufferGeometry(), mat.clone());
    this.line.renderOrder       = 999;
    this.rubberBand.renderOrder = 999;

    const markerGeo = new THREE.SphereGeometry(0.07, 10, 7);
    const markerMat = new THREE.MeshBasicMaterial({ color: MARKER_COLOR_NORMAL, depthTest: false });
    this.closureMarker = new THREE.Mesh(markerGeo, markerMat);
    this.closureMarker.renderOrder = 999;
    this.closureMarker.visible = false;
  }

  /** Feed a mouse-move event (NDC coords + camera). Updates rubber-band preview and closure indicator. */
  onMouseMove(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    const hit = this._raycast(ndcX, ndcY, camera);
    if (!hit) return;
    this.previewPoint = hit;
    this._updateRubberBand();
    this._updateClosureHot(hit);
  }

  /**
   * Feed a mouse-click event (NDC coords + camera).
   * Adds a point, or closes the shape when the click is within GRID_SNAP of the first point.
   */
  onClick(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    const hit = this._raycast(ndcX, ndcY, camera);
    if (!hit) return;

    // Close when click is within closure threshold of the first point (≥3 points placed).
    if (this.points.length >= 3) {
      const first = this.points[0];
      if (hit.distanceTo(first) <= CLOSURE_THRESHOLD) {
        this._closeShape();
        return;
      }
    }

    this.points.push(hit);
    this._updateLine();
  }

  /** Number of committed points so far. */
  get pointCount(): number {
    return this.points.length;
  }

  /** Reset state so a new polygon can be drawn. */
  reset(): void {
    this.points = [];
    this.previewPoint = null;
    this.closureHot = false;
    this.closureMarker.visible = false;
    this.line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
    this.rubberBand.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
  }

  dispose(): void {
    this.line.geometry.dispose();
    this.rubberBand.geometry.dispose();
    this.closureMarker.geometry.dispose();
    (this.line.material as THREE.Material).dispose();
    (this.rubberBand.material as THREE.Material).dispose();
    (this.closureMarker.material as THREE.Material).dispose();
  }

  private _raycast(ndcX: number, ndcY: number, camera: THREE.Camera): THREE.Vector3 | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return new THREE.Vector3(snap(hit.x), 0, snap(hit.z));
  }

  private _updateLine(): void {
    const positions = this.points.flatMap((p) => [p.x, p.y, p.z]);
    this.line.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    // Keep closure marker on the first vertex.
    if (this.points.length > 0) {
      const first = this.points[0];
      this.closureMarker.position.set(first.x, first.y + 0.02, first.z);
      this.closureMarker.visible = true;
    }
  }

  private _updateClosureHot(cursor: THREE.Vector3): void {
    const hot = this.points.length >= 3 && cursor.distanceTo(this.points[0]) <= CLOSURE_THRESHOLD;
    if (hot === this.closureHot) return;
    this.closureHot = hot;
    (this.closureMarker.material as THREE.MeshBasicMaterial).color.setHex(
      hot ? MARKER_COLOR_HOT : MARKER_COLOR_NORMAL,
    );
  }

  private _updateRubberBand(): void {
    if (this.points.length === 0 || !this.previewPoint) {
      this.rubberBand.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
      return;
    }
    const last = this.points[this.points.length - 1];
    const positions = [last.x, last.y, last.z, this.previewPoint.x, this.previewPoint.y, this.previewPoint.z];
    this.rubberBand.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
  }

  private _closeShape(): void {
    if (this.points.length < 3) return;

    // Centroid: average of all points.
    const cx = this.points.reduce((s, p) => s + p.x, 0) / this.points.length;
    const cz = this.points.reduce((s, p) => s + p.z, 0) / this.points.length;
    const centroid = new THREE.Vector3(cx, 0, cz);

    // Build shape with centroid-relative, Z-corrected coords so the geometry
    // is centred at local origin and mesh.position carries the world offset.
    // Mapping: shape.x = world.x - cx; shape.y = cz - world.z.
    // After rotateX(-π/2) in ExtrusionHandle: world.x = shape.x + cx,
    // world.z = -(shape.y) + cz = world.z. ✓
    const shape = new THREE.Shape(
      this.points.map((p) => new THREE.Vector2(p.x - cx, cz - p.z)),
    );

    this.onShapeClosed?.(shape, centroid);
    this.reset();
  }
}
