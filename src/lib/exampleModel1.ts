import { Model } from './Model';
import { 
    KeyframeTrackType,
    type NumberKeyframeTrackData,
    LoopStyle,
    KeyframeAction
} from './model/Action';
import { PerspectiveCameraAsset } from './model/Camera';
import { DirectionalLightAsset } from './model/Light';
import { BoxGeometryAsset, PlaneGeometryAsset } from './model/Geometry';
import { MeshStandardMaterialAsset } from './model/Material';
import { MeshAsset } from './model/Mesh';
import * as THREE from 'three';

const camera = new PerspectiveCameraAsset(
    'camera1',
    75,
    0.1,
    1000,
    new THREE.Vector3(2, 5, 5),
    new THREE.Vector3(0, 0, 0)
);

const lights = [
    new DirectionalLightAsset(
        'light1',
        0xffffff,
        1,
        new THREE.Vector3(5, 10, 7)
    )
];

const meshes = [
    // Ground plane
    new MeshAsset(
        'plane1',
        new PlaneGeometryAsset(100, 100),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(0, 0, 0),
        new THREE.Euler(-Math.PI / 2, 0, 0)
    ),
    // Box
    new MeshAsset(
        'box1',
        new BoxGeometryAsset(1, 1, 1),
        new MeshStandardMaterialAsset(0x00ff00),
        new THREE.Vector3(0, 2, 0),
        new THREE.Euler(0, 0, 0)
    )
];

const actions = [
    new KeyframeAction(
        'rotate',
        'camera1',
        0,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.rotation[y]',
            times: [0, 5],
            values: [0, Math.PI * 2],
        },
        LoopStyle.LoopRepeat,
        Infinity,
        false
    )
];

export const exampleModel1 = new Model(camera, meshes, [], actions, lights);