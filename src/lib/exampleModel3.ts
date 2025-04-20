import { 
  Model, 
  AssetType, 
  GeometryType, 
  MaterialType,
  KeyframeTrackType,
  type GLTFData,
  type MeshData,
  ActionType,
  type KeyframeActionData,
  type GLTFActionData,
  type VectorKeyframeTrackData,
  PerspectiveCameraAsset
} from './Model';

import { 
  type HemisphereLightData, 
  type MeshStandardMaterialData,
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

const assets = [
  {
    type: AssetType.HemisphereLight,
    name: 'light1',
    config: {
      skyColor: 0xffffbb,
      groundColor: 0x080820,
      intensity: 1,
      position: [0, 20, 0]
    } as HemisphereLightData
  },
  {
    type: AssetType.Mesh,
    name: 'plane1',
    config: {
        geometryType: GeometryType.PlaneGeometry,
        geometry: {
            width: 20,
            height: 20
        },
        materialType: MaterialType.MeshStandardMaterial,
        material: {
            color: 0x808080,
        } as MeshStandardMaterialData,
        position: [0, 0, 0],
        rotation: [-Math.PI / 2, 0, 0]
    } as MeshData
  },
  {
    type: AssetType.GLTF,
    name: 'robot1',
    config: {
      url: '/models/gltf/RobotExpressive.glb',      
      position: [0, 0, 0],
      rotation: [0, 0, 0],
    } as GLTFData
  }
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
  },
];

export const exampleModel3 = new Model(camera, assets, actions);