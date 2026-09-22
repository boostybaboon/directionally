import { describe, it, expect } from 'vitest';
import { findActiveSigilToken, applySigilCompletion, filterOptions, sigilFieldOptions } from './sigilAutocomplete';

describe('findActiveSigilToken', () => {
  it('finds an @ token at the start of a line', () => {
    const text = '@AL';
    const token = findActiveSigilToken(text, text.length);
    expect(token).toEqual({ sigil: '@', query: 'AL', sigilStart: 0, queryStart: 1, cursor: 3, tokenIndex: 0, priorTokens: [] });
  });

  it('finds a > token at the start of a line', () => {
    const text = '>ent';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.sigil).toBe('>');
    expect(token?.query).toBe('ent');
    expect(token?.tokenIndex).toBe(0);
  });

  it('finds a # token at the start of a line', () => {
    const text = '#INT';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.sigil).toBe('#');
    expect(token?.query).toBe('INT');
    expect(token?.tokenIndex).toBe(0);
  });

  it('finds the token on the current line within a multi-line buffer', () => {
    const text = '#INT STAGE DAY\n\n@AL';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.sigil).toBe('@');
    expect(token?.query).toBe('AL');
    expect(token?.sigilStart).toBe(text.lastIndexOf('@'));
  });

  it('respects leading whitespace before the sigil', () => {
    const text = '  @AL';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.sigilStart).toBe(2);
    expect(token?.query).toBe('AL');
  });

  it('returns null once a trailing space closes the current token', () => {
    const text = '@ALPHA ';
    const token = findActiveSigilToken(text, text.length);
    expect(token).toBeNull();
  });

  it('returns null when there is no sigil on the current line', () => {
    const text = 'plain dialogue text';
    const token = findActiveSigilToken(text, text.length);
    expect(token).toBeNull();
  });

  it('returns null when non-whitespace precedes the sigil', () => {
    const text = 'x@ALPHA';
    const token = findActiveSigilToken(text, text.length);
    expect(token).toBeNull();
  });

  it('returns an empty-query token right after the bare sigil', () => {
    const text = '@';
    const token = findActiveSigilToken(text, text.length);
    expect(token).toEqual({ sigil: '@', query: '', sigilStart: 0, queryStart: 1, cursor: 1, tokenIndex: 0, priorTokens: [] });
  });

  it('finds the second token (verb) on a > action line, with the actor as a prior token', () => {
    const text = '>ALPHA ent';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.sigil).toBe('>');
    expect(token?.tokenIndex).toBe(1);
    expect(token?.priorTokens).toEqual(['ALPHA']);
    expect(token?.query).toBe('ent');
    expect(token?.queryStart).toBe(text.lastIndexOf('ent'));
  });

  it('finds the third token (side) on a > enter line, with actor+verb as prior tokens', () => {
    const text = '>ALPHA enters le';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.tokenIndex).toBe(2);
    expect(token?.priorTokens).toEqual(['ALPHA', 'enters']);
    expect(token?.query).toBe('le');
  });

  it('finds the second token (setting start) on a # heading line', () => {
    const text = '#INT STA';
    const token = findActiveSigilToken(text, text.length);
    expect(token?.tokenIndex).toBe(1);
    expect(token?.priorTokens).toEqual(['INT']);
    expect(token?.query).toBe('STA');
  });

  it('returns an empty-query token with prior tokens right after a trailing space is followed immediately by more input', () => {
    const text = '>ALPHA enters ';
    // A trailing space alone closes the token (no active token yet).
    expect(findActiveSigilToken(text, text.length)).toBeNull();
    // Once a new character follows the space, the next token becomes active.
    const withNext = text + 'l';
    const token = findActiveSigilToken(withNext, withNext.length);
    expect(token?.tokenIndex).toBe(2);
    expect(token?.query).toBe('l');
  });
});

describe('applySigilCompletion', () => {
  it('splices the completion in place of the active token', () => {
    const text = '@AL';
    const token = { queryStart: 1, cursor: 3 };
    const result = applySigilCompletion(text, token, 'ALPHA');
    expect(result.text).toBe('@ALPHA');
    expect(result.cursor).toBe(6);
  });

  it('preserves text after the cursor', () => {
    const text = '@AL enters left';
    const token = { queryStart: 1, cursor: 3 };
    const result = applySigilCompletion(text, token, 'ALPHA');
    expect(result.text).toBe('@ALPHA enters left');
    expect(result.cursor).toBe(6);
  });

  it('preserves text before the token, including prior tokens on the same line', () => {
    const text = '#INT STAGE DAY\n\n@AL';
    const queryStart = text.lastIndexOf('@') + 1;
    const token = { queryStart, cursor: text.length };
    const result = applySigilCompletion(text, token, 'ALPHA');
    expect(result.text).toBe('#INT STAGE DAY\n\n@ALPHA');
  });

  it('replaces only the active token, preserving prior tokens on a multi-field line', () => {
    const text = '>ALPHA ent';
    const queryStart = text.lastIndexOf('ent');
    const token = { queryStart, cursor: text.length };
    const result = applySigilCompletion(text, token, 'enters ');
    expect(result.text).toBe('>ALPHA enters ');
  });
});

describe('filterOptions', () => {
  it('filters case-insensitively by substring', () => {
    const options = ['ALPHA', 'BETA', 'GAMMA'];
    expect(filterOptions(options, 'al')).toEqual(['ALPHA']);
    expect(filterOptions(options, 'A')).toEqual(['ALPHA', 'BETA', 'GAMMA']);
  });

  it('returns all options for an empty query', () => {
    const options = ['ALPHA', 'BETA'];
    expect(filterOptions(options, '')).toEqual(['ALPHA', 'BETA']);
  });

  it('returns an empty array when nothing matches', () => {
    const options = ['ALPHA', 'BETA'];
    expect(filterOptions(options, 'ZZZ')).toEqual([]);
  });
});

describe('sigilFieldOptions', () => {
  const cast = ['ALPHA', 'BETA'];

  it('@ token 0 scopes to cast', () => {
    expect(sigilFieldOptions('@', 0, [], cast)).toEqual({ kind: 'closed', options: cast });
  });

  it('@ has no further fields after the actor name', () => {
    expect(sigilFieldOptions('@', 1, ['ALPHA'], cast)).toEqual({ kind: 'open' });
  });

  it('> token 0 scopes to cast', () => {
    expect(sigilFieldOptions('>', 0, [], cast)).toEqual({ kind: 'closed', options: cast });
  });

  it('> token 1 scopes to the verb closed set', () => {
    const result = sigilFieldOptions('>', 1, ['ALPHA'], cast);
    expect(result.kind).toBe('closed');
    expect((result as { options: string[] }).options).toEqual(expect.arrayContaining(['enter', 'exit', 'move', 'hold']));
  });

  it('> token 2 scopes to side options after enter', () => {
    expect(sigilFieldOptions('>', 2, ['ALPHA', 'enters'], cast)).toEqual({ kind: 'closed', options: ['left', 'right'] });
  });

  it('> token 2 scopes to side options after exit', () => {
    expect(sigilFieldOptions('>', 2, ['ALPHA', 'exits'], cast)).toEqual({ kind: 'closed', options: ['left', 'right'] });
  });

  it('> token 2 scopes to mark options after move', () => {
    expect(sigilFieldOptions('>', 2, ['ALPHA', 'moves'], cast)).toEqual({ kind: 'closed', options: ['left', 'center', 'right'] });
  });

  it('> token 2 is open (numeric) after hold', () => {
    expect(sigilFieldOptions('>', 2, ['ALPHA', 'holds'], cast)).toEqual({ kind: 'open' });
  });

  it('# token 0 scopes to INT/EXT', () => {
    expect(sigilFieldOptions('#', 0, [], cast)).toEqual({ kind: 'closed', options: ['INT', 'EXT'] });
  });

  it('# token 1 (setting) is open', () => {
    expect(sigilFieldOptions('#', 1, ['INT'], cast)).toEqual({ kind: 'open' });
  });

  it('# token 2 (time of day) is open', () => {
    expect(sigilFieldOptions('#', 2, ['INT', 'STAGE'], cast)).toEqual({ kind: 'open' });
  });
});
