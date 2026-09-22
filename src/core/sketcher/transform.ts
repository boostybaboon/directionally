import * as THREE from 'three';

/** A plain-data rigid transform (position/quaternion/scale). */
export type Transform = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
};

export const IDENTITY_TRANSFORM: Transform = { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] };

export function matrixOf(t: Transform): THREE.Matrix4 {
  return new THREE.Matrix4().compose(
    new THREE.Vector3(t.position[0], t.position[1], t.position[2]),
    new THREE.Quaternion(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]),
    new THREE.Vector3(t.scale[0], t.scale[1], t.scale[2]),
  );
}

export function decomposeTransform(m: THREE.Matrix4): Transform {
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return {
    position: [pos.x, pos.y, pos.z],
    quaternion: [quat.x, quat.y, quat.z, quat.w],
    scale: [scale.x, scale.y, scale.z],
  };
}

/** world = parent · local */
export function localToWorld(local: Transform, parent: Transform): Transform {
  return decomposeTransform(matrixOf(parent).multiply(matrixOf(local)));
}

/** local = parent⁻¹ · world */
export function worldToLocal(world: Transform, parent: Transform): Transform {
  return decomposeTransform(matrixOf(parent).invert().multiply(matrixOf(world)));
}