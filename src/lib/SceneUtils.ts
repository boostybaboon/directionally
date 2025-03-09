import * as THREE from 'three';
import type { Camera, Asset, Action } from './Model';
import { cameraPresenters, assetPresenters } from './Model';

export class SceneUtils {
  static createCamera(camera: Camera): THREE.Camera {
    const presenterClass = cameraPresenters[camera.type];
    const presenter = new presenterClass(camera.config);
    let presentableCamera = presenter.getPresentableCamera();

    return presentableCamera;
  }

  static sceneObjectForAsset(asset: Asset): THREE.Object3D {
    const presenterClass = assetPresenters[asset.type];
    const presenter = new presenterClass(asset.config);
    let presentableAsset = presenter.getPresentableAsset();

    return presentableAsset;
  }

  static addAction(
    animationDict: { [key: string]: { anim: THREE.AnimationAction; start: number; end: number }[] },
    mixers: THREE.AnimationMixer[],
    action: Action
  ): void {
    // const target = action.target === 'camera' ? camera : scene.getObjectByName(action.target);
    // const track = new THREE.KeyframeTrack(action.property, action.times, action.values);
    // const clip = new THREE.AnimationClip(action.name, -1, [track]);
    // const mixer = new THREE.AnimationMixer(target);
    // const animAction = mixer.clipAction(clip).setLoop(action.loop, 1);
    // animAction.clampWhenFinished = action.clampWhenFinished;
    // animAction.play();
    // animAction.paused = true;
    // mixers.push(mixer);
    // animationDict[action.name] = [{ anim: animAction, start: action.times[0], end: action.times[action.times.length - 1] }];
  }
}