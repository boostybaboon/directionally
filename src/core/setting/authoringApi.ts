import { normalizeAIDraft } from '../sketcher/aiDraftSchema.js';
import { fromAIDraft } from '../sketcher/aiDraft.js';
import { draftToDocument } from '../sketcher/documentTree.js';
import * as OPFSCatalogueStore from '../storage/OPFSCatalogueStore.js';
import type { UserCatalogueEntry } from '../storage/OPFSCatalogueStore.js';

/**
 * Scenery authoring surface (Track SET, AI-API).
 *
 * One create verb: an AI Draft document goes in, a document-backed catalogue entry
 * comes out. That entry is exactly the shape a human save produces, so generated and
 * hand-built sets are indistinguishable downstream — production renders both from
 * their tree document. `AI_DRAFT_JSON_SCHEMA` (sketcher/aiDraftSchema.ts) is the only
 * contract an LLM fills; there is no separate compose/geometry authoring format.
 */

export type CreatedSetPiece = {
  entry: UserCatalogueEntry;
  /** False when an existing document-backed entry was updated instead of created. */
  created: boolean;
};

/**
 * Create — or resume in place — a scenery entry from an untrusted AI Draft.
 *
 * The tree document reaches the entry along with the draft's `lights` and
 * `environmentMap`, so a setting's lighting travels with its geometry. Resuming
 * matches the user catalogue by label (or an explicit `resumeEntryId`), so a repeat
 * call updates a set rather than duplicating it.
 */
export async function createSetPiece(
  input: unknown,
  opts: { isSetting?: boolean; resumeEntryId?: string; fallbackLabel?: string } = {},
): Promise<CreatedSetPiece> {
  const aiDraft = normalizeAIDraft(input);
  const draft = fromAIDraft(aiDraft);
  const label = aiDraft.label?.trim() || opts.fallbackLabel?.trim() || 'Untitled Set';
  const document = draftToDocument(draft);

  const existingId = opts.resumeEntryId ?? (await OPFSCatalogueStore.findByLabel(label))?.id;
  if (existingId) {
    const updated = await OPFSCatalogueStore.saveDocument(existingId, document, {
      label,
      environmentId: aiDraft.environmentMap,
      lights: aiDraft.lights,
      partCount: draft.parts.length,
    });
    if (updated) return { entry: updated, created: false };
  }

  const entry = await OPFSCatalogueStore.createSetPieceDocument(label, {
    document,
    isSetting: opts.isSetting ?? true,
    partCount: draft.parts.length,
    ...(aiDraft.environmentMap ? { environmentId: aiDraft.environmentMap } : {}),
    ...(aiDraft.lights && aiDraft.lights.length > 0 ? { lights: aiDraft.lights } : {}),
  });
  return { entry, created: true };
}
