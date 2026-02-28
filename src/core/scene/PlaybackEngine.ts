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
  private duration: number = 0;
  private state: PlaybackState = { isPlaying: false, position: 0 };

  constructor(transport?: Transport) {
    this.transport = transport ?? new ToneTransportAdapter();
  }

  load(payload: EngineLoadPayload) {
    // Preserve existing Tone schedules created by Presenter; only reset local state
    this.animations = payload.animations;
    this.mixers = payload.mixers;
    this.duration = payload.duration ?? 0;
    this.state.position = 0;
    this.state.isPlaying = false;
  }

  getPosition(): number {
    return this.transport.seconds;
  }

  getDuration(): number {
    return this.duration;
  }

  setPosition(time: number) {
    // Sets the transport seconds; Presenter should also update UI slider.
    this.transport.seconds = time;
    this.state.position = time;
  }

  play() {
    const currentTime = this.transport.seconds;
    // Unpause animations whose window has started (including clips starting exactly at currentTime)
    (Object.values(this.animations) as unknown as EngineLoadPayload['animations'][string][]).forEach((animationList) => {
      (animationList as unknown as EngineLoadPayload['animations'][string]).forEach((anim: any) => {
        if (anim.start <= currentTime && currentTime < anim.end) {
          const elapsed = currentTime - anim.start;
          let weight = 1;
          if (anim.fadeIn > 0 && elapsed < anim.fadeIn) {
            weight = elapsed / anim.fadeIn;
          } else if (anim.fadeOut > 0 && anim.end !== Infinity && currentTime > anim.end - anim.fadeOut) {
            weight = (anim.end - currentTime) / anim.fadeOut;
          }
          anim.anim.setEffectiveWeight(weight);
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

    // Mark all animations paused
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

        // Fallback for the first entry: show initial pose only if its start time
        // has been reached. Without this guard a future clip would enable itself
        // before it starts when every earlier entry has been skipped.
        if (i === 0 && time >= anim.start) {
          anim.anim.enabled = true;
          anim.anim.time = 0;
          anim.anim.setEffectiveWeight(1);
        }

        if (time < anim.start) {
          continue;
        }

        // Past explicit scene endTime: LoopOnce holds final frame; LoopRepeat stops
        if (anim.end !== Infinity && time >= anim.end) {
          if (anim.loop === THREE.LoopOnce) {
            anim.anim.enabled = true;
            anim.anim.time = anim.clipDuration;
          } else {
            // LoopRepeat with explicit endTime: clip window has closed
            anim.anim.enabled = false;
          }
          break;
        }

        if (time >= anim.start && (anim.end === Infinity || time < anim.end)) {
          anim.anim.enabled = true;
          const elapsed = time - anim.start;
          // Compute fractional weight for crossfade windows to support seek during blends
          let weight = 1;
          if (anim.fadeIn > 0 && elapsed < anim.fadeIn) {
            weight = elapsed / anim.fadeIn;
          } else if (anim.fadeOut > 0 && anim.end !== Infinity && time > anim.end - anim.fadeOut) {
            weight = (anim.end - time) / anim.fadeOut;
          }
          anim.anim.setEffectiveWeight(weight);
          if (anim.loop === THREE.LoopRepeat) {
            anim.anim.time = elapsed % anim.clipDuration;
          } else {
            anim.anim.time = elapsed;
          }
          break;
        }
      }
    });
  }

  update(delta: number) {
    // Drive mixers; called from Presenter animation loop
    this.mixers.forEach((m) => m.update(delta));
  }

}
