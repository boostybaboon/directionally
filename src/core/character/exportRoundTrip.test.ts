import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralHumanoid } from './ProceduralHumanoid.js';
import { exportCharacterGLB } from './exportCharacterGLB.js';

/**
 * GLTFExporter's binary path reads the assembled Blob back through FileReader,
 * which Node does not provide. Polyfill the two methods it uses (the exporter
 * assigns `onloadend` after calling `read*`, so the promise resolves on the
 * microtask queue and the callback is already attached).
 */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
  readAsDataURL(blob: Blob): void {
    blob.arrayBuffer().then((buf) => {
      this.result = `data:application/octet-stream;base64,${Buffer.from(buf).toString('base64')}`;
      this.onloadend?.();
    });
  }
}

beforeAll(() => {
  if (typeof FileReader === 'undefined') {
    (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
  }
});

/** Copy a Buffer/Uint8Array into a standalone ArrayBuffer (Node pools small buffers). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const RIG_PATH = fileURLToPath(new URL('../../../static/models/gltf/xbot-rig.glb', import.meta.url));

function collectSkinned(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

describe('exportCharacterGLB round-trip', () => {
  it('reproduces the skinned organic body after GLTFExporter → GLTFLoader', async () => {
    const rigBytes = await readFile(RIG_PATH);
    const rig = await new GLTFLoader().parseAsync(toArrayBuffer(rigBytes), RIG_PATH);

    const humanoid = new ProceduralHumanoid(rig.scene, []);

    const before = collectSkinned(humanoid.root);
    expect(before.length).toBeGreaterThan(0);
    // The procedural body meshes are tagged so the reloaded scene can prove
    // they (not just the rig's original mesh) survived the round-trip.
    expect(before.some((m) => m.name === 'loft-body')).toBe(true);

    const { blob } = await exportCharacterGLB(humanoid);
    const reloaded = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '');

    const after = collectSkinned(reloaded.scene);

    const bodyMeshes = after.filter((m) => m.name === 'loft-body');
    expect(bodyMeshes.length).toBeGreaterThan(0);
    for (const mesh of bodyMeshes) {
      expect(mesh.geometry.getAttribute('skinIndex')).toBeDefined();
      expect(mesh.geometry.getAttribute('skinWeight')).toBeDefined();
      expect(mesh.skeleton).toBeDefined();
      expect(mesh.skeleton.bones.length).toBeGreaterThan(0);
      expect(mesh.skeleton.boneInverses.length).toBe(mesh.skeleton.bones.length);
    }
  });
});
