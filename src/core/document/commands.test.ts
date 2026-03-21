import { describe, it, expect } from 'vitest';
import { AddActorCommand, RemoveActorCommand, SetSpeakLinesCommand, MoveStagedActorCommand, MoveSetPieceCommand, SetSceneDurationCommand, AddAnimateSegmentCommand, RemoveAnimateSegmentCommand, UpdateAnimateSegmentCommand, CapturePositionKeyframeCommand, RemoveTransformKeyframeCommand, CaptureLightIntensityKeyframeCommand, RemoveLightKeyframeCommand, SetActorIdleAnimationCommand, SetActorScaleCommand, AddActorBlockCommand, RemoveActorBlockCommand, UpdateActorBlockCommand, AddSceneCommand, RenameSceneCommand, RemoveSceneCommand, SwitchSceneCommand, AddGroupCommand, RenameGroupCommand, RemoveGroupCommand, SetProductionSpeechSettingsCommand } from './commands';
import type { StoredActor, StoredProduction, StoredScene, NamedScene } from '../storage/types';
import { getScenes } from '../storage/types';
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

function makeNamedScene(overrides?: Partial<StoredScene>): NamedScene {
  return { id: 'sc1', name: 'Scene 1', scene: makeScene(overrides) };
}

function getResultScene(result: StoredProduction): StoredScene {
  return getScenes(result.tree ?? [])[0].scene;
}

function makeLine(actorId: string, text: string, pauseAfter = 0): ScriptLine {
  return { actorId, text, pauseAfter };
}

// ── AddActorCommand ───────────────────────────────────────────────────────────

describe('AddActorCommand', () => {
  it('adds actor to cast', () => {
    const doc = makeProduction();
    const result = new AddActorCommand(makeActor('a1')).execute(doc);
    expect(result.actors).toHaveLength(1);
    expect(result.actors![0].id).toBe('a1');
  });

  it('does not overwrite an existing actors list', () => {
    const doc = makeProduction({ actors: [makeActor('a1')] });
    const result = new AddActorCommand(makeActor('a2')).execute(doc);
    expect(result.actors).toHaveLength(2);
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
    const doc = makeProduction({
      actors: [makeActor('a1')],
      tree: [makeNamedScene({
        stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0], startRotation: [0, 0, 0] }],
        actions: [],
      })],
      activeSceneId: 'sc1',
    });
    const result = new RemoveActorCommand('a1').execute(doc);
    expect(getResultScene(result).stagedActors).toHaveLength(0);
  });

  it('removes actor-scoped actions when scene present', () => {
    const doc = makeProduction({
      actors: [makeActor('a1')],
      tree: [makeNamedScene({
        stagedActors: [],
        actions: [
          { type: 'animate', actorId: 'a1', animationName: 'Idle', startTime: 0, endTime: 6, fadeIn: 0.3, loop: 'repeat' },
          { type: 'speak',   actorId: 'a1', startTime: 1, text: 'Hello' },
        ],
      })],
      activeSceneId: 'sc1',
    });
    const result = new RemoveActorCommand('a1').execute(doc);
    expect(getResultScene(result).actions).toHaveLength(0);
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
    expect(result.tree).toBeUndefined();
  });

  it('creates speak actions in the scene with computed startTimes', () => {
    const doc = makeProduction({ actors: [], tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const lines = [makeLine('a1', 'Hello'), makeLine('a2', 'World')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speaks = getResultScene(result).actions.filter((a) => a.type === 'speak');
    expect(speaks).toHaveLength(2);
    // First line starts at t=1.0.
    const first = speaks[0] as { startTime: number };
    expect(first.startTime).toBeCloseTo(1.0);
  });

  it('accumulates startTime based on estimateDuration + pauseAfter', () => {
    const doc = makeProduction({ actors: [], tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const text = 'One two three';
    const pause = 0.5;
    const lines = [makeLine('a1', text, pause), makeLine('a2', 'Next')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speaks = getResultScene(result).actions.filter((a) => a.type === 'speak') as Array<{ startTime: number }>;
    const expectedSecondStart = 1.0 + estimateDuration(text) + pause;
    expect(speaks[1].startTime).toBeCloseTo(expectedSecondStart);
  });

  it('updates scene duration to account for total speech time', () => {
    // Needs > 9 words so estimateDuration pushes t+1 beyond the 6-second floor.
    const doc = makeProduction({ actors: [], tree: [makeNamedScene({ duration: 6 })], activeSceneId: 'sc1' });
    const lines = [makeLine('a1', 'The quick brown fox jumps over the lazy dog sitting by the river')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(getResultScene(result).duration).toBeGreaterThan(6);
  });

  it('preserves looping idle anim endTime unchanged (no T-pose snap at scene end)', () => {
    // SetSpeakLinesCommand must NOT overwrite endTime on looping idle anims.
    // If it did, the PlaybackEngine schedules a Tone stop at that time which
    // snaps the actor to bind pose (T-pose) when the scene ends.
    const doc = makeProduction({
      actors: [makeActor('a1')],
      tree: [makeNamedScene({
        actions: [
          { type: 'animate', actorId: 'a1', animationName: 'Idle', startTime: 0, endTime: 6, fadeIn: 0.3, loop: 'repeat' },
        ],
      })],
      activeSceneId: 'sc1',
    });
    const lines = [makeLine('a1', 'A very long piece of dialogue text for duration testing purposes today')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const idle = getResultScene(result).actions.find((a) => a.type === 'animate') as { endTime: number };
    expect(idle.endTime).toBe(6);
  });

  it('preserves pauseAfter on the resulting SpeakAction for round-trip fidelity', () => {
    const doc = makeProduction({ actors: [], tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const lines = [makeLine('a1', 'Hello', 1.2)];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speak = getResultScene(result).actions.find((a) => a.type === 'speak') as { pauseAfter?: number };
    expect(speak.pauseAfter).toBeCloseTo(1.2);
  });

  it('skips blank lines when building speak actions', () => {
    const doc = makeProduction({ actors: [], tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const lines = [makeLine('a1', ''), makeLine('a2', 'Hello'), makeLine('a1', '  ')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    const speaks = getResultScene(result).actions.filter((a) => a.type === 'speak');
    expect(speaks).toHaveLength(1);
  });

  it('mirrors lines to doc.script for legacy compat', () => {
    const doc = makeProduction({ actors: [], tree: [makeNamedScene()], activeSceneId: 'sc1', script: [] });
    const lines = [makeLine('a1', 'Hello')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(result.script).toEqual(lines);
  });

  it('clamps scene duration to at least 6 seconds when dialogue is short', () => {
    const doc = makeProduction({ actors: [], tree: [makeNamedScene({ duration: 10 })], activeSceneId: 'sc1' });
    const lines = [makeLine('a1', 'Hi')];
    const result = new SetSpeakLinesCommand(lines).execute(doc);
    expect(getResultScene(result).duration).toBeGreaterThanOrEqual(6);
  });
});

// ── MoveStagedActorCommand ────────────────────────────────────────────────────

describe('MoveStagedActorCommand', () => {
  it('updates startPosition of the matching staged actor', () => {
    const doc = makeProduction({
      actors: [makeActor('a1')],
      tree: [makeNamedScene({ stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0] }] })],
      activeSceneId: 'sc1',
    });
    const result = new MoveStagedActorCommand('a1', [3, 0, -2]).execute(doc);
    expect(getResultScene(result).stagedActors[0].startPosition).toEqual([3, 0, -2]);
  });

  it('updates startRotation when provided', () => {
    const doc = makeProduction({
      actors: [makeActor('a1')],
      tree: [makeNamedScene({ stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0] }] })],
      activeSceneId: 'sc1',
    });
    const result = new MoveStagedActorCommand('a1', [1, 0, 1], [0, Math.PI / 2, 0]).execute(doc);
    expect(getResultScene(result).stagedActors[0].startRotation).toEqual([0, Math.PI / 2, 0]);
  });

  it('does not overwrite startRotation when rotation is omitted', () => {
    const existing: [number, number, number] = [0, 1, 0];
    const doc = makeProduction({
      actors: [makeActor('a1')],
      tree: [makeNamedScene({ stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0], startRotation: existing }] })],
      activeSceneId: 'sc1',
    });
    const result = new MoveStagedActorCommand('a1', [5, 0, 5]).execute(doc);
    expect(getResultScene(result).stagedActors[0].startRotation).toEqual(existing);
  });

  it('leaves other staged actors unchanged', () => {
    const doc = makeProduction({
      actors: [makeActor('a1'), makeActor('a2')],
      tree: [makeNamedScene({
        stagedActors: [
          { actorId: 'a1', startPosition: [0, 0, 0] },
          { actorId: 'a2', startPosition: [2, 0, 2] },
        ],
      })],
      activeSceneId: 'sc1',
    });
    const result = new MoveStagedActorCommand('a1', [9, 0, 9]).execute(doc);
    expect(getResultScene(result).stagedActors[1].startPosition).toEqual([2, 0, 2]);
  });

  it('is a no-op when no scenes', () => {
    const doc = makeProduction({ actors: [makeActor('a1')] });
    const result = new MoveStagedActorCommand('a1', [1, 0, 1]).execute(doc);
    expect(result.tree).toBeUndefined();
  });
});

// ── MoveSetPieceCommand ───────────────────────────────────────────────────────

describe('MoveSetPieceCommand', () => {
  const boxSet = [{ name: 'box', geometry: { type: 'box' as const, width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 } }];

  it('updates position of the named set piece', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ set: boxSet })], activeSceneId: 'sc1' });
    const result = new MoveSetPieceCommand('box', [4, 0, 2]).execute(doc);
    expect(getResultScene(result).set[0].position).toEqual([4, 0, 2]);
  });

  it('updates rotation when provided', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ set: boxSet })], activeSceneId: 'sc1' });
    const result = new MoveSetPieceCommand('box', [0, 0, 0], [0, Math.PI, 0]).execute(doc);
    expect(getResultScene(result).set[0].rotation).toEqual([0, Math.PI, 0]);
  });

  it('does not overwrite existing rotation when rotation is omitted', () => {
    const existing: [number, number, number] = [0, 0.5, 0];
    const setWithRot = [{ name: 'box', geometry: { type: 'box' as const, width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 }, rotation: existing }];
    const doc = makeProduction({ tree: [makeNamedScene({ set: setWithRot })], activeSceneId: 'sc1' });
    const result = new MoveSetPieceCommand('box', [1, 0, 1]).execute(doc);
    expect(getResultScene(result).set[0].rotation).toEqual(existing);
  });

  it('leaves other set pieces unchanged', () => {
    const twoSet = [
      { name: 'box', geometry: { type: 'box' as const, width: 1, height: 1, depth: 1 }, material: { color: 0xff0000 } },
      { name: 'sphere', geometry: { type: 'sphere' as const, radius: 0.5 }, material: { color: 0x0000ff } },
    ];
    const doc = makeProduction({ tree: [makeNamedScene({ set: twoSet })], activeSceneId: 'sc1' });
    const result = new MoveSetPieceCommand('box', [5, 0, 5]).execute(doc);
    expect(getResultScene(result).set[1].position).toBeUndefined();
  });

  it('is a no-op when no scenes', () => {
    const doc = makeProduction();
    const result = new MoveSetPieceCommand('box', [1, 0, 1]).execute(doc);
    expect(result.tree).toBeUndefined();
  });
});

// ── SetSceneDurationCommand ───────────────────────────────────────────────────

describe('SetSceneDurationCommand', () => {
  it('sets duration on scene', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new SetSceneDurationCommand(30).execute(doc);
    expect(getResultScene(result).duration).toBe(30);
  });

  it('clears duration when undefined is passed', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ duration: 30 })], activeSceneId: 'sc1' });
    const result = new SetSceneDurationCommand(undefined).execute(doc);
    expect(getResultScene(result).duration).toBeUndefined();
  });

  it('is a no-op when no scenes', () => {
    expect(new SetSceneDurationCommand(10).execute(makeProduction()).tree).toBeUndefined();
  });
});

// ── AddAnimateSegmentCommand ──────────────────────────────────────────────────

describe('AddAnimateSegmentCommand', () => {
  const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk', loop: 'repeat' };

  it('appends a new ClipTrack', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new AddAnimateSegmentCommand(seg).execute(doc);
    const added = getResultScene(result).actions.find((a) => a.type === 'animate') as ClipTrack | undefined;
    expect(added?.animationName).toBe('Walk');
    expect(added?.actorId).toBe('a1');
  });

  it('is a no-op when no scenes', () => {
    expect(new AddAnimateSegmentCommand(seg).execute(makeProduction()).tree).toBeUndefined();
  });
});

// ── RemoveAnimateSegmentCommand ───────────────────────────────────────────────

describe('RemoveAnimateSegmentCommand', () => {
  it('removes action at given global index', () => {
    const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [seg] })], activeSceneId: 'sc1' });
    const result = new RemoveAnimateSegmentCommand(0).execute(doc);
    expect(getResultScene(result).actions).toHaveLength(0);
  });

  it('leaves other actions intact', () => {
    const seg1: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const seg2: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 5, animationName: 'Idle' };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [seg1, seg2] })], activeSceneId: 'sc1' });
    const result = new RemoveAnimateSegmentCommand(0).execute(doc);
    expect((getResultScene(result).actions[0] as ClipTrack).animationName).toBe('Idle');
  });
});

// ── UpdateAnimateSegmentCommand ───────────────────────────────────────────────

describe('UpdateAnimateSegmentCommand', () => {
  it('patches animationName', () => {
    const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [seg] })], activeSceneId: 'sc1' });
    const result = new UpdateAnimateSegmentCommand(0, { animationName: 'Run' }).execute(doc);
    expect((getResultScene(result).actions[0] as ClipTrack).animationName).toBe('Run');
  });

  it('patches startTime and loop', () => {
    const seg: ClipTrack = { type: 'animate', actorId: 'a1', startTime: 0, animationName: 'Walk' };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [seg] })], activeSceneId: 'sc1' });
    const result = new UpdateAnimateSegmentCommand(0, { startTime: 2, loop: 'repeat' }).execute(doc);
    expect((getResultScene(result).actions[0] as ClipTrack).startTime).toBe(2);
    expect((getResultScene(result).actions[0] as ClipTrack).loop).toBe('repeat');
  });

  it('is a no-op when index points to non-animate action', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const before = JSON.stringify(getResultScene(doc).actions);
    const result = new UpdateAnimateSegmentCommand(0, { animationName: 'X' }).execute(doc);
    expect(JSON.stringify(getResultScene(result).actions)).toBe(before);
  });
});

// ── CapturePositionKeyframeCommand ────────────────────────────────────────────

describe('CapturePositionKeyframeCommand', () => {
  it('creates a new TransformTrack when none exists', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new CapturePositionKeyframeCommand('a1', 1.0, [1, 2, 3]).execute(doc);
    const move = getResultScene(result).actions.find((a) => a.type === 'move') as TransformTrack | undefined;
    expect(move?.targetId).toBe('a1');
    expect(move?.keyframes.times).toEqual([1.0]);
    expect(move?.keyframes.values).toEqual([1, 2, 3]);
  });

  it('appends a keyframe to the existing TransformTrack in time order', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [0], values: [0, 0, 0], trackType: 'vector' },
    };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new CapturePositionKeyframeCommand('a1', 2.0, [5, 0, 0]).execute(doc);
    const move = getResultScene(result).actions[0] as TransformTrack;
    expect(move.keyframes.times).toEqual([0, 2.0]);
    expect(move.keyframes.values).toEqual([0, 0, 0, 5, 0, 0]);
  });

  it('replaces a keyframe within 50ms snap', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [1.0], values: [1, 2, 3], trackType: 'vector' },
    };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new CapturePositionKeyframeCommand('a1', 1.02, [9, 9, 9]).execute(doc);
    const move = getResultScene(result).actions[0] as TransformTrack;
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
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new RemoveTransformKeyframeCommand('a1', '.position', 1).execute(doc);
    const move = getResultScene(result).actions[0] as TransformTrack;
    expect(move.keyframes.times).toEqual([0]);
    expect(move.keyframes.values).toEqual([0, 0, 0]);
  });

  it('removes the TransformTrack when the last keyframe is deleted', () => {
    const existing: TransformTrack = {
      type: 'move', targetId: 'a1', startTime: 0,
      keyframes: { property: '.position', times: [1.0], values: [1, 2, 3], trackType: 'vector' },
    };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new RemoveTransformKeyframeCommand('a1', '.position', 0).execute(doc);
    expect(getResultScene(result).actions).toHaveLength(0);
  });
});

// ── CaptureLightIntensityKeyframeCommand ──────────────────────────────────────

describe('CaptureLightIntensityKeyframeCommand', () => {
  it('creates a new LightingTrack when none exists', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new CaptureLightIntensityKeyframeCommand('sun', 0, 1.5).execute(doc);
    const la = getResultScene(result).actions.find((a) => a.type === 'lighting') as LightingTrack | undefined;
    expect(la?.lightId).toBe('sun');
    expect(la?.keyframes.times).toEqual([0]);
    expect(la?.keyframes.values).toEqual([1.5]);
  });

  it('appends a keyframe and keeps time-sorted order', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [0], values: [1], trackType: 'number' },
    };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new CaptureLightIntensityKeyframeCommand('sun', 2, 0.5).execute(doc);
    const la = getResultScene(result).actions[0] as LightingTrack;
    expect(la.keyframes.times).toEqual([0, 2]);
    expect(la.keyframes.values).toEqual([1, 0.5]);
  });

  it('replaces a keyframe within 50ms snap', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [1.0], values: [1], trackType: 'number' },
    };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new CaptureLightIntensityKeyframeCommand('sun', 1.01, 2).execute(doc);
    const la = getResultScene(result).actions[0] as LightingTrack;
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
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new RemoveLightKeyframeCommand('sun', '.intensity', 0).execute(doc);
    const la = getResultScene(result).actions[0] as LightingTrack;
    expect(la.keyframes.times).toEqual([2]);
    expect(la.keyframes.values).toEqual([0.5]);
  });

  it('removes the LightingTrack when the last keyframe is deleted', () => {
    const existing: LightingTrack = {
      type: 'lighting', lightId: 'sun', startTime: 0,
      keyframes: { property: '.intensity', times: [0], values: [1], trackType: 'number' },
    };
    const doc = makeProduction({ tree: [makeNamedScene({ actions: [existing] })], activeSceneId: 'sc1' });
    const result = new RemoveLightKeyframeCommand('sun', '.intensity', 0).execute(doc);
    expect(getResultScene(result).actions).toHaveLength(0);
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
    const doc = makeProduction({
      actors: [actor],
      tree: [makeNamedScene()],
      activeSceneId: 'sc1',
    });
    const result = new SetActorIdleAnimationCommand('a1', 'Run').execute(doc);
    const idle = (getResultScene(result).actions as ClipTrack[]).find(
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
    const doc = makeProduction({
      actors: [actor],
      tree: [makeNamedScene({ stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0] }] })],
      activeSceneId: 'sc1',
    });
    const result = new SetActorScaleCommand('a1', 3).execute(doc);
    expect(getResultScene(result).stagedActors[0].startScale).toEqual([3, 3, 3]);
  });

  it('removes startScale when undefined is passed', () => {
    const actor: StoredActor = { ...makeActor('a1'), scale: 2 };
    const doc = makeProduction({
      actors: [actor],
      tree: [makeNamedScene({ stagedActors: [{ actorId: 'a1', startPosition: [0, 0, 0], startScale: [2, 2, 2] }] })],
      activeSceneId: 'sc1',
    });
    const result = new SetActorScaleCommand('a1', undefined).execute(doc);
    expect(result.actors![0].scale).toBeUndefined();
    expect(getResultScene(result).stagedActors[0].startScale).toBeUndefined();
  });

  it('does not alter other staged actors', () => {
    const staged1: StagedActor = { actorId: 'a1', startPosition: [0, 0, 0] };
    const staged2: StagedActor = { actorId: 'a2', startPosition: [1, 0, 0] };
    const doc = makeProduction({
      actors: [makeActor('a1'), makeActor('a2')],
      tree: [makeNamedScene({ stagedActors: [staged1, staged2] })],
      activeSceneId: 'sc1',
    });
    const result = new SetActorScaleCommand('a1', 2).execute(doc);
    expect(getResultScene(result).stagedActors[1].startScale).toBeUndefined();
  });
});

// ── AddActorBlockCommand ────────────────────────────────────────────────

describe('AddActorBlockCommand', () => {
  const block = (): import('../domain/types').ActorBlock => ({
    type: 'actorBlock', actorId: 'a1', startTime: 1, endTime: 4, clip: 'Walk',
  });

  it('appends a block to an empty blocks list', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new AddActorBlockCommand(block()).execute(doc);
    expect(getResultScene(result).blocks).toHaveLength(1);
    expect(getResultScene(result).blocks![0]).toMatchObject({ actorId: 'a1', clip: 'Walk' });
  });

  it('appends after existing blocks', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [block()] })], activeSceneId: 'sc1' });
    const result = new AddActorBlockCommand({ ...block(), startTime: 5, endTime: 8 }).execute(doc);
    expect(getResultScene(result).blocks).toHaveLength(2);
  });

  it('is a no-op when no scenes', () => {
    expect(new AddActorBlockCommand(block()).execute(makeProduction()).tree).toBeUndefined();
  });
});

// ── RemoveActorBlockCommand ────────────────────────────────────────────

describe('RemoveActorBlockCommand', () => {
  const b1 = (): import('../domain/types').ActorBlock => ({ type: 'actorBlock', actorId: 'a1', startTime: 0, endTime: 2 });
  const b2 = (): import('../domain/types').ActorBlock => ({ type: 'actorBlock', actorId: 'a1', startTime: 3, endTime: 5 });

  it('removes the block at the given index', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [b1(), b2()] })], activeSceneId: 'sc1' });
    const result = new RemoveActorBlockCommand(0).execute(doc);
    expect(getResultScene(result).blocks).toHaveLength(1);
    expect(getResultScene(result).blocks![0].startTime).toBe(3);
  });

  it('results in an empty blocks array when the last block is removed', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [b1()] })], activeSceneId: 'sc1' });
    const result = new RemoveActorBlockCommand(0).execute(doc);
    expect(getResultScene(result).blocks).toHaveLength(0);
  });

  it('is a no-op when no scenes', () => {
    expect(new RemoveActorBlockCommand(0).execute(makeProduction()).tree).toBeUndefined();
  });
});

// ── UpdateActorBlockCommand ────────────────────────────────────────────

describe('UpdateActorBlockCommand', () => {
  const base = (): import('../domain/types').ActorBlock => ({
    type: 'actorBlock', actorId: 'a1', startTime: 0, endTime: 4, clip: 'Walk',
  });

  it('patches a single field', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [base()] })], activeSceneId: 'sc1' });
    const result = new UpdateActorBlockCommand(0, { clip: 'Run' }).execute(doc);
    expect((getResultScene(result).blocks![0] as import('../domain/types').ActorBlock).clip).toBe('Run');
  });

  it('patches timing fields', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [base()] })], activeSceneId: 'sc1' });
    const result = new UpdateActorBlockCommand(0, { startTime: 2, endTime: 6 }).execute(doc);
    expect(getResultScene(result).blocks![0].startTime).toBe(2);
    expect(getResultScene(result).blocks![0].endTime).toBe(6);
  });

  it('preserves other blocks unchanged', () => {
    const other: import('../domain/types').ActorBlock = { type: 'actorBlock', actorId: 'a2', startTime: 10, endTime: 12 };
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [base(), other] })], activeSceneId: 'sc1' });
    const result = new UpdateActorBlockCommand(0, { clip: 'Idle' }).execute(doc);
    expect(getResultScene(result).blocks![1]).toEqual(other);
  });

  it('is a no-op when no scenes', () => {
    expect(new UpdateActorBlockCommand(0, { clip: 'Run' }).execute(makeProduction()).tree).toBeUndefined();
  });

  it('is a no-op when index is out of range', () => {
    const doc = makeProduction({ tree: [makeNamedScene({ blocks: [base()] })], activeSceneId: 'sc1' });
    const result = new UpdateActorBlockCommand(5, { clip: 'Run' }).execute(doc);
    const block = getResultScene(result).blocks![0];
    if (block.type !== 'actorBlock') throw new Error('expected actorBlock');
    expect(block.clip).toBe('Walk');
  });
});

// ── Scene management commands ─────────────────────────────────────────────────

describe('AddSceneCommand', () => {
  it('appends a new scene to the tree', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new AddSceneCommand('Scene 2').execute(doc);
    expect(getScenes(result.tree ?? [])).toHaveLength(2);
    expect(getScenes(result.tree ?? [])[1].name).toBe('Scene 2');
  });

  it('auto-names the scene when name is empty', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new AddSceneCommand().execute(doc);
    expect(getScenes(result.tree ?? [])[1].name).toBe('Scene 2');
  });

  it('does not change the active scene', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new AddSceneCommand().execute(doc);
    expect(result.activeSceneId).toBe('sc1');
  });
});

describe('RenameSceneCommand', () => {
  it('renames the target scene', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new RenameSceneCommand('sc1', 'Renamed').execute(doc);
    expect(getScenes(result.tree ?? [])[0].name).toBe('Renamed');
  });

  it('is a no-op when tree is absent', () => {
    const doc = makeProduction();
    const result = new RenameSceneCommand('x', 'Y').execute(doc);
    expect(result.tree).toBeUndefined();
  });
});

describe('RemoveSceneCommand', () => {
  it('removes the target scene', () => {
    const ns2: NamedScene = { id: 'sc2', name: 'Scene 2', scene: makeScene() };
    const doc = makeProduction({ tree: [makeNamedScene(), ns2], activeSceneId: 'sc1' });
    const result = new RemoveSceneCommand('sc1').execute(doc);
    expect(getScenes(result.tree ?? [])).toHaveLength(1);
    expect(getScenes(result.tree ?? [])[0].id).toBe('sc2');
  });

  it('is a no-op when only one scene remains', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new RemoveSceneCommand('sc1').execute(doc);
    expect(getScenes(result.tree ?? [])).toHaveLength(1);
  });

  it('updates activeSceneId when the active scene is removed', () => {
    const ns2: NamedScene = { id: 'sc2', name: 'Scene 2', scene: makeScene() };
    const doc = makeProduction({ tree: [makeNamedScene(), ns2], activeSceneId: 'sc1' });
    const result = new RemoveSceneCommand('sc1').execute(doc);
    expect(result.activeSceneId).toBe('sc2');
  });
});

describe('SwitchSceneCommand', () => {
  it('updates activeSceneId', () => {
    const ns2: NamedScene = { id: 'sc2', name: 'Scene 2', scene: makeScene() };
    const doc = makeProduction({ tree: [makeNamedScene(), ns2], activeSceneId: 'sc1' });
    const result = new SwitchSceneCommand('sc2').execute(doc);
    expect(result.activeSceneId).toBe('sc2');
  });

  it('is a no-op when sceneId does not exist', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new SwitchSceneCommand('nonexistent').execute(doc);
    expect(result.activeSceneId).toBe('sc1');
  });
});

// ── Group (Act) commands ──────────────────────────────────────────────────────

describe('AddGroupCommand', () => {
  it('appends a new group to the tree', () => {
    const doc = makeProduction();
    const result = new AddGroupCommand('Act 1').execute(doc);
    expect(result.tree).toHaveLength(1);
    expect((result.tree![0] as import('../storage/types').StoredGroup).name).toBe('Act 1');
  });

  it('auto-names the group when name is empty', () => {
    const doc = makeProduction();
    const result = new AddGroupCommand().execute(doc);
    expect((result.tree![0] as import('../storage/types').StoredGroup).name).toBe('Act 1');
  });
});

describe('RenameGroupCommand', () => {
  it('renames the target group', () => {
    const doc = new AddGroupCommand('Old Name').execute(makeProduction());
    const groupId = (doc.tree![0] as import('../storage/types').StoredGroup).id;
    const result = new RenameGroupCommand(groupId, 'New Name').execute(doc);
    expect((result.tree![0] as import('../storage/types').StoredGroup).name).toBe('New Name');
  });
});

describe('RemoveGroupCommand', () => {
  it('removes the target group from the tree', () => {
    const doc = new AddGroupCommand('Act 1').execute(makeProduction());
    const groupId = (doc.tree![0] as import('../storage/types').StoredGroup).id;
    const result = new RemoveGroupCommand(groupId).execute(doc);
    expect(result.tree).toHaveLength(0);
  });

  it('is a no-op when group id not found', () => {
    const doc = new AddGroupCommand('Act 1').execute(makeProduction());
    const result = new RemoveGroupCommand('nonexistent').execute(doc);
    expect(result.tree).toHaveLength(1);
  });

  it('adds a scene inside a group using AddSceneCommand with parentGroupId', () => {
    const withGroup = new AddGroupCommand('Act 1').execute(makeProduction());
    const groupId = (withGroup.tree![0] as import('../storage/types').StoredGroup).id;
    const result = new AddSceneCommand('Scene 1', groupId).execute(withGroup);
    const group = result.tree![0] as import('../storage/types').StoredGroup;
    expect(group.children).toHaveLength(1);
    expect(group.children[0].name).toBe('Scene 1');
  });

  it('uses the caller-supplied sceneId when provided', () => {
    const doc = makeProduction({ tree: [makeNamedScene()], activeSceneId: 'sc1' });
    const result = new AddSceneCommand('Act 1 Scene', undefined, 'pre-generated-id').execute(doc);
    expect(getScenes(result.tree ?? []).find((ns) => ns.id === 'pre-generated-id')).toBeDefined();
  });
});


describe('SetProductionSpeechSettingsCommand', () => {
  it('sets speech settings on the production', () => {
    const result = new SetProductionSpeechSettingsCommand({ engine: 'kokoro', bubbleScale: 1.2 }).execute(makeProduction());
    expect(result.speechSettings).toEqual({ engine: 'kokoro', bubbleScale: 1.2 });
  });

  it('clears speech settings when called with undefined', () => {
    const withSettings = new SetProductionSpeechSettingsCommand({ engine: 'espeak', bubbleScale: 0.8 }).execute(makeProduction());
    const cleared = new SetProductionSpeechSettingsCommand(undefined).execute(withSettings);
    expect(cleared.speechSettings).toBeUndefined();
  });

  it('updates modifiedAt', () => {
    const before = makeProduction();
    const after = new SetProductionSpeechSettingsCommand({ engine: 'espeak', bubbleScale: 1 }).execute(before);
    expect(after.modifiedAt).toBeGreaterThanOrEqual(before.modifiedAt);
  });
});
