import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PlaybackEngine } from './PlaybackEngine';
import type { Transport, EngineLoadPayload } from './types';
import type { AnimationDict } from '../../lib/model/Action';

/**
 * FakeTransport: In-memory transport for testing.
 * Allows manual control of `seconds` and schedule bookkeeping.
 */
class FakeTransport implements Transport {
  seconds: number = 0;
  isRunning: boolean = false;
  private schedules: Array<{ time: number; callback: (time: number) => void }> = [];

  start() {
    this.isRunning = true;
  }

  pause() {
    this.isRunning = false;
  }

  stop() {
    this.isRunning = false;
    this.seconds = 0;
  }

  cancel() {
    this.schedules = [];
  }

  scheduleOnce(callback: (time: number) => void, time: number): number {
    const id = this.schedules.length;
    this.schedules.push({ time, callback });
    return id;
  }
}

/**
 * FakeAnimationAction: Minimal AnimationAction mock for testing.
 */
class FakeAnimationAction {
  enabled: boolean = false;
  paused: boolean = true;
  time: number = 0;
  loop: THREE.AnimationActionLoopStyles = THREE.LoopOnce;
  clampWhenFinished: boolean = false;

  play() {
    this.paused = false;
  }

  getMixer() {
    return {
      setTime: () => {
        // no-op for testing
      },
    };
  }
}

/**
 * Helper to create a minimal AnimationDict entry for testing.
 */
function createAnimationEntry(
  start: number,
  end: number,
  loop: THREE.AnimationActionLoopStyles = THREE.LoopOnce
) {
  return {
    anim: new FakeAnimationAction() as unknown as THREE.AnimationAction,
    start,
    end,
    loop,
    repetitions: loop === THREE.LoopRepeat ? Infinity : 1,
  };
}

/**
 * Helper to load animations into an engine with fake transport.
 */
function setupEngine(animations: AnimationDict) {
  const transport = new FakeTransport();
  const engine = new PlaybackEngine(transport);
  const mixers: THREE.AnimationMixer[] = [];
  engine.load({ animations, mixers });
  return { engine, transport };
}

describe('PlaybackEngine - Shuttle Invariants', () => {
  it('play → pause → play preserves position', () => {
    const animations: AnimationDict = {
      'obj_prop': [createAnimationEntry(0, 2, THREE.LoopOnce)],
    };
    const { engine, transport } = setupEngine(animations);

    // Play at t=0
    engine.play();
    expect(transport.isRunning).toBe(true);
    expect(engine.getPosition()).toBe(0);

    // Simulate playback to t=0.5
    transport.seconds = 0.5;
    const posAt0_5 = engine.getPosition();
    expect(posAt0_5).toBe(0.5);

    // Pause
    engine.pause();
    expect(transport.isRunning).toBe(false);
    expect(engine.getPosition()).toBe(0.5);

    // Resume play: position should not jump
    engine.play();
    expect(engine.getPosition()).toBe(0.5);
  });

  it('paused seek into looping animation sets modulo time', () => {
    const animations: AnimationDict = {
      'obj_prop': [createAnimationEntry(0, 2, THREE.LoopRepeat)],
    };
    const { engine, transport } = setupEngine(animations);

    // Pause and seek to t=3 (past one cycle of 2-second loop)
    engine.pause();
    engine.seek(3);

    const entry = animations['obj_prop'][0];
    // Should wrap: (3 - 0) % (2 - 0) = 1
    expect(entry.anim.time).toBe(1);
    expect(entry.anim.enabled).toBe(true);
    expect(entry.anim.paused).toBe(true);
  });

  it('seek backwards into completed one-shot keeps final frame', () => {
    const animations: AnimationDict = {
      'obj_prop': [createAnimationEntry(0, 2, THREE.LoopOnce)],
    };
    const { engine, transport } = setupEngine(animations);

    // Seek to t=4 (past the 2-second animation)
    engine.pause();
    engine.seek(4);

    const entry = animations['obj_prop'][0];
    expect(entry.anim.enabled).toBe(true);
    // One-shot past end should be at duration (final frame)
    expect(entry.anim.time).toBe(2);
    expect(entry.anim.paused).toBe(true);

    // Now seek backwards into the middle at t=1
    engine.seek(1);
    expect(entry.anim.enabled).toBe(true);
    expect(entry.anim.time).toBe(1);
  });

  it('rewind after completion resets to initial state', () => {
    const anim1 = createAnimationEntry(0, 1, THREE.LoopOnce);
    const anim2 = createAnimationEntry(1, 2, THREE.LoopOnce);
    const animations: AnimationDict = {
      'obj_prop': [anim1, anim2],
    };
    const { engine } = setupEngine(animations);

    // Seek to t=2.5 (past both animations)
    engine.pause();
    engine.seek(2.5);

    // Rewind to 0
    engine.rewind();
    // At t=0, the reverse iteration ensures first animation (i===0) is enabled at time=0
    expect(anim1.anim.enabled).toBe(true);
    expect(anim1.anim.time).toBe(0);
    expect(anim2.anim.enabled).toBe(false);
  });

  it('rapid seek spam leaves consistent enabled states', () => {
    const anim1 = createAnimationEntry(0, 2, THREE.LoopRepeat);
    const anim2 = createAnimationEntry(2, 4, THREE.LoopRepeat);
    const animations: AnimationDict = {
      'obj_prop': [anim1, anim2],
    };
    const { engine } = setupEngine(animations);

    engine.pause();

    // Rapid seeks: 0 → 3 → 1 → 3.5 → 0.5
    engine.seek(0);
    expect(anim1.anim.enabled).toBe(true);
    expect(anim2.anim.enabled).toBe(false);

    engine.seek(3);
    // t=3 is in second animation window [2, 4)
    expect(anim1.anim.enabled).toBe(false);
    expect(anim2.anim.enabled).toBe(true);
    expect(anim2.anim.time).toBe(1); // (3 - 2) % 2 = 1

    engine.seek(1);
    // t=1 is in first animation window [0, 2)
    expect(anim1.anim.enabled).toBe(true);
    expect(anim2.anim.enabled).toBe(false);
    expect(anim1.anim.time).toBe(1);

    engine.seek(3.5);
    expect(anim1.anim.enabled).toBe(false);
    expect(anim2.anim.enabled).toBe(true);
    expect(anim2.anim.time).toBe(1.5);

    engine.seek(0.5);
    expect(anim1.anim.enabled).toBe(true);
    expect(anim2.anim.enabled).toBe(false);
    expect(anim1.anim.time).toBe(0.5);
  });

  it('transport seconds updates after seek', () => {
    const animations: AnimationDict = {
      'obj_prop': [createAnimationEntry(0, 2, THREE.LoopOnce)],
    };
    const { engine, transport } = setupEngine(animations);

    engine.pause();
    engine.seek(1.5);
    // setPosition is called during seek which updates transport.seconds
    expect(transport.seconds).toBe(1.5);
    expect(engine.getPosition()).toBe(1.5);

    // Verify setPosition updates transport independently
    engine.setPosition(0.8);
    expect(transport.seconds).toBe(0.8);
  });

  it('update() drives mixers without altering seek state', () => {
    const animations: AnimationDict = {
      'obj_prop': [createAnimationEntry(0, 2, THREE.LoopOnce)],
    };
    const { engine } = setupEngine(animations);

    engine.pause();
    engine.seek(1);

    const entry = animations['obj_prop'][0];
    const initialTime = entry.anim.time;
    const initialEnabled = entry.anim.enabled;

    // Call update() multiple times; should not change paused animation state
    engine.update(0.016);
    engine.update(0.016);

    expect(entry.anim.time).toBe(initialTime);
    expect(entry.anim.enabled).toBe(initialEnabled);
  });

  it('play unpauses animations matching the presenter condition', () => {
    const anim1 = createAnimationEntry(0, 1, THREE.LoopOnce);
    const anim2 = createAnimationEntry(1, 2, THREE.LoopRepeat);
    const anim3 = createAnimationEntry(2, 3, THREE.LoopOnce);
    const animations: AnimationDict = {
      'obj_prop': [anim1, anim2, anim3],
    };
    const { engine, transport } = setupEngine(animations);

    // Manually set animations to a paused state via seek (mimics pause + seek workflow)
    engine.pause();
    engine.seek(1.5);
    expect(anim1.anim.paused).toBe(true);
    expect(anim2.anim.paused).toBe(true);
    expect(anim3.anim.paused).toBe(true);

    // Now call play which should unpause anim2
    engine.play();
    
    // Presenter's logic: if (start < currentTime && (currentTime < end || loop === LoopRepeat)) unpause
    // anim1 [0, 1]: 0 < 1.5 && (1.5 < 1 || LoopOnce) = true && false = false → stays paused
    // anim2 [1, 2]: 1 < 1.5 && (1.5 < 2 || LoopRepeat) = true && true = true → unpaused
    // anim3 [2, 3]: 2 < 1.5 = false → stays paused
    expect(anim1.anim.paused).toBe(true);
    expect(anim2.anim.paused).toBe(false);
    expect(anim3.anim.paused).toBe(true);
  });

  it('setPosition writes to transport seconds setter (regression: getter-only transport throws)', () => {
    // This test uses an explicit getter+setter pair to verify that setPosition
    // calls the setter. A getter-only implementation would throw at runtime
    // even though FakeTransport (plain field) masks the issue in other tests.
    let storedSeconds = 0;
    const trackedTransport: Transport = {
      get seconds() { return storedSeconds; },
      set seconds(v: number) { storedSeconds = v; },
      start() {},
      pause() {},
      stop() {},
      cancel() {},
      scheduleOnce(_cb: (t: number) => void, _t: number) { return 0; },
    };
    const engine = new PlaybackEngine(trackedTransport);
    engine.load({ animations: {}, mixers: [] });

    engine.setPosition(1.5);
    expect(storedSeconds).toBe(1.5);

    engine.seek(2.5);
    expect(storedSeconds).toBe(2.5);
  });

  it('initial load and setSequenceTo(0) enable first animation at time=0', () => {
    const anim1 = createAnimationEntry(0, 2, THREE.LoopOnce);
    const anim2 = createAnimationEntry(2, 4, THREE.LoopOnce);
    const animations: AnimationDict = {
      'obj_prop': [anim1, anim2],
    };
    const { engine } = setupEngine(animations);

    // Simulate initial setSequenceTo(0) which calls seek(0)
    engine.seek(0);

    // First animation should be enabled at time=0
    expect(anim1.anim.enabled).toBe(true);
    expect(anim1.anim.time).toBe(0);
    expect(anim1.anim.paused).toBe(true);

    // Second animation should not be enabled yet
    expect(anim2.anim.enabled).toBe(false);
  });
});
