import type * as THREE from 'three';
import type { AnimationDict } from '../../../lib/model/Action';

export interface Transport {
  seconds: number;
  start(): void;
  pause(): void;
  stop(): void;
  cancel(): void;
  scheduleOnce(callback: (time: number) => void, time: number): number;
}

export type PlaybackState = {
  isPlaying: boolean;
  position: number;
};

export type AnimationEntry = {
  anim: THREE.AnimationAction;
  start: number;
  end: number;
  loop: THREE.AnimationActionLoopStyles;
  repetitions: number;
};

export type EngineLoadPayload = {
  animations: AnimationDict;
  mixers: THREE.AnimationMixer[];
};
