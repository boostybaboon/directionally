import * as THREE from 'three';
import type { PathKeyframe } from '../../core/domain/types.js';

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
    end: number;           // scene timeline stop time; Infinity = runs until end of scene
    clipDuration: number;  // raw clip duration for LoopRepeat modulo
    loop: THREE.AnimationActionLoopStyles;
    repetitions: number;
    fadeIn: number;        // seconds; 0 = hard cut
    fadeOut: number;       // seconds; 0 = hard cut
  }[];
};

const loopStyles: { [key: string]: THREE.AnimationActionLoopStyles } = {
  [LoopStyle.LoopRepeat]: THREE.LoopRepeat,
  [LoopStyle.LoopOnce]: THREE.LoopOnce,
};

export abstract class Action {
  constructor(
    public readonly name: string,
    public readonly target: string,
    public readonly startTime: number
  ) {}

  abstract addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    meshAnimationClips: THREE.AnimationClip[],
    mixerMap?: Map<string, THREE.AnimationMixer>
  ): void;
}

export class KeyframeAction extends Action {
  constructor(
    name: string,
    target: string,
    startTime: number,
    private readonly trackType: KeyframeTrackType,
    private readonly trackData: KeyframeTrackData,
    private readonly loop: LoopStyle,
    private readonly repetitions: number,
    private readonly clampWhenFinished: boolean
  ) {
    super(name, target, startTime);
  }

  addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    meshAnimationClips: THREE.AnimationClip[],
    _mixerMap?: Map<string, THREE.AnimationMixer>
  ): void {
    let keyframeTrack: THREE.KeyframeTrack;
    
    switch (this.trackType) {
      case KeyframeTrackType.NumberKeyframeTrack:
        keyframeTrack = new THREE.NumberKeyframeTrack(
          this.trackData.property,
          this.trackData.times,
          this.trackData.values
        );
        break;
      case KeyframeTrackType.VectorKeyframeTrack:
        keyframeTrack = new THREE.VectorKeyframeTrack(
          this.trackData.property,
          this.trackData.times,
          this.trackData.values
        );
        break;
      case KeyframeTrackType.QuaternionKeyframeTrack:
        keyframeTrack = new THREE.QuaternionKeyframeTrack(
          this.trackData.property,
          this.trackData.times,
          this.trackData.values,
          THREE.InterpolateLinear
        );
        break;
    }

    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const clip = new THREE.AnimationClip(this.name, -1, [keyframeTrack]);
    const animAction = mixer.clipAction(clip);

    animAction.loop = loopStyles[this.loop];
    animAction.repetitions = this.repetitions;
    animAction.clampWhenFinished = this.clampWhenFinished;
    animAction.play();
    animAction.paused = true;

    const animationDictKey = target.name + '_' + this.trackData.property;

    if (!animationDict[animationDictKey]) {
      animationDict[animationDictKey] = [];
    }

    animationDict[animationDictKey].push({
      anim: animAction,
      start: this.startTime,
      // LoopRepeat runs indefinitely — Infinity prevents seek() from hard-disabling after one cycle.
      // LoopOnce has a natural endpoint at startTime + clip.duration.
      end: this.loop === LoopStyle.LoopRepeat ? Infinity : this.startTime + clip.duration,
      clipDuration: clip.duration,
      loop: loopStyles[this.loop],
      repetitions: this.repetitions,
      fadeIn: 0,
      fadeOut: 0,
    });
  }
}

export class GLTFAction extends Action {
  constructor(
    name: string,
    target: string,
    startTime: number,
    private readonly animationName: string,
    private readonly endTime?: number,
    private readonly fadeIn: number = 0,
    private readonly fadeOut: number = 0
  ) {
    super(name, target, startTime);
  }

  addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    meshAnimationClips: THREE.AnimationClip[],
    mixerMap?: Map<string, THREE.AnimationMixer>
  ): void {
    // Use a shared mixer per actor so multiple clips can be crossfaded.
    // Falls back to a new mixer when no mixerMap is provided (e.g. tests).
    let mixer = mixerMap?.get(target.name);
    if (!mixer) {
      mixer = new THREE.AnimationMixer(target);
      mixerMap?.set(target.name, mixer);
      mixers.push(mixer);
    }

    const clip = meshAnimationClips.find((meshClip) => meshClip.name === this.animationName)
      // Case-insensitive fallback for models whose clip names differ only in casing.
      ?? meshAnimationClips.find((meshClip) => meshClip.name.toLowerCase() === this.animationName.toLowerCase());

    if (clip) {
      // Create a uniquely-named copy so multiple segments of the same base clip
      // can coexist as independent actions on the shared mixer (mixer caches by clip UUID).
      const segmentClip = new THREE.AnimationClip(this.name, clip.duration, clip.tracks);
      const action = mixer.clipAction(segmentClip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      // Start at weight 0; the Tone schedule at startTime will set the correct weight.
      // Do NOT set paused=true — the clip must remain active in the mixer for per-frame
      // weight updates (crossfades) and seek() time positioning to work correctly.
      action.setEffectiveWeight(0);
      action.play();

      if (!animationDict[this.name]) {
        animationDict[this.name] = [];
      }

      animationDict[this.name].push({
        anim: action,
        start: this.startTime,
        end: this.endTime ?? Infinity,
        clipDuration: clip.duration,
        loop: THREE.LoopRepeat,
        repetitions: Infinity,
        fadeIn: this.fadeIn,
        fadeOut: this.fadeOut,
      });
    } else {
      console.error('Animation not found:', this.animationName);
    }
  }
}

/**
 * Drives the playback camera along a spatial path defined by PathKeyframe[]
 * (position + lookAt at each keyframe time). Position is interpolated via
 * VectorKeyframeTrack; orientation is baked as quaternions and interpolated
 * via QuaternionKeyframeTrack — no per-frame camera.lookAt() call needed.
 *
 * The PathKeyframe type is shared with future character MovePath actions so
 * the same spline editor UI and runtime can serve both camera and actor paths.
 */
export class CameraPathAction extends Action {
  constructor(
    name: string,
    target: string,
    private readonly keyframes: PathKeyframe[],
  ) {
    super(name, target, 0);
  }

  addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    _meshClips: THREE.AnimationClip[],
    _mixerMap?: Map<string, THREE.AnimationMixer>,
  ): void {
    if (this.keyframes.length === 0) return;

    const times = this.keyframes.map((k) => k.time);
    const posValues: number[] = [];
    const quatValues: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);

    for (const kf of this.keyframes) {
      const pos    = new THREE.Vector3(...kf.position);
      const lookAt = new THREE.Vector3(...kf.lookAt);
      posValues.push(pos.x, pos.y, pos.z);
      const q = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().lookAt(pos, lookAt, up),
      );
      quatValues.push(q.x, q.y, q.z, q.w);
    }

    const clipDuration = times[times.length - 1];
    const clip = new THREE.AnimationClip(this.name, clipDuration, [
      new THREE.VectorKeyframeTrack('.position', times, posValues),
      new THREE.QuaternionKeyframeTrack('.quaternion', times, quatValues, THREE.InterpolateLinear),
    ]);

    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const animAction = mixer.clipAction(clip);
    animAction.loop = THREE.LoopOnce;
    animAction.clampWhenFinished = true;
    animAction.play();
    animAction.paused = true;

    if (!animationDict[this.name]) animationDict[this.name] = [];
    animationDict[this.name].push({
      anim: animAction,
      start: 0,
      end: clipDuration,
      clipDuration,
      loop: THREE.LoopOnce,
      repetitions: 1,
      fadeIn: 0,
      fadeOut: 0,
    });
  }
}