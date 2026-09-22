import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { buildHumanoidFromSpec } from './specCharacter.js';
import { exportCharacterGLB } from './exportCharacterGLB.js';

/**
 * GLTFExporter's binary path reads the assembled Blob back through FileReader,
 * which Node does not provide. Polyfill the two methods it uses.
 */
class NodeFileReader {
  result: ArrayBuffer | string | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then((buf) => { this.result = buf; this.onloadend?.(); });
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

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const RIG_PATH = fileURLToPath(new URL('../../../static/models/gltf/xbot-rig.glb', import.meta.url));

function loftBodies(root: THREE.Object3D): THREE.SkinnedMesh[] {
  const out: THREE.SkinnedMesh[] = [];
  root.traverse((o) => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name === 'loft-body') out.push(o as THREE.SkinnedMesh);
  });
  return out;
}

describe('buildHumanoidFromSpec', () => {
  it('materialises a spec-backed organic body that survives GLB export/reload', async () => {
    const rigBytes = await readFile(RIG_PATH);
    const rig = await new GLTFLoader().parseAsync(toArrayBuffer(rigBytes), RIG_PATH);

    const humanoid = buildHumanoidFromSpec({ build: 0.6, skinTone: 'Deep', age: 0.5 }, rig.scene, []);

    expect(loftBodies(humanoid.root).length).toBeGreaterThan(0);

    const { blob } = await exportCharacterGLB(humanoid);
    const reloaded = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), '');

    const bodies = loftBodies(reloaded.scene);
    expect(bodies.length).toBeGreaterThan(0);
    for (const mesh of bodies) {
      expect(mesh.geometry.getAttribute('skinIndex')).toBeDefined();
      expect(mesh.geometry.getAttribute('skinWeight')).toBeDefined();
      expect(mesh.skeleton).toBeDefined();
      expect(mesh.skeleton.bones.length).toBeGreaterThan(0);
    }
  });
});
