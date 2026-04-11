import * as THREE from 'three';

/**
 * Manages part selection in the assembly tool.
 *
 * Selection state is indicated by a cyan EdgesGeometry outline added as a
 * direct child of the selected mesh — it follows TransformControls drags
 * automatically without any extra update calls.
 *
 * Multi-select: shift-click via addToSelection() adds further meshes with an
 * orange outline. The primary selection (cyan) is the last single-clicked mesh.
 * Call selectedMeshes to get all currently selected items (primary + multi).
 */
export class SelectionManager {
  private _selected: THREE.Mesh | null = null;
  private outline: THREE.LineSegments | null = null;
  private _multiSelected: Map<THREE.Mesh, THREE.LineSegments> = new Map();

  onSelectionChanged?: (mesh: THREE.Mesh | null) => void;

  get selectedMesh(): THREE.Mesh | null {
    return this._selected;
  }

  /** All currently selected meshes: primary first, then multi-selected. */
  get selectedMeshes(): THREE.Mesh[] {
    const result: THREE.Mesh[] = [];
    if (this._selected) result.push(this._selected);
    for (const mesh of this._multiSelected.keys()) result.push(mesh);
    return result;
  }

  /**
   * Raycast against the given meshes and return the closest hit, or null.
   * Does not change selection state — call select() after this.
   */
  pick(ndcX: number, ndcY: number, camera: THREE.Camera, meshes: THREE.Mesh[]): THREE.Mesh | null {
    if (meshes.length === 0) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length > 0 ? (hits[0].object as THREE.Mesh) : null;
  }

  /** Select a mesh (or pass null to deselect). Clears any multi-selection. */
  select(mesh: THREE.Mesh | null): void {
    // Clear multi-selection whenever a fresh single select is made.
    this.clearMultiSelection();

    // Remove outline from the previously selected mesh.
    if (this.outline && this._selected) {
      this._selected.remove(this.outline);
      this.outline.geometry.dispose();
      (this.outline.material as THREE.Material).dispose();
      this.outline = null;
    }

    this._selected = mesh;

    if (mesh) {
      // Attach outline as a child so it follows TransformControls automatically.
      const edges = new THREE.EdgesGeometry(mesh.geometry);
      const mat = new THREE.LineBasicMaterial({
        color: 0x00ffff,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      });
      this.outline = new THREE.LineSegments(edges, mat);
      this.outline.renderOrder = 999;
      mesh.add(this.outline);
    }

    this.onSelectionChanged?.(mesh);
  }

  /** Deselect whatever is currently selected. */
  deselect(): void {
    this.select(null);
  }

  /**
   * Add a mesh to the multi-selection (orange outline).
   * If the mesh is already the primary selection or already multi-selected, no-op.
   */
  addToSelection(mesh: THREE.Mesh): void {
    if (this._multiSelected.has(mesh) || mesh === this._selected) return;
    const edges = new THREE.EdgesGeometry(mesh.geometry);
    const mat = new THREE.LineBasicMaterial({
      color: 0xff8800,
      depthTest: false,
      transparent: true,
      opacity: 0.8,
    });
    const outline = new THREE.LineSegments(edges, mat);
    outline.renderOrder = 999;
    mesh.add(outline);
    this._multiSelected.set(mesh, outline);
  }

  /** Remove a mesh from the multi-selection and dispose its outline. */
  removeFromSelection(mesh: THREE.Mesh): void {
    const outline = this._multiSelected.get(mesh);
    if (!outline) return;
    mesh.remove(outline);
    outline.geometry.dispose();
    (outline.material as THREE.Material).dispose();
    this._multiSelected.delete(mesh);
  }

  /** Clear all multi-selected items and dispose their outlines. */
  clearMultiSelection(): void {
    for (const [mesh, outline] of this._multiSelected) {
      mesh.remove(outline);
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
    }
    this._multiSelected.clear();
  }

  dispose(): void {
    this.deselect();
  }
}
