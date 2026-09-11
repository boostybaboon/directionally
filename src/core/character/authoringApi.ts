/**
 * AI authoring surface for characters (ROADMAP_API.md API-2): a JSON contract
 * an LLM (or human client) fills, plus one validated call that turns it into a
 * reusable catalogue entry. Mirrors `src/core/setting/authoringApi.ts` for
 * scenery — same "schema → normalise → persist" shape, differing only in schema.
 *
 * A spec-backed character carries a `CharacterSpec` (no GLB) and is rebuilt
 * procedurally at scene load; GLB export stays a caching/portability step, not a
 * correctness requirement.
 */

import { validateCharacterSpec } from './characterSpec.js';
import type { CharacterSpec } from './characterSpec.js';
import { SKIN_TONES, HAIR_COLORS, EYE_COLORS } from './clothing.js';
import * as OPFSCatalogueStore from '../storage/OPFSCatalogueStore.js';
import type { UserCatalogueEntry } from '../storage/OPFSCatalogueStore.js';

export type NewCharacter = {
  label: string;
  spec: CharacterSpec;
};

// ── JSON Schema (the contract an AI fills) ─────────────────────────────────────

/** Human-readable "label 0xrrggbb" list so the schema tells the model the colour domain. */
function swatchHint(swatches: ReadonlyArray<{ label: string; color: number }>): string {
  const listed = swatches.map((s) => `${s.label} 0x${s.color.toString(16).padStart(6, '0')}`).join(', ');
  return `A 24-bit colour as a hex number (0x000000..0xffffff). Prefer one of: ${listed}.`;
}

const SKIN_TONE_LABELS = SKIN_TONES.map((t) => t.label);

export const CHARACTER_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['label'],
  properties: {
    label: { type: 'string' },
    spec: {
      type: 'object',
      additionalProperties: false,
      properties: {
        height: { type: 'number', minimum: 0, maximum: 1 },
        build: { type: 'number', minimum: -1, maximum: 1 },
        muscularity: { type: 'number', minimum: 0, maximum: 1 },
        age: { type: 'number', minimum: 0, maximum: 1 },
        feminineMasculine: { type: 'number', minimum: -1, maximum: 1 },
        skinTone: {
          description: `A skin-tone label (${SKIN_TONE_LABELS.map((l) => `"${l}"`).join(', ')}) or a 24-bit hex colour number.`,
          oneOf: [
            { type: 'string', enum: SKIN_TONE_LABELS },
            { type: 'number' },
          ],
        },
        hairColor: { type: 'number', description: swatchHint(HAIR_COLORS) },
        hairGreying: { type: 'number', minimum: 0, maximum: 1, description: '0 = no grey, 1 = fully grey; blends hairColor toward grey.' },
        eyeColor: { type: 'number', description: swatchHint(EYE_COLORS) },
        outfit: { type: 'string', enum: ['casual', 'teeShorts', 'layered', 'bare'] },
      },
    },
  },
};

// ── Normalise + apply ──────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new Error(`${name} must be a string`);
  return v;
}

/**
 * Validate + normalise untrusted JSON into a `NewCharacter`. Throws a
 * descriptive `Error` on the first invalid field; the spec is clamped and
 * defaulted via `validateCharacterSpec`, so a missing/empty spec is legal and
 * resolves to the neutral character.
 */
export function normalizeCharacterInput(input: unknown): NewCharacter {
  if (!isRecord(input)) throw new Error('character must be an object');
  const label = str(input.label, 'label').trim();
  if (!label) throw new Error('character requires a non-empty "label"');
  const spec = validateCharacterSpec((isRecord(input.spec) ? input.spec : {}) as CharacterSpec);
  return { label, spec };
}

/**
 * Create a reusable spec-backed catalogue character from untrusted JSON.
 * Validates + normalises via `normalizeCharacterInput`, persists via
 * `OPFSCatalogueStore.addCharacter`, and returns the created entry. The caller
 * is responsible for posting `{ type: 'catalogue-updated' }` on
 * `BroadcastChannel('directionally-catalogue')` so open script views re-resolve.
 */
export async function createCharacter(input: unknown): Promise<UserCatalogueEntry> {
  const { label, spec } = normalizeCharacterInput(input);
  // Procedural humanoids expose "idle" as their default clip (see animationClips.ts).
  return OPFSCatalogueStore.addCharacter({ label, spec, defaultAnimation: 'idle' });
}
