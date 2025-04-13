import * as THREE from 'three';
import * as Tone from 'tone';

export interface AnimationState {
    anim: THREE.AnimationAction;
    mixer: THREE.AnimationMixer;
    start: number;
    end: number;
    loopMode: 'once' | 'repeat' | 'pingpong';
    repetitions: number;
}

export interface Sequencer {
    schedule: (callback: (time: number) => void, time: number) => void;
    clear: (time: number) => void;
    start: () => void;
    pause: () => void;
    seconds: number;
}

export class AnimationController {
    private animationDict: { [key: string]: AnimationState } = {};
    private sequencer: Sequencer;

    constructor(sequencer: Sequencer) {
        this.sequencer = sequencer;
    }

    public setupAnimation(
        object: THREE.Object3D, 
        trackName: string, 
        times: number[], 
        values: number[], 
        duration: number,
        startTime: number = 0,
        endTime: number = duration,
        loopMode: 'once' | 'repeat' | 'pingpong' = 'repeat',
        repetitions: number = Infinity
    ): void {
        // Create animation clip
        const track = new THREE.KeyframeTrack(trackName, times, values);
        const clip = new THREE.AnimationClip('animation', duration, [track]);

        // Create mixer for this animation
        const mixer = new THREE.AnimationMixer(object);
        const action = mixer.clipAction(clip);

        // Set loop mode
        switch (loopMode) {
            case 'once':
                action.setLoop(THREE.LoopOnce, 1);
                break;
            case 'repeat':
                action.setLoop(THREE.LoopRepeat, repetitions);
                break;
            case 'pingpong':
                action.setLoop(THREE.LoopPingPong, repetitions);
                break;
        }

        // Create unique key for this animation
        const key = `${object.name}.${trackName}`;

        // Store animation state
        this.animationDict[key] = {
            anim: action,
            mixer,
            start: startTime,
            end: endTime,
            loopMode,
            repetitions
        };

        // Schedule animation start
        this.sequencer.schedule((time) => {
            console.log(`Animation starting for ${key} at global time ${time}s`);
            Tone.getDraw().schedule(() => {
                action.enabled = true;
                action.time = 0;
                action.paused = false;
            }, time);
        }, startTime);

        // Schedule animation end for non-looping animations
        if (loopMode === 'once') {
            this.sequencer.schedule((time) => {
                console.log(`Animation ending for ${key} at global time ${time}s`);
                Tone.getDraw().schedule(() => {
                    action.paused = true;
                }, time);
            }, endTime);
        }

        // Set initial state
        action.enabled = false;
        action.paused = true;
        action.time = 0;
    }

    public play(): void {
        this.sequencer.start();
    }

    public pause(): void {
        this.sequencer.pause();
        Object.values(this.animationDict).forEach((state) => {
            state.anim.paused = true;
        });
    }

    public setTime(time: number): void {
        this.sequencer.seconds = time;
        
        // Disable all animations first
        Object.values(this.animationDict).forEach((state) => {
            state.anim.enabled = false;
            state.anim.paused = true;
        });

        // Enable and set time for animations that should be active
        Object.values(this.animationDict).forEach((state) => {
            if (time < state.start) {
                return;
            }
            
            if (time >= state.end) {
                state.anim.enabled = true;
                if (state.loopMode === 'once') {
                    state.anim.time = (state.end - state.start);
                } else if (state.loopMode === 'repeat') {
                    state.anim.time = (time - state.start) % (state.end - state.start);
                } else if (state.loopMode === 'pingpong') {
                    const cycleTime = state.end - state.start;
                    const cycleProgress = (time - state.start) % (cycleTime * 2);
                    state.anim.time = cycleProgress < cycleTime ? cycleProgress : cycleTime * 2 - cycleProgress;
                }
                return;
            }
            
            if (time >= state.start && time < state.end) {
                state.anim.enabled = true;
                state.anim.time = (time - state.start);
            }
        });

        // Update all mixers to apply changes
        Object.values(this.animationDict).forEach((state) => {
            state.mixer.update(0);
        });
    }

    public update(delta: number): void {
        Object.values(this.animationDict).forEach((state) => {
            state.mixer.update(delta);
        });
    }
} 