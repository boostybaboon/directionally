import type { CharacterEntry, SetPieceEntry } from '../catalogue/types.js';
import type { GeometryConfig, LightConfig, MaterialConfig, PlacedProp, Vec3 } from '../domain/types.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type UserCatalogueEntry = (CharacterEntry | SetPieceEntry) & {
  userAdded: true;
  addedAt: number;
  /** Set when this entry was exported from a Sketcher assembly — enables round-trip editing. */
  sourceAssemblyId?: string;
};

/** Caller-provided metadata when adding a new asset (id, addedAt, and gltfPath are generated). */
export type NewCharacterMeta = Omit<CharacterEntry, 'id' | 'gltfPath'>;
export type NewSetPieceMeta = Omit<SetPieceEntry, 'id' | 'geometry' | 'material'> & {
  geometry?: GeometryConfig;
  material?: MaterialConfig;
};
export type NewAssetMeta = NewCharacterMeta | NewSetPieceMeta;

/** Metadata for a procedural set-piece saved without a GLB — a leaf
 *  (`geometry` + `material`) or a composite (`compose`). When used as a
 *  setting, an optional environment and lights are captured too. */
export type NewProceduralSetPiece = {
  label: string;
  compose?: PlacedProp[];
  geometry?: GeometryConfig;
  material?: MaterialConfig;
  defaultRotation?: Vec3;
  environmentId?: string;
  lights?: LightConfig[];
};

// ── Serialised form ───────────────────────────────────────────────────────────

// gltfPath is runtime-only (object URL); all other fields are stored in JSON.
type StoredEntry = {
  id: string;
  /** GLB filename for GLB-backed entries; empty string for metadata-only (procedural) entries. */
  filename: string;
  addedAt: number;
  kind: 'character' | 'set-piece';
  label: string;
  defaultRotation?: Vec3;
  defaultScale?: number;
  defaultAnimation?: string;
  geometry?: GeometryConfig;
  material?: MaterialConfig;
  /** Composite of placed sub-items for metadata-only composite set-pieces. */
  compose?: PlacedProp[];
  /** Environment catalogue id captured when this entry was saved as a setting. */
  environmentId?: string;
  /** Lights captured when this entry was saved as a setting. */
  lights?: LightConfig[];
  /** ID of the SketcherAssemblyStore entry that produced this asset. */
  sourceAssemblyId?: string;
};

// ── Placeholder for GLB set-pieces without explicit procedural geometry ───────

const PLACEHOLDER_GEOMETRY: GeometryConfig = { type: 'box', width: 0.01, height: 0.01, depth: 0.01 };
const PLACEHOLDER_MATERIAL: MaterialConfig = { color: 0x000000, metalness: 0, roughness: 1 };

// ── OPFS helpers ──────────────────────────────────────────────────────────────

const ASSETS_DIR = 'assets';
const META_FILE  = 'assets-meta.json';

type DirectoryProvider = () => Promise<FileSystemDirectoryHandle>;

const _defaultProvider: DirectoryProvider = async () => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ASSETS_DIR, { create: true });
};

let _getDir: DirectoryProvider = _defaultProvider;

/** Override the OPFS directory provider. Use in tests to inject an in-memory mock. */
export function _setDirectoryProvider(fn: DirectoryProvider): void {
  _getDir = fn;
}

/** Restore the real OPFS provider. */
export function _resetDirectoryProvider(): void {
  _getDir = _defaultProvider;
}

async function readMeta(dir: FileSystemDirectoryHandle): Promise<StoredEntry[]> {
  try {
    const fh = await dir.getFileHandle(META_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as StoredEntry[];
  } catch {
    return [];
  }
}

async function writeMeta(dir: FileSystemDirectoryHandle, entries: StoredEntry[]): Promise<void> {
  const fh = await dir.getFileHandle(META_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(entries));
  await writable.close();
}

function toUserEntry(s: StoredEntry, gltfPath?: string): UserCatalogueEntry {
  if (s.kind === 'character') {
    return {
      kind: 'character',
      id: s.id,
      label: s.label,
      gltfPath: gltfPath ?? '',
      defaultAnimation: s.defaultAnimation,
      defaultScale: s.defaultScale,
      defaultRotation: s.defaultRotation,
      userAdded: true,
      addedAt: s.addedAt,
      sourceAssemblyId: s.sourceAssemblyId,
    };
  }
  if (s.compose) {
    return {
      kind: 'set-piece',
      id: s.id,
      label: s.label,
      compose: s.compose,
      defaultRotation: s.defaultRotation,
      ...(s.environmentId ? { environmentId: s.environmentId } : {}),
      ...(s.lights ? { lights: s.lights } : {}),
      userAdded: true,
      addedAt: s.addedAt,
      sourceAssemblyId: s.sourceAssemblyId,
    };
  }
  return {
    kind: 'set-piece',
    id: s.id,
    label: s.label,
    ...(gltfPath ? { gltfPath } : {}),
    geometry: s.geometry ?? PLACEHOLDER_GEOMETRY,
    material: s.material ?? PLACEHOLDER_MATERIAL,
    defaultRotation: s.defaultRotation,
    ...(s.environmentId ? { environmentId: s.environmentId } : {}),
    ...(s.lights ? { lights: s.lights } : {}),
    userAdded: true,
    addedAt: s.addedAt,
    sourceAssemblyId: s.sourceAssemblyId,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Return all user-added catalogue entries. Each entry gets a fresh gltfPath
 * object URL produced from its OPFS file — no reload fragility.
 * Entries whose OPFS file is missing are silently skipped.
 */
export async function list(): Promise<UserCatalogueEntry[]> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const results: UserCatalogueEntry[] = [];
  for (const s of stored) {
    if (s.filename === '') {
      // Metadata-only entry (procedural leaf or composite) — no GLB file to read.
      results.push(toUserEntry(s));
      continue;
    }
    try {
      const fh = await dir.getFileHandle(s.filename);
      const file = await fh.getFile();
      results.push(toUserEntry(s, URL.createObjectURL(file)));
    } catch {
      // OPFS file missing — skip stale metadata entry
    }
  }
  return results;
}

/**
 * Store a GLB blob to OPFS and register it in the metadata index.
 * Returns the new catalogue entry with a fresh gltfPath object URL.
 *
 * Pass `sourceAssemblyId` to record which SketcherAssemblyStore entry
 * produced this asset — enables "Edit in Sketcher" and in-place re-export.
 */
export async function add(
  blob: Blob,
  meta: NewAssetMeta,
  sourceAssemblyId?: string,
): Promise<UserCatalogueEntry> {
  const id = crypto.randomUUID();
  const filename = `${id}.glb`;
  const addedAt = Date.now();

  const dir = await _getDir();

  const fh = await dir.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();

  const entry: StoredEntry = {
    id,
    filename,
    addedAt,
    kind: meta.kind as 'character' | 'set-piece',
    label: meta.label,
    defaultRotation: meta.defaultRotation,
    ...(meta.kind === 'character'
      ? {
          defaultScale: (meta as NewCharacterMeta).defaultScale,
          defaultAnimation: (meta as NewCharacterMeta).defaultAnimation,
        }
      : {
          geometry: (meta as NewSetPieceMeta).geometry,
          material: (meta as NewSetPieceMeta).material,
          ...((meta as NewSetPieceMeta).environmentId
            ? { environmentId: (meta as NewSetPieceMeta).environmentId }
            : {}),
          ...((meta as NewSetPieceMeta).lights
            ? { lights: (meta as NewSetPieceMeta).lights }
            : {}),
        }),
    ...(sourceAssemblyId ? { sourceAssemblyId } : {}),
  };

  const stored = await readMeta(dir);
  stored.push(entry);
  await writeMeta(dir, stored);

  return toUserEntry(entry, URL.createObjectURL(blob));
}

/**
 * Overwrite the GLB for an existing entry in place, optionally updating the label.
 * Returns the updated entry, or null if the id is not found.
 */
export async function update(
  id: string,
  blob: Blob,
  label?: string,
): Promise<UserCatalogueEntry | null> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const idx = stored.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  const fh = await dir.getFileHandle(stored[idx].filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();

  if (label !== undefined) stored[idx] = { ...stored[idx], label };
  await writeMeta(dir, stored);

  return toUserEntry(stored[idx], URL.createObjectURL(blob));
}

/**
 * Find the catalogue entry whose `sourceAssemblyId` matches the given assembly id.
 * Returns null when no entry has been exported from that assembly yet.
 */
export async function findByAssemblyId(assemblyId: string): Promise<UserCatalogueEntry | null> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const entry = stored.find((e) => e.sourceAssemblyId === assemblyId);
  if (!entry) return null;
  try {
    const fh = await dir.getFileHandle(entry.filename);
    const file = await fh.getFile();
    return toUserEntry(entry, URL.createObjectURL(file));
  } catch {
    return null;
  }
}

/**
 * Remove an asset from OPFS and the metadata index by id.
 * No-op when the id is not found.
 */
export async function remove(id: string): Promise<void> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const entry = stored.find((e) => e.id === id);
  if (!entry) return;

  if (entry.filename) {
    try {
      await dir.removeEntry(entry.filename);
    } catch {
      // File already gone — continue with metadata cleanup
    }
  }

  await writeMeta(dir, stored.filter((e) => e.id !== id));
}

function isPlacedProp(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.ref === 'string') return true;
  return Boolean(item.geometry && item.material);
}

/**
 * Validate the metadata for a procedural set-piece. Returns an error message,
 * or null when valid.
 */
export function validateSetPieceMeta(meta: NewProceduralSetPiece): string | null {
  if (!meta.label || !meta.label.trim()) return 'label is required';
  const hasCompose = Boolean(meta.compose && meta.compose.length > 0);
  const hasLeaf = Boolean(meta.geometry && meta.material);
  if (hasCompose && hasLeaf) return 'provide either `compose` or `geometry` + `material`, not both';
  if (!hasCompose && !hasLeaf) return 'provide `compose` (composite) or `geometry` + `material` (leaf)';
  if (hasCompose) {
    for (const item of meta.compose!) {
      if (!isPlacedProp(item)) return 'each `compose` item needs a `ref` or `geometry` + `material`';
    }
  }
  return null;
}

/**
 * Persist a procedural set-piece (leaf geometry or a composite of primitives)
 * with no GLB file. Returns the new catalogue entry — composites carry no
 * gltfPath and expand via the setting resolver's `expandEntry`.
 */
export async function addSetPiece(meta: NewProceduralSetPiece): Promise<UserCatalogueEntry> {
  const error = validateSetPieceMeta(meta);
  if (error) throw new Error(error);

  const id = crypto.randomUUID();
  const addedAt = Date.now();
  const dir = await _getDir();

  const entry: StoredEntry = {
    id,
    filename: '',
    addedAt,
    kind: 'set-piece',
    label: meta.label.trim(),
    defaultRotation: meta.defaultRotation,
    ...(meta.compose && meta.compose.length > 0
      ? { compose: meta.compose }
      : { geometry: meta.geometry, material: meta.material }),
    ...(meta.environmentId ? { environmentId: meta.environmentId } : {}),
    ...(meta.lights && meta.lights.length > 0 ? { lights: meta.lights } : {}),
  };

  const stored = await readMeta(dir);
  stored.push(entry);
  await writeMeta(dir, stored);

  return toUserEntry(entry);
}
