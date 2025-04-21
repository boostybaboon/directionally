import { 
  Model, 
  KeyframeTrackType,
  ActionType,
  type KeyframeActionData,
  type GLTFActionData,
  type VectorKeyframeTrackData,
  PerspectiveCameraAsset,
  HemisphereLightAsset,
  PlaneGeometryAsset,
  MeshStandardMaterialAsset,
  MeshAsset,
  GLTFAsset,
  type NumberKeyframeTrackData,
  LoopStyle
} from './Model';

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
  {
    type: ActionType.Keyframe,
    name: 'walkPosition',
    target: 'robot1',
    config: {
      keyframeTrackType: KeyframeTrackType.VectorKeyframeTrack,
      keyframeTrackData: {
        property: '.position',
        times: [0, 2, 4, 6, 8],
        values: [  0,   0,   0, 
                   0,   0, 7.5,
                 7.5,   0, 7.5,
                 7.5,   0,   0,
                   0,   0,   0,],
      } as VectorKeyframeTrackData,
      loop: LoopStyle.LoopRepeat,
      repetitions: Infinity,
      clampWhenFinished: false,
      startTime: 0,
    } as KeyframeActionData,
  },
  {
    type: ActionType.Keyframe,
    name: 'walkRotation1',
    target: 'robot1',
    config: {
      keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
      keyframeTrackData: {
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
      } as NumberKeyframeTrackData,
      loop: LoopStyle.LoopRepeat,
      repetitions: Infinity,
      clampWhenFinished: false,
      startTime: 0,
    } as KeyframeActionData,
  },
  {
    type: ActionType.GLTF,
    name: 'walk',
    target: 'robot1',
    config: {
      animationName: 'Walking',
      startTime: 0,
    } as GLTFActionData,
  }
];

export const exampleModel3 = new Model(camera, meshes, gltfs, actions, lights);