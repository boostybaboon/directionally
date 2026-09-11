/**
 * Development experiment: does an LLM (DeepSeek) produce usable asset documents
 * for a character and a set? Exercises the real `describeToDocument` path (the
 * same free-text → document step `make` uses), without any UI or persistence.
 *
 * Run: yarn agent:experiment
 * Requires DEEPSEEK_API_KEY — `export DEEPSEEK_API_KEY=sk-...` or put it in a
 * gitignored `.env` (see .env.example).
 */
import { readFileSync } from 'node:fs';
import { describeToDocument } from '../src/core/agent/api.js';
import { DeepSeekProvider } from '../src/core/agent/provider.js';
import { normalizeCharacterInput } from '../src/core/character/authoringApi.js';
import { normalizeSetPieceInput } from '../src/core/setting/authoringApi.js';

function loadApiKey(): string | undefined {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
    for (const line of env.split('\n')) {
      const match = line.match(/^\s*DEEPSEEK_API_KEY\s*=\s*(.*)\s*$/);
      if (match) return match[1].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env file */ }
  return undefined;
}

function check(kind: 'character' | 'setting', document: unknown): string {
  try {
    if (kind === 'character') normalizeCharacterInput(document);
    else normalizeSetPieceInput(document);
    return 'VALID';
  } catch (err) {
    return `INVALID — ${err instanceof Error ? err.message : String(err)}`;
  }
}

async function main(): Promise<void> {
  const apiKey = loadApiKey();
  if (!apiKey) {
    console.error('Missing DEEPSEEK_API_KEY. Set it via `export DEEPSEEK_API_KEY=sk-...` or in a gitignored `.env`, then re-run.');
    process.exitCode = 1;
    return;
  }

  const provider = new DeepSeekProvider({ apiKey });

  const cases = [
    { kind: 'character', description: 'a middle-aged woman, a friendly primary-school teacher in her 50s' },
    { kind: 'setting', description: 'a primary-school classroom with desks and a blackboard' },
  ] as const;

  for (const { kind, description } of cases) {
    console.log(`\n===== ${kind}: ${description} =====`);
    try {
      const document = await describeToDocument(provider, kind, description);
      console.log(JSON.stringify(document, null, 2));
      console.log(`\n[${kind}] ${check(kind, document)}`);
    } catch (err) {
      console.error(`[${kind}] FAILED: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
