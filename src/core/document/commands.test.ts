import { describe, it, expect } from 'vitest';
import { AddActorCommand, RemoveActorCommand, SetSpeakLinesCommand, MoveStagedActorCommand, MoveSetPieceCommand } from './commands';
import type { StoredActor, StoredProduction, StoredScene } from '../storage/types';
import type { ScriptLine } from '../../lib/sandbox/types';
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
