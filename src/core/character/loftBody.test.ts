import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ProceduralHumanoid, DEFAULT_BONE_PARAMS } from './ProceduralHumanoid.js';

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

const RIG_PATH = fileURLToPath(new URL('../../../static/models/gltf/xbot-rig.glb', import.meta.url));

describe('HP-6 loft body', () => {
  it('builds a lofted skinned body with field-projected joints', async () => {
    const rig = await new GLTFLoader().parseAsync(toArrayBuffer(await readFile(RIG_PATH)), RIG_PATH);
    const humanoid = new ProceduralHumanoid(rig.scene, [], undefined, 'organic', {}, 0, undefined, -20, 'loft');

    const skinned: THREE.SkinnedMesh[] = [];
    humanoid.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });

    const body = skinned.find((m) => m.name === 'loft-body');
    expect(body).toBeDefined();
    if (!body) return;

    const geo = body.geometry;
    expect(geo.getAttribute('position').count).toBeGreaterThan(200);
    expect(geo.getAttribute('skinIndex')).toBeDefined();
    expect(geo.getAttribute('skinWeight')).toBeDefined();
    expect(geo.getAttribute('color')).toBeDefined();
    expect(geo.index).toBeDefined();
    expect(body.skeleton.bones.length).toBeGreaterThan(0);

    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
      expect(Number.isFinite(nor.getX(i) + nor.getY(i) + nor.getZ(i))).toBe(true);
      minX = Math.min(minX, pos.getX(i)); maxX = Math.max(maxX, pos.getX(i));
      minY = Math.min(minY, pos.getY(i)); maxY = Math.max(maxY, pos.getY(i));
    }
    // Humanoid-scaled (metres) — catches the cm-vs-metre mix-up.
    expect(maxY - minY).toBeGreaterThan(1.0);
    expect(maxX - minX).toBeLessThan(2.5);

    const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
    for (let v = 0; v < sw.count; v++) {
      expect(sw.getX(v) + sw.getY(v) + sw.getZ(v) + sw.getW(v)).toBeCloseTo(1, 5);
    }
  });

  it('caps both the left and right toe tips', async () => {
    const rig = await new GLTFLoader().parseAsync(toArrayBuffer(await readFile(RIG_PATH)), RIG_PATH);
    rig.scene.updateMatrixWorld(true);
    const humanoid = new ProceduralHumanoid(rig.scene, [], undefined, 'organic', {}, 0, undefined, -20, 'loft');

    const skinned: THREE.SkinnedMesh[] = [];
    humanoid.root.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) skinned.push(o as THREE.SkinnedMesh); });
    const body = skinned.find((m) => m.name === 'loft-body');
    expect(body).toBeDefined();
    if (!body) return;

    const pos = body.geometry.getAttribute('position') as THREE.BufferAttribute;
    // The toe cap apex sits at capDistance = min(tubeRadiusX, tubeRadiusZ) along
    // the bone's +Y, transformed by its bind-pose matrixWorld.
    const capDistance = Math.min(DEFAULT_BONE_PARAMS.toe.tubeRadiusX, DEFAULT_BONE_PARAMS.toe.tubeRadiusZ);
    for (const name of ['mixamorigLeftToe_End', 'mixamorigRightToe_End']) {
      const bone = body.skeleton.bones.find((b) => b.name === name);
      expect(bone, name).toBeDefined();
      if (!bone) continue;
      const apex = new THREE.Vector3(0, capDistance, 0).applyMatrix4(bone.matrixWorld);
      let found = false;
      for (let i = 0; i < pos.count; i++) {
        const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (v.distanceToSquared(apex) < 1e-6) { found = true; break; }
      }
      expect(found, `${name} cap apex`).toBe(true);
    }
  });
});
