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
  weight: number = 1;
  loop: THREE.AnimationActionLoopStyles = THREE.LoopOnce;
  clampWhenFinished: boolean = false;

  play() {
    this.paused = false;
  }

  setEffectiveWeight(w: number) {
    this.weight = w;
    return this;
  }

  fadeIn(_d: number) { return this; }
  fadeOut(_d: number) { return this; }

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
 * clipDuration defaults to `end - start`; pass explicitly when end is Infinity.
 */
function createAnimationEntry(
  start: number,
  end: number,
  loop: THREE.AnimationActionLoopStyles = THREE.LoopOnce,
  clipDuration?: number,
  fadeIn: number = 0,
  fadeOut: number = 0
) {
  return {
    anim: new FakeAnimationAction() as unknown as THREE.AnimationAction,
    start,
    end,
    clipDuration: clipDuration ?? (end - start),
    loop,
    repetitions: loop === THREE.LoopRepeat ? Infinity : 1,
    fadeIn,
    fadeOut,
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
  it('play() at exactly startTime unpauses the clip (boundary: start === currentTime)', () => {
    // Regression: strict `<` in play() meant t=0 clips were never unpaused by play(),
    // only by the Tone schedule ~30ms later. `<=` fixes this.
    const anim = createAnimationEntry(0, Infinity, THREE.LoopRepeat, 1.5);
    const animations: AnimationDict = { 'alpha_Idle_0': [anim] };
    const { engine } = setupEngine(animations);

    engine.seek(0);  // pauses everything
    expect(anim.anim.paused).toBe(true);

    engine.play();   // should unpause the t=0 clip via the `<=` boundary
    expect(anim.anim.paused).toBe(false);
  });

  it('play() does not unpause a clip whose start is in the future', () => {
    const idle    = createAnimationEntry(0, 4,        THREE.LoopRepeat, 1.5);
    const walking = createAnimationEntry(4, Infinity, THREE.LoopRepeat, 1.2);
    const animations: AnimationDict = {
      'alpha_Idle_0':    [idle],
      'alpha_Walking_4': [walking],
    };
    const { engine, transport } = setupEngine(animations);

    engine.seek(0);
    transport.seconds = 0;  // play from t=0
    engine.play();

    // Idle starts at 0 — should be unpaused
    expect(idle.anim.paused).toBe(false);
    // Walking starts at 4 — should stay paused at t=0
    expect(walking.anim.paused).toBe(true);
  });

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

  it('paused seek into open-ended looping animation wraps modulo clip duration', () => {
    // end=Infinity represents a GLTF clip with no explicit scene endTime
    const animations: AnimationDict = {
      'obj_prop': [createAnimationEntry(0, Infinity, THREE.LoopRepeat, 2)],
    };
    const { engine } = setupEngine(animations);

    // Pause and seek to t=3 (past one cycle of the 2-second clip)
    engine.pause();
    engine.seek(3);

    const entry = animations['obj_prop'][0];
    // Should wrap: (3 - 0) % 2 = 1
    expect(entry.anim.time).toBe(1);
    expect(entry.anim.enabled).toBe(true);
    expect(entry.anim.paused).toBe(true);
  });

  it('GLTF clip with explicit endTime disables on seek past endTime', () => {
    // Represents: Idle [0, 4), Walking [4, 20), Idle [20, Infinity)
    const idleBefore  = createAnimationEntry(0,  4,        THREE.LoopRepeat, 1.5);
    const walking     = createAnimationEntry(4,  20,       THREE.LoopRepeat, 1.2);
    const idleAfter   = createAnimationEntry(20, Infinity, THREE.LoopRepeat, 1.5);
    const animations: AnimationDict = {
      'alpha_Idle_0':     [idleBefore],
      'alpha_Walking_4':  [walking],
      'alpha_Idle_20':    [idleAfter],
    };
    const { engine } = setupEngine(animations);
    engine.pause();

    // During Idle window
    engine.seek(2);
    expect(idleBefore.anim.enabled).toBe(true);
    expect(walking.anim.enabled).toBe(false);
    expect(idleAfter.anim.enabled).toBe(false);

    // During Walking window
    engine.seek(10);
    expect(idleBefore.anim.enabled).toBe(false);  // past endTime=4, LoopRepeat → disabled
    expect(walking.anim.enabled).toBe(true);
    expect(walking.anim.time).toBeCloseTo((10 - 4) % 1.2, 5);
    expect(idleAfter.anim.enabled).toBe(false);

    // During second Idle window (open-ended)
    engine.seek(25);
    expect(idleBefore.anim.enabled).toBe(false);
    expect(walking.anim.enabled).toBe(false);     // past endTime=20, LoopRepeat → disabled
    expect(idleAfter.anim.enabled).toBe(true);
    expect(idleAfter.anim.time).toBeCloseTo((25 - 20) % 1.5, 5);
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

  // --- Regression: KeyframeAction LoopRepeat clips must use end=Infinity ---

  it('LoopRepeat clip with end=Infinity stays active and wraps past one cycle (KeyframeAction regression)', () => {
    // Mirrors a LoopRepeat KeyframeAction after the fix: end=Infinity, clipDuration=5
    const anim = createAnimationEntry(0, Infinity, THREE.LoopRepeat, 5);
    const animations: AnimationDict = { 'camera1_.rotation': [anim] };
    const { engine } = setupEngine(animations);

    engine.pause();

    // Seek to t=7: one full cycle (5s) + 2s → wraps to 2
    engine.seek(7);
    expect(anim.anim.enabled).toBe(true);
    expect(anim.anim.time).toBeCloseTo(2, 5);

    // Seek to t=10: two full cycles → wraps to 0
    engine.seek(10);
    expect(anim.anim.enabled).toBe(true);
    expect(anim.anim.time).toBeCloseTo(0, 5);

    // Would have been disabled at t=5 under the old `end = startTime + clip.duration` bug
    engine.seek(5.5);
    expect(anim.anim.enabled).toBe(true);
    expect(anim.anim.time).toBeCloseTo(0.5, 5);
  });

  // --- Regression: LoopOnce clips must hold final frame (FlyIntoRoom regression) ---

  it('LoopOnce clip holds final frame when seek lands in a gap before next clip starts', () => {
    // Mirrors cameraMove1 [0,3) and cameraMove2 [5,8) in FlyIntoRoomExample.
    // In the gap t=3..5 the first clip must stay at its final frame.
    const move1 = createAnimationEntry(0, 3, THREE.LoopOnce);  // clipDuration=3
    const move2 = createAnimationEntry(5, 8, THREE.LoopOnce);  // clipDuration=3
    const animations: AnimationDict = { 'camera1_.position': [move1, move2] };
    const { engine } = setupEngine(animations);

    engine.pause();

    // Within move1
    engine.seek(1.5);
    expect(move1.anim.enabled).toBe(true);
    expect(move1.anim.time).toBeCloseTo(1.5, 5);
    expect(move2.anim.enabled).toBe(false);

    // In the gap: move1 should hold final frame, move2 not yet active
    engine.seek(4);
    expect(move1.anim.enabled).toBe(true);
    expect(move1.anim.time).toBeCloseTo(3, 5);  // final frame
    expect(move2.anim.enabled).toBe(false);

    // Within move2
    engine.seek(6);
    expect(move2.anim.enabled).toBe(true);
    expect(move2.anim.time).toBeCloseTo(1, 5);  // 6 - 5
    // move1 is superseded by move2 (break stops at move2)
    expect(move1.anim.enabled).toBe(false);

    // Past move2: move2 holds its final frame
    engine.seek(9);
    expect(move2.anim.enabled).toBe(true);
    expect(move2.anim.time).toBeCloseTo(3, 5);  // final frame
  });
});
