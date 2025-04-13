import * as THREE from 'three';

export interface AnimationState {
    anim: THREE.AnimationAction;
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
    private mixer: THREE.AnimationMixer | null = null;
    private animationDict: { [key: string]: AnimationState[] } = {};
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

        // Create mixer and action
        this.mixer = new THREE.AnimationMixer(object);
        const action = this.mixer.clipAction(clip);

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

        action.play();

        // Add to animation dictionary
        this.animationDict[trackName] = [{
            anim: action,
            start: startTime,
            end: endTime,
            loopMode,
            repetitions
        }];

        // Schedule animation state changes
        this.sequencer.clear(0);
        this.animationDict[trackName].forEach((anim) => {
            // Schedule start
            this.sequencer.schedule((time) => {
                if (this.mixer) {
                    anim.anim.enabled = true;
                    anim.anim.paused = false;
                }
            }, anim.start);

            // Schedule end for non-looping animations
            if (anim.loopMode === 'once') {
                this.sequencer.schedule((time) => {
                    anim.anim.paused = true;
                }, anim.end);
            }
        });

        // Set initial state
        action.paused = true;
        this.setTime(0);
    }

    public play(): void {
        this.sequencer.start();
        
        // Unpause animations that should be playing at current time
        const currentTime = this.sequencer.seconds;
        Object.values(this.animationDict).forEach((animationList) => {
            animationList.forEach((anim) => {
                if (anim.start <= currentTime && (currentTime < anim.end || anim.loopMode !== 'once')) {
                    anim.anim.paused = false;
                }
            });
        });
    }

    public pause(): void {
        this.sequencer.pause();
        
        // Pause all animations without resetting their time
        Object.values(this.animationDict).forEach((animationList) => {
            animationList.forEach((anim) => {
                anim.anim.paused = true;
            });
        });
    }

    public setTime(time: number): void {
        this.sequencer.seconds = time;
        
        // Update animation states based on time
        Object.entries(this.animationDict).forEach(([_, animationList]) => {
            for (let i = animationList.length - 1; i >= 0; i--) {
                const anim = animationList[i];

                if (time < anim.start) {
                    anim.anim.enabled = false;
                    continue;
                }
                
                if (time >= anim.end) {
                    anim.anim.enabled = true;
                    if (anim.loopMode === 'once') {
                        anim.anim.time = (anim.end - anim.start);
                    } else if (anim.loopMode === 'repeat') {
                        anim.anim.time = (time - anim.start) % (anim.end - anim.start);
                    } else if (anim.loopMode === 'pingpong') {
                        const cycleTime = anim.end - anim.start;
                        const cycleProgress = (time - anim.start) % (cycleTime * 2);
                        anim.anim.time = cycleProgress < cycleTime ? cycleProgress : cycleTime * 2 - cycleProgress;
                    }
                    break;
                }
                
                if (time >= anim.start && time < anim.end) {
                    anim.anim.enabled = true;
                    anim.anim.time = (time - anim.start);
                    break;
                }
            }
        });

        // Update mixer to apply changes
        if (this.mixer) {
            this.mixer.time = time;
            this.mixer.update(0);
        }
    }

    public update(delta: number): void {
        if (this.mixer) {
            this.mixer.update(delta);
        }
    }
} 