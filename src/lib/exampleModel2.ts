import { Model } from './Model';
import { 
  KeyframeTrackType,
  LoopStyle,
  KeyframeAction
} from './model/Action';
import { PerspectiveCameraAsset } from './model/Camera';
import { HemisphereLightAsset } from './model/Light';
import { PlaneGeometryAsset, SphereGeometryAsset } from './model/Geometry';
import { MeshStandardMaterialAsset } from './model/Material';
import { MeshAsset } from './model/Mesh';
import * as THREE from 'three';

const camera = new PerspectiveCameraAsset(
  'camera1',
  75,
  0.1,
  1000
);
camera.position = new THREE.Vector3(2, 5, 5);
camera.lookAt = new THREE.Vector3(0, 0, 0);

const lights = [
  new HemisphereLightAsset(
    'light1',
    0xffffbb,
    0x080820,
    1
  )
];
lights[0].position = new THREE.Vector3(0, 10, 0);

const meshes: MeshAsset[] = [];

// Ground plane
const ground = new MeshAsset(
    'plane1',
    new PlaneGeometryAsset(10, 10),
    new MeshStandardMaterialAsset(0x808080)
);
ground.position = new THREE.Vector3(0, 0, 0);
ground.rotation = new THREE.Euler(-Math.PI / 2, 0, 0);
meshes.push(ground);

// Sphere
const sphere = new MeshAsset(
    'sphere1',
    new SphereGeometryAsset(1, 32, 32),
    new MeshStandardMaterialAsset(0x0000ff)
);
sphere.position = new THREE.Vector3(0, 2, 0);
sphere.rotation = new THREE.Euler(0, 0, 0);
meshes.push(sphere);

const actions = [
  new KeyframeAction(
    'bounce',
    'sphere1',
    0,
    KeyframeTrackType.NumberKeyframeTrack,
    {
      property: '.position[y]',
      times: [0, 1, 2],
      values: [0, 2, 0],
    },
    LoopStyle.LoopRepeat,
    Infinity,
    false
  )
];

export const exampleModel2 = new Model(camera, meshes, [], actions, lights);