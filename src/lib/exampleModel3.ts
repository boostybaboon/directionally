import { Model } from './Model';
import { 
  KeyframeTrackType,
  LoopStyle,
  KeyframeAction,
  GLTFAction
} from './model/Action';
import { PerspectiveCameraAsset } from './model/Camera';
import { HemisphereLightAsset } from './model/Light';
import { PlaneGeometryAsset } from './model/Geometry';
import { MeshStandardMaterialAsset } from './model/Material';
import { MeshAsset } from './model/Mesh';
import { GLTFAsset } from './model/GLTF';
import * as THREE from 'three';

const camera = new PerspectiveCameraAsset(
  'camera1',
  45,
  0.1,
  1000
);
camera.position = new THREE.Vector3(3, 10, 20);
camera.lookAt = new THREE.Vector3(0, 0, 0);

const lights = [
  new HemisphereLightAsset(
    'light1',
    0xffffbb,
    0x080820,
    1,
    new THREE.Vector3(0, 20, 0)
  )
];

const gltfs = [
  new GLTFAsset(
    'robot1',
    '/models/gltf/RobotExpressive.glb',
    new THREE.Vector3(0, 0, 0),
    new THREE.Euler(0, 0, 0)
  )
];

const meshes: MeshAsset[] = [];

// Ground plane
const ground = new MeshAsset(
    'plane1',
    new PlaneGeometryAsset(20, 20),
    new MeshStandardMaterialAsset(0x808080)
);
ground.position = new THREE.Vector3(0, 0, 0);
ground.rotation = new THREE.Euler(-Math.PI / 2, 0, 0);
meshes.push(ground);

const actions = [
  new KeyframeAction(
    'walkPosition',
    'robot1',
    0,
    KeyframeTrackType.VectorKeyframeTrack,
    {
      property: '.position',
      times: [0, 2, 4, 6, 8],
      values: [  0,   0,   0, 
                 0,   0, 7.5,
               7.5,   0, 7.5,
               7.5,   0,   0,
                 0,   0,   0,],
    },
    LoopStyle.LoopRepeat,
    Infinity,
    false
  ),
  new KeyframeAction(
    'walkRotation1',
    'robot1',
    0,
    KeyframeTrackType.NumberKeyframeTrack,
    {
      property: '.rotation[y]',
      times: [0.0, 1.6, 2.0, 3.6, 4.0, 5.6, 6.0, 7.6, 8.0],
      values: [
        0,
        0,
        Math.PI/2, 
        Math.PI/2, 
        Math.PI, 
        Math.PI, 
        3*Math.PI/2, 
        3*Math.PI/2, 
        0,],
    },
    LoopStyle.LoopRepeat,
    Infinity,
    false
  ),
  new GLTFAction(
    'walk',
    'robot1',
    0,
    'Walking'
  )
];

export const exampleModel3 = new Model(camera, meshes, gltfs, actions, lights);