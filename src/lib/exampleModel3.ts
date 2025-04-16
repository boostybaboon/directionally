import { Model } from './model/index';
import { CameraType } from './model/camera/types';
import { GeometryType } from './model/geometry/types';
import { MaterialType } from './model/material/types';
import { AssetType } from './model/types';
import type { HemisphereLightData } from './model/light/types';
import type { GLTFData } from './model/gltf/types';
import { ActionType } from './model/animation/types';

const camera = {
  type: CameraType.PerspectiveCamera,
  name: 'camera1',
  config: {
    fov: 45,
    near: 0.1,
    far: 1000,
    position: [3, 10, 20],
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
        color: 0x808080
      },
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0]
    } as Record<string, any>
  },
  {
    type: AssetType.GLTF,
    name: 'robot1',
    config: {
      url: '/models/gltf/RobotExpressive.glb',
      position: [0, 0, 0],
      rotation: [0, 0, 0]
    } as GLTFData
  }
];

const actions = [
  {
    type: ActionType.Keyframe,
    name: 'walkPosition',
    target: 'robot1',
    config: {
      property: '.position',
      times: [0, 2, 4, 6, 8],
      values: [
        0, 0, 0,
        0, 0, 7.5,
        7.5, 0, 7.5,
        7.5, 0, 0,
        0, 0, 0
      ],
      loop: true,
      repetitions: Infinity
    } as Record<string, any>
  },
  {
    type: ActionType.Keyframe,
    name: 'walkRotation1',
    target: 'robot1',
    config: {
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
        0
      ],
      loop: true,
      repetitions: Infinity
    } as Record<string, any>
  },
  {
    type: ActionType.GLTF,
    name: 'walk',
    target: 'robot1',
    config: {
      animationName: 'Walking',
      startTime: 0,
      endTime: 10
    } as Record<string, any>
  }
];

export const exampleModel3 = new Model(camera, assets, actions);