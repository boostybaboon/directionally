import { writable, type Writable } from 'svelte/store';
import type { Object3DAsset } from '../scene/Object3D/Object3DAsset';
import type { PerspectiveCamera } from 'three';

export interface SceneState {
    camera: PerspectiveCamera | null;
    assets: Object3DAsset[];
    selectedAsset: Object3DAsset | null;
}

export interface SceneStore extends Writable<SceneState> {
    selectAsset: (asset: Object3DAsset | null) => void;
    loadScene: (camera: PerspectiveCamera, assets: Object3DAsset[]) => void;
}

function createSceneStore(): SceneStore {
    const { subscribe, set, update } = writable<SceneState>({
        camera: null,
        assets: [],
        selectedAsset: null
    });

    return {
        subscribe,
        set,
        update,
        selectAsset: (asset: Object3DAsset | null) => 
            update(state => ({ ...state, selectedAsset: asset })),
        loadScene: (camera: PerspectiveCamera, assets: Object3DAsset[]) =>
            set({ camera, assets, selectedAsset: null })
    };
}

export const sceneStore = createSceneStore(); 