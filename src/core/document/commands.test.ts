import { describe, it, expect } from 'vitest';
import { AddActorCommand, RemoveActorCommand, SetSpeakLinesCommand, MoveStagedActorCommand, MoveSetPieceCommand, SetSceneDurationCommand, AddAnimateSegmentCommand, RemoveAnimateSegmentCommand, UpdateAnimateSegmentCommand, CapturePositionKeyframeCommand, RemoveTransformKeyframeCommand, CaptureLightIntensityKeyframeCommand, RemoveLightKeyframeCommand, SetActorIdleAnimationCommand, SetActorScaleCommand, AddActorBlockCommand, RemoveActorBlockCommand, UpdateActorBlockCommand } from './commands';
import type { StoredActor, StoredProduction, StoredScene } from '../storage/types';
import type { ScriptLine } from '../../lib/script/types';
import type { ClipTrack, LightingTrack, TransformTrack, StagedActor } from '../domain/types';
import { defaultSceneShell, estimateDuration } from '../storage/sceneBuilder';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeProduction(overrides?: Partial<StoredProduction>): StoredProduction {
  return {
    id: 'p1',
    name: 'Test',
    createdAt: 1000,
    modifiedAt: 1000,
    script: [],
    ...overrides,
  };
}

function makeActor(id: string, role: string = id): StoredActor {
  return { id, role, catalogueId: 'robot-expressive' };
}

function makeScene(overrides?: Partial<StoredScene>): StoredScene {
  return { ...defaultSceneShell(), ...overrides };
}

function makeLine(actorId: string, text: string, pauseAfter = 0): ScriptLine {
  return { actorId, text, pauseAfter };
}

// ── AddActorCommand ───────────────────────────────────────────────────────────

describe('AddActorCommand', () => {
  it('adds actor when no scene present', () => {
    const doc = makeProduction();
    const result = new AddActorCommand(makeActor('a1')).execute(doc);
    expect(result.actors).toHaveLength(1);
    expect(result.actors![0].id).toBe('a1');
    expect(result.scene).toBeUndefined();
  });

  it('does not overwrite an existing actors list', () => {
    const doc = makeProduction({ actors: [makeActor('a1')] });
    const result = new AddActorCommand(makeActor('a2')).execute(doc);
    expect(result.actors).toHaveLength(2);
  });

  it('adds actor and stages them when scene is present', () => {
    const doc = makeProduction({ actors: [], scene: makeScene() });
    const result = new AddActorCommand(makeActor('a1', 'Alice')).execute(doc);
    expect(result.actors).toHaveLength(1);
    expect(result.scene!.stagedActors).toHaveLength(1);
    expect(result.scene!.stagedActors[0].actorId).toBe('a1');
  });

  it('places single actor at origin', () => {
    const doc = makeProduction({ actors: [], scene: makeScene() });
    const result = new AddActorCommand(makeActor('a1')).execute(doc);
    expect(result.scene!.stagedActors[0].startPosition).toEqual([0, 0, 0]);
  });

  it('adds looping idle animate action when scene is present', () => {
    const doc = makeProduction({ actors: [], scene: makeScene() });
    const result = new AddActorCommand(makeActor('a1')).execute(doc);
    const idles = result.scene!.actions.filter(
      (a) => a.type === 'animate' && (a as { loop?: string }).loop === 'repeat',
    );
    expect(idles).toHaveLength(1);
    expect((idles[0] as { actorId: string }).actorId).toBe('a1');
  });

  it('repositions both actors when second actor added', () => {
    const doc = makeProduction({ actors: [makeActor('a1')], scene: makeScene() });
    // Manually stage the first actor so there is a scene to start from.
    const after1 = new AddActorCommand(makeActor('a2')).execute(
      makeProduction({ actors: [makeActor('a1')], scene: makeScene() }),
    );
    expect(after1.scene!.stagedActors).toHaveLength(2);
    const xs = after1.scene!.stagedActors.map((s) => s.startPosition![0]);
    expect(xs[0]).not.toEqual(xs[1]);
  });

  it('sets modifiedAt to a time >= createdAt', () => {
    const doc = makeProduction();
    const before = Date.now();
    const result = new AddActorCommand(makeActor('a1')).execute(doc);
    expect(result.modifiedAt).toBeGreaterThanOrEqual(before);
  });
});

// ── RemoveActorCommand ────────────────────────────────────────────────────────

describe('RemoveActorCommand', () => {
  it('removes actor from actors list', () => {
    const doc = makeProduction({ actors: [makeActor('a1'), makeActor('a2')] });
    const result = new RemoveActorCommand('a1').execute(doc);
    expect(result.actors!.map((a) => a.id)).toEqual(['a2']);
  });

  it('removes actor from stagedActors when scene present', () => {
    const scene = makeScene({
      stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0], startRotation: [0, 0, 0] }],
      actions: [],
    });
    const doc = makeProduction({ actors: [makeActor('a1')], scene });
    const result = new RemoveActorCommand('a1').execute(doc);
    expect(result.scene!.stagedActors).toHaveLength(0);
  });

  it('removes actor-scoped actions when scene present', () => {
    const scene = makeScene({
      stagedActors: [],
      actions: [
        { type: 'animate', actorId: 'a1', animationName: 'Idle', startTime: 0, endTime: 6, fadeIn: 0.3, loop: 'repeat' },
        { type: 'speak',   actorId: 'a1', startTime: 1, text: 'Hello' },
      ],
    });
    const doc = makeProduction({ actors: [makeActor('a1')], scene });
    const result = new RemoveActorCommand('a1').execute(doc);
    expect(result.scene!.actions).toHaveLength(0);
  });

  it('removes actor lines from script (legacy path)', () => {
    const doc = makeProduction({
      actors: [makeActor('a1'), makeActor('a2')],
      script: [makeLine('a1', 'Hi there'), makeLine('a2', 'Hey')],
    });
    const result = new RemoveActorCommand('a1').execute(doc);
    expect(result.script).toHaveLength(1);
    expect(result.script![0].actorId).toBe('a2');
  });
});

// ── SetSpeakLinesCommand ──────────────────────────────────────────────────────

describe('SetSpeakLinesCommand', () => {
  it('falls back to updating script only when no scene', () => {
    const doc = makeProduction({ script: [] });
    const lines = [makeLine('a1', 'Hello world')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(result.script).toEqual(lines);
    expect(result.scene).toBeUndefined();
  });

  it('creates speak actions in the scene with computed startTimes', () => {
    const scene = makeScene();
    const doc = makeProduction({ actors: [], scene });
    const lines = [makeLine('a1', 'Hello'), makeLine('a2', 'World')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speaks = result.scene!.actions.filter((a) => a.type === 'speak');
    expect(speaks).toHaveLength(2);
    // First line starts at t=1.0.
    const first = speaks[0] as { startTime: number };
    expect(first.startTime).toBeCloseTo(1.0);
  });

  it('accumulates startTime based on estimateDuration + pauseAfter', () => {
    const scene = makeScene();
    const doc = makeProduction({ actors: [], scene });
    const text = 'One two three';
    const pause = 0.5;
    const lines = [makeLine('a1', text, pause), makeLine('a2', 'Next')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speaks = result.scene!.actions.filter((a) => a.type === 'speak') as Array<{ startTime: number }>;
    const expectedSecondStart = 1.0 + estimateDuration(text) + pause;
    expect(speaks[1].startTime).toBeCloseTo(expectedSecondStart);
  });

  it('updates scene duration to account for total speech time', () => {
    // Needs > 9 words so estimateDuration pushes t+1 beyond the 6-second floor.
    const scene = makeScene({ duration: 6 });
    const doc = makeProduction({ actors: [], scene });
    const lines = [makeLine('a1', 'The quick brown fox jumps over the lazy dog sitting by the river')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(result.scene!.duration).toBeGreaterThan(6);
  });

  it('preserves looping idle anim endTime unchanged (no T-pose snap at scene end)', () => {
    // SetSpeakLinesCommand must NOT overwrite endTime on looping idle anims.
    // If it did, the PlaybackEngine schedules a Tone stop at that time which
    // snaps the actor to bind pose (T-pose) when the scene ends.
    const scene = makeScene({
      actions: [
        { type: 'animate', actorId: 'a1', animationName: 'Idle', startTime: 0, endTime: 6, fadeIn: 0.3, loop: 'repeat' },
      ],
    });
    const doc = makeProduction({ actors: [makeActor('a1')], scene });
    const lines = [makeLine('a1', 'A very long piece of dialogue text for duration testing purposes today')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const idle = result.scene!.actions.find((a) => a.type === 'animate') as { endTime: number };
    expect(idle.endTime).toBe(6);
  });

  it('preserves pauseAfter on the resulting SpeakAction for round-trip fidelity', () => {
    const scene = makeScene();
    const doc = makeProduction({ actors: [], scene });
    const lines = [makeLine('a1', 'Hello', 1.2)];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speak = result.scene!.actions.find((a) => a.type === 'speak') as { pauseAfter?: number };
    expect(speak.pauseAfter).toBeCloseTo(1.2);
  });

  it('skips blank lines when building speak actions', () => {
    const scene = makeScene();
    const doc = makeProduction({ actors: [], scene });
    const lines = [makeLine('a1', ''), makeLine('a2', 'Hello'), makeLine('a1', '  ')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speaks = result.scene!.actions.filter((a) => a.type === 'speak');
    expect(speaks).toHaveLength(1);
  });

  it('mirrors lines to doc.script for legacy compat', () => {
    const scene = makeScene();
    const doc = makeProduction({ actors: [], scene, script: [] });
    const lines = [makeLine('a1', 'Hello')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(result.script).toEqual(lines);
  });

  it('clamps scene duration to at least 6 seconds when dialogue is short', () => {
    const scene = makeScene({ duration: 10 });
    const doc = makeProduction({ actors: [], scene });
    const lines = [makeLine('a1', 'Hi')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(result.scene!.duration).toBeGreaterThanOrEqual(6);
  });
});

// ── MoveStagedActorCommand ────────────────────────────────────────────────────

describe('MoveStagedActorCommand', () => {
  it('updates startPosition of the matching staged actor', () => {
    const scene = makeScene({
      stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0] }],
    });
    const doc = makeProduction({ actors: [makeActor('a1')], scene });
    const result = new MoveStagedActorCommand('a1', [3, 0, -2]).execute(doc);
    expect(result.scene!.stagedActors[0].startPosition).toEqual([3, 0, -2]);
  });

  it('updates startRotation when provided', () => {
    const scene = makeScene({
      stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0] }],
    });
    const doc = makeProduction({ actors: [makeActor('a1')], scene });
    const result = new MoveStagedActorCommand('a1', [1, 0, 1], [0, Math.PI / 2, 0]).execute(doc);
    expect(result.scene!.stagedActors[0].startRotation).toEqual([0, Math.PI / 2, 0]);
  });

  it('does not overwrite startRotation when rotation is omitted', () => {
    const existing: [number, number, number] = [0, 1, 0];
    const scene = makeScene({
      stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0], startRotation: existing }],
    });
    const doc = makeProduction({ actors: [makeActor('a1')], scene });
    const result = new MoveStagedActorCommand('a1', [5, 0, 5]).execute(doc);
    expect(result.scene!.stagedActors[0].startRotation).toEqual(existing);
  });

  it('leaves other staged actors unchanged', () => {
    const scene = makeScene({
      stagedActors: [
        { actorId: 'a1', startPosition: [0, 0, 0] },
        { actorId: 'a2', startPosition: [2, 0, 2] },
      ],
    });
    const doc = makeProduction({ actors: [makeActor('a1'), makeActor('a2')], scene });
    const result = new MoveStagedActorCommand('a1', [9, 0, 9]).execute(doc);
    expect(result.scene!.stagedActors[1].startPosition).toEqual([2, 0, 2]);
  });

  it('is a no-op when no scene is present', () => {
    const doc = makeProduction({ actors: [makeActor('a1')] });
    const result = new MoveStagedActorCommand('a1', [1, 0, 1]).execute(doc);
    expect(result.scene).toBeUndefined();
  });
});

// ── MoveSetPieceCommand ───────────────────────────────────────────────────────

describe('MoveSetPieceCommand', () => {
  it('updates position of the named set piece', () => {
    const scene = makeScene({
      set: [{ name: 'box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 } }],
    });
    const doc = makeProduction({ scene });
    const result = new MoveSetPieceCommand('box', [4, 0, 2]).execute(doc);
    expect(result.scene!.set[0].position).toEqual([4, 0, 2]);
  });

  it('updates rotation when provided', () => {
    const scene = makeScene({
      set: [{ name: 'box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 } }],
    });
    const doc = makeProduction({ scene });
    const result = new MoveSetPieceCommand('box', [0, 0, 0], [0, Math.PI, 0]).execute(doc);
    expect(result.scene!.set[0].rotation).toEqual([0, Math.PI, 0]);
  });

  it('does not overwrite existing rotation when rotation is omitted', () => {
    const existing: [number, number, number] = [0, 0.5, 0];
    const scene = makeScene({
      set: [{ name: 'box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 }, rotation: existing }],
    });
    const doc = makeProduction({ scene });
    const result = new MoveSetPieceCommand('box', [1, 0, 1]).execute(doc);
    expect(result.scene!.set[0].rotation).toEqual(existing);
  });

  it('leaves other set pieces unchanged', () => {
    const scene = makeScene({
      set: [
        { name: 'box', geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 } },
        { name: 'sphere', geometry: { type: 'sphere', radius: 0.5 }, material: { color: 0x0000ff } },
      ],
    });
    const doc = makeProduction({ scene });
    const result = new MoveSetPieceCommand('box', [5, 0, 5]).execute(doc);
    expect(result.scene!.set[1].position).toBeUndefined();
  });

  it('is a no-op when no scene is present', () => {
    const doc = makeProduction();
    const result = new MoveSetPieceCommand('box', [1, 0, 1]).execute(doc);
    expect(result.scene).toBeUndefined();
  });
});

// ── SetSceneDurationCommand ───────────────────────────────────────────────────

describe('SetSceneDurationCommand', () => {
  it('sets duration on scene', () => {
    const doc = makeProduction({ scene: makeScene() });
    const result = new SetSceneDurationCommand(30).execute(doc);
    expect(result.scene!.duration).toBe(30);
  });

  it('clears duration when undefined is passed', () => {
    const doc = makeProduction({ scene: makeScene({ duration: 30 }) });
    const result = new SetSceneDurationCommand(undefined).execute(doc);
    expect(result.scene!.duration).toBeUndefined();
  });

  it('is a no-op when no scene', () => {
    const doc = makeProduction();
    expect(new SetSceneDurationCommand(10).execute(doc).scene).toBeUndefined();
  });
});

// ── AddAnimateSegmentCommand ──────────────────────────────────────────────────

describe('AddAnimateSegmentCommand', () => {
  const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk', loop: 'repeat' };

  it('appends a new ClipTrack', () => {
    const doc = makeProduction({ scene: makeScene() });
    const result = new AddAnimateSegmentCommand(seg).execute(doc);
    const added = result.scene!.actions.find((a) => a.type === 'animate') as ClipTrack | undefined;
    expect(added?.animationName).toBe('Walk');
    expect(added?.actorId).toBe('a1');
  });

  it('is a no-op when no scene', () => {
    const doc = makeProduction();
    expect(new AddAnimateSegmentCommand(seg).execute(doc).scene).toBeUndefined();
  });
});

// ── RemoveAnimateSegmentCommand ───────────────────────────────────────────────

describe('RemoveAnimateSegmentCommand', () => {
  it('removes action at given global index', () => {
    const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const scene = makeScene({ actions: [seg] });
    const doc = makeProduction({ scene });
    const result = new RemoveAnimateSegmentCommand(0).execute(doc);
    expect(result.scene!.actions).toHaveLength(0);
  });

  it('leaves other actions intact', () => {
    const seg1: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const seg2: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 5, animationName: 'Idle' };
    const scene = makeScene({ actions: [seg1, seg2] });
    const doc = makeProduction({ scene });
    const result = new RemoveAnimateSegmentCommand(0).execute(doc);
    expect((result.scene!.actions[0] as ClipTrack).animationName).toBe('Idle');
  });
});

// ── UpdateAnimateSegmentCommand ───────────────────────────────────────────────

describe('UpdateAnimateSegmentCommand', () => {
  it('patches animationName', () => {
    const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const doc = makeProduction({ scene: makeScene({ actions: [seg] }) });
    const result = new UpdateAnimateSegmentCommand(0, { animationName: 'Run' }).execute(doc);
    expect((result.scene!.actions[0] as ClipTrack).animationName).toBe('Run');
  });

  it('patches startTime and loop', () => {
    const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const doc = makeProduction({ scene: makeScene({ actions: [seg] }) });
    const result = new UpdateAnimateSegmentCommand(0, { startTime: 2, loop: 'repeat' }).execute(doc);
    expect((result.scene!.actions[0] as ClipTrack).startTime).toBe(2);
    expect((result.scene!.actions[0] as ClipTrack).loop).toBe('repeat');
  });

  it('is a no-op when index points to non-animate action', () => {
    const doc = makeProduction({ scene: makeScene() });
    const before = JSON.stringify(doc.scene!.actions);
    new UpdateAnimateSegmentCommand(0, { animationName: 'X' }).execute(doc);
    expect(JSON.stringify(doc.scene!.actions)).toBe(before);
  });
});

// ── CapturePositionKeyframeCommand ────────────────────────────────────────────

describe('CapturePositionKeyframeCommand', () => {
  it('creates a new TransformTrack when none exists', () => {
    const doc = makeProduction({ scene: makeScene() });
    const result = new CapturePositionKeyframeCommand('a1', 1.0, [1, 2, 3]).execute(doc);
    const move = result.scene!.actions.find((a) => a.type === 'move') as TransformTrack | undefined;
    expect(move?.targetId).toBe('a1');
    expect(move?.keyframes.times).toEqual([1.0]);
    expect(move?.keyframes.values).toEqual([1, 2, 3]);
  });

  it('appends a keyframe to the existing TransformTrack in time order', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [0], values: [0, 0, 0], trackType: 'vector' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new CapturePositionKeyframeCommand('a1', 2.0, [5, 0, 0]).execute(doc);
    const move = result.scene!.actions[0] as TransformTrack;
    expect(move.keyframes.times).toEqual([0, 2.0]);
    expect(move.keyframes.values).toEqual([0, 0, 0, 5, 0, 0]);
  });

  it('replaces a keyframe within 50ms snap', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [1.0], values: [1, 2, 3], trackType: 'vector' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new CapturePositionKeyframeCommand('a1', 1.02, [9, 9, 9]).execute(doc);
    const move = result.scene!.actions[0] as TransformTrack;
    expect(move.keyframes.times).toHaveLength(1);
    expect(move.keyframes.values).toEqual([9, 9, 9]);
  });
});

// ── RemoveTransformKeyframeCommand ────────────────────────────────────────────

describe('RemoveTransformKeyframeCommand', () => {
  it('removes the keyframe at the given index', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [0, 1], values: [0, 0, 0, 5, 0, 0], trackType: 'vector' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new RemoveTransformKeyframeCommand('a1', '.position', 1).execute(doc);
    const move = result.scene!.actions[0] as TransformTrack;
    expect(move.keyframes.times).toEqual([0]);
    expect(move.keyframes.values).toEqual([0, 0, 0]);
  });

  it('removes the TransformTrack when the last keyframe is deleted', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [1.0], values: [1, 2, 3], trackType: 'vector' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new RemoveTransformKeyframeCommand('a1', '.position', 0).execute(doc);
    expect(result.scene!.actions).toHaveLength(0);
  });
});

// ── CaptureLightIntensityKeyframeCommand ──────────────────────────────────────

describe('CaptureLightIntensityKeyframeCommand', () => {
  it('creates a new LightingTrack when none exists', () => {
    const doc = makeProduction({ scene: makeScene() });
    const result = new CaptureLightIntensityKeyframeCommand('sun', 0, 1.5).execute(doc);
    const la = result.scene!.actions.find((a) => a.type === 'lighting') as LightingTrack | undefined;
    expect(la?.lightId).toBe('sun');
    expect(la?.keyframes.times).toEqual([0]);
    expect(la?.keyframes.values).toEqual([1.5]);
  });

  it('appends a keyframe and keeps time-sorted order', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [0], values: [1], trackType: 'number' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new CaptureLightIntensityKeyframeCommand('sun', 2, 0.5).execute(doc);
    const la = result.scene!.actions[0] as LightingTrack;
    expect(la.keyframes.times).toEqual([0, 2]);
    expect(la.keyframes.values).toEqual([1, 0.5]);
  });

  it('replaces a keyframe within 50ms snap', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [1.0], values: [1], trackType: 'number' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new CaptureLightIntensityKeyframeCommand('sun', 1.01, 2).execute(doc);
    const la = result.scene!.actions[0] as LightingTrack;
    expect(la.keyframes.times).toHaveLength(1);
    expect(la.keyframes.values).toEqual([2]);
  });
});

// ── RemoveLightKeyframeCommand ────────────────────────────────────────────────

describe('RemoveLightKeyframeCommand', () => {
  it('removes the keyframe at the given index', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [0, 2], values: [1, 0.5], trackType: 'number' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new RemoveLightKeyframeCommand('sun', '.intensity', 0).execute(doc);
    const la = result.scene!.actions[0] as LightingTrack;
    expect(la.keyframes.times).toEqual([2]);
    expect(la.keyframes.values).toEqual([0.5]);
  });

  it('removes the LightingTrack when the last keyframe is deleted', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [0], values: [1], trackType: 'number' },
    };
    const doc = makeProduction({ scene: makeScene({ actions: [existing] }) });
    const result = new RemoveLightKeyframeCommand('sun', '.intensity', 0).execute(doc);
    expect(result.scene!.actions).toHaveLength(0);
  });
});

// ── SetActorIdleAnimationCommand ────────────────────────────────────────────

describe('SetActorIdleAnimationCommand', () => {
  it('sets idleAnimation on the actor', () => {
    const actor = makeActor('a1');
    const doc = makeProduction({ actors: [actor] });
    const result = new SetActorIdleAnimationCommand('a1', 'Walk').execute(doc);
    expect(result.actors![0].idleAnimation).toBe('Walk');
  });

  it('updates the idle animate action in the scene', () => {
    const actor = makeActor('a1');
    const doc = makeProduction({ actors: [actor], scene: makeScene() });
    const result = new SetActorIdleAnimationCommand('a1', 'Run').execute(doc);
    const idle = (result.scene!.actions as ClipTrack[]).find(
      (a) => a.type === 'animate' && a.actorId === 'a1' && a.loop === 'repeat',
    );
    expect(idle?.animationName).toBe('Run');
  });

  it('clears idleAnimation when undefined is passed', () => {
    const actor: StoredActor = { ...makeActor('a1'), idleAnimation: 'Walk' };
    const doc = makeProduction({ actors: [actor] });
    const result = new SetActorIdleAnimationCommand('a1', undefined).execute(doc);
    expect(result.actors![0].idleAnimation).toBeUndefined();
  });

  it('is a no-op when actorId not found', () => {
    const doc = makeProduction({ actors: [makeActor('a1')] });
    const result = new SetActorIdleAnimationCommand('x', 'Run').execute(doc);
    expect(result.actors![0].idleAnimation).toBeUndefined();
  });
});

// ── SetActorScaleCommand ──────────────────────────────────────────────────

describe('SetActorScaleCommand', () => {
  it('sets scale on the actor', () => {
    const actor = makeActor('a1');
    const doc = makeProduction({ actors: [actor] });
    const result = new SetActorScaleCommand('a1', 2).execute(doc);
    expect(result.actors![0].scale).toBe(2);
  });

  it('updates startScale on the staged actor', () => {
    const actor = makeActor('a1');
    const staged: StagedActor = { actorId: 'a1', startPosition: [0, 0, 0] };
    const scene = makeScene({ stagedActors: [staged] });
    const doc = makeProduction({ actors: [actor], scene });
    const result = new SetActorScaleCommand('a1', 3).execute(doc);
    expect(result.scene!.stagedActors[0].startScale).toEqual([3, 3, 3]);
  });

  it('removes startScale when undefined is passed', () => {
    const actor: StoredActor = { ...makeActor('a1'), scale: 2 };
    const staged: StagedActor = { actorId: 'a1', startPosition: [0, 0, 0], startScale: [2, 2, 2] };
    const scene = makeScene({ stagedActors: [staged] });
    const doc = makeProduction({ actors: [actor], scene });
    const result = new SetActorScaleCommand('a1', undefined).execute(doc);
    expect(result.actors![0].scale).toBeUndefined();
    expect(result.scene!.stagedActors[0].startScale).toBeUndefined();
  });

  it('does not alter other staged actors', () => {
    const staged1: StagedActor = { actorId: 'a1', startPosition: [0, 0, 0] };
    const staged2: StagedActor = { actorId: 'a2', startPosition: [1, 0, 0] };
    const scene = makeScene({ stagedActors: [staged1, staged2] });
    const doc = makeProduction({ actors: [makeActor('a1'), makeActor('a2')], scene });
    const result = new SetActorScaleCommand('a1', 2).execute(doc);
    expect(result.scene!.stagedActors[1].startScale).toBeUndefined();
  });
});

// ── AddActorBlockCommand ────────────────────────────────────────────────

describe('AddActorBlockCommand', () => {
  const block = (): import('../domain/types').ActorBlock => ({
    type: 'actorBlock', actorId: 'a1', startTime: 1, endTime: 4, clip: 'Walk',
  });

  it('appends a block to an empty blocks list', () => {
    const doc = makeProduction({ scene: makeScene() });
    const result = new AddActorBlockCommand(block()).execute(doc);
    expect(result.scene!.blocks).toHaveLength(1);
    expect(result.scene!.blocks![0]).toMatchObject({ actorId: 'a1', clip: 'Walk' });
  });

  it('appends after existing blocks', () => {
    const doc = makeProduction({ scene: makeScene({ blocks: [block()] }) });
    const result = new AddActorBlockCommand({ ...block(), startTime: 5, endTime: 8 }).execute(doc);
    expect(result.scene!.blocks).toHaveLength(2);
  });

  it('is a no-op when no scene', () => {
    const doc = makeProduction();
    expect(new AddActorBlockCommand(block()).execute(doc).scene).toBeUndefined();
  });
});

// ── RemoveActorBlockCommand ────────────────────────────────────────────

describe('RemoveActorBlockCommand', () => {
  const b1 = (): import('../domain/types').ActorBlock => ({ type: 'actorBlock', actorId: 'a1', startTime: 0, endTime: 2 });
  const b2 = (): import('../domain/types').ActorBlock => ({ type: 'actorBlock', actorId: 'a1', startTime: 3, endTime: 5 });

  it('removes the block at the given index', () => {
    const doc = makeProduction({ scene: makeScene({ blocks: [b1(), b2()] }) });
    const result = new RemoveActorBlockCommand(0).execute(doc);
    expect(result.scene!.blocks).toHaveLength(1);
    expect(result.scene!.blocks![0].startTime).toBe(3);
  });

  it('results in an empty blocks array when the last block is removed', () => {
    const doc = makeProduction({ scene: makeScene({ blocks: [b1()] }) });
    const result = new RemoveActorBlockCommand(0).execute(doc);
    expect(result.scene!.blocks).toHaveLength(0);
  });

  it('is a no-op when no scene', () => {
    expect(new RemoveActorBlockCommand(0).execute(makeProduction()).scene).toBeUndefined();
  });
});

// ── UpdateActorBlockCommand ────────────────────────────────────────────

describe('UpdateActorBlockCommand', () => {
  const base = (): import('../domain/types').ActorBlock => ({
    type: 'actorBlock', actorId: 'a1', startTime: 0, endTime: 4, clip: 'Walk',
  });

  it('patches a single field', () => {
    const doc = makeProduction({ scene: makeScene({ blocks: [base()] }) });
    const result = new UpdateActorBlockCommand(0, { clip: 'Run' }).execute(doc);
    expect((result.scene!.blocks![0] as import('../domain/types').ActorBlock).clip).toBe('Run');
  });

  it('patches timing fields', () => {
    const doc = makeProduction({ scene: makeScene({ blocks: [base()] }) });
    const result = new UpdateActorBlockCommand(0, { startTime: 2, endTime: 6 }).execute(doc);
    expect(result.scene!.blocks![0].startTime).toBe(2);
    expect(result.scene!.blocks![0].endTime).toBe(6);
  });

  it('preserves other blocks unchanged', () => {
    const other: import('../domain/types').ActorBlock = { type: 'actorBlock', actorId: 'a2', startTime: 10, endTime: 12 };
    const doc = makeProduction({ scene: makeScene({ blocks: [base(), other] }) });
    const result = new UpdateActorBlockCommand(0, { clip: 'Idle' }).execute(doc);
    expect(result.scene!.blocks![1]).toEqual(other);
  });

  it('is a no-op when no scene', () => {
    expect(new UpdateActorBlockCommand(0, { clip: 'Run' }).execute(makeProduction()).scene).toBeUndefined();
  });

  it('is a no-op when index is out of range', () => {
    const doc = makeProduction({ scene: makeScene({ blocks: [base()] }) });
    const result = new UpdateActorBlockCommand(5, { clip: 'Run' }).execute(doc);
    const block = result.scene!.blocks![0];
    if (block.type !== 'actorBlock') throw new Error('expected actorBlock');
    expect(block.clip).toBe('Walk');
  });
});

