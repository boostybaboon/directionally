import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokenizeScript } from './sigilScript.js';

/**
 * SCRIPT_DSL.md is what a creative AI reads to write plays, so its examples are load-bearing: a
 * snippet that no longer parses teaches the wrong grammar. Every ```script block must tokenize with
 * no diagnostics, and the single ```script-bad block must fail exactly as the document says it does.
 */
const document = readFileSync(resolve(process.cwd(), 'SCRIPT_DSL.md'), 'utf8');

function blocks(tag: string): string[] {
  const pattern = new RegExp(`\`\`\`${tag}\\n([\\s\\S]*?)\`\`\``, 'g');
  return [...document.matchAll(pattern)].map((match) => match[1]);
}

describe('SCRIPT_DSL.md', () => {
  it('has examples to check', () => {
    expect(blocks('script').length).toBeGreaterThan(0);
    expect(blocks('script-bad').length).toBe(1);
  });

  it.each(blocks('script'))('example %# parses with no diagnostics', (source) => {
    const { doc, diagnostics } = tokenizeScript(source);

    expect(diagnostics.map((d) => `L${d.line}: ${d.message}`)).toEqual([]);
    expect(doc.scenes.length).toBeGreaterThan(0);
    for (const scene of doc.scenes) {
      expect(scene.setting).toBeTruthy();
      expect(scene.timeOfDay).toBeTruthy();
      expect(scene.beats.length).toBeGreaterThan(0);
    }
  });

  it('fails the anti-example exactly as the document claims', () => {
    const [bad] = blocks('script-bad');
    const { doc, diagnostics } = tokenizeScript(bad);

    expect(doc.scenes).toHaveLength(0);
    expect(diagnostics.length).toBeGreaterThan(0);
  });
});
