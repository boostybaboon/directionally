import type { CharacterEntry, SetPieceEntry } from '../catalogue/types.js';
import type { GeometryConfig, MaterialConfig, Vec3 } from '../domain/types.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type UserCatalogueEntry = (CharacterEntry | SetPieceEntry) & {
  userAdded: true;
  addedAt: number;
};

/** Caller-provided metadata when adding a new asset (id, addedAt, and gltfPath are generated). */
export type NewCharacterMeta = Omit<CharacterEntry, 'id' | 'gltfPath'>;
export type NewSetPieceMeta = Omit<SetPieceEntry, 'id' | 'geometry' | 'material'> & {
  geometry?: GeometryConfig;
  material?: MaterialConfig;
};
export type NewAssetMeta = NewCharacterMeta | NewSetPieceMeta;

// ── Serialised form ───────────────────────────────────────────────────────────

// gltfPath is runtime-only (object URL); all other fields are stored in JSON.
type StoredEntry = {
  id: string;
  filename: string;
  addedAt: number;
  kind: 'character' | 'set-piece';
  label: string;
  defaultRotation?: Vec3;
  defaultScale?: number;
  defaultAnimation?: string;
  geometry?: GeometryConfig;
  material?: MaterialConfig;
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

function toUserEntry(s: StoredEntry, gltfPath: string): UserCatalogueEntry {
  if (s.kind === 'character') {
    return {
      kind: 'character',
      id: s.id,
      label: s.label,
      gltfPath,
      defaultAnimation: s.defaultAnimation,
      defaultScale: s.defaultScale,
      defaultRotation: s.defaultRotation,
      userAdded: true,
      addedAt: s.addedAt,
    };
  } else {
    return {
      kind: 'set-piece',
      id: s.id,
      label: s.label,
      gltfPath,
      geometry: s.geometry ?? PLACEHOLDER_GEOMETRY,
      material: s.material ?? PLACEHOLDER_MATERIAL,
      defaultRotation: s.defaultRotation,
      userAdded: true,
      addedAt: s.addedAt,
    };
  }
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
 */
export async function add(blob: Blob, meta: NewAssetMeta): Promise<UserCatalogueEntry> {
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
        }),
  };

  const stored = await readMeta(dir);
  stored.push(entry);
  await writeMeta(dir, stored);

  return toUserEntry(entry, URL.createObjectURL(blob));
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

  try {
    await dir.removeEntry(entry.filename);
  } catch {
    // File already gone — continue with metadata cleanup
  }

  await writeMeta(dir, stored.filter((e) => e.id !== id));
}
