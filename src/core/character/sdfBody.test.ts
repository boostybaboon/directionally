import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralHumanoid } from './ProceduralHumanoid.js';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const RIG_PATH = fileURLToPath(new URL('../../../static/models/gltf/xbot-rig.glb', import.meta.url));

describe('HP-5 SDF body', () => {
  it('builds a single skinned mesh with field weights and vertex colours', async () => {
    const rig = await new GLTFLoader().parseAsync(toArrayBuffer(await readFile(RIG_PATH)), RIG_PATH);
    const humanoid = new ProceduralHumanoid(rig.scene, [], undefined, 'organic', {}, 0, undefined, -20, 'sdf');

    const skinned: THREE.SkinnedMesh[] = [];
    humanoid.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });

    const body = skinned.find((m) => m.name === 'sdf-body');
    expect(body).toBeDefined();
    if (!body) return;

    const geo = body.geometry;
    expect(geo.getAttribute('position').count).toBeGreaterThan(1000);
    expect(geo.getAttribute('skinIndex')).toBeDefined();
    expect(geo.getAttribute('skinWeight')).toBeDefined();
    expect(geo.getAttribute('color')).toBeDefined();
    expect(geo.index).toBeDefined();
    expect(body.skeleton.bones.length).toBeGreaterThan(0);

    const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
    for (let v = 0; v < sw.count; v++) {
      const sum = sw.getX(v) + sw.getY(v) + sw.getZ(v) + sw.getW(v);
      expect(sum).toBeCloseTo(1, 4);
    }

    // Humanoid-scaled in the rig's world space (metres) — guards against the
    // cm-vs-metre mix-up that once produced a giant origin-centred sphere.
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
      minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i));
    }
    expect(maxY - minY).toBeGreaterThan(1.0);
    expect(maxX - minX).toBeLessThan(2.5);
  });
});
