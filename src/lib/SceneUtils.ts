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
    const gltfPresenter = new GTLFPresenter(asset.name, asset.config as GLTFData, asset.parent);
    return await gltfPresenter.getPresentableAsset();
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