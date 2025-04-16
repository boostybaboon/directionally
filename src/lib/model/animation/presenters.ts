import * as THREE from 'three';
import type { IPresentableAction, KeyframeActionData, GLTFActionData, AnimationDict } from './types';
import { LoopStyle } from './types';
import type { Action } from './types';

export class KeyframeActionPresenter implements IPresentableAction {
  name: string;
  config: KeyframeActionData;

  constructor(name: string, config: KeyframeActionData) {
    this.name = name;
    this.config = config;
  }

  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void {
    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    // Handle both old and new config formats
    const property = this.config.keyframeTrackData?.property || this.config.property;
    const times = this.config.keyframeTrackData?.times || this.config.times;
    const values = this.config.keyframeTrackData?.values || this.config.values;
    const loop = this.config.loop === true ? LoopStyle.LoopRepeat : (this.config.loop || LoopStyle.LoopOnce);
    const repetitions = this.config.repetitions || (loop === LoopStyle.LoopRepeat ? Infinity : 1);
    const clampWhenFinished = this.config.clampWhenFinished || false;

    if (!property || !times || !values) {
      throw new Error('Missing required animation properties');
    }
    const track = new THREE.KeyframeTrack(
      `.${action.target}.${property}`,
      times as number[],
      values as number[]
    );

    const clip = new THREE.AnimationClip(this.name, -1, [track]);
    const anim = mixer.clipAction(clip);
    anim.loop = loop === LoopStyle.LoopRepeat ? THREE.LoopRepeat : THREE.LoopOnce;
    anim.repetitions = repetitions;
    anim.clampWhenFinished = clampWhenFinished;

    if (!animationDict[action.target]) {
      animationDict[action.target] = [];
    }

    animationDict[action.target].push({
      anim,
      start: 0,
      end: Math.max(...times),
      loop: anim.loop,
      repetitions: repetitions
    });
  }
}

export class GLTFActionPresenter implements IPresentableAction {
  name: string;
  config: GLTFActionData;

  constructor(name: string, config: GLTFActionData) {
    this.name = name;
    this.config = config;
  }

  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void {
    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const clip = meshAnimationClips.find(clip => clip.name === this.config.animationName);
    if (!clip) {
      console.error(`Could not find animation clip with name ${this.config.animationName}`);
      return;
    }

    const anim = mixer.clipAction(clip);
    anim.loop = THREE.LoopOnce;
    anim.clampWhenFinished = true;

    if (!animationDict[action.target]) {
      animationDict[action.target] = [];
    }

    animationDict[action.target].push({
      anim,
      start: this.config.startTime,
      end: this.config.endTime,
      loop: anim.loop,
      repetitions: 1
    });
  }
} 