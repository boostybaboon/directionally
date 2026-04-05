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
});
