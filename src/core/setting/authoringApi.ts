import type { GeometryConfig, LightConfig, MaterialConfig, PlacedProp, Vec3 } from '../domain/types.js';
import { assignLocalIds } from '../catalogue/localId.js';
import * as OPFSCatalogueStore from '../storage/OPFSCatalogueStore.js';
import type { NewProceduralSetPiece, UserCatalogueEntry } from '../storage/OPFSCatalogueStore.js';

/**
 * AI authoring surface for scenery (Track SET, AI-API).
 *
 * An LLM doesn't need the Three.js runtime — it needs a JSON contract it can
 * emit against, and one validated call to turn that JSON into a reusable
 * catalogue entry. `SET_PIECE_JSON_SCHEMA` is the contract (embed it in a
 * system prompt or a `response_format`/`tool_choice` `input_schema`);
 * `createSetPiece` is the single call that validates, assigns stable
 * `localId`s, persists via `addSetPiece`, and returns the created entry.
 *
 * Kept deliberately free of any provider/LLM dependency — that lives in
 * ROADMAP_AI.md's `/api/generate/*` server routes, which produce JSON this
 * module consumes. The schema mirrors `NewProceduralSetPiece` + `PlacedProp`
 * (the source of truth); keep them in sync when either type changes.
 */

// ── JSON Schema (the contract an AI fills) ─────────────────────────────────────

const VEC3_SCHEMA: Record<string, unknown> = {
  type: 'array',
  items: { type: 'number' },
  minItems: 3,
  maxItems: 3,
};

const GEOMETRY_SCHEMA: Record<string, unknown> = {
  oneOf: [
    {
      type: 'object', additionalProperties: false,
      required: ['type', 'width', 'height', 'depth'],
      properties: { type: { const: 'box' }, width: { type: 'number' }, height: { type: 'number' }, depth: { type: 'number' } },
    },
    {
      type: 'object', additionalProperties: false,
      required: ['type', 'width', 'height'],
      properties: { type: { const: 'plane' }, width: { type: 'number' }, height: { type: 'number' } },
    },
    {
      type: 'object', additionalProperties: false,
      required: ['type', 'radius'],
      properties: { type: { const: 'sphere' }, radius: { type: 'number' }, widthSegments: { type: 'number' }, heightSegments: { type: 'number' } },
    },
    {
      type: 'object', additionalProperties: false,
      required: ['type', 'radiusTop', 'radiusBottom', 'height'],
      properties: { type: { const: 'cylinder' }, radiusTop: { type: 'number' }, radiusBottom: { type: 'number' }, height: { type: 'number' }, radialSegments: { type: 'number' } },
    },
  ],
};

const MATERIAL_SCHEMA: Record<string, unknown> = {
  type: 'object', additionalProperties: false, required: ['color'],
  properties: {
    color: { type: 'number' }, emissive: { type: 'number' }, metalness: { type: 'number' }, roughness: { type: 'number' },
    textureUrl: { type: 'string' }, repeatU: { type: 'number' }, repeatV: { type: 'number' },
  },
};

const LIGHT_SCHEMA: Record<string, unknown> = {
  oneOf: [
    {
      type: 'object', additionalProperties: false, required: ['type', 'id', 'color', 'intensity', 'position'],
      properties: { type: { const: 'directional' }, id: { type: 'string' }, color: { type: 'number' }, intensity: { type: 'number' }, position: VEC3_SCHEMA },
    },
    {
      type: 'object', additionalProperties: false, required: ['type', 'id', 'skyColor', 'groundColor', 'intensity'],
      properties: { type: { const: 'hemisphere' }, id: { type: 'string' }, skyColor: { type: 'number' }, groundColor: { type: 'number' }, intensity: { type: 'number' }, position: VEC3_SCHEMA },
    },
    {
      type: 'object', additionalProperties: false, required: ['type', 'id', 'color', 'intensity', 'position'],
      properties: { type: { const: 'spot' }, id: { type: 'string' }, color: { type: 'number' }, intensity: { type: 'number' }, angle: { type: 'number' }, penumbra: { type: 'number' }, decay: { type: 'number' }, position: VEC3_SCHEMA, target: VEC3_SCHEMA },
    },
    {
      type: 'object', additionalProperties: false, required: ['type', 'id', 'color', 'intensity', 'position'],
      properties: { type: { const: 'point' }, id: { type: 'string' }, color: { type: 'number' }, intensity: { type: 'number' }, distance: { type: 'number' }, decay: { type: 'number' }, position: VEC3_SCHEMA },
    },
  ],
};

const PLACED_PROP_SCHEMA: Record<string, unknown> = {
  oneOf: [
    {
      type: 'object', additionalProperties: false, required: ['ref'],
      properties: { ref: { type: 'string' }, position: VEC3_SCHEMA, rotation: VEC3_SCHEMA, scale: VEC3_SCHEMA, localId: { type: 'string' } },
    },
    {
      type: 'object', additionalProperties: false, required: ['geometry', 'material'],
      properties: { geometry: GEOMETRY_SCHEMA, material: MATERIAL_SCHEMA, name: { type: 'string' }, position: VEC3_SCHEMA, rotation: VEC3_SCHEMA, scale: VEC3_SCHEMA, localId: { type: 'string' } },
    },
  ],
};

/** JSON Schema for a reusable scenery asset: a leaf primitive, an assembly of
 *  primitives/refs (`compose`), or a whole setting (`compose` + lights + env). */
export const SET_PIECE_JSON_SCHEMA: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Scenery set-piece',
  description: 'A reusable scenery asset (item, assembly, or whole setting) for Directionally.',
  type: 'object',
  additionalProperties: false,
  required: ['label'],
  properties: {
    label: { type: 'string' },
    geometry: GEOMETRY_SCHEMA,
    material: MATERIAL_SCHEMA,
    compose: { type: 'array', items: PLACED_PROP_SCHEMA },
    defaultRotation: VEC3_SCHEMA,
    environmentId: { type: 'string' },
    lights: { type: 'array', items: LIGHT_SCHEMA },
  },
  oneOf: [
    { required: ['geometry', 'material'] },
    { required: ['compose'] },
  ],
};

// ── Validation / normalisation ────────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, field: string): string {
  if (typeof v !== 'string') throw new Error(`${field} must be a string`);
  return v;
}

function num(v: unknown, field: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${field} must be a finite number`);
  return v;
}

function int(v: unknown, field: string): number {
  const n = num(v, field);
  if (!Number.isInteger(n)) throw new Error(`${field} must be an integer`);
  return n;
}

function vec3(v: unknown, field: string): Vec3 {
  if (!Array.isArray(v) || v.length !== 3 || v.some((n) => typeof n !== 'number' || !Number.isFinite(n))) {
    throw new Error(`${field} must be an array of three finite numbers`);
  }
  return [v[0], v[1], v[2]];
}

function normalizeGeometry(v: unknown): GeometryConfig {
  if (!isRecord(v)) throw new Error('geometry must be an object');
  switch (v.type) {
    case 'box':
      return { type: 'box', width: num(v.width, 'width'), height: num(v.height, 'height'), depth: num(v.depth, 'depth') };
    case 'plane':
      return { type: 'plane', width: num(v.width, 'width'), height: num(v.height, 'height') };
    case 'sphere':
      return {
        type: 'sphere',
        radius: num(v.radius, 'radius'),
        ...(v.widthSegments !== undefined ? { widthSegments: int(v.widthSegments, 'widthSegments') } : {}),
        ...(v.heightSegments !== undefined ? { heightSegments: int(v.heightSegments, 'heightSegments') } : {}),
      };
    case 'cylinder':
      return {
        type: 'cylinder',
        radiusTop: num(v.radiusTop, 'radiusTop'),
        radiusBottom: num(v.radiusBottom, 'radiusBottom'),
        height: num(v.height, 'height'),
        ...(v.radialSegments !== undefined ? { radialSegments: int(v.radialSegments, 'radialSegments') } : {}),
      };
    default:
      throw new Error(`unknown geometry type "${String(v.type)}"`);
  }
}

function normalizeMaterial(v: unknown): MaterialConfig {
  if (!isRecord(v)) throw new Error('material must be an object');
  const m: MaterialConfig = { color: num(v.color, 'color') };
  if (v.emissive !== undefined) m.emissive = num(v.emissive, 'emissive');
  if (v.metalness !== undefined) m.metalness = num(v.metalness, 'metalness');
  if (v.roughness !== undefined) m.roughness = num(v.roughness, 'roughness');
  if (v.textureUrl !== undefined) m.textureUrl = str(v.textureUrl, 'textureUrl');
  if (v.repeatU !== undefined) m.repeatU = num(v.repeatU, 'repeatU');
  if (v.repeatV !== undefined) m.repeatV = num(v.repeatV, 'repeatV');
  return m;
}

function normalizeLight(v: unknown): LightConfig {
  if (!isRecord(v)) throw new Error('light must be an object');
  switch (v.type) {
    case 'directional':
      return { type: 'directional', id: str(v.id, 'id'), color: num(v.color, 'color'), intensity: num(v.intensity, 'intensity'), position: vec3(v.position, 'position') };
    case 'hemisphere':
      return {
        type: 'hemisphere', id: str(v.id, 'id'), skyColor: num(v.skyColor, 'skyColor'), groundColor: num(v.groundColor, 'groundColor'), intensity: num(v.intensity, 'intensity'),
        ...(v.position !== undefined ? { position: vec3(v.position, 'position') } : {}),
      };
    case 'spot':
      return {
        type: 'spot', id: str(v.id, 'id'), color: num(v.color, 'color'), intensity: num(v.intensity, 'intensity'), position: vec3(v.position, 'position'),
        ...(v.angle !== undefined ? { angle: num(v.angle, 'angle') } : {}),
        ...(v.penumbra !== undefined ? { penumbra: num(v.penumbra, 'penumbra') } : {}),
        ...(v.decay !== undefined ? { decay: num(v.decay, 'decay') } : {}),
        ...(v.target !== undefined ? { target: vec3(v.target, 'target') } : {}),
      };
    case 'point':
      return {
        type: 'point', id: str(v.id, 'id'), color: num(v.color, 'color'), intensity: num(v.intensity, 'intensity'), position: vec3(v.position, 'position'),
        ...(v.distance !== undefined ? { distance: num(v.distance, 'distance') } : {}),
        ...(v.decay !== undefined ? { decay: num(v.decay, 'decay') } : {}),
      };
    default:
      throw new Error(`unknown light type "${String(v.type)}"`);
  }
}

function normalizePlacedProp(v: unknown): PlacedProp {
  if (!isRecord(v)) throw new Error('compose item must be an object');
  const position = v.position !== undefined ? vec3(v.position, 'position') : undefined;
  const rotation = v.rotation !== undefined ? vec3(v.rotation, 'rotation') : undefined;
  const scale = v.scale !== undefined ? vec3(v.scale, 'scale') : undefined;
  const localId = v.localId !== undefined ? str(v.localId, 'localId') : undefined;

  if (v.ref !== undefined) {
    return {
      ref: str(v.ref, 'ref'),
      ...(position ? { position } : {}),
      ...(rotation ? { rotation } : {}),
      ...(scale ? { scale } : {}),
      ...(localId ? { localId } : {}),
    };
  }
  return {
    geometry: normalizeGeometry(v.geometry),
    material: normalizeMaterial(v.material),
    ...(v.name !== undefined ? { name: str(v.name, 'name') } : {}),
    ...(position ? { position } : {}),
    ...(rotation ? { rotation } : {}),
    ...(scale ? { scale } : {}),
    ...(localId ? { localId } : {}),
  };
}

function normalizeCompose(v: unknown): PlacedProp[] {
  if (!Array.isArray(v) || v.length === 0) throw new Error('compose must be a non-empty array');
  return v.map(normalizePlacedProp);
}

function normalizeLights(v: unknown): LightConfig[] {
  if (!Array.isArray(v)) throw new Error('lights must be an array');
  return v.map(normalizeLight);
}

/**
 * Validate + normalise untrusted JSON into a `NewProceduralSetPiece`.
 * Throws a descriptive `Error` on the first invalid field; assigns a stable
 * `localId` to any `compose` child that lacks one (idempotent via `assignLocalIds`).
 */
export function normalizeSetPieceInput(input: unknown): NewProceduralSetPiece {
  if (!isRecord(input)) throw new Error('set-piece must be an object');

  const label = str(input.label, 'label').trim();
  if (!label) throw new Error('set-piece requires a non-empty "label"');

  const hasLeaf = input.geometry !== undefined || input.material !== undefined;
  const hasCompose = input.compose !== undefined;
  if (hasLeaf === hasCompose) {
    throw new Error('set-piece must provide either "compose" (composite) or "geometry" + "material" (leaf), not both');
  }

  const out: NewProceduralSetPiece = { label };
  if (hasLeaf) {
    out.geometry = normalizeGeometry(input.geometry);
    out.material = normalizeMaterial(input.material);
  } else {
    out.compose = assignLocalIds(normalizeCompose(input.compose));
  }
  if (input.defaultRotation !== undefined) out.defaultRotation = vec3(input.defaultRotation, 'defaultRotation');
  if (input.environmentId !== undefined) out.environmentId = str(input.environmentId, 'environmentId');
  if (input.lights !== undefined) out.lights = normalizeLights(input.lights);

  return out;
}

// ── Apply ──────────────────────────────────────────────────────────────────────

/**
 * Create a reusable catalogue set-piece/setting from untrusted JSON.
 * Validates + normalises via `normalizeSetPieceInput`, persists via
 * `OPFSCatalogueStore.addSetPiece`, and returns the created entry. The caller
 * is responsible for posting `{ type: 'catalogue-updated' }` on
 * `BroadcastChannel('directionally-catalogue')` so open script views re-resolve.
 */
export async function createSetPiece(input: unknown): Promise<UserCatalogueEntry> {
  return OPFSCatalogueStore.addSetPiece(normalizeSetPieceInput(input));
}
