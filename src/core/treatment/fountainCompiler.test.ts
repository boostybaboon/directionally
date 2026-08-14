import { describe, it, expect } from 'vitest';
import { renderFountain, createDefaultScriptDocument } from './fountain';
import { compileScriptDocument } from './fountainCompiler';
import type { ScriptDocument, Beat, ActionBeat, StageSide, StageMark } from './fountain';

// ── Programmatic fixture builders ────────────────────────────────────────────

function buildDoc(scenes: ScriptDocument['scenes'], cast: string[]): ScriptDocument {
  return { scenes, cast, diagnostics: [] };
}

function act(character: string, verb: ActionBeat['verb'], opts: { side?: StageSide; target?: StageMark; seconds?: number } = {}): ActionBeat {
  return { type: 'action', character, verb, ...opts };
}

function say(character: string, text: string): Beat {
  return { type: 'dialogue', character, text };
}

function scene(heading: string, beats: Beat[]): ScriptDocument['scenes'][0] {
  return { heading, beats };
}

function allBlocks(result: ReturnType<typeof compileScriptDocument>) {
  return (result.scenes[0]?.scene?.blocks ?? []);
}

function actorBlocks(result: ReturnType<typeof compileScriptDocument>) {
  return allBlocks(result).filter((b) => b.type === 'actorBlock');
}

function speakActions(result: ReturnType<typeof compileScriptDocument>) {
  return result.scenes[0].scene.actions.filter((a) => a.type === 'speak');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('compileScriptDocument', () => {
  it('produces exactly two actors from the default example', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    expect(result.actors).toHaveLength(2);
    expect(result.actors[0].role).toBe('ALPHA');
    expect(result.actors[1].role).toBe('BETA');
  });

  it('produces one scene from the default example', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0].name).toContain('INT. STAGE');
  });

  it('generates enter blocks for both actors', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    const blocks = actorBlocks(result);
    // ALPHA: enter + move. BETA: enter.
    expect(blocks).toHaveLength(3);

    const alphaId = result.actors[0].id;
    const betaId = result.actors[1].id;
    const alphaBlocks = blocks.filter((b) => b.actorId === alphaId);
    const betaBlocks = blocks.filter((b) => b.actorId === betaId);

    expect(alphaBlocks).toHaveLength(2); // enter + move
    expect(betaBlocks).toHaveLength(1);  // enter
  });

  it('generates speak actions from dialogue', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    const speaks = speakActions(result);
    expect(speaks).toHaveLength(2);
  });

  it('handles a pure-action scene with zero dialogue', () => {
    const doc = buildDoc([
      scene('INT. CORRIDOR - NIGHT', [
        act('REN', 'enter', { side: 'left' }),
        act('REN', 'move', { target: 'center' }),
        act('REN', 'hold', { seconds: 3.0 }),
        act('REN', 'exit', { side: 'right' }),
      ]),
    ], ['REN']);

    const result = compileScriptDocument(doc);

    expect(result.actors).toHaveLength(1);
    expect(result.actors[0].role).toBe('REN');
    expect(actorBlocks(result)).toHaveLength(4); // enter + move + hold + exit
    expect(speakActions(result)).toHaveLength(0);
  });

  it('handles a dialogue-heavy scene', () => {
    const doc = buildDoc([
      scene('INT. FLAT - EVENING', [
        act('CASS', 'enter', { side: 'left' }),
        act('JO', 'enter', { side: 'right' }),
        say('CASS', 'You kept the piano.'),
        say('JO', 'Didn\'t have anywhere else.'),
        act('CASS', 'move', { target: 'center' }),
        act('JO', 'hold', { seconds: 2.0 }),
      ]),
    ], ['CASS', 'JO']);

    const result = compileScriptDocument(doc);

    expect(result.actors).toHaveLength(2);
    expect(speakActions(result)).toHaveLength(2);

    const cassBlocks = actorBlocks(result).filter((b) => b.actorId === result.actors[0].id);
    const joBlocks = actorBlocks(result).filter((b) => b.actorId === result.actors[1].id);

    expect(cassBlocks).toHaveLength(2); // enter + move
    expect(joBlocks).toHaveLength(2);   // enter + hold
  });

  it('stages actors offstage when their first beat is enter', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    const staged = result.scenes[0].scene.stagedActors;
    // Both ALPHA and BETA start offstage (first beat is enter)
    for (const s of staged) {
      const pos = s.startPosition!;
      // Offstage positions are at x <= -2.76 (left offstage) or x >= +2.76 (right offstage)
      expect(pos[0] < -2.5 || pos[0] > 2.5).toBe(true);
    }
  });

  it('renderFountain produces readable text from structured data', () => {
    const doc = createDefaultScriptDocument();
    const text = renderFountain(doc);

    expect(text).toContain('INT. STAGE - DAY');
    expect(text).toContain('ALPHA');
    expect(text).toContain('enters from stage left');
    expect(text).toContain('BETA');
    expect(text).toContain('enters from stage right');
    expect(text).toContain('We start here.');
    expect(text).toContain('moves to center');
    expect(text).toContain('Copy that.');
  });

  it('renderFountain is deterministic', () => {
    const doc = createDefaultScriptDocument();
    const a = renderFountain(doc);
    const b = renderFountain(doc);
    expect(a).toBe(b);
  });

  it('applies human-scale from catalogue to all staged actors', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    for (const s of result.scenes[0].scene.stagedActors) {
      expect(s.startScale).toBeDefined();
      expect(s.startScale![0]).toBeLessThan(1); // robot should be scaled down
      expect(s.startScale![0]).toBeGreaterThan(0.1);
    }
  });
});
