import * as Tone from 'tone';
import * as THREE from 'three';
import type { AnimationDict } from '../../lib/model/Action';
import type { Transport, PlaybackState, EngineLoadPayload } from './types';

// Tone transport adapter to decouple UI from the core
class ToneTransportAdapter implements Transport {
  get seconds() {
    return Tone.getTransport().seconds;
  }
  set seconds(value: number) {
    Tone.getTransport().seconds = value;
  }
  start() {
    Tone.getTransport().start();
  }
  pause() {
    Tone.getTransport().pause();
  }
  stop() {
    Tone.getTransport().stop();
  }
  cancel() {
    Tone.getTransport().cancel();
  }
  scheduleOnce(callback: (time: number) => void, time: number): number {
    return Tone.getTransport().scheduleOnce(callback as any, time);
  }
}

export class PlaybackEngine {
  private transport: Transport;
  private animations: AnimationDict = {};
  private mixers: THREE.AnimationMixer[] = [];
  private positionUpdateInterval: number | null = null;
  private state: PlaybackState = { isPlaying: false, position: 0 };

  constructor(transport?: Transport) {
    this.transport = transport ?? new ToneTransportAdapter();
  }

  load(payload: EngineLoadPayload) {
    // Preserve existing Tone schedules created by Presenter; only reset local state
    this.animations = payload.animations;
    this.mixers = payload.mixers;
    this.state.position = 0;
    this.state.isPlaying = false;
  }

  getPosition(): number {
    return this.transport.seconds;
  }

  setPosition(time: number) {
    // Sets the transport seconds; Presenter should also update UI slider.
    this.transport.seconds = time;
    this.state.position = time;
  }

  play() {
    const currentTime = this.transport.seconds;
    // Match Presenter: unpause animations that started and are not ended, or loop repeat
    (Object.values(this.animations) as unknown as EngineLoadPayload['animations'][string][]).forEach((animationList) => {
      (animationList as unknown as EngineLoadPayload['animations'][string]).forEach((anim: any) => {
        if (anim.start < currentTime && (currentTime < anim.end || anim.loop === THREE.LoopRepeat)) {
          anim.anim.paused = false;
        }
      });
    });

    this.transport.start();
    this.state.isPlaying = true;
  }

  pause() {
    this.transport.pause();
    this.state.position = this.transport.seconds;
    this.state.isPlaying = false;
    this.clearPositionUpdateInterval();

    // Match Presenter: mark all animations paused
    (Object.values(this.animations) as unknown as EngineLoadPayload['animations'][string][]).forEach((animationList) => {
      (animationList as unknown as EngineLoadPayload['animations'][string]).forEach((anim: any) => {
        anim.anim.paused = true;
      });
    });
  }

  rewind() {
    // Set transport to 0 and seek logic will re-enable correct initial actions
    this.setPosition(0);
    this.seek(0);
  }

  stop() {
    this.transport.stop();
    this.state.isPlaying = false;
    this.clearPositionUpdateInterval();
  }

  // CRITICAL: mirror Presenter.setSequenceTo for correctness
  seek(time: number) {
    // Update transport (Tone is source of truth)
    this.setPosition(time);

    // Equivalent to pauseAndDisableAll from Presenter
    (Object.values(this.animations) as unknown as EngineLoadPayload['animations'][string][]).forEach((animationList) => {
      (animationList as unknown as EngineLoadPayload['animations'][string]).forEach((anim: any) => {
        anim.anim.enabled = false;
        anim.anim.getMixer().setTime(0);
        anim.anim.paused = true;
      });
    });

    // For each animation list, iterate from last to first selecting appropriate state
    (Object.entries(this.animations) as unknown as Array<[string, EngineLoadPayload['animations'][string]]>).forEach(([_, animationList]) => {
      for (let i = (animationList as any).length - 1; i >= 0; i--) {
        const anim = (animationList as any)[i];

        if (i === 0) {
          anim.anim.enabled = true;
          anim.anim.time = 0;
        }

        if (time < anim.start) {
          continue;
        }

        if (time >= anim.end) {
          anim.anim.enabled = true;
          if (anim.loop === THREE.LoopOnce) {
            anim.anim.time = (anim.end - anim.start);
          } else if (anim.loop === THREE.LoopRepeat) {
            anim.anim.time = (time - anim.start) % (anim.end - anim.start);
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
  }

  update(delta: number) {
    // Drive mixers; called from Presenter animation loop
    this.mixers.forEach((m) => m.update(delta));
  }

  private clearPositionUpdateInterval() {
    if (this.positionUpdateInterval !== null) {
      window.clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }
  }
}
