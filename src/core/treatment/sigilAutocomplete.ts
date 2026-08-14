/**
 * Pure tokenizing logic for the sigil-scoped autocomplete primitive (Track SCR).
 *
 * A sigil (`@`, `>`, `#`) is only recognised at the start of a line (optionally
 * indented) — this matches the sigil grammar in ROADMAP.md, where `@ACTOR`,
 * `>ACTOR verb arg`, and `#INT SETTING TOD` always begin their own line. Once a
 * sigil opens a line, every space-separated token after it is itself a
 * candidate for closed-set completion — which closed set depends on the sigil
 * and the token's position (`sigilFieldOptions` below). No DOM dependency;
 * fully unit-testable.
 */

import { VERB_ALIASES, SIDE_WORDS, MARK_WORDS } from './sigilScript.js';

export type SigilChar = '@' | '>' | '#';

export type ActiveSigilToken = {
  sigil: SigilChar;
  /** Text typed for the token currently under the cursor. */
  query: string;
  /** Index of the sigil character within the full text. */
  sigilStart: number;
  /** Index where the active token's text begins (after the sigil and any prior tokens). */
  queryStart: number;
  /** Index of the cursor within the full text (end of the active token). */
  cursor: number;
  /** 0-based position of the active token among the space-separated tokens after the sigil. */
  tokenIndex: number;
  /** Tokens already committed on this line before the active one. */
  priorTokens: string[];
};

const SIGIL_LINE_PATTERN = /^(\s*)([@>#])(.*)$/;

/**
 * Finds the sigil-scoped token surrounding the cursor, if any. Returns null
 * when the cursor is not immediately after an open token on a sigil-started
 * line (e.g. a trailing space closes the current token and no new one has
 * started yet, or the line has other non-whitespace content before the sigil).
 */
export function findActiveSigilToken(text: string, cursor: number): ActiveSigilToken | null {
  const lineStart = text.lastIndexOf('\n', cursor - 1) + 1;
  const line = text.slice(lineStart, cursor);
  const match = SIGIL_LINE_PATTERN.exec(line);
  if (!match) return null;

  const [, leadingWs, sigil, afterSigil] = match;
  const sigilStart = lineStart + leadingWs.length;

  if (afterSigil === '') {
    return { sigil: sigil as SigilChar, query: '', sigilStart, queryStart: sigilStart + 1, cursor, tokenIndex: 0, priorTokens: [] };
  }
  if (/\s$/.test(afterSigil)) return null;

  const tokens = afterSigil.split(/\s+/).filter((t) => t.length > 0);
  const query = tokens[tokens.length - 1];
  const priorTokens = tokens.slice(0, -1);
  const tokenIndex = priorTokens.length;
  const queryStart = cursor - query.length;

  return { sigil: sigil as SigilChar, query, sigilStart, queryStart, cursor, tokenIndex, priorTokens };
}

/**
 * Splices `completion` into `text` in place of the active token, preserving
 * everything before it (sigil + prior tokens) and everything after the cursor.
 * Returns the new text and the cursor position immediately after the inserted
 * completion.
 */
export function applySigilCompletion(
  text: string,
  token: Pick<ActiveSigilToken, 'queryStart' | 'cursor'>,
  completion: string,
): { text: string; cursor: number } {
  const before = text.slice(0, token.queryStart);
  const after = text.slice(token.cursor);
  return {
    text: before + completion + after,
    cursor: before.length + completion.length,
  };
}

/**
 * Case-insensitive substring filter over a closed set of candidate values.
 */
export function filterOptions(options: string[], query: string): string[] {
  const q = query.toLowerCase();
  return options.filter((opt) => opt.toLowerCase().includes(q));
}

/** @deprecated use filterOptions — kept for call sites scoped specifically to cast names. */
export function filterCastOptions(cast: string[], query: string): string[] {
  return filterOptions(cast, query);
}

const INTERIOR_WORDS = ['INT', 'EXT'];
const VERB_WORDS = Object.keys(VERB_ALIASES).filter((w) => VERB_ALIASES[w] === w);
const SIDE_OPTIONS = [...SIDE_WORDS];
const MARK_OPTIONS = [...MARK_WORDS];

export type SigilFieldOptions =
  | { kind: 'closed'; options: string[] }
  | { kind: 'open' };

/**
 * Resolves which closed set (if any) completes the token at `tokenIndex` for
 * a given sigil line, using `priorTokens` to disambiguate the conditional
 * third field of an action beat (side/mark/none, depending on the verb typed
 * in `priorTokens[1]`). Returns `{ kind: 'open' }` for free-text fields
 * (dialogue, scene setting, time-of-day, hold duration) — never blocks, just
 * declines to offer a popup.
 */
export function sigilFieldOptions(
  sigil: SigilChar,
  tokenIndex: number,
  priorTokens: string[],
  cast: string[],
): SigilFieldOptions {
  if (sigil === '@') {
    return tokenIndex === 0 ? { kind: 'closed', options: cast } : { kind: 'open' };
  }

  if (sigil === '>') {
    if (tokenIndex === 0) return { kind: 'closed', options: cast };
    if (tokenIndex === 1) return { kind: 'closed', options: VERB_WORDS };
    if (tokenIndex === 2) {
      const verb = VERB_ALIASES[(priorTokens[1] ?? '').toLowerCase()];
      if (verb === 'enter' || verb === 'exit') return { kind: 'closed', options: SIDE_OPTIONS };
      if (verb === 'move') return { kind: 'closed', options: MARK_OPTIONS };
      return { kind: 'open' }; // hold: numeric seconds, no closed set
    }
    return { kind: 'open' };
  }

  // '#'
  if (tokenIndex === 0) return { kind: 'closed', options: INTERIOR_WORDS };
  return { kind: 'open' }; // setting / time-of-day: free text until Track CAT's CAT-2 scopes settings
}
