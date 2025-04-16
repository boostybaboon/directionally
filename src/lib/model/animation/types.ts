import * as THREE from 'three';
import type { JSONObject } from '../types';

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

export type AnimationDict = {
  [key: string]: {
    anim: THREE.AnimationAction;
    start: number;
    end: number;
    loop: THREE.AnimationActionLoopStyles;
    repetitions: number;
  }[];
};

export type KeyframeActionData = {
  keyframeTrackType?: KeyframeTrackType;
  keyframeTrackData?: KeyframeTrackData;
  // Support for direct properties
  property?: string;
  times?: number[];
  values?: number[];
  loop?: LoopStyle | boolean;
  repetitions?: number;
  clampWhenFinished?: boolean;
}

export type GLTFActionData = {
  animationName: string;
  startTime: number;
  endTime: number;
}

export type Action = {
  type: ActionType;
  name: string;
  target: string;
  config: JSONObject;
}

export enum ActionType {
  Keyframe,
  GLTF,
}

export interface IPresentableAction {
  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void;
} 