/**
 * Sigil-tokenized script format (Track SCR). `tokenizeScript()` and
 * `renderScript()` are the sigil editor's own text ↔ `ScriptDocument` mapping —
 * the replacement for the boxed Combobox editor's data flow. See ROADMAP.md
 * "Track SCR — Sigil-Tokenized Script Editor" for the grammar this implements.
 *
 * Grammar (one sigil per line, sigil declares the line's type before any
 * content is interpreted — never a heuristic, always a deterministic switch):
 *   #INT SETTING TOD    — scene heading, starts a new scene
 *   >ACTOR verb arg     — action beat (enter/exit/move/hold)
 *   @ACTOR              — speaker cue; every following non-sigil line is
 *                         dialogue text for that actor, until the next sigil
 *   (blank line)        — pure visual separation, ignored
 *
 * No regex parsing of unscoped prose: every token's type is fixed by its
 * sigil before a single character of its value is read.
 */

import type { ActionBeat, ActionVerb, Diagnostic, ScriptDocument, SceneBlock, StageMark, StageSide } from './fountain.js';


// ── Tokenizer ────────────────────────────────────────────────────────────────

export const VERB_ALIASES: Record<string, ActionVerb> = {
  enter: 'enter', enters: 'enter',
  exit: 'exit', exits: 'exit',
  move: 'move', moves: 'move',
  hold: 'hold', holds: 'hold',
};

export const SIDE_WORDS = new Set(['left', 'right']);
export const MARK_WORDS = new Set(['left', 'center', 'right']);


function parseSceneHeadingLine(rest: string, lineNo: number, diagnostics: Diagnostic[]): SceneBlock {
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    diagnostics.push({ line: lineNo, level: 'warning', message: `Scene heading "#${rest}" is missing a setting and/or time of day.` });
    return { heading: 'UNTITLED', beats: [] };
  }

  const first = tokens[0].toUpperCase();
  let interior: boolean | undefined;
  let rest2 = tokens;
  if (first === 'INT') { interior = true; rest2 = tokens.slice(1); }
  else if (first === 'EXT') { interior = false; rest2 = tokens.slice(1); }
  else {
    diagnostics.push({ line: lineNo, level: 'warning', message: `Scene heading "#${rest}" should start with INT or EXT.` });
  }

  if (rest2.length === 0) {
    return { heading: 'UNTITLED', interior, beats: [] };
  }

  const timeOfDay = rest2[rest2.length - 1].toUpperCase();
  const setting = rest2.slice(0, -1).join(' ').toUpperCase() || undefined;

  const prefix = interior == null ? 'INT./EXT.' : (interior ? 'INT.' : 'EXT.');
  const heading = `${prefix} ${setting || 'UNTITLED'} - ${timeOfDay || 'DAY'}`;

  return { heading, interior, setting, timeOfDay, beats: [] };
}

function parseActionLine(rest: string, lineNo: number, diagnostics: Diagnostic[]): ActionBeat | null {
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    diagnostics.push({ line: lineNo, level: 'error', message: `Action beat ">${rest}" needs an actor and a verb.` });
    return null;
  }

  const character = tokens[0].toUpperCase();
  const verb = VERB_ALIASES[tokens[1].toLowerCase()];
  if (!verb) {
    diagnostics.push({ line: lineNo, level: 'error', message: `Unknown verb "${tokens[1]}" in action beat ">${rest}".` });
    return null;
  }

  let argTokens = tokens.slice(2).map((t) => t.toLowerCase());
  // Light synonym normalisation: an optional leading preposition is accepted
  // when parsing but never emitted by the canonical renderer.
  if (argTokens[0] === 'from' || argTokens[0] === 'to') argTokens = argTokens.slice(1);

  switch (verb) {
    case 'enter':
    case 'exit': {
      const side = argTokens[0];
      if (side && !SIDE_WORDS.has(side)) {
        diagnostics.push({ line: lineNo, level: 'warning', message: `Unrecognised side "${side}" in ">${rest}" — expected left or right.` });
      }
      return { type: 'action', character, verb, side: SIDE_WORDS.has(side) ? (side as StageSide) : undefined };
    }
    case 'move': {
      const target = argTokens[0];
      if (target && !MARK_WORDS.has(target)) {
        diagnostics.push({ line: lineNo, level: 'warning', message: `Unrecognised mark "${target}" in ">${rest}" — expected left, center, or right.` });
      }
      return { type: 'action', character, verb, target: MARK_WORDS.has(target) ? (target as StageMark) : 'center' };
    }
    case 'hold': {
      const seconds = parseFloat(argTokens[0]);
      if (isNaN(seconds)) {
        diagnostics.push({ line: lineNo, level: 'warning', message: `Hold beat ">${rest}" is missing a numeric duration.` });
      }
      return { type: 'action', character, verb, seconds: isNaN(seconds) ? 1.0 : seconds };
    }
  }
}

/**
 * Tokenizes sigil-scoped script text into a `ScriptDocument`. Never parses
 * unscoped prose — every line's type is determined by its leading sigil
 * character (`#`, `>`, `@`) before any of its content is read. Dialogue text
 * (the one genuinely free-form field) is taken verbatim, never tokenized.
 */
export function tokenizeScript(text: string): { doc: ScriptDocument; diagnostics: Diagnostic[]; sceneStartLines: number[] } {
  const lines = text.split('\n');
  const diagnostics: Diagnostic[] = [];
  const scenes: SceneBlock[] = [];
  const sceneStartLines: number[] = [];
  const cast: string[] = [];
  const castSeen = new Set<string>();

  function addCast(name: string) {
    if (!castSeen.has(name)) {
      castSeen.add(name);
      cast.push(name);
    }
  }

  let currentScene: SceneBlock | null = null;
  let currentSpeaker: string | null = null;
  let dialogueLines: string[] = [];

  function flushDialogue() {
    if (currentSpeaker && dialogueLines.length > 0 && currentScene) {
      currentScene.beats.push({ type: 'dialogue', character: currentSpeaker, text: dialogueLines.join('\n') });
    }
    dialogueLines = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const lineNo = i + 1;

    if (trimmed === '') continue;

    if (trimmed.startsWith('#')) {
      flushDialogue();
      currentSpeaker = null;
      currentScene = parseSceneHeadingLine(trimmed.slice(1).trim(), lineNo, diagnostics);
      scenes.push(currentScene);
      sceneStartLines.push(lineNo);
      continue;
    }

    if (trimmed.startsWith('>')) {
      flushDialogue();
      currentSpeaker = null;
      if (!currentScene) {
        diagnostics.push({ line: lineNo, level: 'error', message: `Action beat "${trimmed}" appears before any scene heading (#).` });
        continue;
      }
      const beat = parseActionLine(trimmed.slice(1).trim(), lineNo, diagnostics);
      if (beat) {
        addCast(beat.character);
        currentScene.beats.push(beat);
      }
      continue;
    }

    if (trimmed.startsWith('@')) {
      flushDialogue();
      const name = trimmed.slice(1).trim().toUpperCase();
      currentSpeaker = name;
      addCast(name);
      continue;
    }

    // Non-sigil line: dialogue continuation for the current speaker.
    if (currentSpeaker && currentScene) {
      dialogueLines.push(trimmed);
    } else {
      diagnostics.push({ line: lineNo, level: 'warning', message: `Line "${trimmed}" has no active speaker (@) or scene (#) — ignored.` });
    }
  }
  flushDialogue();

  return { doc: { scenes, cast, diagnostics }, diagnostics, sceneStartLines };
}

/**
 * Maps a 1-based line number to the index of the scene whose `#` heading is the
 * nearest at-or-above that line. Returns 0 when the line precedes the first
 * heading. `sceneStartLines` is sorted ascending (tokenizer output).
 */
export function sceneIndexForLine(sceneStartLines: number[], line: number): number {
  let index = 0;
  for (let i = 0; i < sceneStartLines.length; i++) {
    if (sceneStartLines[i] <= line) index = i;
    else break;
  }
  return index;
}

// ── Renderer ─────────────────────────────────────────────────────────────────

function renderSceneHeadingSigil(scene: SceneBlock): string {
  const prefix = scene.interior == null ? 'INT/EXT' : (scene.interior ? 'INT' : 'EXT');
  const setting = scene.setting || 'UNTITLED';
  const tod = scene.timeOfDay || 'DAY';
  return `#${prefix} ${setting} ${tod}`;
}

function renderActionSigil(beat: ActionBeat): string {
  switch (beat.verb) {
    case 'enter': return `>${beat.character} enters${beat.side ? ` ${beat.side}` : ''}`;
    case 'exit': return `>${beat.character} exits${beat.side ? ` ${beat.side}` : ''}`;
    case 'move': return `>${beat.character} moves ${beat.target ?? 'center'}`;
    case 'hold': return `>${beat.character} holds ${beat.seconds ?? 1.0}`;
  }
}

/**
 * Renders a `ScriptDocument` back to sigil-tokenized text. Canonical form:
 * no prepositions ("from"/"to") on action args, uppercase cast/setting/time
 * tokens — the tokenizer's light synonym normalisation exists to accept
 * variation on the way in, not to require it on the way out.
 */
export function renderScript(doc: ScriptDocument): string {
  const parts: string[] = [];

  for (const scene of doc.scenes) {
    if (parts.length > 0) parts.push('');
    parts.push(renderSceneHeadingSigil(scene));
    parts.push('');

    let lastSpeaker: string | null = null;
    let lastBeatType: 'action' | 'dialogue' | 'other' | null = null;
    for (const beat of scene.beats) {
      if (beat.type === 'action') {
        // Blank-line-separate a run of actions from whatever came before,
        // but not from a preceding action (matches the canonical grammar
        // example in ROADMAP.md: consecutive > lines have no blank between).
        if (lastBeatType && lastBeatType !== 'action') parts.push('');
        parts.push(renderActionSigil(beat));
        lastSpeaker = null;
        lastBeatType = 'action';
      } else if (beat.type === 'dialogue') {
        if (lastSpeaker !== beat.character) {
          if (parts.length > 0 && parts[parts.length - 1] !== '') parts.push('');
          parts.push(`@${beat.character}`);
          lastSpeaker = beat.character;
        }
        parts.push(...beat.text.split('\n'));
        lastBeatType = 'dialogue';
      } else {
        // Transitions are not part of the sigil grammar (v1) — rendered as
        // plain text so nothing is silently dropped.
        parts.push(beat.text);
        lastSpeaker = null;
        lastBeatType = 'other';
      }
    }

  }

  while (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts.join('\n');
}

// ── Alias retyping ──────────────────────────────────────────────────────────

/**
 * Retypes an alias across raw sigil text: every sigil-token occurrence of
 * `oldName` is replaced with `newName`, while dialogue prose is left untouched.
 * `kind` scopes which sigil lines are edited — 'cast' touches `@`/`>` lines,
 * 'setting' touches `#` heading lines. Matching is case-insensitive. The binding
 * rekey (moving castBindings/settingBindings to the new name) is the caller's
 * responsibility, so a rename keeps the same catalogue asset attached.
 */
export function retypeAlias(
  text: string,
  oldName: string,
  newName: string,
  kind: 'cast' | 'setting',
): string {
  const oldUpper = oldName.trim().toUpperCase();
  const replacement = newName.trim();
  if (!oldUpper || !replacement || replacement.toUpperCase() === oldUpper) return text;

  return text.split('\n').map((line) => {
    const ws = line.match(/^\s*/)?.[0] ?? '';
    const body = line.slice(ws.length);
    const sigil = body[0];

    if (kind === 'cast') {
      if (sigil === '@') {
        return body.slice(1).trim().toUpperCase() === oldUpper ? `${ws}@${replacement}` : line;
      }
      if (sigil === '>') {
        const m = /^>(\s*)(\S+)/.exec(body);
        if (m && m[2].toUpperCase() === oldUpper) {
          return `${ws}>${m[1]}${replacement}${body.slice(m[0].length)}`;
        }
      }
      return line;
    }

    // Setting: replace the tokens between INT/EXT and the trailing time-of-day.
    if (sigil === '#') {
      const tokens = body.slice(1).trim().split(/\s+/).filter(Boolean);
      if (tokens.length >= 2 && tokens.slice(1, -1).join(' ').toUpperCase() === oldUpper) {
        return `${ws}#${[tokens[0], ...replacement.split(/\s+/), tokens[tokens.length - 1]].join(' ')}`;
      }
    }
    return line;
  }).join('\n');
}
