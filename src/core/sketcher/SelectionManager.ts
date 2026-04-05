import * as THREE from 'three';

/**
 * Manages part selection in the assembly tool.
 *
 * Selection state is indicated by a cyan EdgesGeometry outline added as a
 * direct child of the selected mesh — it follows TransformControls drags
 * automatically without any extra update calls.
 */
export class SelectionManager {
  private _selected: THREE.Mesh | null = null;
  private outline: THREE.LineSegments | null = null;

  onSelectionChanged?: (mesh: THREE.Mesh | null) => void;

  get selectedMesh(): THREE.Mesh | null {
    return this._selected;
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

  /** Select a mesh (or pass null to deselect). */
  select(mesh: THREE.Mesh | null): void {
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

  dispose(): void {
    this.deselect();
  }
}
