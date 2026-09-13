import { make, bindName } from '../core/agent/api.js';
import type { MakeResult } from '../core/agent/api.js';
import type { CatalogueEntry } from '../core/catalogue/types.js';
import { normalizeAIDraft } from '../core/sketcher/aiDraftSchema.js';
import { fromAIDraft } from '../core/sketcher/aiDraft.js';
import { exportDraftGLB } from '../core/sketcher/exportGLB.js';
import * as SketcherAssemblyStore from '../core/storage/SketcherAssemblyStore.js';
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
 * generateEditableSetting — create a setting via the LLM and publish it exactly
 * like a human save: AI Draft grammar → `SketcherDraft` → `SketcherAssemblyStore`
 * → GLB bake → `OPFSCatalogueStore` GLB entry (`sourceAssemblyId`). The result can
 * be opened and edited in the Sketcher, and re-saved in place (ROADMAP_API P1).
 */
export async function generateEditableSetting(
  name: string,
  description: string,
  settingBindings: Record<string, string> = {},
): Promise<MakeResult> {
  const response = await fetch('/agent/make', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'setting', name, description, draft: true }),
  });

  const data = (await response.json().catch(() => ({}))) as { document?: unknown; error?: string };
  if (!response.ok) {
    throw new Error(data.error ?? `Generation failed (${response.status})`);
  }

  const aiDraft = normalizeAIDraft(data.document);
  const label = aiDraft.label ?? (name.trim() || 'Untitled Setting');
  const draft = fromAIDraft(aiDraft);
  const blob = await exportDraftGLB(draft);
  const environmentId = aiDraft.environmentMap;
  const lights = aiDraft.lights;

  // Resume-by-name: re-generating an existing setting updates its entry and its
  // editable assembly in place, so a repeat "Generate" never duplicates.
  const existing = await OPFSCatalogueStore.findByLabel(label);
  const resume = existing?.sourceAssemblyId
    ? { entryId: existing.id, assemblyId: existing.sourceAssemblyId }
    : null;

  let assemblyId: string;
  if (resume) {
    const saved = await SketcherAssemblyStore.save(resume.assemblyId, label, draft);
    assemblyId = saved?.id ?? resume.assemblyId;
  } else {
    assemblyId = (await SketcherAssemblyStore.create(label, draft)).id;
  }

  const publishMeta = {
    kind: 'set-piece' as const,
    label,
    isSetting: true,
    partCount: draft.parts.length,
    ...(environmentId ? { environmentId } : {}),
    ...(lights && lights.length > 0 ? { lights } : {}),
  };

  const entry: CatalogueEntry = resume
    ? await OPFSCatalogueStore.update(resume.entryId, blob, label, {
        isSetting: true,
        partCount: draft.parts.length,
        environmentId,
        lights,
      }) ?? await OPFSCatalogueStore.add(blob, publishMeta, assemblyId)
    : await OPFSCatalogueStore.add(blob, publishMeta, assemblyId);

  return {
    entry,
    boundTo: name.trim().toUpperCase(),
    created: resume === null,
    castBindings: {},
    settingBindings: bindName(name, entry.id, settingBindings),
    warnings: resume ? [`Reused existing "${entry.label}".`] : [],
  };
}

