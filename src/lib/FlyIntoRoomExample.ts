import { Model } from './Model';
import { 
    KeyframeTrackType,
    type NumberKeyframeTrackData,
    type VectorKeyframeTrackData,
    type QuaternionKeyframeTrackData,
    LoopStyle,
    KeyframeAction
} from './model/Action';
import { PerspectiveCameraAsset } from './model/Camera';
import { DirectionalLightAsset, HemisphereLightAsset, SpotLightAsset } from './model/Light';
import { BoxGeometryAsset, PlaneGeometryAsset, SphereGeometryAsset } from './model/Geometry';
import { MeshStandardMaterialAsset } from './model/Material';
import { MeshAsset } from './model/Mesh';
import * as THREE from 'three';

const camera = new PerspectiveCameraAsset(
    'camera1',
    45.8366,
    0.1,
    1000,
    new THREE.Vector3(0, 5, -30),
    new THREE.Vector3(0, 3, 0)
);

const lights = [
    // Main directional light
    new DirectionalLightAsset(
        'light1',
        0xffffff,
        1.5,
        new THREE.Vector3(0, 20, 0)
    ),
    // Hemisphere light
    new HemisphereLightAsset(
        'light2',
        0xffffff,
        0x444444,
        2.5,
        new THREE.Vector3(0, 20, -20)
    ),
    // Spotlights
    new SpotLightAsset(
        'spotLight1',
        0xffffff,
        0,
        Math.PI / 8,
        0,
        2,
        new THREE.Vector3(2, 3, 0.1),
        new THREE.Vector3(-0.5, -0.25, 1)
    ),
    new SpotLightAsset(
        'spotLight2',
        0xffffff,
        0,
        Math.PI / 8,
        0,
        2,
        new THREE.Vector3(-2, 3, 6.9),
        new THREE.Vector3(0, 0, -1)
    )
];

const meshes = [
    // Door hinge
    new MeshAsset(
        'hinge',
        new BoxGeometryAsset(0.1, 0.1, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(0, 2, 0),
        new THREE.Euler(0, 0, 0)
    ),
    // Door
    new MeshAsset(
        'door',
        new BoxGeometryAsset(2, 4, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(-1, 0, 0),
        new THREE.Euler(0, 0, 0),
        'hinge'
    ),
    // Sphere lights
    new MeshAsset(
        'sphereLight1',
        new SphereGeometryAsset(0.2),
        new MeshStandardMaterialAsset(0x808080, 0xffffff),
        new THREE.Vector3(2, 3, 0.1),
        new THREE.Euler(0, 0, 0)
    ),
    new MeshAsset(
        'sphereLight2',
        new SphereGeometryAsset(0.2),
        new MeshStandardMaterialAsset(0x808080, 0xffffff),
        new THREE.Vector3(-2, 3, 6.9),
        new THREE.Euler(0, 0, 0)
    ),
    // Ground
    new MeshAsset(
        'ground',
        new PlaneGeometryAsset(50, 50),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(0, 0, 0),
        new THREE.Euler(-Math.PI / 2, 0, 0)
    ),
    // Walls
    new MeshAsset(
        'wall1',
        new BoxGeometryAsset(8, 6, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(-6, 3, 0),
        new THREE.Euler(0, 0, 0)
    ),
    new MeshAsset(
        'wall2',
        new BoxGeometryAsset(4, 6, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(2, 3, 0),
        new THREE.Euler(0, 0, 0)
    ),
    new MeshAsset(
        'wall3',
        new BoxGeometryAsset(2, 2, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(-1, 5, 0),
        new THREE.Euler(0, 0, 0)
    ),
    new MeshAsset(
        'wall4',
        new BoxGeometryAsset(14, 6, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(-3, 3, 7),
        new THREE.Euler(0, 0, 0)
    ),
    // Wall 5 (back wall)
    new MeshAsset(
        'wall5',
        new BoxGeometryAsset(7, 6, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(-10, 3, 3.5),
        new THREE.Euler(0, Math.PI / 2, 0)
    ),
    // Wall 6 (right wall)
    new MeshAsset(
        'wall6',
        new BoxGeometryAsset(7, 6, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(4, 3, 3.5),
        new THREE.Euler(0, Math.PI / 2, 0)
    ),
    // Roof
    new MeshAsset(
        'roof',
        new BoxGeometryAsset(14, 7, 0.1),
        new MeshStandardMaterialAsset(0x808080),
        new THREE.Vector3(-3, 6, 3.5),
        new THREE.Euler(Math.PI / 2, 0, 0)
    )
];

const actions = [
    // Camera rotation animation
    new KeyframeAction(
        'cameraRotate',
        'camera1',
        9,
        KeyframeTrackType.QuaternionKeyframeTrack,
        {
            property: '.quaternion',
            times: [0, 5],
            values: [
                0, 1, 0, 0,   // Quaternion for 180 degrees around Y-axis
                0, 0, 0, 1   // Quaternion for 0 degrees (identity quaternion)
            ]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Camera move forward animation (first part)
    new KeyframeAction(
        'cameraMove1',
        'camera1',
        0,
        KeyframeTrackType.VectorKeyframeTrack,
        {
            property: '.position',
            times: [0, 3],
            values: [0, 5, -30, 0, 2, -10]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Camera move forward animation (second part)
    new KeyframeAction(
        'cameraMove2',
        'camera1',
        5,
        KeyframeTrackType.VectorKeyframeTrack,
        {
            property: '.position',
            times: [0, 3],
            values: [0, 2, -10, -2, 2, 3]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Door opening animation
    new KeyframeAction(
        'doorOpen',
        'hinge',
        3,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.rotation[y]',
            times: [0, 2],
            values: [0, Math.PI / 3]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Door closing animation
    new KeyframeAction(
        'doorClose',
        'hinge',
        13,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.rotation[y]',
            times: [0, 2],
            values: [Math.PI / 3, 0]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Spotlight 1 brighten
    new KeyframeAction(
        'spotLight1Brighten',
        'spotLight1',
        3,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.intensity',
            times: [0, 2],
            values: [0, 2]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Spotlight 2 brighten
    new KeyframeAction(
        'spotLight2Brighten',
        'spotLight2',
        3,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.intensity',
            times: [0, 2],
            values: [0, 2]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Spotlight 1 dim
    new KeyframeAction(
        'spotLight1Dim',
        'spotLight1',
        13,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.intensity',
            times: [0, 2],
            values: [2, 0]
        },
        LoopStyle.LoopOnce,
        1,
        true
    ),
    // Spotlight 2 dim
    new KeyframeAction(
        'spotLight2Dim',
        'spotLight2',
        13,
        KeyframeTrackType.NumberKeyframeTrack,
        {
            property: '.intensity',
            times: [0, 2],
            values: [2, 0]
        },
        LoopStyle.LoopOnce,
        1,
        true
    )
];

export const flyIntoRoomExample = new Model(camera, meshes, [], actions, lights, 0x33334c);
