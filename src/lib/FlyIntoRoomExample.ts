import { Model } from './Model';
import { 
    KeyframeTrackType,
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
    1000
);
camera.position = new THREE.Vector3(0, 5, -30);
camera.lookAt = new THREE.Vector3(0, 3, 0);

const lights = [
    // Main directional light
    new DirectionalLightAsset(
        'light1',
        0xffffff,
        1.5
    ),
    // Hemisphere light
    new HemisphereLightAsset(
        'light2',
        0xffffff,
        0x444444,
        2.5
    ),
    // Spotlights
    new SpotLightAsset(
        'spotLight1',
        0xffffff,
        0,
        Math.PI / 8,
        0,
        2
    ),
    new SpotLightAsset(
        'spotLight2',
        0xffffff,
        0,
        Math.PI / 8,
        0,
        2
    )
];

// Set positions and targets
lights[0].position.copy(new THREE.Vector3(0, 20, 0));
lights[1].position = new THREE.Vector3(0, 20, -20);
lights[2].position = new THREE.Vector3(2, 3, 0.1);
lights[3].position = new THREE.Vector3(-2, 3, 6.9);

// Set spotlight targets
(lights[2] as SpotLightAsset).target.copy(new THREE.Vector3(-0.5, -0.25, 1));
(lights[3] as SpotLightAsset).target.copy(new THREE.Vector3(0, 0, -1));

const meshes: MeshAsset[] = [];

// Door hinge
const hinge = new MeshAsset(
    'hinge',
    new BoxGeometryAsset(0.1, 0.1, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
hinge.position = new THREE.Vector3(0, 2, 0);
hinge.rotation = new THREE.Euler(0, 0, 0);
meshes.push(hinge);

// Door
const door = new MeshAsset(
    'door',
    new BoxGeometryAsset(2, 4, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
door.position = new THREE.Vector3(-1, 0, 0);
door.rotation = new THREE.Euler(0, 0, 0);
door.parent = 'hinge';
meshes.push(door);

// Sphere light 1
const sphereLight1 = new MeshAsset(
    'sphereLight1',
    new SphereGeometryAsset(0.2),
    new MeshStandardMaterialAsset(0x808080, 0xffffff)
);
sphereLight1.position = new THREE.Vector3(2, 3, 0.1);
sphereLight1.rotation = new THREE.Euler(0, 0, 0);
meshes.push(sphereLight1);

// Sphere light 2
const sphereLight2 = new MeshAsset(
    'sphereLight2',
    new SphereGeometryAsset(0.2),
    new MeshStandardMaterialAsset(0x808080, 0xffffff)
);
sphereLight2.position = new THREE.Vector3(-2, 3, 6.9);
sphereLight2.rotation = new THREE.Euler(0, 0, 0);
meshes.push(sphereLight2);

// Ground
const ground = new MeshAsset(
    'ground',
    new PlaneGeometryAsset(50, 50),
    new MeshStandardMaterialAsset(0x808080)
);
ground.position = new THREE.Vector3(0, 0, 0);
ground.rotation = new THREE.Euler(-Math.PI / 2, 0, 0);
meshes.push(ground);

// Wall 1
const wall1 = new MeshAsset(
    'wall1',
    new BoxGeometryAsset(8, 6, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
wall1.position = new THREE.Vector3(-6, 3, 0);
wall1.rotation = new THREE.Euler(0, 0, 0);
meshes.push(wall1);

// Wall 2
const wall2 = new MeshAsset(
    'wall2',
    new BoxGeometryAsset(4, 6, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
wall2.position = new THREE.Vector3(2, 3, 0);
wall2.rotation = new THREE.Euler(0, 0, 0);
meshes.push(wall2);

// Wall 3
const wall3 = new MeshAsset(
    'wall3',
    new BoxGeometryAsset(2, 2, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
wall3.position = new THREE.Vector3(-1, 5, 0);
wall3.rotation = new THREE.Euler(0, 0, 0);
meshes.push(wall3);

// Wall 4
const wall4 = new MeshAsset(
    'wall4',
    new BoxGeometryAsset(14, 6, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
wall4.position = new THREE.Vector3(-3, 3, 7);
wall4.rotation = new THREE.Euler(0, 0, 0);
meshes.push(wall4);

// Wall 5 (back wall)
const wall5 = new MeshAsset(
    'wall5',
    new BoxGeometryAsset(7, 6, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
wall5.position = new THREE.Vector3(-10, 3, 3.5);
wall5.rotation = new THREE.Euler(0, Math.PI / 2, 0);
meshes.push(wall5);

// Wall 6 (right wall)
const wall6 = new MeshAsset(
    'wall6',
    new BoxGeometryAsset(7, 6, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
wall6.position = new THREE.Vector3(4, 3, 3.5);
wall6.rotation = new THREE.Euler(0, Math.PI / 2, 0);
meshes.push(wall6);

// Roof
const roof = new MeshAsset(
    'roof',
    new BoxGeometryAsset(14, 7, 0.1),
    new MeshStandardMaterialAsset(0x808080)
);
roof.position = new THREE.Vector3(-3, 6, 3.5);
roof.rotation = new THREE.Euler(Math.PI / 2, 0, 0);
meshes.push(roof);

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
