import * as THREE from 'three';
import type { SketchMode } from './types.js';

const DEFAULT_GRID_SNAP = 0.1;
const MARKER_COLOR_NORMAL = 0x00ffff;
const MARKER_COLOR_HOT    = 0xffdd00;

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
  /** Grid snap size in world units. Change at any time to adjust snapping. */
  snapSize = DEFAULT_GRID_SNAP;
  /** Drawing mode: polygon (multi-click), rectangle (two-click diagonal), or circle (two-click centre+radius). */
  mode: SketchMode = 'polygon';
  /** Number of sides for circle approximation. */
  circleSegments = 32;
  /**
   * Drawing plane: 'xz' (default, floor plane) for extrusion sketches;
   * 'xy' (front face of scene) for revolve sketches.
   * In 'xy' mode raycasts hit the z=0 plane, shape.x = world.x, shape.y = world.y
   * with no centroid offset — the Y axis at x=0 is the revolution axis directly.
   */
  drawPlane: 'xz' | 'xy' = 'xz';

  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly xyPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
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
   * - Polygon: adds a vertex; closes the shape when clicked near the first point (≥3 points).
   * - Rectangle: first click sets anchor corner; second click sets opposite corner and closes.
   * - Circle: first click sets centre; second click sets radius and closes as an N-gon.
   */
  onClick(ndcX: number, ndcY: number, camera: THREE.Camera): void {
    const hit = this._raycast(ndcX, ndcY, camera);
    if (!hit) return;

    if (this.mode === 'rectangle') {
      if (this.points.length === 0) {
        this.points.push(hit);
        this._updateLine();
      } else {
        const a = this.points[0];
        if (this.drawPlane === 'xy') {
          this.points = [
            new THREE.Vector3(a.x, a.y, 0),
            new THREE.Vector3(hit.x, a.y, 0),
            new THREE.Vector3(hit.x, hit.y, 0),
            new THREE.Vector3(a.x, hit.y, 0),
          ];
        } else {
          this.points = [
            new THREE.Vector3(a.x, 0, a.z),
            new THREE.Vector3(hit.x, 0, a.z),
            new THREE.Vector3(hit.x, 0, hit.z),
            new THREE.Vector3(a.x, 0, hit.z),
          ];
        }
        this._closeShape();
      }
      return;
    }

    if (this.mode === 'circle') {
      if (this.points.length === 0) {
        this.points.push(hit);
        this._updateLine();
      } else {
        const centre = this.points[0];
        const radius = this.drawPlane === 'xy'
          ? new THREE.Vector2(hit.x - centre.x, hit.y - centre.y).length()
          : new THREE.Vector2(hit.x - centre.x, hit.z - centre.z).length();
        if (radius < 0.01) return;
        this.points = this._buildCirclePoints(centre, radius);
        this._closeShape();
      }
      return;
    }

    // Close when click is within closure threshold of the first point (≥3 points placed).
    if (this.points.length >= 3) {
      const first = this.points[0];
      if (hit.distanceTo(first) <= this.snapSize * 2) {
        if (!this._wouldCloseIntersect()) this._closeShape();
        return;
      }
    }

    if (this._wouldSelfIntersect(hit)) return;
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

  private _get2D(v: THREE.Vector3): [number, number] {
    return this.drawPlane === 'xy' ? [v.x, v.y] : [v.x, v.z];
  }

  private _segIntersect2D(
    ax: number, ay: number, bx: number, by: number,
    cx: number, cy: number, dx: number, dy: number,
  ): boolean {
    const d1x = bx - ax, d1y = by - ay;
    const d2x = dx - cx, d2y = dy - cy;
    const cross = d1x * d2y - d1y * d2x;
    if (Math.abs(cross) < 1e-10) return false;
    const ex = cx - ax, ey = cy - ay;
    const t = (ex * d2y - ey * d2x) / cross;
    const u = (ex * d1y - ey * d1x) / cross;
    return t > 1e-10 && t < 1 - 1e-10 && u > 1e-10 && u < 1 - 1e-10;
  }

  /**
   * Returns true if the segment from the last committed point to `newPoint`
   * would cross any non-adjacent existing edge of the polygon.
   */
  private _wouldSelfIntersect(newPoint: THREE.Vector3): boolean {
    const n = this.points.length;
    if (n < 3) return false;
    const [lx, ly] = this._get2D(this.points[n - 1]);
    const [nx, ny] = this._get2D(newPoint);
    for (let i = 0; i < n - 2; i++) {
      const [ax, ay] = this._get2D(this.points[i]);
      const [bx, by] = this._get2D(this.points[i + 1]);
      if (this._segIntersect2D(lx, ly, nx, ny, ax, ay, bx, by)) return true;
    }
    return false;
  }

  /**
   * Returns true if closing the polygon (last point → first point) would cross
   * any non-adjacent interior edge.
   */
  private _wouldCloseIntersect(): boolean {
    const n = this.points.length;
    if (n < 4) return false;
    const [lx, ly] = this._get2D(this.points[n - 1]);
    const [fx, fy] = this._get2D(this.points[0]);
    for (let i = 1; i < n - 2; i++) {
      const [ax, ay] = this._get2D(this.points[i]);
      const [bx, by] = this._get2D(this.points[i + 1]);
      if (this._segIntersect2D(lx, ly, fx, fy, ax, ay, bx, by)) return true;
    }
    return false;
  }

  private _snap(v: number): number {
    return Math.round(v / this.snapSize) * this.snapSize;
  }

  /** Build an N-gon approximating a circle of the given radius centred at `centre`. */
  private _buildCirclePoints(centre: THREE.Vector3, radius: number): THREE.Vector3[] {
    return Array.from({ length: this.circleSegments }, (_, i) => {
      const angle = (i / this.circleSegments) * Math.PI * 2;
      if (this.drawPlane === 'xy') {
        return new THREE.Vector3(
          centre.x + Math.cos(angle) * radius,
          centre.y + Math.sin(angle) * radius,
          0,
        );
      }
      return new THREE.Vector3(
        centre.x + Math.cos(angle) * radius,
        0,
        centre.z + Math.sin(angle) * radius,
      );
    });
  }

  private _raycast(ndcX: number, ndcY: number, camera: THREE.Camera): THREE.Vector3 | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hit = new THREE.Vector3();
    if (this.drawPlane === 'xy') {
      if (!raycaster.ray.intersectPlane(this.xyPlane, hit)) return null;
      return new THREE.Vector3(this._snap(hit.x), this._snap(hit.y), 0);
    }
    if (!raycaster.ray.intersectPlane(this.groundPlane, hit)) return null;
    return new THREE.Vector3(this._snap(hit.x), 0, this._snap(hit.z));
  }

  private _updateLine(): void {
    const positions = this.points.flatMap((p) => [p.x, p.y, p.z]);
    this.line.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
    // Closure marker: polygon mode only — rect/circle have no close-near-first mechanic.
    if (this.mode === 'polygon' && this.points.length > 0) {
      const first = this.points[0];
      if (this.drawPlane === 'xy') {
        // Offset slightly toward the camera (+Z) so it sits in front of the line.
        this.closureMarker.position.set(first.x, first.y, 0.02);
      } else {
        this.closureMarker.position.set(first.x, first.y + 0.02, first.z);
      }
      this.closureMarker.visible = true;
    } else {
      this.closureMarker.visible = false;
    }
  }

  private _updateClosureHot(cursor: THREE.Vector3): void {
    const hot = this.points.length >= 3 && cursor.distanceTo(this.points[0]) <= this.snapSize * 2;
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

    // Rectangle: after first click, show the full 4-corner outline as preview.
    if (this.mode === 'rectangle' && this.points.length === 1) {
      const a = this.points[0];
      const b = this.previewPoint;
      let pts: Float32Array;
      if (this.drawPlane === 'xy') {
        pts = new Float32Array([
          a.x, a.y, 0,  b.x, a.y, 0,  b.x, b.y, 0,  a.x, b.y, 0,  a.x, a.y, 0,
        ]);
      } else {
        pts = new Float32Array([
          a.x, 0, a.z,  b.x, 0, a.z,  b.x, 0, b.z,  a.x, 0, b.z,  a.x, 0, a.z,
        ]);
      }
      this.rubberBand.geometry.setAttribute('position', new THREE.BufferAttribute(pts, 3));
      return;
    }

    // Circle: after first click, show the N-gon outline as preview.
    if (this.mode === 'circle' && this.points.length === 1) {
      const centre = this.points[0];
      const radius = this.drawPlane === 'xy'
        ? new THREE.Vector2(this.previewPoint.x - centre.x, this.previewPoint.y - centre.y).length()
        : new THREE.Vector2(this.previewPoint.x - centre.x, this.previewPoint.z - centre.z).length();
      if (radius < 0.001) {
        this.rubberBand.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(0), 3));
        return;
      }
      const circlePts = this._buildCirclePoints(centre, radius);
      // Close the loop by repeating the first point.
      const flat = [...circlePts.flatMap((p) => [p.x, p.y, p.z]), circlePts[0].x, circlePts[0].y, circlePts[0].z];
      this.rubberBand.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flat), 3));
      return;
    }

    // Polygon: single rubber-band segment from last committed point to cursor.
    const last = this.points[this.points.length - 1];
    const positions = [last.x, last.y, last.z, this.previewPoint.x, this.previewPoint.y, this.previewPoint.z];
    this.rubberBand.geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array(positions), 3),
    );
  }

  private _closeShape(): void {
    if (this.points.length < 3) return;

    if (this.drawPlane === 'xy') {
      // In XY mode the Y axis (x=0) is the revolution axis for LatheGeometry.
      // Pass world XY coords directly — no centroid offset — so lathePoints[i][0]
      // is the true radial distance from the Y axis and lathePoints[i][1] is height.
      const shape = new THREE.Shape(
        this.points.map((p) => new THREE.Vector2(p.x, p.y)),
      );
      this.onShapeClosed?.(shape, new THREE.Vector3(0, 0, 0));
      this.reset();
      return;
    }

    // XZ floor-plane mode (extrusion sketches).
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
