import type * as THREE from 'three';
import type { AnimationDict } from '../../lib/model/Action';
import type { ActorVoice } from '../domain/types.js';

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
  end: number;           // scene timeline stop time; Infinity = runs until end of scene
  clipDuration: number;  // raw clip duration for LoopRepeat modulo
  loop: THREE.AnimationActionLoopStyles;
  repetitions: number;
  fadeIn: number;        // seconds; 0 = hard cut
  fadeOut: number;       // seconds; 0 = hard cut
};

export type EngineLoadPayload = {
  animations: AnimationDict;
  mixers: THREE.AnimationMixer[];
  duration?: number;
};

export type SpeechEntry = {
  actorId: string;
  startTime: number;
  text: string;
  voice?: ActorVoice;
};
