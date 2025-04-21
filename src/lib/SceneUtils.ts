import type { 
  Action,
  AnimationDict
} from './model/Action';

import { 
  actionPresenters
} from './model/Action';

import * as THREE from 'three';

export class SceneUtils {
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