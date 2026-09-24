/**
 * Sigil-tokenized script format (Track SCR). `tokenizeScript()` and
 * `renderScript()` are the sigil editor's own text ↔ `ScriptDocument` mapping —
 * the replacement for the boxed Combobox editor's data flow. See ROADMAP.md
 * "Track SCR — Sigil-Tokenized Script Editor" for the grammar this implements.
 *
 * Grammar (one sigil per line, sigil declares the line's type before any
 * content is interpreted — never a heuristic, always a deterministic switch):
 *   #INT SETTING TOD    — scene heading, starts a new scene
 *   ##OP NODE [x y z]   — dressing: this scene's venue, with these modifications
 *                         (hide/show/remove/move), addressable by node path
 *   >ACTOR verb arg     — action beat (enter/exit/move/hold)
 *   @ACTOR              — speaker cue; every following non-sigil line is
 *                         dialogue text for that actor, until the next sigil
 *   (blank line)        — pure visual separation, ignored
 *
 * No regex parsing of unscoped prose: every token's type is fixed by its
 * sigil before a single character of its value is read.
 */

import type { ActionBeat, ActionVerb, Diagnostic, DressingBeat, DressingOp, ScriptDocument, SceneBlock, StageMark, StageSide } from './fountain.js';


// ── Tokenizer ────────────────────────────────────────────────────────────────

export const VERB_ALIASES: Record<string, ActionVerb> = {
  enter: 'enter', enters: 'enter',
  exit: 'exit', exits: 'exit',
  move: 'move', moves: 'move',
  hold: 'hold', holds: 'hold',
};

export const SIDE_WORDS = new Set(['left', 'right']);
export const MARK_WORDS = new Set(['left', 'center', 'right']);

export const DRESSING_OPS: DressingOp[] = ['hide', 'show', 'remove', 'move'];


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
 * A dressing line names a node path inside the setting's document, so the node is
 * lower-cased the way ids are minted — a line typed `## hide Sofa` addresses `sofa`.
 */
function parseDressingLine(rest: string, lineNo: number, diagnostics: Diagnostic[]): DressingBeat | null {
  const tokens = rest.split(/\s+/).filter(Boolean);
  const word = tokens[0] ?? '';
  const op = word.toLowerCase() as DressingOp;
  if (!DRESSING_OPS.includes(op)) {
    diagnostics.push({ line: lineNo, level: 'error', message: `Unknown dressing op "${word}" in "##${rest}" — expected ${DRESSING_OPS.join(', ')}.` });
    return null;
  }

  const node = tokens[1]?.toLowerCase();
  if (!node) {
    diagnostics.push({ line: lineNo, level: 'error', message: `Dressing line "##${rest}" needs a node to ${op}.` });
    return null;
  }

  if (op !== 'move') {
    if (tokens.length > 2) {
      diagnostics.push({ line: lineNo, level: 'warning', message: `Dressing line "##${rest}" ignores ${tokens.length - 2} extra token(s) — "${op}" takes only a node.` });
    }
    return { type: 'dressing', op, node };
  }

  const position = tokens.slice(2, 5).map((t) => parseFloat(t));
  if (position.length < 3 || position.some((n) => isNaN(n))) {
    diagnostics.push({ line: lineNo, level: 'error', message: `Dressing line "##${rest}" needs three numbers after the node.` });
    return null;
  }
  return { type: 'dressing', op, node, position: [position[0], position[1], position[2]] };
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

    if (trimmed.startsWith('##')) {
      flushDialogue();
      currentSpeaker = null;
      if (!currentScene) {
        diagnostics.push({ line: lineNo, level: 'error', message: `Dressing line "${trimmed}" appears before any scene heading (#).` });
        continue;
      }
      const beat = parseDressingLine(trimmed.slice(2).trim(), lineNo, diagnostics);
      if (beat) currentScene.beats.push(beat);
      continue;
    }

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

function renderDressingSigil(beat: DressingBeat): string {
  const args = beat.op === 'move' ? ` ${(beat.position ?? [0, 0, 0]).join(' ')}` : '';
  return `## ${beat.op} ${beat.node}${args}`;
}

// ── Dressing edits ──────────────────────────────────────────────────────────

/**
 * Which line a dressing change owns. A node is hidden or shown, gone, or placed — one slot
 * each — so a later change replaces the line it supersedes instead of piling up beside it,
 * while a different slot is kept: "hide it, then take it away" reads in that order.
 */
export type DressingSlot = 'visibility' | 'gone' | 'position';

function slotOf(op: string): DressingSlot | null {
  if (op === 'hide' || op === 'show') return 'visibility';
  if (op === 'remove') return 'gone';
  if (op === 'move') return 'position';
  return null;
}

export type DressingChange =
  | { op: DressingOp; node: string; position?: [number, number, number] }
  | { clear: DressingSlot; node: string };

/**
 * Sets or clears what one scene says about one node, as the `##` line that carries it. This is
 * the edit a dressing panel makes rather than mutating a compiled scene, because the script is
 * the source of truth and a scene's overrides are derived from it — an edit that bypassed the
 * script would be overwritten by the next compile.
 *
 * `sceneStartLine` is the 1-based heading line of the scene to edit (`sceneStartLines` from the
 * tokenizer); the scene runs to the line before the next heading. Lines are inserted after the
 * heading or after the scene's existing dressing run, whichever is later, so the canonical form
 * is what a panel edit produces.
 */
export function setDressing(text: string, sceneStartLine: number, change: DressingChange): string {
  const lines = text.split('\n');
  const start = Math.max(0, Math.min(sceneStartLine - 1, lines.length - 1));

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    // A heading, not a dressing line — `##` opens with the same character.
    const body = lines[i].trim();
    if (body.startsWith('#') && !body.startsWith('##')) { end = i; break; }
  }

  const slot = 'clear' in change ? change.clear : slotOf(change.op);
  const node = change.node.toLowerCase();

  const kept: string[] = [];
  for (let i = start; i < end; i++) {
    const line = lines[i];
    const body = line.trim();
    if (!body.startsWith('##')) { kept.push(line); continue; }
    const [op, lineNode] = body.slice(2).trim().split(/\s+/);
    if (slotOf((op ?? '').toLowerCase()) === slot && lineNode?.toLowerCase() === node) continue;
    kept.push(line);
  }

  if (!('clear' in change)) {
    let insertAt = 1; // kept[0] is the heading, so this is "directly under it"
    for (let i = 0; i < kept.length; i++) {
      if (kept[i].trim().startsWith('##')) insertAt = i + 1;
    }
    kept.splice(insertAt, 0, renderDressingSigil({ type: 'dressing', op: change.op, node, ...(change.position ? { position: change.position } : {}) }));
  }

  return [...lines.slice(0, start), ...kept, ...lines.slice(end)].join('\n');
}

/** Renders a `ScriptDocument` back to sigil-tokenized text. Canonical form:
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
    let lastBeatType: 'action' | 'dialogue' | 'dressing' | 'other' | null = null;
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
      } else if (beat.type === 'dressing') {
        // A run of dressing lines stays together under the heading; a blank separates it
        // from prose, because it is not a beat in the scene's time.
        if (lastBeatType && lastBeatType !== 'dressing') parts.push('');
        parts.push(renderDressingSigil(beat));
        lastSpeaker = null;
        lastBeatType = 'dressing';
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
    // A dressing line names nodes inside the setting's document — never a cast role or a
    // setting name, so a rename has nothing to retype here.
    if (body.startsWith('##')) return line;
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
