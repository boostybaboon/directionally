import * as THREE from 'three';
import type { 
  Camera, 
  Asset, 
  Action, 
} from './Model';
import { 
  cameraPresenters, 
  assetPresenters, 
  keyframeTrackPresenters, 
  loopStyles
} from './Model';

export class SceneUtils {
  static createCamera(camera: Camera): THREE.Camera {
    const presenterClass = cameraPresenters[camera.type];
    const presenter = new presenterClass(camera.name, camera.config);
    let presentableCamera = presenter.getPresentableCamera();

    return presentableCamera;
  }

  static sceneObjectForAsset(asset: Asset): THREE.Object3D {
    const presenterClass = assetPresenters[asset.type];
    const presenter = new presenterClass(asset.name, asset.config);
    let presentableAsset = presenter.getPresentableAsset();

    return presentableAsset;
  }

  static addAction(
    // TODO should be a type to match what's in Presenter.svelte
    animationDict: 
    { 
      [key: string]: 
      { 
        anim: THREE.AnimationAction; 
        start: number; 
        end: number 
        loop: THREE.AnimationActionLoopStyles;
        repetitions: number;
      }[] 
    },
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    action: Action
  ): void {
    const presenterClass = keyframeTrackPresenters[action.keyframeTrackType];
    const presenter = new presenterClass(action.keyframeTrackData);
    const track = presenter.getKeyframeTrack();
    const clip = new THREE.AnimationClip(action.name, -1, [track]);
    const mixer = new THREE.AnimationMixer(target);
    var animAction = mixer.clipAction(clip).setLoop(loopStyles[action.loop], action.repetitions);
    animAction.clampWhenFinished = action.clampWhenFinished;
    animAction.play();
    animAction.paused = true;
    mixers.push(mixer);
    animationDict[action.name] = [{ 
      anim: animAction, 
      start: action.keyframeTrackData.times[0], 
      end: action.keyframeTrackData.times[action.keyframeTrackData.times.length - 1],
      loop: loopStyles[action.loop],
      repetitions: action.repetitions
    }];
  }
}