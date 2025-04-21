import { 
    Model, 
    ActionType,
    type KeyframeActionData,
    DirectionalLightAsset,
    PerspectiveCameraAsset,
    PlaneGeometryAsset,
    BoxGeometryAsset,
    MeshStandardMaterialAsset,
    MeshAsset,
    KeyframeTrackType,
    type NumberKeyframeTrackData,
    LoopStyle
} from './Model';

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
    {
        type: ActionType.Keyframe,
        name: 'rotate',
        target: 'camera1',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.rotation[y]',
                times: [0, 5],
                values: [0, Math.PI * 2],
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopRepeat,
            repetitions: Infinity,
            clampWhenFinished: false,
            startTime: 0
        } as KeyframeActionData
    }
];

export const exampleModel1 = new Model(camera, meshes, [], actions, lights);