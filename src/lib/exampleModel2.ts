import { 
  Model, 
  AssetType, 
  GeometryType, 
  MaterialType,
  KeyframeTrackType,
  type KeyframeActionData,
  ActionType,
  PerspectiveCameraAsset
} from './Model';

import { 
  type HemisphereLightData, 
  type MeshData, 
  type SphereGeometryData, 
  type MeshStandardMaterialData,
  type NumberKeyframeTrackData,
  LoopStyle
} from './Model';

import * as THREE from 'three';

const camera = new PerspectiveCameraAsset(
  'camera1',
  75,
  2,
  0.1,
  1000,
  new THREE.Vector3(2, 5, 5),
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
      position: [0, 10, 0]
    } as HemisphereLightData
  },
  {
    type: AssetType.Mesh,
    name: 'plane1',
    config: {
        geometryType: GeometryType.PlaneGeometry,
        geometry: {
            width: 10,
            height: 10
        },
        materialType: MaterialType.MeshStandardMaterial,
        material: {
            color: 0x808080,
        } as MeshStandardMaterialData,
        position: [0, 0, 0],
        rotation: [-Math.PI / 2, 0, 0]
    }
  },
  {
    type: AssetType.Mesh,
    name: 'sphere1',
    config: {
      geometryType: GeometryType.SphereGeometry,
      geometry: {
        radius: 1,
        widthSegments: 32,
        heightSegments: 32
      } as SphereGeometryData,
      materialType: MaterialType.MeshStandardMaterial,
      material: {
        color: 0x0000ff
      } as MeshStandardMaterialData,
      position: [0, 2, 0],
      rotation: [0, 0, 0],
    } as MeshData
  }
];

const actions = [
  {
    type: ActionType.Keyframe,
    name: 'bounce',
    target: 'sphere1',
    config: {
      keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
      keyframeTrackData: {
        property: '.position[y]',
        times: [0, 1, 2],
        values: [0, 2, 0],
      } as NumberKeyframeTrackData,
      loop: LoopStyle.LoopRepeat,
      repetitions: Infinity,
      clampWhenFinished: false,
      startTime: 0,
    } as KeyframeActionData,
  }
];

export const exampleModel2 = new Model(camera, assets, actions);