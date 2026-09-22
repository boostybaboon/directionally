import type { CharacterEntry, SetPieceEntry } from '../catalogue/types.js';
import type { CharacterSpec } from '../character/characterSpec.js';
import type { SetDocument } from '../sketcher/documentTree.js';
import type { Vec3 } from '../domain/types.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type UserCatalogueEntry = (CharacterEntry | SetPieceEntry) & {
  userAdded: true;
  addedAt: number;
  /** Last modification time (ms); equals `addedAt` for entries never edited. */
  modifiedAt?: number;
  /**
   * Mirrors `SetPieceEntry.hasDocument` so callers holding the character|set-piece
   * union can test it without narrowing first.
   */
  hasDocument?: boolean;
  /** Id of the editable design backing this asset (a CharacterDesignStore design). */
  sourceDesignId?: string;
  /** Number of editable primitives backing this entry (for the catalogue tree note). */
  partCount?: number;
};

/** Caller-provided metadata when adding a GLB-backed character (id, addedAt and gltfPath are generated). */
export type NewCharacterMeta = Omit<CharacterEntry, 'id' | 'gltfPath'>;

/** Metadata for a spec-backed character (no GLB) — the API-2 create path. */
export type NewSpecCharacter = {
  label: string;
  spec: CharacterSpec;
  defaultAnimation?: string;
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
  /** Procedural character description for spec-backed characters (no GLB). */
  spec?: CharacterSpec;
  /** Marks a set-piece as a top-level setting rather than a component prop. */
  isSetting?: boolean;
  /** True when a `<id>.document.json` sibling file holds this entry's editable tree. */
  hasDocument?: boolean;
  /** Last modification time (ms); defaults to `addedAt`. */
  modifiedAt?: number;
  /** ID of the editable design backing this asset (a CharacterDesignStore design). */
  sourceDesignId?: string;
  /** Number of editable primitives backing this entry. */
  partCount?: number;
};

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
    if (s.spec) {
      return {
        kind: 'character',
        id: s.id,
        label: s.label,
        spec: s.spec,
        defaultAnimation: s.defaultAnimation,
        defaultScale: s.defaultScale,
        defaultRotation: s.defaultRotation,
        userAdded: true,
        addedAt: s.addedAt,
        sourceDesignId: s.sourceDesignId,
      };
    }
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
      sourceDesignId: s.sourceDesignId,
    };
  }
  // A set-piece entry is document-backed: its body and its orientation are the tree
  // document, so nothing besides identity and metadata lives on the entry.
  return {
    kind: 'set-piece',
    id: s.id,
    label: s.label,
    // An explicit classification round-trips, including `false` (a prop).
    ...(s.isSetting !== undefined ? { isSetting: s.isSetting } : {}),
    userAdded: true,
    addedAt: s.addedAt,
    ...(s.modifiedAt !== undefined ? { modifiedAt: s.modifiedAt } : {}),
    ...(s.hasDocument ? { hasDocument: true } : {}),
    sourceDesignId: s.sourceDesignId,
    ...(s.partCount !== undefined ? { partCount: s.partCount } : {}),
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * True when an entry is usable as an asset. A character needs a baked GLB or a spec;
 * a set-piece *is* its tree document (ROADMAP_CATALOGUE step 8), so having one is
 * what publishes it — there is no separate bake and no publish step.
 */
function isPublishedEntry(s: StoredEntry): boolean {
  if (s.kind === 'set-piece') return Boolean(s.hasDocument);
  return s.filename !== '' || Boolean(s.spec);
}

/**
 * Return all user-added catalogue entries. Character entries get a fresh gltfPath
 * object URL produced from their OPFS file — no reload fragility. Set-piece entries
 * are document-backed and carry nothing but metadata here; their document is read on
 * demand (`getDocument`). Entries whose OPFS file is missing are silently skipped.
 */
export async function list(): Promise<UserCatalogueEntry[]> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const results: UserCatalogueEntry[] = [];
  for (const s of stored) {
    if (!isPublishedEntry(s)) continue;
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
 * Return every entry backed by an editable document — every saved set, most
 * recently modified first. This is the Sketcher's sets column.
 */
export async function listDocuments(): Promise<UserCatalogueEntry[]> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  return stored
    .filter((s) => s.hasDocument)
    .map((s) => toUserEntry(s))
    .sort((a, b) => (b.modifiedAt ?? b.addedAt) - (a.modifiedAt ?? a.addedAt));
}

/**
 * Store a GLB blob to OPFS and register it in the metadata index as a character.
 * Returns the new catalogue entry with a fresh gltfPath object URL.
 *
 * Pass `sourceDesignId` to link the character to the design it was built from,
 * which is what the script roster's "edit" affordance deep-links to. Sets are not
 * added this way: a set is created from its tree document
 * (`createSetPieceDocument`) and has no GLB of its own.
 */
export async function add(
  blob: Blob,
  meta: NewCharacterMeta,
  sourceDesignId?: string,
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
    kind: 'character',
    label: meta.label,
    defaultRotation: meta.defaultRotation,
    defaultScale: meta.defaultScale,
    defaultAnimation: meta.defaultAnimation,
    ...(sourceDesignId ? { sourceDesignId } : {}),
  };

  const stored = await readMeta(dir);
  stored.push(entry);
  await writeMeta(dir, stored);

  return toUserEntry(entry, URL.createObjectURL(blob));
}

/**
 * Metadata a set-piece carries alongside its tree document: its name, its
 * classification (scenery vs prop) and how many parts it is made of. Its lighting and
 * environment are content of the document, not properties of the entry.
 */
export type SetPieceMeta = {
  label?: string;
  isSetting?: boolean;
  partCount?: number;
};

/**
 * Merge metadata onto a stored entry and mark it modified. A key the caller omits
 * keeps its stored value; a key explicitly set to `undefined` clears it.
 */
function mergeSetPieceMeta(entry: StoredEntry, meta: SetPieceMeta): StoredEntry {
  return {
    ...entry,
    ...(meta.label !== undefined ? { label: meta.label.trim() } : {}),
    ...(meta.isSetting !== undefined ? { isSetting: meta.isSetting } : {}),
    ...(meta.partCount !== undefined ? { partCount: meta.partCount } : {}),
    modifiedAt: Date.now(),
  };
}

/**
 * Overwrite the GLB baked for an existing character entry in place, optionally
 * renaming it. Returns the updated entry, or null if the id is not found.
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

  const filename = stored[idx].filename || `${id}.glb`;
  const fh = await dir.getFileHandle(filename, { create: true });
  const writable = await fh.createWritable();
  await writable.write(blob);
  await writable.close();

  stored[idx] = {
    ...stored[idx],
    filename,
    ...(label !== undefined ? { label: label.trim() } : {}),
  };
  await writeMeta(dir, stored);

  return toUserEntry(stored[idx], URL.createObjectURL(blob));
}

/**
 * Rewrite a set-piece's metadata without touching its document — the Sketcher's
 * rename and reclassify path. Returns the updated entry, or null when the
 * id is unknown or is not a set-piece.
 */
export async function updateSetPieceMeta(
  id: string,
  meta: SetPieceMeta,
): Promise<UserCatalogueEntry | null> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const idx = stored.findIndex((e) => e.id === id);
  if (idx === -1 || stored[idx].kind !== 'set-piece') return null;

  stored[idx] = mergeSetPieceMeta(stored[idx], meta);
  await writeMeta(dir, stored);

  return toUserEntry(stored[idx]);
}

/**
 * Find the catalogue entry backed by the given design id. Used to resume an
 * edit-in-place flow from a character design. Returns null when no entry has
 * been published from that design yet.
 */
export async function findBySourceDesignId(designId: string): Promise<UserCatalogueEntry | null> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const entry = stored.find((e) => e.sourceDesignId === designId);
  if (!entry) return null;
  // Metadata-only (procedural) entries have no GLB file to open.
  if (entry.filename === '') return toUserEntry(entry);
  try {
    const fh = await dir.getFileHandle(entry.filename);
    const file = await fh.getFile();
    return toUserEntry(entry, URL.createObjectURL(file));
  } catch {
    return null;
  }
}

/**
 * Find the catalogue entry whose label matches (case-insensitive). Returns null
 * when no match exists. Used for resume-by-name so repeat generation reuses an
 * entry instead of minting a duplicate.
 */
export async function findByLabel(label: string): Promise<UserCatalogueEntry | null> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const needle = label.trim().toLowerCase();
  const entry = stored.find((e) => e.label.trim().toLowerCase() === needle);
  if (!entry) return null;
  if (entry.filename === '') return toUserEntry(entry);
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

  if (entry.hasDocument) {
    try {
      await dir.removeEntry(documentFileName(id));
    } catch {
      // Document file already gone — continue with metadata cleanup
    }
  }

  await writeMeta(dir, stored.filter((e) => e.id !== id));
}

/**
 * Persist a spec-backed character (no GLB) — ROADMAP_API.md API-2. The entry
 * carries a `CharacterSpec` and is rebuilt procedurally at scene load.
 */
export async function addCharacter(meta: NewSpecCharacter): Promise<UserCatalogueEntry> {
  const id = crypto.randomUUID();
  const addedAt = Date.now();
  const dir = await _getDir();

  const entry: StoredEntry = {
    id,
    filename: '',
    addedAt,
    kind: 'character',
    label: meta.label.trim(),
    spec: meta.spec,
    defaultAnimation: meta.defaultAnimation,
  };

  const stored = await readMeta(dir);
  stored.push(entry);
  await writeMeta(dir, stored);

  return toUserEntry(entry);
}

// ── Editable documents (sketcher-authored sets) ───────────────────────────────

/** Sibling file holding an entry's editable tree document. */
function documentFileName(id: string): string {
  return `${id}.document.json`;
}

const EMPTY_DOCUMENT: SetDocument = { root: [], joints: [] };

/**
 * Create a set-piece entry backed by an editable document (a sketcher-authored set).
 * The document lives in a sibling file; the metadata records `hasDocument` so the
 * list stays small. Pass `isSetting` to mark it as a top-level setting.
 */
export async function createSetPieceDocument(
  label: string,
  opts: {
    document?: SetDocument;
    /** Marks the set as a top-level setting (a venue) rather than a component prop. */
    isSetting?: boolean;
    /** Number of editable primitives, for the catalogue note. */
    partCount?: number;
  } = {},
): Promise<UserCatalogueEntry> {
  const id = crypto.randomUUID();
  const addedAt = Date.now();
  const dir = await _getDir();

  const fh = await dir.getFileHandle(documentFileName(id), { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(opts.document ?? EMPTY_DOCUMENT));
  await writable.close();

  const entry: StoredEntry = {
    id,
    filename: '',
    addedAt,
    modifiedAt: addedAt,
    kind: 'set-piece',
    label: label.trim(),
    hasDocument: true,
    ...(opts.isSetting ? { isSetting: true } : {}),
    ...(opts.partCount !== undefined ? { partCount: opts.partCount } : {}),
  };

  const stored = await readMeta(dir);
  stored.push(entry);
  await writeMeta(dir, stored);

  return toUserEntry(entry);
}

/** Read an entry's editable document, or null when it has none. */
export async function getDocument(id: string): Promise<SetDocument | null> {
  const dir = await _getDir();
  try {
    const fh = await dir.getFileHandle(documentFileName(id));
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as SetDocument;
  } catch {
    return null;
  }
}

/**
 * Write an entry's editable document and, in the same pass, its metadata (name,
 * classification, baseline lighting/environment, part count) — every autosave keeps
 * the entry and its document in lock-step, so nothing about a set needs a separate
 * save or publish step. A set-piece with no document yet becomes editable. Returns
 * the updated entry, or null when the id is unknown or is not a set-piece.
 */
export async function saveDocument(
  id: string,
  document: SetDocument,
  meta: SetPieceMeta = {},
): Promise<UserCatalogueEntry | null> {
  const dir = await _getDir();
  const stored = await readMeta(dir);
  const idx = stored.findIndex((e) => e.id === id);
  if (idx === -1 || stored[idx].kind !== 'set-piece') return null;

  const fh = await dir.getFileHandle(documentFileName(id), { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(document));
  await writable.close();

  stored[idx] = mergeSetPieceMeta({ ...stored[idx], hasDocument: true }, meta);
  await writeMeta(dir, stored);

  return toUserEntry(stored[idx]);
}

