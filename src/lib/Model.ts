import * as THREE from 'three';
import type { CameraAsset } from './model/Camera';
import type { LightAsset } from './model/Light';
import type { MeshAsset } from './model/Mesh';
import type { GLTFAsset } from './model/GLTF';

type JSONValue = string | number | boolean | { [key: string]: JSONValue } | JSONValue[];

type JSONObject = { [key: string]: JSONValue };

export enum LoopStyle {
  LoopRepeat,
  LoopOnce,
  //LoopPingPong, TODO - implement this, but by reversing the KeyframeTrack data, not by using the THREE.LoopPingPong constant
  //as it's hard to correctly set a pingponged animation to time t and have it start correctly
}

export enum KeyframeTrackType {
  NumberKeyframeTrack,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
}

export type NumberKeyframeTrackData = {
  property: string;
  times: number[];
  values: number[];
}

export type VectorKeyframeTrackData = {
  property: string;
  times: number[];
  values: number[];
}

export type QuaternionKeyframeTrackData = {
  property: string;
  times: number[];
  values: number[];
}

export type KeyframeTrackData = NumberKeyframeTrackData | VectorKeyframeTrackData | QuaternionKeyframeTrackData;

export interface IPresentableKeyframeTrack {
  getKeyframeTrack(): THREE.KeyframeTrack;
}

export class NumberKeyframeTrackPresenter implements IPresentableKeyframeTrack {
  config: NumberKeyframeTrackData;

  constructor(config: NumberKeyframeTrackData) {
    this.config = config;
  }

  getKeyframeTrack(): THREE.KeyframeTrack {
    return new THREE.NumberKeyframeTrack(this.config.property, this.config.times, this.config.values);
  }
}

export class VectorKeyframeTrackPresenter implements IPresentableKeyframeTrack {
  config: VectorKeyframeTrackData;

  constructor(config: VectorKeyframeTrackData) {
    this.config = config;
  }

  getKeyframeTrack(): THREE.KeyframeTrack {
    return new THREE.VectorKeyframeTrack(this.config.property, this.config.times, this.config.values);
  }
}

export class QuaternionKeyframeTrackPresenter implements IPresentableKeyframeTrack {
  config: QuaternionKeyframeTrackData;

  constructor(config: QuaternionKeyframeTrackData) {
    this.config = config;
  }

  getKeyframeTrack(): THREE.KeyframeTrack {
    return new THREE.QuaternionKeyframeTrack(this.config.property, this.config.times, this.config.values, THREE.InterpolateLinear);
  }
}

export const keyframeTrackPresenters: { [key: string]: new (data: any) => IPresentableKeyframeTrack } = {
  [KeyframeTrackType.NumberKeyframeTrack]: NumberKeyframeTrackPresenter,
  [KeyframeTrackType.VectorKeyframeTrack]: VectorKeyframeTrackPresenter,
  [KeyframeTrackType.QuaternionKeyframeTrack]: QuaternionKeyframeTrackPresenter,
};

export const loopStyles: { [key: string]: THREE.AnimationActionLoopStyles } = {
  [LoopStyle.LoopRepeat]: THREE.LoopRepeat,
  [LoopStyle.LoopOnce]: THREE.LoopOnce,
};

export enum ActionType {
  Keyframe,
  GLTF,
}

export type Action = {
  type: ActionType;
  name: string;
  target: string;
  config: JSONObject;
}

export type KeyframeActionData = {
  keyframeTrackType: KeyframeTrackType;
  keyframeTrackData: JSONObject;
  loop: LoopStyle;
  repetitions: number;
  clampWhenFinished: boolean;
  startTime: number;
}

export type GLTFActionData = {
  animationName: string;
  startTime: number;
}

export type AnimationDict = {
  [key: string]: {
    anim: THREE.AnimationAction;
    start: number;
    end: number;
    loop: THREE.AnimationActionLoopStyles;
    repetitions: number;
  }[];
};

export type IPresentableAction = {
  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void;
}

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
    const keyframeTrackPresenterClass = keyframeTrackPresenters[this.config.keyframeTrackType];
    const keyframeTrackPresenter = new keyframeTrackPresenterClass(this.config.keyframeTrackData);
    const keyframeTrack = keyframeTrackPresenter.getKeyframeTrack();

    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const clip = new THREE.AnimationClip(this.name, -1, [keyframeTrack]);
    const animAction = mixer.clipAction(clip);

    animAction.loop = loopStyles[this.config.loop];
    animAction.repetitions = this.config.repetitions;
    animAction.clampWhenFinished = this.config.clampWhenFinished;
    animAction.play();
    animAction.paused = true;

    const animationDictKey = target.name+'_'+this.config.keyframeTrackData.property;

    if (!animationDict[animationDictKey]) {
      animationDict[animationDictKey] = [];
    }

    animationDict[animationDictKey].push({
      anim: animAction,
      start: this.config.startTime,
      end: this.config.startTime + clip.duration,
      loop: loopStyles[this.config.loop],
      repetitions: this.config.repetitions,
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

    const clip = meshAnimationClips.find((meshClip) => meshClip.name === this.config.animationName);

    if (clip) {
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      action.play();

      const animationDictKey = target.name+'_'+this.config.animationName;

      if (!animationDict[animationDictKey]) {
        animationDict[animationDictKey] = [];
      }

      animationDict[animationDictKey].push({
        anim: action,
        //TODO - what to really do about start and end times given definition in the clip and the action model??
        start: this.config.startTime,
        end: clip.duration,
        loop: THREE.LoopRepeat,
        repetitions: Infinity
      });
    }
    else {
      console.error('Animation not found:', this.config.animationName);
    }
  }
}

export const actionPresenters: { [key: string]: new (name: string, data: any) => IPresentableAction } = {
  [ActionType.Keyframe]: KeyframeActionPresenter,
  [ActionType.GLTF]: GLTFActionPresenter,
};

export class Model {
  camera: CameraAsset;
  meshes: MeshAsset[];
  gltfs: GLTFAsset[];
  actions: Action[];
  lights: LightAsset[];
  backgroundColor?: number;

  constructor(
    camera: CameraAsset, 
    meshes: MeshAsset[] = [],
    gltfs: GLTFAsset[] = [],
    actions: Action[] = [], 
    lights: LightAsset[] = [],
    backgroundColor?: number
  ) {
    this.camera = camera;
    this.meshes = meshes;
    this.gltfs = gltfs;
    this.actions = actions;
    this.lights = lights;
    this.backgroundColor = backgroundColor;
  }
}