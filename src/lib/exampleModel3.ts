import { 
  Model, 
  CameraType, 
  AssetType, 
  GeometryType, 
  MaterialType,
  KeyframeTrackType,
  type GLTFData,
  type MeshData,
  ActionType,
  type KeyframeActionData,
  type GLTFActionData,
} from './Model';

import { 
  type PerspectiveCameraData, 
  type HemisphereLightData, 
  type MeshStandardMaterialData,
  type NumberKeyframeTrackData,
  type Action,
  type Camera,
  LoopStyle
} from './Model';

const camera = {
  type: CameraType.PerspectiveCamera,
  name: 'camera1',
  config: {
    fov: 45,
    aspect: 2,
    near: 0.1,
    far: 1000,
    position: [3, 10, 10],
    lookAt: [0, 0, 0]
  } as PerspectiveCameraData
} as Camera;

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
            width: 10,
            height: 10
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
    name: 'bounce',
    target: 'robot1',
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
    } as KeyframeActionData,
  },
  {
    type: ActionType.GLTF,
    name: 'walk',
    target: 'robot1',
    config: {
      animationName: 'Walking',
      startTime: 0,
      endTime: 10,
    } as GLTFActionData,
  },
];

export const exampleModel3 = new Model(camera, assets, actions);