import * as THREE from 'three';

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
    meshAnimationClips: THREE.AnimationClip[]
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
    meshAnimationClips: THREE.AnimationClip[]
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
      end: this.startTime + clip.duration,
      clipDuration: clip.duration,
      loop: loopStyles[this.loop],
      repetitions: this.repetitions,
    });
  }
}

export class GLTFAction extends Action {
  constructor(
    name: string,
    target: string,
    startTime: number,
    private readonly animationName: string,
    private readonly endTime?: number
  ) {
    super(name, target, startTime);
  }

  addAction(
    animationDict: AnimationDict,
    mixers: THREE.AnimationMixer[],
    target: THREE.Object3D,
    meshAnimationClips: THREE.AnimationClip[]
  ): void {
    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const clip = meshAnimationClips.find((meshClip) => meshClip.name === this.animationName);

    if (clip) {
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      action.play();

      const animationDictKey = target.name + '_' + this.animationName;

      if (!animationDict[animationDictKey]) {
        animationDict[animationDictKey] = [];
      }

      animationDict[animationDictKey].push({
        anim: action,
        start: this.startTime,
        end: this.endTime ?? Infinity,
        clipDuration: clip.duration,
        loop: THREE.LoopRepeat,
        repetitions: Infinity
      });
    } else {
      console.error('Animation not found:', this.animationName);
    }
  }
} 