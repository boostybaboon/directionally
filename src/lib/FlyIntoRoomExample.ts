import { 
    Model, 
    AssetType, 
    GeometryType, 
    MaterialType,
    KeyframeTrackType,
    ActionType,
    type KeyframeActionData,
    PerspectiveCameraAsset,
    DirectionalLightAsset,
    HemisphereLightAsset,
    SpotLightAsset
} from './Model';

import { 
    type MeshData, 
    type BoxGeometryData, 
    type SphereGeometryData,
    type PlaneGeometryData,
    type MeshStandardMaterialData,
    type NumberKeyframeTrackData,
    type VectorKeyframeTrackData,
    type QuaternionKeyframeTrackData,
    type Action,
    LoopStyle
} from './Model';

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
        0xffffff,  // Sky color
        0x444444,  // Ground color
        2.5,       // Intensity
        new THREE.Vector3(0, 20, -20)  // Position
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

const assets = [
    // Door hinge
    {
        type: AssetType.Mesh,
        name: 'hinge',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 0.1,
                height: 0.1,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [0, 2, 0],
            rotation: [0, 0, 0]
        } as MeshData
    },
    // Door
    {
        type: AssetType.Mesh,
        name: 'door',
        parent: 'hinge',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 2,
                height: 4,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [-1, 0, 0],
            rotation: [0, 0, 0]
        } as MeshData
    },
    // Sphere lights
    {
        type: AssetType.Mesh,
        name: 'sphereLight1',
        config: {
            geometryType: GeometryType.SphereGeometry,
            geometry: {
                radius: 0.2,
                widthSegments: 32,
                heightSegments: 32
            } as SphereGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080,
                emissive: 0xffffff
            } as MeshStandardMaterialData,
            position: [2, 3, 0.1],
            rotation: [0, 0, 0]
        } as MeshData
    },
    {
        type: AssetType.Mesh,
        name: 'sphereLight2',
        config: {
            geometryType: GeometryType.SphereGeometry,
            geometry: {
                radius: 0.2,
                widthSegments: 32,
                heightSegments: 32
            } as SphereGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080,
                emissive: 0xffffff
            } as MeshStandardMaterialData,
            position: [-2, 3, 6.9],
            rotation: [0, 0, 0]
        } as MeshData
    },
    // Ground
    {
        type: AssetType.Mesh,
        name: 'ground',
        config: {
            geometryType: GeometryType.PlaneGeometry,
            geometry: {
                width: 50,
                height: 50
            } as PlaneGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [0, 0, 0],
            rotation: [-Math.PI / 2, 0, 0]
        } as MeshData
    },
    // Walls
    {
        type: AssetType.Mesh,
        name: 'wall1',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 8,
                height: 6,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [-6, 3, 0],
            rotation: [0, 0, 0]
        } as MeshData
    },
    {
        type: AssetType.Mesh,
        name: 'wall2',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 4,
                height: 6,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [2, 3, 0],
            rotation: [0, 0, 0]
        } as MeshData
    },
    {
        type: AssetType.Mesh,
        name: 'wall3',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 2,
                height: 2,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [-1, 5, 0],
            rotation: [0, 0, 0]
        } as MeshData
    },
    {
        type: AssetType.Mesh,
        name: 'wall4',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 14,
                height: 6,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [-3, 3, 7],
            rotation: [0, 0, 0]
        } as MeshData
    },
    {
        type: AssetType.Mesh,
        name: 'wall5',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 7,
                height: 6,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [-10, 3, 3.5],
            rotation: [0, Math.PI / 2, 0]
        } as MeshData
    },
    {
        type: AssetType.Mesh,
        name: 'wall6',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 7,
                height: 6,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [4, 3, 3.5],
            rotation: [0, Math.PI / 2, 0]
        } as MeshData
    },
    // Roof
    {
        type: AssetType.Mesh,
        name: 'roof',
        config: {
            geometryType: GeometryType.BoxGeometry,
            geometry: {
                width: 14,
                height: 7,
                depth: 0.1
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x808080
            } as MeshStandardMaterialData,
            position: [-3, 6, 3.5],
            rotation: [Math.PI / 2, 0, 0]
        } as MeshData
    }
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
    },
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
    },
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
    },
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
    },
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
    },
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
    },
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
    },
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
    },
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
    }
];

export const flyIntoRoomExample = new Model(camera, assets, actions, lights, 0x33334c);
