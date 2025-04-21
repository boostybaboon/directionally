import { Model } from './Model';
import { 
    ActionType,
    type KeyframeActionData,
    KeyframeTrackType,
    type NumberKeyframeTrackData,
    type VectorKeyframeTrackData,
    type QuaternionKeyframeTrackData,
    type Action,
    LoopStyle
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
    {
        type: ActionType.Keyframe,
        name: 'cameraRotate',
        target: 'camera1',
        config: {
            keyframeTrackType: KeyframeTrackType.QuaternionKeyframeTrack,
            keyframeTrackData: {
                property: '.quaternion',
                times: [0, 5],
                values: [
                    0, 1, 0, 0,   // Quaternion for 180 degrees around Y-axis
                    0, 0, 0, 1   // Quaternion for 0 degrees (identity quaternion)
                ]
            } as QuaternionKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 9,
        } as KeyframeActionData
    } as Action,
    // Camera move forward animation (first part)
    {
        type: ActionType.Keyframe,
        name: 'cameraMove1',
        target: 'camera1',
        config: {
            keyframeTrackType: KeyframeTrackType.VectorKeyframeTrack,
            keyframeTrackData: {
                property: '.position',
                times: [0, 3],
                values: [0, 5, -30, 0, 2, -10]
            } as VectorKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 0,
        } as KeyframeActionData
    } as Action,
    // Camera move forward animation (second part)
    {
        type: ActionType.Keyframe,
        name: 'cameraMove2',
        target: 'camera1',
        config: {
            keyframeTrackType: KeyframeTrackType.VectorKeyframeTrack,
            keyframeTrackData: {
                property: '.position',
                times: [0, 3],
                values: [0, 2, -10, -2, 2, 3]
            } as VectorKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 5,
        } as KeyframeActionData
    } as Action,
    // Door opening animation
    {
        type: ActionType.Keyframe,
        name: 'doorOpen',
        target: 'hinge',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.rotation[y]',
                times: [0, 2],
                values: [0, Math.PI / 3]
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 3,
        } as KeyframeActionData
    } as Action,
    // Door closing animation
    {
        type: ActionType.Keyframe,
        name: 'doorClose',
        target: 'hinge',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.rotation[y]',
                times: [0, 2],
                values: [Math.PI / 3, 0]
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 13,
        } as KeyframeActionData
    } as Action,
    // Spotlight 1 brighten
    {
        type: ActionType.Keyframe,
        name: 'spotLight1Brighten',
        target: 'spotLight1',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.intensity',
                times: [0, 3],
                values: [0, 1]
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 7,
        } as KeyframeActionData
    } as Action,
    // Spotlight 1 dim
    {
        type: ActionType.Keyframe,
        name: 'spotLight1Dim',
        target: 'spotLight1',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.intensity',
                times: [0, 1],
                values: [1, 0]
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 14,
        } as KeyframeActionData
    } as Action,
    // Spotlight 2 brighten
    {
        type: ActionType.Keyframe,
        name: 'spotLight2Brighten',
        target: 'spotLight2',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.intensity',
                times: [0, 3],
                values: [0, 1]
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 7,
        } as KeyframeActionData
    } as Action,
    // Spotlight 2 dim
    {
        type: ActionType.Keyframe,
        name: 'spotLight2Dim',
        target: 'spotLight2',
        config: {
            keyframeTrackType: KeyframeTrackType.NumberKeyframeTrack,
            keyframeTrackData: {
                property: '.intensity',
                times: [0, 1],
                values: [1, 0]
            } as NumberKeyframeTrackData,
            loop: LoopStyle.LoopOnce,
            repetitions: 1,
            clampWhenFinished: true,
            startTime: 14,
        } as KeyframeActionData
    } as Action,
];

export const flyIntoRoomExample = new Model(camera, meshes, [], actions, lights, 0x33334c);
