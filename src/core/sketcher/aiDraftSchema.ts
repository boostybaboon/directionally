import { AI_CONVENTION } from './aiDraft.js';
import type { AIDraft, AIGroup, AIPart } from './aiDraft.js';
import type { LightConfig } from '../domain/types.js';

/**
 * The AI Draft grammar as a JSON Schema, plus the validator that turns untrusted
 * LLM output into a well-formed `AIDraft`. Mirrors `SET_PIECE_JSON_SCHEMA` +
 * `normalizeSetPieceInput` in `setting/authoringApi.ts`, but for the richer
 * AI-facing grammar (named parts, absolute `size`, Euler `rotation`, groups).
 *
 * This is the contract the editable generate path (`generateEditableSetting`)
 * fills; the canonical `SketcherDraft` remains the single source of truth.
 */

// ── JSON Schema ───────────────────────────────────────────────────────────────

const VEC3_SCHEMA: Record<string, unknown> = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
};

const LIGHT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  required: ['type', 'color', 'intensity'],
  properties: {
    type: { enum: ['directional', 'hemisphere', 'point', 'ambient'] },
    id: { type: 'string' },
    color: { type: 'number' },
    intensity: { type: 'number' },
    position: VEC3_SCHEMA,
    skyColor: { type: 'number' },
    groundColor: { type: 'number' },
  },
};

const SIZE_LENGTHS: Record<string, number> = {
  box: 3,      // [w, h, d]
  sphere: 1,   // [radius]
  cylinder: 3, // [rTop, rBottom, h]
  capsule: 2,  // [radius, length]
  cone: 2,     // [radius, h]
  torus: 2,    // [radius, tube]
};

const PART_VARIANTS: Record<string, unknown>[] = Object.entries(SIZE_LENGTHS).map(([shape, len]) => ({
  type: 'object',
  additionalProperties: false,
  required: ['id', 'name', 'shape', 'size'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    kind: { const: 'primitive' },
    shape: { const: shape },
    size: { type: 'array', items: { type: 'number' }, minItems: len, maxItems: len },
    position: VEC3_SCHEMA,
    rotation: VEC3_SCHEMA,
    color: { type: 'number' },
    group: { type: 'string' },
  },
}));

const GROUP_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'children'],
  properties: {
    id: { type: 'string' },
    name: { type: 'string' },
    position: VEC3_SCHEMA,
    quaternion: { type: 'array', items: { type: 'number' }, minItems: 4, maxItems: 4 },
    scale: VEC3_SCHEMA,
    children: { type: 'array', items: { type: 'string' }, minItems: 1 },
  },
};

export const AI_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['parts'],
  properties: {
    convention: {
      type: 'object',
      additionalProperties: false,
      required: ['units', 'up', 'groundY', 'forward'],
      properties: {
        units: { const: 'metres' },
        up: { const: '+Y' },
        groundY: { const: 0 },
        forward: { const: '-Z' },
      },
    },
    parts: { type: 'array', minItems: 1, items: { oneOf: PART_VARIANTS } },
    groups: { type: 'array', items: GROUP_SCHEMA },
    label: { type: 'string' },
    lights: { type: 'array', items: LIGHT_SCHEMA },
    environmentMap: { type: 'string' },
  },
};

// ── Normalisation ─────────────────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asString(v: unknown, field: string): string {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${field} must be a non-empty string`);
  return v.trim();
}

function asNumber(v: unknown, field: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) throw new Error(`${field} must be a number`);
  return v;
}

function asVec3(v: unknown, field: string): [number, number, number] {
  if (!Array.isArray(v) || v.length !== 3) throw new Error(`${field} must be an array of 3 numbers`);
  return [asNumber(v[0], `${field}[0]`), asNumber(v[1], `${field}[1]`), asNumber(v[2], `${field}[2]`)];
}

function asVec4(v: unknown, field: string): [number, number, number, number] {
  if (!Array.isArray(v) || v.length !== 4) throw new Error(`${field} must be an array of 4 numbers`);
  return [asNumber(v[0], `${field}[0]`), asNumber(v[1], `${field}[1]`), asNumber(v[2], `${field}[2]`), asNumber(v[3], `${field}[3]`)];
}

function normalizePart(v: unknown, field: string): AIPart {
  if (!isRecord(v)) throw new Error(`${field} must be an object`);

  const id = asString(v.id, `${field}.id`);
  const name = asString(v.name, `${field}.name`);
  const kind = v.kind === undefined ? 'primitive' : asString(v.kind, `${field}.kind`);
  if (kind !== 'primitive' && kind !== 'sketch' && kind !== 'lathed') {
    throw new Error(`${field}.kind must be 'primitive', 'sketch', or 'lathed'`);
  }

  const position: [number, number, number] = v.position !== undefined ? asVec3(v.position, `${field}.position`) : [0, 0, 0];
  const rotation: [number, number, number] = v.rotation !== undefined ? asVec3(v.rotation, `${field}.rotation`) : [0, 0, 0];
  const color = v.color !== undefined ? asNumber(v.color, `${field}.color`) : 0x8888cc;

  const part: AIPart = { id, name, kind, position, rotation, color };

  if (kind === 'primitive') {
    const shape = v.shape !== undefined ? asString(v.shape, `${field}.shape`).toLowerCase() : undefined;
    if (!shape || !(shape in SIZE_LENGTHS)) {
      throw new Error(`${field}.shape must be one of ${Object.keys(SIZE_LENGTHS).join(', ')}`);
    }
    const size = v.size;
    if (!Array.isArray(size) || size.length !== SIZE_LENGTHS[shape]) {
      throw new Error(`${field}.size must be ${SIZE_LENGTHS[shape]} number(s) for shape "${shape}"`);
    }
    part.shape = shape;
    part.size = size.map((n, i) => asNumber(n, `${field}.size[${i}]`));
  } else {
    part.scale = v.scale !== undefined ? asVec3(v.scale, `${field}.scale`) : [1, 1, 1] as [number, number, number];
  }

  if (v.group !== undefined) part.group = asString(v.group, `${field}.group`);
  return part;
}

function normalizeGroup(v: unknown, field: string): AIGroup {
  if (!isRecord(v)) throw new Error(`${field} must be an object`);
  const id = asString(v.id, `${field}.id`);
  if (!Array.isArray(v.children) || v.children.length === 0) {
    throw new Error(`${field}.children must be a non-empty array`);
  }
  const children = v.children.map((c, i) => asString(c, `${field}.children[${i}]`));
  const group: AIGroup = { id, children };
  if (v.name !== undefined) group.name = asString(v.name, `${field}.name`);
  if (v.position !== undefined) group.position = asVec3(v.position, `${field}.position`);
  if (v.quaternion !== undefined) group.quaternion = asVec4(v.quaternion, `${field}.quaternion`);
  if (v.scale !== undefined) group.scale = asVec3(v.scale, `${field}.scale`);
  return group;
}

/**
 * Validate + normalise untrusted LLM output into a well-formed `AIDraft`.
 * Throws a descriptive `Error` on the first invalid field. The `convention`
 * is always the fixed `AI_CONVENTION` — the AI declares its coordinate system
 * in the prompt, and `fromAIDraft` does not consume a per-document convention.
 */
export function normalizeAIDraft(input: unknown): AIDraft {
  if (!isRecord(input)) throw new Error('setting draft must be an object');

  const partsRaw = input.parts;
  if (!Array.isArray(partsRaw) || partsRaw.length === 0) throw new Error('parts must be a non-empty array');
  const parts = partsRaw.map((p, i) => normalizePart(p, `parts[${i}]`));

  const groups = Array.isArray(input.groups)
    ? input.groups.map((g, i) => normalizeGroup(g, `groups[${i}]`))
    : [];

  return {
    convention: AI_CONVENTION,
    parts,
    groups,
    ...(input.label !== undefined ? { label: asString(input.label, 'label') } : {}),
    ...(input.lights !== undefined ? { lights: input.lights as LightConfig[] } : {}),
    ...(input.environmentMap !== undefined ? { environmentMap: asString(input.environmentMap, 'environmentMap') } : {}),
  };
}

