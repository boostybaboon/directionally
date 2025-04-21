import { Model } from './Model';
import { 
  KeyframeTrackType,
  type VectorKeyframeTrackData,
  type QuaternionKeyframeTrackData,
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
  1000,
  new THREE.Vector3(3, 10, 20),
  new THREE.Vector3(0, 0, 0)
);

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

const meshes = [
  new MeshAsset(
    'plane1',
    new PlaneGeometryAsset(20, 20),
    new MeshStandardMaterialAsset(0x808080),
    new THREE.Vector3(0, 0, 0),
    new THREE.Euler(-Math.PI / 2, 0, 0)
  )
];

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
    KeyframeTrackType.QuaternionKeyframeTrack,
    {
      property: '.quaternion',
      times: [0.0, 0.2, 1.8, 2.0, 2.2, 3.8, 4.0, 4.2, 5.8, 6.0, 6.2, 7.8, 8.0],
      values: [
        0, 0.3826834, 0, -0.9238795, 
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0.3826834, 0, 0.9238795, 
        0, 0.7071068, 0, 0.7071068,
        0, 0.7071068, 0, 0.7071068, 
        0, 0.9238795, 0, 0.3826834, 
        0, 1, 0, 0,
        0, 1, 0, 0,
        0, 0.9238795, 0, -0.3826834, 
        0, 0.7071068, 0, -0.7071068,
        0, 0.7071068, 0, -0.7071068,
        0, 0.3826834, 0, -0.9238795,
      ],
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

export const exampleModel4 = new Model(camera, meshes, gltfs, actions, lights);