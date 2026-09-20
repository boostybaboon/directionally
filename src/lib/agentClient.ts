import { make } from '../core/agent/api.js';
import type { MakeResult } from '../core/agent/api.js';
import type { CatalogueEntry } from '../core/catalogue/types.js';

export type GenerateOptions = {
  userEntries?: CatalogueEntry[];
  castBindings?: Record<string, string>;
  settingBindings?: Record<string, string>;
};

/**
 * generateAsset — the client half of AI-assisted creation: POST a free-text
 * description to the server's LLM step (`/agent/make`), then hand the returned
 * document to the core `make` verb to persist + bind it against the script.
 *
 * Both kinds take the same path, so there is no separate scenery entry point: the
 * AI Draft grammar is the only scenery grammar, and `make` turns a draft into the
 * set's tree document — which *is* the stored set, no bake required.
 */
export async function generateAsset(
  kind: 'setting' | 'character',
  name: string,
  description: string,
  options: GenerateOptions = {},
): Promise<MakeResult> {
  const response = await fetch('/agent/make', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, name, description }),
  });

  const data = (await response.json().catch(() => ({}))) as { document?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Generation failed (${response.status})`);
  }

  return make(kind, name, data.document, options);
}

/**
 * requestDraftEdit — the client half of an AI edit: POST the current draft and an instruction to the
 * server's LLM step (`/agent/edit`), and get the whole new draft back. Apply it with
 * `applyDraftCommand` through `SketcherDocument.execute()` — the id-diff is what makes the turn one
 * undoable step, and what keeps a part the AI left alone the same part.
 */
export async function requestDraftEdit(
  draft: unknown,
  instruction: string,
  history: string[] = [],
): Promise<unknown> {
  const response = await fetch('/agent/edit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ draft, instruction, history }),
  });

  const data = (await response.json().catch(() => ({}))) as { draft?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Edit failed (${response.status})`);
  }
  return data.draft;
}
