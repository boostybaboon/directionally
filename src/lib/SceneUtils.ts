import * as THREE from 'three';
import type { 
  Camera, 
  Asset, 
  Action,
  AnimationDict, 
} from './Model';
import { 
  cameraPresenters, 
  assetPresenters, 
  actionPresenters
} from './Model';

export class SceneUtils {
  static createCamera(camera: Camera): THREE.Camera {
    const presenterClass = cameraPresenters[camera.type];
    const presenter = new presenterClass(camera.name, camera.config);
    let presentableCamera = presenter.getPresentableCamera();

    return presentableCamera;
  }

  static async sceneObjectForAsset(asset: Asset): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    const presenterClass = assetPresenters[asset.type];
    const presenter = new presenterClass(asset.name, asset.config, asset.parent);
    let presentableAsset = presenter.getPresentableAsset();

    return presentableAsset;
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