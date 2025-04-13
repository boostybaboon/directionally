import { writable, type Writable } from 'svelte/store';
import type { Object3DAsset } from '../scene/Object3D/Object3DAsset';
import { Scene, Color } from 'three';
import type { PerspectiveCameraAsset } from '../scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset';
import type { AnimationData } from '../animation/AnimationData';

export interface SceneState {
    camera: PerspectiveCameraAsset | null;
    scene: Scene | null;
    assets: Object3DAsset[];
    selectedAsset: Object3DAsset | null;
    actions: AnimationData[];
}

export interface SceneStore extends Writable<SceneState> {
    selectAsset: (asset: Object3DAsset | null) => void;
    loadScene: (camera: PerspectiveCameraAsset, assets: Object3DAsset[], actions?: AnimationData[]) => void;
}

function createSceneStore(): SceneStore {
    const { subscribe, set, update } = writable<SceneState>({
        camera: null,
        scene: null,
        assets: [],
        selectedAsset: null,
        actions: []
    });

    return {
        subscribe,
        set,
        update,
        selectAsset: (asset: Object3DAsset | null) => 
            update(state => ({ ...state, selectedAsset: asset })),
        loadScene: (camera: PerspectiveCameraAsset, assets: Object3DAsset[], actions: AnimationData[] = []) => {
            // Create a new scene
            const scene = new Scene();
            scene.background = new Color(0xf0f0f0);

            // Add all assets to the scene
            assets.forEach(asset => {
                const object = asset.getObject3D();
                if (object) {
                    // Store reference to asset in userData for raycasting
                    object.userData.asset = asset;
                    scene.add(object);
                }
            });

            set({ camera, scene, assets, selectedAsset: null, actions });
        }
    };
}

export const sceneStore: SceneStore = createSceneStore(); 