import { normalizeAIDraft } from '../sketcher/aiDraftSchema.js';
import { fromAIDraft } from '../sketcher/aiDraft.js';
import { countParts } from '../sketcher/documentTree.js';
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
 * The tree document reaches the entry whole — a setting's lighting and environment are
 * nodes in it, so they travel with its geometry. Resuming
 * matches the user catalogue by label (or an explicit `resumeEntryId`), so a repeat
 * call updates a set rather than duplicating it.
 */
export async function createSetPiece(
  input: unknown,
  opts: { isSetting?: boolean; resumeEntryId?: string; fallbackLabel?: string } = {},
): Promise<CreatedSetPiece> {
  const aiDraft = normalizeAIDraft(input);
  const label = aiDraft.label?.trim() || opts.fallbackLabel?.trim() || 'Untitled Set';
  const document = fromAIDraft(aiDraft);

  const existingId = opts.resumeEntryId ?? (await OPFSCatalogueStore.findByLabel(label))?.id;
  if (existingId) {
    const updated = await OPFSCatalogueStore.saveDocument(existingId, document, {
      label,
      partCount: countParts(document),
    });
    if (updated) return { entry: updated, created: false };
  }

  const entry = await OPFSCatalogueStore.createSetPieceDocument(label, {
    document,
    isSetting: opts.isSetting ?? true,
    partCount: countParts(document),
  });
  return { entry, created: true };
}
