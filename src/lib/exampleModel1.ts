import { Model } from './model/index';
import { CameraType } from './model/camera/types';
import { GeometryType } from './model/geometry/types';
import { MaterialType } from './model/material/types';
import { AssetType } from './model/types';
import type { DirectionalLightData } from './model/light/types';
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
    type: AssetType.DirectionalLight,
    name: 'light1',
    config: {
      color: 0xffffff,
      intensity: 1,
      position: [5, 10, 7]
    } as DirectionalLightData
  },
  {
    type: AssetType.Mesh,
    name: 'plane1',
    config: {
      geometryType: GeometryType.PlaneGeometry,
      geometry: {
        width: 100,
        height: 100
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
    name: 'box1',
    config: {
      geometryType: GeometryType.BoxGeometry,
      geometry: {
        width: 1,
        height: 1,
        depth: 1
      },
      materialType: MaterialType.MeshStandardMaterial,
      material: {
        color: 0x00ff00
      },
      position: [0, 2, 0],
      rotation: [0, 0, 0]
    } as Record<string, any>
  }
];

const actions = [
  {
    type: ActionType.Keyframe,
    name: 'rotate',
    target: 'camera1',
    config: {
      property: '.rotation[y]',
      times: [0, 5],
      values: [0, Math.PI * 2],
      loop: true,
      repetitions: Infinity
    } as Record<string, any>
  }
];

export const exampleModel1 = new Model(camera, assets, actions);