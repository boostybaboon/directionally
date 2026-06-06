import type { BoneParamMap, FaceParams, RobotStyle } from '../character/ProceduralHumanoid.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type CharacterDesign = {
  boneParams: BoneParamMap;
  faceParams: FaceParams;
  style: RobotStyle;
  neckTiltDeg: number;
  insetFactor: number;
};

export type DesignMeta = {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
};

// ── OPFS helpers ──────────────────────────────────────────────────────────────

const DESIGNS_DIR = 'character-designs';
const META_FILE = 'designs-meta.json';

type DirectoryProvider = () => Promise<FileSystemDirectoryHandle>;

const _defaultProvider: DirectoryProvider = async () => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DESIGNS_DIR, { create: true });
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

async function readMeta(dir: FileSystemDirectoryHandle): Promise<DesignMeta[]> {
  try {
    const fh = await dir.getFileHandle(META_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as DesignMeta[];
  } catch {
    return [];
  }
}

async function writeMeta(dir: FileSystemDirectoryHandle, entries: DesignMeta[]): Promise<void> {
  const fh = await dir.getFileHandle(META_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(entries));
  await writable.close();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all saved design metadata, sorted by most recently modified first. */
export async function list(): Promise<DesignMeta[]> {
  const dir = await _getDir();
  const entries = await readMeta(dir);
  return entries.slice().sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Load and return a saved design by id, or null if not found. */
export async function get(id: string): Promise<CharacterDesign | null> {
  const dir = await _getDir();
  try {
    const fh = await dir.getFileHandle(`${id}.json`);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as CharacterDesign;
  } catch {
    return null;
  }
}

/** Create a new named design and persist the initial state. Returns the new metadata. */
export async function create(name: string, design: CharacterDesign): Promise<DesignMeta> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const meta: DesignMeta = { id, name, createdAt: now, modifiedAt: now };

  const dir = await _getDir();

  const fh = await dir.getFileHandle(`${id}.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(design));
  await writable.close();

  const entries = await readMeta(dir);
  entries.push(meta);
  await writeMeta(dir, entries);

  return meta;
}

/** Overwrite the design and update the name and modifiedAt timestamp for an existing entry. */
export async function save(id: string, name: string, design: CharacterDesign): Promise<DesignMeta | null> {
  const dir = await _getDir();
  const entries = await readMeta(dir);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  const fh = await dir.getFileHandle(`${id}.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(design));
  await writable.close();

  entries[idx] = { ...entries[idx], name, modifiedAt: Date.now() };
  await writeMeta(dir, entries);

  return entries[idx];
}

/** Delete a design and its JSON file. No-op if not found. */
export async function remove(id: string): Promise<void> {
  const dir = await _getDir();
  const entries = await readMeta(dir);
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) return;

  try {
    await dir.removeEntry(`${id}.json`);
  } catch {
    // File already gone — continue with metadata cleanup.
  }

  await writeMeta(dir, filtered);
}
