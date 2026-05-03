import * as THREE from 'three';

/**
 * Manages part selection in the assembly tool.
 *
 * Standalone part selection: cyan EdgesGeometry outline added as a child of
 * the selected mesh — follows TransformControls drags automatically.
 *
 * Weld group selection: a single amber BoxHelper around the THREE.Group
 * replaces per-mesh outlines entirely, making it unambiguous that the group
 * is the selected entity rather than any individual mesh.
 *
 * Multi-select: shift-click via addToSelection() adds further meshes with an
 * orange outline. The primary selection (cyan) is the last single-clicked mesh.
 * Call selectedMeshes to get all currently selected items (primary + multi).
 */
export class SelectionManager {
  private _selected: THREE.Mesh | null = null;
  private outline: THREE.LineSegments | null = null;
  private _multiSelected: Map<THREE.Mesh, THREE.LineSegments> = new Map();

  // Weld group selection state — mutually exclusive with per-mesh outline.
  private _groupBox: THREE.LineSegments | null = null;
  private _groupBoxParent: THREE.Group | null = null;
  /** Soft white outline on the representative mesh — visible alongside the amber group box. */
  private _memberHint: THREE.LineSegments | null = null;

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

  /** Select a mesh (or pass null to deselect). Clears any multi-selection and group box. */
  select(mesh: THREE.Mesh | null): void {
    // Clear multi-selection whenever a fresh single select is made.
    this.clearMultiSelection();
    this.clearGroupBox();

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

  /**
   * Select a weld group as a unit.
   *
   * Shows a single amber BoxHelper around the THREE.Group instead of per-mesh
   * outlines. The representative mesh is stored as the primary selection so
   * that existing callers (selectedPartId, TC attachment, etc.) continue to
   * work — but no cyan outline is added to that mesh.
   */
  selectGroup(representativeMesh: THREE.Mesh, group: THREE.Group): void {
    this.clearMultiSelection();
    this.clearGroupBox();

    // Remove any existing per-mesh outline.
    if (this.outline && this._selected) {
      this._selected.remove(this.outline);
      this.outline.geometry.dispose();
      (this.outline.material as THREE.Material).dispose();
      this.outline = null;
    }

    this._selected = representativeMesh;

    // Compute AABB in group-local space so the Box3Helper (added as a group
    // child) inherits the group's world transform without double-applying it.
    // BoxHelper computes in world space, causing incorrect positioning when
    // added as a child — Box3Helper with a local-space box avoids that.
    group.updateWorldMatrix(true, false);
    const invGroupWorld = new THREE.Matrix4().copy(group.matrixWorld).invert();
    const localBox = new THREE.Box3();
    group.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        child.geometry.computeBoundingBox();
        if (child.geometry.boundingBox) {
          const childBox = child.geometry.boundingBox.clone();
          const meshToLocal = new THREE.Matrix4().multiplyMatrices(invGroupWorld, child.matrixWorld);
          childBox.applyMatrix4(meshToLocal);
          localBox.union(childBox);
        }
      }
    });
    const box = new THREE.Box3Helper(localBox, 0xffaa00);
    box.renderOrder = 999;
    (box.material as THREE.LineBasicMaterial).depthTest = false;
    (box.material as THREE.LineBasicMaterial).transparent = true;
    (box.material as THREE.LineBasicMaterial).opacity = 0.85;
    group.add(box);
    this._groupBox = box;
    this._groupBoxParent = group;

    // Soft white outline on the representative mesh so the clicked member is
    // identifiable alongside the amber group box.
    const hintEdges = new THREE.EdgesGeometry(representativeMesh.geometry);
    const hintMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      transparent: true,
      opacity: 0.45,
    });
    this._memberHint = new THREE.LineSegments(hintEdges, hintMat);
    this._memberHint.renderOrder = 998;
    representativeMesh.add(this._memberHint);

    this.onSelectionChanged?.(representativeMesh);
  }

  /** Remove the weld group bounding box (and member hint) if one is shown. */
  clearGroupBox(): void {
    if (this._groupBox) {
      // Use removeFromParent() rather than _groupBoxParent.remove() because
      // GlueManager._dissolveGroup() re-parents group children to the scene
      // via scene.attach(), making _groupBoxParent stale. removeFromParent()
      // works regardless of what the current parent is.
      this._groupBox.removeFromParent();
      this._groupBox.geometry.dispose();
      (this._groupBox.material as THREE.Material).dispose();
      this._groupBox = null;
      this._groupBoxParent = null;
    }
    if (this._memberHint) {
      this._memberHint.removeFromParent();
      this._memberHint.geometry.dispose();
      (this._memberHint.material as THREE.Material).dispose();
      this._memberHint = null;
    }
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
