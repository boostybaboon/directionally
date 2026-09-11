import { describe, it, expect } from 'vitest';
import { tokenizeScript, renderScript, sceneIndexForLine, retypeAlias } from './sigilScript';
import type { ScriptDocument, Beat, ActionBeat, SceneBlock } from './fountain';

// ── Programmatic fixture builders (mirrors fountainCompiler.test.ts) ────────

function act(character: string, verb: ActionBeat['verb'], opts: { side?: 'left' | 'right'; target?: 'left' | 'center' | 'right'; seconds?: number } = {}): ActionBeat {
  return { type: 'action', character, verb, ...opts };
}

function say(character: string, text: string): Beat {
  return { type: 'dialogue', character, text };
}

function scene(setting: string, timeOfDay: string, interior: boolean, beats: Beat[]): SceneBlock {
  const prefix = interior ? 'INT.' : 'EXT.';
  return { heading: `${prefix} ${setting} - ${timeOfDay}`, interior, setting, timeOfDay, beats };
}

function doc(scenes: SceneBlock[], cast: string[]): ScriptDocument {
  return { scenes, cast, diagnostics: [] };
}

describe('tokenizeScript', () => {
  it('parses a scene heading with INT/EXT, setting, and time-of-day', () => {
    const result = tokenizeScript('#INT STAGE DAY');
    expect(result.doc.scenes).toHaveLength(1);
    expect(result.doc.scenes[0].interior).toBe(true);
    expect(result.doc.scenes[0].setting).toBe('STAGE');
    expect(result.doc.scenes[0].timeOfDay).toBe('DAY');
    expect(result.doc.scenes[0].heading).toBe('INT. STAGE - DAY');
  });

  it('parses an EXT heading', () => {
    const result = tokenizeScript('#EXT PARK NIGHT');
    expect(result.doc.scenes[0].interior).toBe(false);
  });

  it('parses a multi-word setting', () => {
    const result = tokenizeScript("#INT JO'S FLAT EVENING");
    expect(result.doc.scenes[0].setting).toBe("JO'S FLAT");
    expect(result.doc.scenes[0].timeOfDay).toBe('EVENING');
  });

  it('parses an enter action beat with side', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n>ALPHA enters left');
    const beat = result.doc.scenes[0].beats[0] as ActionBeat;
    expect(beat.type).toBe('action');
    expect(beat.character).toBe('ALPHA');
    expect(beat.verb).toBe('enter');
    expect(beat.side).toBe('left');
  });

  it('parses enter with a "from" preposition (accepted on input, not required)', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n>ALPHA enter from left');
    const beat = result.doc.scenes[0].beats[0] as ActionBeat;
    expect(beat.verb).toBe('enter');
    expect(beat.side).toBe('left');
  });

  it('parses a move action beat with a target mark', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n>ALPHA moves center');
    const beat = result.doc.scenes[0].beats[0] as ActionBeat;
    expect(beat.verb).toBe('move');
    expect(beat.target).toBe('center');
  });

  it('parses a hold action beat with numeric seconds', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n>ALPHA holds 2.5');
    const beat = result.doc.scenes[0].beats[0] as ActionBeat;
    expect(beat.verb).toBe('hold');
    expect(beat.seconds).toBe(2.5);
  });

  it('attributes non-sigil lines after @ to that speaker as dialogue', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n@ALPHA\nWe start here.');
    const beat = result.doc.scenes[0].beats[0];
    expect(beat.type).toBe('dialogue');
    expect((beat as { character: string }).character).toBe('ALPHA');
    expect((beat as { text: string }).text).toBe('We start here.');
  });

  it('joins multiple consecutive dialogue lines under one speaker into one beat', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n@ALPHA\nLine one.\nLine two.');
    expect(result.doc.scenes[0].beats).toHaveLength(1);
    expect((result.doc.scenes[0].beats[0] as { text: string }).text).toBe('Line one.\nLine two.');
  });

  it('populates cast in order of first appearance across @ and > sigils', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n>ALPHA enters left\n>BETA enters right\n\n@ALPHA\nHi.');
    expect(result.doc.cast).toEqual(['ALPHA', 'BETA']);
  });

  it('starts a new scene on each # line', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n@ALPHA\nHi.\n\n#EXT PARK NIGHT\n\n@BETA\nBye.');
    expect(result.doc.scenes).toHaveLength(2);
    expect(result.doc.scenes[0].setting).toBe('STAGE');
    expect(result.doc.scenes[1].setting).toBe('PARK');
  });

  it('emits a diagnostic for a dialogue line with no active speaker or scene', () => {
    const result = tokenizeScript('stray line with no sigil');
    expect(result.diagnostics.some((d) => d.level === 'warning')).toBe(true);
  });

  it('emits a diagnostic for an action beat before any scene heading', () => {
    const result = tokenizeScript('>ALPHA enters left');
    expect(result.diagnostics.some((d) => d.level === 'error')).toBe(true);
  });

  it('emits a diagnostic for an unknown verb', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n>ALPHA teleports left');
    expect(result.diagnostics.some((d) => d.level === 'error')).toBe(true);
  });

  it('ignores blank lines entirely', () => {
    const result = tokenizeScript('#INT STAGE DAY\n\n\n\n@ALPHA\n\nHi.');
    expect(result.doc.scenes).toHaveLength(1);
  });
});

describe('renderScript', () => {
  it('renders a scene heading in canonical sigil form', () => {
    const d = doc([scene('STAGE', 'DAY', true, [])], []);
    expect(renderScript(d)).toBe('#INT STAGE DAY');
  });

  it('renders action beats without prepositions', () => {
    const d = doc([scene('STAGE', 'DAY', true, [act('ALPHA', 'enter', { side: 'left' })])], ['ALPHA']);
    expect(renderScript(d)).toContain('>ALPHA enters left');
  });

  it('renders a speaker cue followed by dialogue text', () => {
    const d = doc([scene('STAGE', 'DAY', true, [say('ALPHA', 'We start here.')])], ['ALPHA']);
    const text = renderScript(d);
    expect(text).toContain('@ALPHA');
    expect(text).toContain('We start here.');
  });

  it('does not repeat the speaker cue for consecutive lines from the same actor', () => {
    const d = doc([scene('STAGE', 'DAY', true, [say('ALPHA', 'Line one.'), say('ALPHA', 'Line two.')])], ['ALPHA']);
    const text = renderScript(d);
    expect(text.match(/@ALPHA/g)?.length).toBe(1);
  });

  it('repeats the speaker cue when the speaker changes and changes back', () => {
    const d = doc([scene('STAGE', 'DAY', true, [
      say('ALPHA', 'Hi.'),
      say('BETA', 'Hello.'),
      say('ALPHA', 'Again.'),
    ])], ['ALPHA', 'BETA']);
    const text = renderScript(d);
    expect(text.match(/@ALPHA/g)?.length).toBe(2);
    expect(text.match(/@BETA/g)?.length).toBe(1);
  });
});

describe('lossless round-trip: tokenizeScript(renderScript(doc)) === doc (structurally)', () => {
  function stripDiagnostics(d: ScriptDocument) {
    return { scenes: d.scenes, cast: d.cast };
  }

  it('round-trips a simple two-actor scene (dialogue-driven style)', () => {
    const original = doc([
      scene('STAGE', 'DAY', true, [
        act('ALPHA', 'enter', { side: 'left' }),
        act('BETA', 'enter', { side: 'right' }),
        say('ALPHA', 'We start here.'),
        act('ALPHA', 'move', { target: 'center' }),
        say('BETA', 'Copy that.'),
      ]),
    ], ['ALPHA', 'BETA']);

    const text = renderScript(original);
    const { doc: reparsed } = tokenizeScript(text);
    expect(stripDiagnostics(reparsed)).toEqual(stripDiagnostics(original));
  });

  it('round-trips a pure-action scene (action-driven style, no dialogue)', () => {
    const original = doc([
      scene('CORRIDOR', 'NIGHT', true, [
        act('REN', 'enter', { side: 'left' }),
        act('REN', 'move', { target: 'center' }),
        act('REN', 'hold', { seconds: 3.0 }),
        act('REN', 'exit', { side: 'right' }),
      ]),
    ], ['REN']);

    const text = renderScript(original);
    const { doc: reparsed } = tokenizeScript(text);
    expect(stripDiagnostics(reparsed)).toEqual(stripDiagnostics(original));
  });

  it('round-trips a multi-scene document', () => {
    const original = doc([
      scene('STAGE', 'DAY', true, [
        act('ALPHA', 'enter', { side: 'left' }),
        say('ALPHA', 'Scene one.'),
      ]),
      scene('PARK', 'NIGHT', false, [
        act('BETA', 'enter', { side: 'right' }),
        say('BETA', 'Scene two.'),
      ]),
    ], ['ALPHA', 'BETA']);

    const text = renderScript(original);
    const { doc: reparsed } = tokenizeScript(text);
    expect(stripDiagnostics(reparsed)).toEqual(stripDiagnostics(original));
    expect(reparsed.scenes).toHaveLength(2);
  });

  it('round-trips multi-line dialogue for one speaker as a single beat', () => {
    const original = doc([
      scene('FLAT', 'EVENING', true, [
        say('CASS', 'You kept the piano.\nI wasn\'t sure you would.'),
      ]),
    ], ['CASS']);

    const text = renderScript(original);
    const { doc: reparsed } = tokenizeScript(text);
    expect(stripDiagnostics(reparsed)).toEqual(stripDiagnostics(original));
  });

  it('round-trips both treatment-fixture-style documents (dialogue-driven "Homecoming" scene 1 excerpt)', () => {
    // Mirrors TREATMENT_DIALOGUE_DRIVEN.md scene 1 ("Small Talk") structurally.
    const original = doc([
      scene("JO'S FLAT", 'EVENING', true, [
        act('CASS', 'enter', { side: 'left' }),
        say('CASS', "You kept the piano. I wasn't sure you would."),
        say('JO', "Didn't have anywhere else to put it."),
        say('CASS', 'Place looks good. Smaller than I remember.'),
        act('CASS', 'move', { target: 'center' }),
        say('JO', "He thinks a lot of things. Doesn't mean he's wrong."),
      ]),
    ], ['CASS', 'JO']);

    const text = renderScript(original);
    const { doc: reparsed } = tokenizeScript(text);
    expect(stripDiagnostics(reparsed)).toEqual(stripDiagnostics(original));
  });

  it('round-trips both treatment-fixture-style documents (action-driven "Night Shift" scene 1 excerpt)', () => {
    // Mirrors TREATMENT_ACTION_DRIVEN.md scene 1 ("In") structurally.
    const original = doc([
      scene('CORRIDOR', 'NIGHT', true, [
        act('REN', 'enter', { side: 'left' }),
        act('REN', 'hold', { seconds: 1.5 }),
        act('REN', 'move', { target: 'center' }),
        act('REN', 'exit', { side: 'right' }),
      ]),
    ], ['REN']);

    const text = renderScript(original);
    const { doc: reparsed } = tokenizeScript(text);
    expect(stripDiagnostics(reparsed)).toEqual(stripDiagnostics(original));
  });
});

describe('lossless round-trip: renderScript(tokenizeScript(text)) === text (canonical text)', () => {
  it('round-trips canonical sigil text unchanged', () => {
    const text = [
      '#INT STAGE DAY',
      '',
      '>ALPHA enters left',
      '>BETA enters right',
      '',
      '@ALPHA',
      'We start here.',
      '',
      '>ALPHA moves center',
      '',
      '@BETA',
      'Copy that.',
    ].join('\n');

    const { doc: parsed } = tokenizeScript(text);
    expect(renderScript(parsed)).toBe(text);
  });

  it('round-trips canonical multi-scene text unchanged', () => {
    const text = [
      '#INT STAGE DAY',
      '',
      '>ALPHA enters left',
      '',
      '@ALPHA',
      'Scene one.',
      '',
      '#EXT PARK NIGHT',
      '',
      '>BETA enters right',
      '',
      '@BETA',
      'Scene two.',
    ].join('\n');

    const { doc: parsed } = tokenizeScript(text);
    expect(renderScript(parsed)).toBe(text);
  });
});

describe('sceneStartLines / sceneIndexForLine', () => {
  it('records the 1-based line of each # heading', () => {
    const text = [
      '#INT STAGE DAY',
      '',
      '@ALPHA',
      'Hi.',
      '',
      '#EXT PARK NIGHT',
      '',
      '@BETA',
      'Bye.',
    ].join('\n');
    const result = tokenizeScript(text);
    expect(result.doc.scenes).toHaveLength(2);
    expect(result.sceneStartLines).toEqual([1, 6]);
  });

  it('maps a caret line to the scene whose heading is at-or-above it', () => {
    expect(sceneIndexForLine([1, 6], 0)).toBe(0);
    expect(sceneIndexForLine([1, 6], 1)).toBe(0);
    expect(sceneIndexForLine([1, 6], 3)).toBe(0);
    expect(sceneIndexForLine([1, 6], 6)).toBe(1);
    expect(sceneIndexForLine([1, 6], 9)).toBe(1);
  });

  it('returns 0 when there are no scenes', () => {
    expect(sceneIndexForLine([], 5)).toBe(0);
  });
});

describe('retypeAlias', () => {
  it('retypes a cast name across @ and > lines but leaves dialogue prose untouched', () => {
    const text = [
      '#INT STAGE DAY',
      '',
      '@BOB',
      'Hello, I am Bob the builder.',
      '>BOB enters left',
      '> BOB moves center',
    ].join('\n');
    const result = retypeAlias(text, 'BOB', 'ROBERT', 'cast');
    expect(result).toBe([
      '#INT STAGE DAY',
      '',
      '@ROBERT',
      'Hello, I am Bob the builder.',
      '>ROBERT enters left',
      '> ROBERT moves center',
    ].join('\n'));
  });

  it('retypes a scene setting within the # heading', () => {
    const text = '#INT CLASSROOM DAY\n\n@ALICE\nHi.\n\n#EXT CLASSROOM NIGHT';
    const result = retypeAlias(text, 'CLASSROOM', 'SCHOOLROOM', 'setting');
    expect(result).toBe('#INT SCHOOLROOM DAY\n\n@ALICE\nHi.\n\n#EXT SCHOOLROOM NIGHT');
  });

  it('does not touch prose or other sigil kinds when scoped', () => {
    const text = '@BOB\n#INT CLASSROOM DAY\n>BOB enters';
    expect(retypeAlias(text, 'BOB', 'ROBERT', 'setting')).toBe(text);
    expect(retypeAlias(text, 'CLASSROOM', 'ROOM', 'cast')).toBe(text);
  });

  it('is a no-op for an unchanged name', () => {
    const text = '@BOB\n>BOB enters';
    expect(retypeAlias(text, 'BOB', 'BOB', 'cast')).toBe(text);
  });
});
