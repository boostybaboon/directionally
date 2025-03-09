import { 
  Model, 
  CameraType, 
  AssetType, 
  GeometryType, 
  MaterialType,
  KeyframeTrackType,
} from './Model';

import { 
  type PerspectiveCameraData, 
  type HemisphereLightData, 
  type MeshData, 
  type SphereGeometryData, 
  type MeshStandardMaterialData,
  type NumberKeyframeTrackData,
  type Action,
  type Camera,
  LoopStyles
} from './Model';

const camera = {
  type: CameraType.PerspectiveCamera,
  name: 'camera1',
  config: {
    fov: 75,
    aspect: 2,
    near: 0.1,
    far: 1000,
    position: [2, 5, 5],
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
    name: 'bounce',
    target: 'sphere1',
    keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
    keyframeTrackData: {
      property: '.position[y]',
      times: [0, 1, 2],
      values: [0, 2, 0],
    } as NumberKeyframeTrackData,
    loop: LoopStyles.LoopPingPong,
    clampWhenFinished: false
  } as Action,
];

export const exampleModel2 = new Model(camera, assets, actions);