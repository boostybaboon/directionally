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
  1000,
  new THREE.Vector3(2, 5, 5),
  new THREE.Vector3(0, 0, 0)
);

const lights = [
  new HemisphereLightAsset(
    'light1',
    0xffffbb,
    0x080820,
    1,
    new THREE.Vector3(0, 10, 0)
  )
];

const meshes = [
  // Ground plane
  new MeshAsset(
    'plane1',
    new PlaneGeometryAsset(10, 10),
    new MeshStandardMaterialAsset(0x808080),
    new THREE.Vector3(0, 0, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0)
  ),
  // Sphere
  new MeshAsset(
    'sphere1',
    new SphereGeometryAsset(1, 32, 32),
    new MeshStandardMaterialAsset(0x0000ff),
    new THREE.Vector3(0, 2, 0),
    new THREE.Euler(0, 0, 0)
  )
];

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