import { 
    Model, 
    CameraType, 
    AssetType, 
    GeometryType, 
    MaterialType,
    KeyframeTrackType,
    ActionType,
    type KeyframeActionData,
} from './Model';

import { 
    type PerspectiveCameraData, 
    type DirectionalLightData, 
    type MeshData, 
    type BoxGeometryData, 
    type MeshStandardMaterialData,
    type NumberKeyframeTrackData,
    type Camera,
    type Action,
    LoopStyle
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
                color: 0x808080,
            } as MeshStandardMaterialData,
            position: [0, 0, 0],
            rotation: [-Math.PI / 2, 0, 0]
        }
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
            } as BoxGeometryData,
            materialType: MaterialType.MeshStandardMaterial,
            material: {
                color: 0x00ff00
            } as MeshStandardMaterialData,
            position: [0, 2, 0],
            rotation: [0, 0, 0]
        } as MeshData
    }
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
            clampWhenFinished: false
        } as KeyframeActionData
    }
];

export const exampleModel1 = new Model(camera, assets, actions);