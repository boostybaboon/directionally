import type { 
  Asset,
  IPresentableAsset,
  MeshData,
  GLTFData,
  Action,
  AnimationDict
} from './Model';

import { 
  AssetType,
  MeshPresenter,
  GTLFPresenter,
  actionPresenters
} from './Model';

import * as THREE from 'three';

export class SceneUtils {
  static async sceneObjectForAsset(asset: Asset): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    switch (asset.type) {
      case AssetType.Mesh:
        const meshPresenter = new MeshPresenter(asset.name, asset.config as MeshData, asset.parent);
        return await meshPresenter.getPresentableAsset();
      
      case AssetType.GLTF:
        const gltfPresenter = new GTLFPresenter(asset.name, asset.config as GLTFData, asset.parent);
        return await gltfPresenter.getPresentableAsset();
      
      default:
        throw new Error(`Unsupported asset type: ${asset.type}`);
    }
  }

  static addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    action: Action,
    meshAnimationClips: THREE.AnimationClip[]
  ): void {
    const presenterClass = actionPresenters[action.type];
    const presenter = new presenterClass(action.name, action.config);
    presenter.addAction(animationDict, mixers, target, action, meshAnimationClips);
  }
}