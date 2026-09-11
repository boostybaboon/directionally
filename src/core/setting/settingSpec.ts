import type {
  LightConfig,
  Placement,
  PlacedProp,
  SetPiece,
  Vec3,
} from '../domain/types.js';
import type { StoredScene } from '../storage/types.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import {
  getById,
  getEnvironments,
  getLights,
  getSetPieces,
} from '../catalogue/catalogue.js';
import type { CatalogueEntry, EnvironmentEntry, LightEntry, SetPieceEntry } from '../catalogue/types.js';

export type { PropSpec, PlacedProp, Placement } from '../domain/types.js';

/** A flattened backdrop approximating non-interactive surround (the "flatting"). */
export type BackdropSpec = {
  /** Name from TEXTURE_REGISTRY, or omit to use a flat colour. */
  texture?: string;
  color?: number;
  width: number;
  height: number;
  position?: Vec3;
  rotation?: Vec3;
};

/**
 * Level-0 setting API: the minimal, AI-fillable surface for describing an
 * environment in structured form. Every field is optional — an empty spec
 * resolves to a neutral room. An LLM fills this JSON and the app resolves it
 * into the renderer's `SetPiece[]` via `resolveSettingSpec`.
 */
export interface SettingSpec {
  /** Setting name/type ('classroom', 'courtroom', …) — descriptive only; resolution is catalogue-driven. */
  name?: string;
  /** HDRI environment backdrop (catalogue id or label). */
  environment?: string;
  /** Floor piece — a catalogue ref ('wood-floor') or an inline primitive. */
  floor?: PlacedProp;
  /** Flattened backdrops for non-interactive surround. */
  backdrops?: BackdropSpec[];
  /** Placed props/furnishings — catalogue refs or improvised primitives. */
  props?: PlacedProp[];
  /** Lights: catalogue refs ('hemisphere-light') or inline light configs. Empty → starter lights. */
  lights?: Array<string | LightConfig>;
}

export interface ValidatedSettingSpec {
  name: string;
  environment?: string;
  floor: PlacedProp;
  backdrops: BackdropSpec[];
  props: PlacedProp[];
  lights: Array<string | LightConfig>;
}

export interface ResolvedSetting {
  /** Resolved environment catalogue id (e.g. 'studio-neutral'). */
  environmentMap?: string;
  set: SetPiece[];
  lights: LightConfig[];
  /** Refs that didn't match the catalogue — surfaced so the AI can retry. */
  unresolved: string[];
}

/** Backdrop texture names → bundled texture URLs. */
export const TEXTURE_REGISTRY: Record<string, string> = {
  brick: '/textures/brick.jpg',
  concrete: '/textures/concrete.jpg',
  plaster: '/textures/plaster.jpg',
  wood: '/textures/wood-boards.jpg',
};

const DEFAULT_FLOOR: PlacedProp = {
  name: 'ground',
  geometry: { type: 'plane', width: 12, height: 12 },
  material: { color: 0x8a8a8a, roughness: 0.9, metalness: 0 },
  rotation: [-Math.PI / 2, 0, 0],
};

const DEFAULT_LIGHTS: LightConfig[] = [
  { type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2, position: [0, 20, 0] },
  { type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [5, 10, 5] },
];

const MAX_COMPOSITE_DEPTH = 8;

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * All entries whose label matches `label`, ordered by resolution preference:
 * user-authored entries (most recently added first), then bundled entries in
 * catalogue order. `mostRecentByLabel` is the first element of this list.
 */
export function matchesByLabel<T extends CatalogueEntry>(
  matches: T[],
  label: string,
): T[] {
  const target = normalize(label);
  const userMatches = matches.filter((e) => 'addedAt' in e && normalize(e.label) === target) as Array<T & { addedAt: number }>;
  const bundledMatches = matches.filter((e) => !('addedAt' in e) && normalize(e.label) === target);
  return [
    ...userMatches.sort((a, b) => b.addedAt - a.addedAt),
    ...bundledMatches,
  ];
}

/**
 * Pick the most-recently-added user-authored entry whose label matches `label`,
 * falling back to the first bundled entry only when no user entry matches.
 * Without this, duplicate user labels (e.g. re-exported "GARDEN") resolve to the
 * oldest entry, silently binding a scene to stale geometry.
 */
export function mostRecentByLabel<T extends CatalogueEntry>(
  matches: T[],
  label: string,
): T | undefined {
  return matchesByLabel(matches, label)[0];
}

/** Resolve a prop ref to a catalogue SetPieceEntry (id, then case-insensitive label). */
export function resolveProp(ref: string, entries: CatalogueEntry[] = CATALOGUE_ENTRIES): SetPieceEntry | undefined {
  const byId = getById(ref, entries);
  if (byId?.kind === 'set-piece') return byId;
  return mostRecentByLabel(getSetPieces(entries), ref);
}

/** Resolve an environment label to a catalogue EnvironmentEntry. */
export function resolveEnvironment(label: string, entries: CatalogueEntry[] = CATALOGUE_ENTRIES): EnvironmentEntry | undefined {
  const byId = getById(label, entries);
  if (byId?.kind === 'environment') return byId;
  return mostRecentByLabel(getEnvironments(entries), label);
}

/** Resolve a light ref to a catalogue LightEntry. */
export function resolveLight(ref: string, entries: CatalogueEntry[] = CATALOGUE_ENTRIES): LightEntry | undefined {
  const byId = getById(ref, entries);
  if (byId?.kind === 'light') return byId;
  return mostRecentByLabel(getLights(entries), ref);
}

/** Normalise a spec to concrete values with defaults for every missing field. */
export function validateSettingSpec(spec: SettingSpec): ValidatedSettingSpec {
  return {
    name: (spec.name ?? '').trim(),
    environment: spec.environment,
    floor: spec.floor ?? DEFAULT_FLOOR,
    backdrops: spec.backdrops ?? [],
    props: spec.props ?? [],
    lights: spec.lights ?? [],
  };
}


function applyPlacement(piece: SetPiece, placement: Placement): SetPiece {
  const out: SetPiece = { ...piece };
  if (placement.position) out.position = placement.position;
  if (placement.rotation) out.rotation = placement.rotation;
  if (placement.scale) out.scale = placement.scale;
  return out;
}

/**
 * Offset a composite child by its parent's placement (translation + scale).
 * Composite rotation is intentionally not applied yet — composites place props
 * by translation only, and rotating a whole assembly needs quaternion handling
 * that's out of scope for level 0.
 */
function offsetPiece(piece: SetPiece, placement: Placement): SetPiece {
  const out: SetPiece = { ...piece };
  if (placement.position) {
    const [dx, dy, dz] = placement.position;
    out.position = piece.position
      ? ([piece.position[0] + dx, piece.position[1] + dy, piece.position[2] + dz] as Vec3)
      : ([dx, dy, dz] as Vec3);
  }
  if (placement.scale) {
    const [sx, sy, sz] = placement.scale;
    out.scale = piece.scale
      ? ([piece.scale[0] * sx, piece.scale[1] * sy, piece.scale[2] * sz] as Vec3)
      : ([sx, sy, sz] as Vec3);
  }
  return out;
}

function backdropToSetPiece(b: BackdropSpec, index: number): SetPiece {
  const textureUrl = b.texture ? TEXTURE_REGISTRY[b.texture] : undefined;
  const position: Vec3 = b.position ?? [0, b.height / 2, -5];
  return {
    name: b.texture ?? `backdrop_${index}`,
    geometry: { type: 'box', width: b.width, height: b.height, depth: 0.1 },
    material: textureUrl
      ? { color: 0xffffff, roughness: 0.95, metalness: 0, textureUrl }
      : { color: b.color ?? 0x8899aa, roughness: 0.95, metalness: 0 },
    position,
    rotation: b.rotation,
  };
}

/**
 * Expand a catalogue SetPieceEntry into its flattened SetPieces. Composite
 * entries (`compose`) are expanded recursively; leaf entries become a single
 * piece (procedural geometry or a `gltfPath`). `placement` offsets composite
 * children / places the leaf.
 */
export function expandEntry(
  entry: SetPieceEntry,
  placement?: Placement,
  entries: CatalogueEntry[] = CATALOGUE_ENTRIES,
  unresolved: string[] = [],
  depth = 0,
): SetPiece[] {
  if (entry.compose) {
    if (depth >= MAX_COMPOSITE_DEPTH) return [];
    const children = expandProps(entry.compose, entries, unresolved, depth + 1);
    return placement ? children.map((c) => offsetPiece(c, placement)) : children;
  }
  const piece: SetPiece = {
    name: entry.id,
    geometry: entry.geometry ?? { type: 'box', width: 0.01, height: 0.01, depth: 0.01 },
    material: entry.material ?? { color: 0x000000, metalness: 0, roughness: 1 },
  };
  if (entry.gltfPath) {
    piece.gltfPath = entry.gltfPath.startsWith('blob:') ? `opfs://${entry.id}` : entry.gltfPath;
  }
  if (entry.defaultRotation) piece.rotation = entry.defaultRotation;
  return [placement ? applyPlacement(piece, placement) : piece];
}

function expandProps(
  props: PlacedProp[],
  entries: CatalogueEntry[],
  unresolved: string[],
  depth: number,
): SetPiece[] {
  const out: SetPiece[] = [];
  for (const p of props) {
    if ('ref' in p) {
      const entry = resolveProp(p.ref, entries);
      if (entry) {
        out.push(...expandEntry(entry, p, entries, unresolved, depth));
        continue;
      }
      unresolved.push(p.ref);
      continue;
    }
    const piece: SetPiece = { name: p.name ?? 'piece', geometry: p.geometry, material: p.material };
    out.push(applyPlacement(piece, p));
  }
  return out;
}

/**
 * Resolve a single `SetPiece` into its rendered children. If `piece.ref` is
 * absent, returns `[piece]` unchanged. If `piece.ref` is set, looks up the
 * catalogue `SetPieceEntry` and expands it (recursively, through any nested
 * `compose`/`ref` chain via `expandEntry`) using the piece's own transform as
 * the placement. Expanded child names are prefixed with the instance's own
 * `name` so multiple instances of the same Definition placed in one scene
 * stay individually addressable and don't collide.
 *
 * Unresolved refs fall back to `[piece]` (its own placeholder geometry/material)
 * so a broken reference still renders something rather than vanishing, and the
 * ref is recorded in `unresolved` for the caller to surface.
 *
 * Flattening only happens here, at render time (Track SET, N2) — the `ref` on
 * the stored piece is never rewritten, so the scene stays edit-friendly.
 */
export function resolveInstance(
  piece: SetPiece,
  entries: CatalogueEntry[] = CATALOGUE_ENTRIES,
  unresolved: string[] = [],
): SetPiece[] {
  if (!piece.ref) return [piece];
  const entry = resolveProp(piece.ref, entries);
  if (!entry) {
    unresolved.push(piece.ref);
    return [piece];
  }
  const placement: Placement = { position: piece.position, rotation: piece.rotation, scale: piece.scale };
  const expanded = expandEntry(entry, placement, entries, unresolved);
  return expanded.map((c) => ({ ...c, name: `${piece.name}/${c.name}` }));
}

/** Resolve every `ref` piece in `pieces` via `resolveInstance`, flattening in place. */
export function resolveInstances(
  pieces: SetPiece[],
  entries: CatalogueEntry[] = CATALOGUE_ENTRIES,
  unresolved: string[] = [],
): SetPiece[] {
  return pieces.flatMap((p) => resolveInstance(p, entries, unresolved));
}

function resolveSettingBody(
  spec: SettingSpec,
  entries: CatalogueEntry[],
): ResolvedSetting {
  const v = validateSettingSpec(spec);
  const unresolved: string[] = [];
  const set: SetPiece[] = [];

  let environmentMap: string | undefined;
  if (v.environment) {
    const env = resolveEnvironment(v.environment, entries);
    if (env) environmentMap = env.id;
    else unresolved.push(v.environment);
  }

  set.push(...expandProps([v.floor], entries, unresolved, 0));

  v.backdrops.forEach((b, i) => set.push(backdropToSetPiece(b, i)));
  set.push(...expandProps(v.props, entries, unresolved, 0));

  const lights: LightConfig[] = [];
  if (v.lights.length === 0) {
    lights.push(...DEFAULT_LIGHTS);
  } else {
    for (const item of v.lights) {
      if (typeof item === 'string') {
        const entry = resolveLight(item, entries);
        if (entry) lights.push({ id: entry.id, ...entry.config } as LightConfig);
        else unresolved.push(item);
      } else {
        lights.push(item);
      }
    }
  }

  return { environmentMap, set, lights, unresolved: [...new Set(unresolved)] };
}

/**
 * Resolve a SettingSpec into a renderer-ready scene (`SetPiece[]` + lights +
 * optional environment). `ref` props resolve against the catalogue (leaf or
 * composite entries); inline primitives are emitted as-is. Unresolved refs are
 * reported so a caller (or an AI) can retry or create the missing item.
 */
export function resolveSettingSpec(
  spec: SettingSpec,
  entries: CatalogueEntry[] = CATALOGUE_ENTRIES,
): ResolvedSetting {
  return resolveSettingBody(spec, entries);
}

/** Convert flattened SetPieces into inline PlacedProps (drops gltfPath/parent). */
export function setPiecesToCompose(pieces: SetPiece[]): PlacedProp[] {
  return pieces.map((p) => ({
    name: p.name,
    geometry: p.geometry,
    material: p.material,
    ...(p.position ? { position: p.position } : {}),
    ...(p.rotation ? { rotation: p.rotation } : {}),
    ...(p.scale ? { scale: p.scale } : {}),
  }));
}

/** Resolve a SettingSpec into a renderer-ready StoredScene (with a default camera). */
export function settingSpecToScene(
  spec: SettingSpec,
  entries: CatalogueEntry[] = CATALOGUE_ENTRIES,
): StoredScene {
  const resolved = resolveSettingSpec(spec, entries);
  return {
    camera: { fov: 50, near: 0.1, far: 120, position: [0, 5, 12], lookAt: [0, 1, 0] },
    lights: resolved.lights,
    set: resolved.set,
    stagedActors: [],
    actions: [],
    environmentMap: resolved.environmentMap,
    duration: 6,
  };
}

/**
 * Convert a StoredScene back into a SettingSpec (the inverse of
 * `settingSpecToScene`). The first plane piece is treated as the floor; the
 * rest become props. Lights round-trip as inline configs.
 */
export function sceneToSettingSpec(scene: StoredScene, name = ''): SettingSpec {
  const compose = setPiecesToCompose(scene.set);
  const floorIndex = compose.findIndex((p) => 'geometry' in p && p.geometry.type === 'plane');
  let floor: PlacedProp | undefined;
  let props: PlacedProp[] = compose;
  if (floorIndex !== -1) {
    floor = compose[floorIndex];
    props = compose.filter((_, i) => i !== floorIndex);
  }
  return { name, environment: scene.environmentMap, floor, props, lights: scene.lights };
}
