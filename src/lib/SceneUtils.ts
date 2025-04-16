import * as THREE from 'three';
import type { Camera } from './model/camera';
import { AssetType, type Asset } from './model/types';
import { ActionType, type Action, type AnimationDict } from './model/animation/types';
import { cameraPresenters } from './model/camera';
import { MeshPresenter } from './model/mesh/presenters';
import { KeyframeActionPresenter, GLTFActionPresenter } from './model/animation/presenters';
import { DirectionalLightPresenter, HemisphereLightPresenter } from './model/light/presenters';
import { GTLFPresenter } from './model/gltf/presenters';

const assetPresenters: Record<AssetType, any> = {
  [AssetType.Mesh]: MeshPresenter,
  [AssetType.DirectionalLight]: DirectionalLightPresenter,
  [AssetType.HemisphereLight]: HemisphereLightPresenter,
  [AssetType.SpotLight]: null,
  [AssetType.Group]: null,
  [AssetType.GLTF]: GTLFPresenter
};

const actionPresenters: Record<ActionType, any> = {
  [ActionType.Keyframe]: KeyframeActionPresenter,
  [ActionType.GLTF]: GLTFActionPresenter
};

export class SceneUtils {
  static createCamera(camera: Camera, aspect?: number): THREE.Camera {
    const presenterClass = cameraPresenters[camera.type];
    const presenter = new presenterClass(camera.name, camera.config);
    return presenter.getPresentableCamera(aspect);
  }

  static sceneObjectForAsset(asset: Asset): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    const presenterClass = assetPresenters[asset.type];
    if (!presenterClass) {
      throw new Error(`No presenter found for asset type ${AssetType[asset.type]}`);
    }
    const presenter = new presenterClass(asset.name, asset.config);
    return presenter.getPresentableAsset();
  }

  static addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    action: Action,
    meshAnimationClips: THREE.AnimationClip[]
  ): void {
    const presenterClass = actionPresenters[action.type];
    if (!presenterClass) {
      throw new Error(`No presenter found for action type ${ActionType[action.type]}`);
    }
    const presenter = new presenterClass(action.name, action.config);
    presenter.addAction(animationDict, mixers, target, action, meshAnimationClips);
  }
}