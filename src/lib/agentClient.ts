import { make } from '../core/agent/api.js';
import type { MakeResult } from '../core/agent/api.js';
import type { CatalogueEntry } from '../core/catalogue/types.js';
import { normalizeAIDraft } from '../core/sketcher/aiDraftSchema.js';
import { fromAIDraft } from '../core/sketcher/aiDraft.js';
import { exportDraftGLB } from '../core/sketcher/exportGLB.js';
import * as OPFSCatalogueStore from '../core/storage/OPFSCatalogueStore.js';

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
 * set's tree document. The only scenery-specific step here is the GLB bake the
 * catalogue publishes alongside it.
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

  if (kind !== 'setting') {
    return make(kind, name, data.document, options);
  }

  // Bake before persisting, so a failed export leaves no half-made entry behind.
  const draft = fromAIDraft(normalizeAIDraft(data.document));
  const blob = await exportDraftGLB(draft);
  const result = await make('setting', name, data.document, options);
  const baked = await OPFSCatalogueStore.update(result.entry.id, blob, result.entry.label, {
    partCount: draft.parts.length,
  });
  return baked ? { ...result, entry: baked } : result;
}
