import { Model } from './model/index';
import { CameraType } from './model/camera/types';
import { GeometryType } from './model/geometry/types';
import { MaterialType } from './model/material/types';
import { AssetType } from './model/types';
import type { HemisphereLightData } from './model/light/types';
import { ActionType } from './model/animation/types';

const camera = {
  type: CameraType.PerspectiveCamera,
  name: 'camera1',
  config: {
    fov: 75,
    near: 0.1,
    far: 1000,
    position: [2, 5, 5],
    lookAt: [0, 0, 0]
  }
};

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
        color: 0x808080
      },
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0]
    } as Record<string, any>
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
      },
      materialType: MaterialType.MeshStandardMaterial,
      material: {
        color: 0x0000ff
      },
      position: [0, 2, 0],
      rotation: [0, 0, 0]
    } as Record<string, any>
  }
];

const actions = [
  {
    type: ActionType.Keyframe,
    name: 'bounce',
    target: 'sphere1',
    config: {
      property: '.position[y]',
      times: [0, 1, 2],
      values: [0, 2, 0],
      loop: true,
      repetitions: Infinity
    } as Record<string, any>
  }
];

export const exampleModel2 = new Model(camera, assets, actions);