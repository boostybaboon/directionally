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
