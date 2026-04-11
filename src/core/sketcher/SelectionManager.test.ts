import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SelectionManager } from './SelectionManager.js';

function makeMesh(): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial(),
  );
}

describe('SelectionManager', () => {
  let sm: SelectionManager;

  beforeEach(() => {
    sm = new SelectionManager();
  });

  it('starts with no selection', () => {
    expect(sm.selectedMesh).toBeNull();
  });

  it('select() sets selectedMesh and adds outline child', () => {
    const mesh = makeMesh();
    sm.select(mesh);
    expect(sm.selectedMesh).toBe(mesh);
    expect(mesh.children).toHaveLength(1);
    expect(mesh.children[0]).toBeInstanceOf(THREE.LineSegments);
  });

  it('select(null) deselects and removes outline', () => {
    const mesh = makeMesh();
    sm.select(mesh);
    sm.select(null);
    expect(sm.selectedMesh).toBeNull();
    expect(mesh.children).toHaveLength(0);
  });

  it('selecting a different mesh moves outline to new mesh', () => {
    const a = makeMesh();
    const b = makeMesh();
    sm.select(a);
    sm.select(b);
    expect(sm.selectedMesh).toBe(b);
    expect(a.children).toHaveLength(0);
    expect(b.children).toHaveLength(1);
  });

  it('deselect() removes outline', () => {
    const mesh = makeMesh();
    sm.select(mesh);
    sm.deselect();
    expect(sm.selectedMesh).toBeNull();
    expect(mesh.children).toHaveLength(0);
  });

  it('onSelectionChanged fires with correct value', () => {
    const mesh = makeMesh();
    const calls: Array<THREE.Mesh | null> = [];
    sm.onSelectionChanged = (m) => calls.push(m);
    sm.select(mesh);
    sm.deselect();
    expect(calls).toEqual([mesh, null]);
  });

  it('pick() returns null for empty mesh list', () => {
    const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    expect(sm.pick(0, 0, cam, [])).toBeNull();
  });

  it('pick() returns the closest mesh along the ray', () => {
    // Place camera above looking down; mesh at origin should be hit at NDC (0,0).
    const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    cam.position.set(0, 5, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);

    const mesh = makeMesh(); // 1×1×1 box at origin
    mesh.updateMatrixWorld(true);

    const hit = sm.pick(0, 0, cam, [mesh]);
    expect(hit).toBe(mesh);
  });

  it('pick() returns null when ray misses', () => {
    const cam = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
    cam.position.set(0, 5, 0);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld(true);

    const mesh = makeMesh();
    mesh.position.set(100, 0, 0); // far away from ray
    mesh.updateMatrixWorld(true);

    const hit = sm.pick(0, 0, cam, [mesh]);
    expect(hit).toBeNull();
  });

  // ── Multi-select ────────────────────────────────────────────────────────────

  it('addToSelection adds a second mesh with an orange outline', () => {
    const a = makeMesh();
    const b = makeMesh();
    sm.select(a);
    sm.addToSelection(b);

    expect(sm.selectedMeshes).toHaveLength(2);
    expect(sm.selectedMeshes).toContain(a);
    expect(sm.selectedMeshes).toContain(b);
    // Orange outline added as a child of b.
    expect(b.children).toHaveLength(1);
    expect(b.children[0]).toBeInstanceOf(THREE.LineSegments);
  });

  it('addToSelection ignores the already-primary-selected mesh', () => {
    const a = makeMesh();
    sm.select(a);
    sm.addToSelection(a); // should not double-add

    expect(sm.selectedMeshes).toHaveLength(1);
    expect(a.children).toHaveLength(1); // only the cyan primary outline
  });

  it('removeFromSelection removes the mesh and disposes its outline', () => {
    const a = makeMesh();
    const b = makeMesh();
    sm.select(a);
    sm.addToSelection(b);

    sm.removeFromSelection(b);

    expect(sm.selectedMeshes).toHaveLength(1);
    expect(b.children).toHaveLength(0);
  });

  it('clearMultiSelection removes all additional selected meshes', () => {
    const a = makeMesh();
    const b = makeMesh();
    const c = makeMesh();
    sm.select(a);
    sm.addToSelection(b);
    sm.addToSelection(c);

    sm.clearMultiSelection();

    expect(sm.selectedMeshes).toHaveLength(1); // only primary remains
    expect(sm.selectedMesh).toBe(a);
    expect(b.children).toHaveLength(0);
    expect(c.children).toHaveLength(0);
  });

  it('select() clears multi-selection when a fresh single select is made', () => {
    const a = makeMesh();
    const b = makeMesh();
    const c = makeMesh();
    sm.select(a);
    sm.addToSelection(b);

    sm.select(c); // fresh single-select should clear b

    expect(sm.selectedMeshes).toHaveLength(1);
    expect(sm.selectedMesh).toBe(c);
    expect(b.children).toHaveLength(0);
  });
});
