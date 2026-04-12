import type { SketcherDraft } from '../sketcher/types.js';

// ── Public types ──────────────────────────────────────────────────────────────

export type AssemblyMeta = {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
};

// ── OPFS helpers ──────────────────────────────────────────────────────────────

const ASSEMBLIES_DIR = 'sketcher-assemblies';
const META_FILE = 'assemblies-meta.json';

type DirectoryProvider = () => Promise<FileSystemDirectoryHandle>;

const _defaultProvider: DirectoryProvider = async () => {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(ASSEMBLIES_DIR, { create: true });
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

async function readMeta(dir: FileSystemDirectoryHandle): Promise<AssemblyMeta[]> {
  try {
    const fh = await dir.getFileHandle(META_FILE);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as AssemblyMeta[];
  } catch {
    return [];
  }
}

async function writeMeta(dir: FileSystemDirectoryHandle, entries: AssemblyMeta[]): Promise<void> {
  const fh = await dir.getFileHandle(META_FILE, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(entries));
  await writable.close();
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Return all saved assembly metadata, sorted by most recently modified first. */
export async function list(): Promise<AssemblyMeta[]> {
  const dir = await _getDir();
  const entries = await readMeta(dir);
  return entries.slice().sort((a, b) => b.modifiedAt - a.modifiedAt);
}

/** Load and return a saved draft by id, or null if not found. */
export async function get(id: string): Promise<SketcherDraft | null> {
  const dir = await _getDir();
  try {
    const fh = await dir.getFileHandle(`${id}.json`);
    const file = await fh.getFile();
    return JSON.parse(await file.text()) as SketcherDraft;
  } catch {
    return null;
  }
}

/** Create a new named assembly and persist the initial draft. Returns the new metadata. */
export async function create(name: string, draft: SketcherDraft): Promise<AssemblyMeta> {
  const id = crypto.randomUUID();
  const now = Date.now();
  const meta: AssemblyMeta = { id, name, createdAt: now, modifiedAt: now };

  const dir = await _getDir();

  const fh = await dir.getFileHandle(`${id}.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(draft));
  await writable.close();

  const entries = await readMeta(dir);
  entries.push(meta);
  await writeMeta(dir, entries);

  return meta;
}

/** Overwrite the draft and update the name and modifiedAt timestamp for an existing assembly. */
export async function save(id: string, name: string, draft: SketcherDraft): Promise<AssemblyMeta | null> {
  const dir = await _getDir();
  const entries = await readMeta(dir);
  const idx = entries.findIndex((e) => e.id === id);
  if (idx === -1) return null;

  const fh = await dir.getFileHandle(`${id}.json`, { create: true });
  const writable = await fh.createWritable();
  await writable.write(JSON.stringify(draft));
  await writable.close();

  entries[idx] = { ...entries[idx], name, modifiedAt: Date.now() };
  await writeMeta(dir, entries);

  return entries[idx];
}

/** Delete an assembly and its draft file. No-op if not found. */
export async function remove(id: string): Promise<void> {
  const dir = await _getDir();
  const entries = await readMeta(dir);
  const filtered = entries.filter((e) => e.id !== id);
  if (filtered.length === entries.length) return;

  try {
    await dir.removeEntry(`${id}.json`);
  } catch {
    // File already gone — still remove from metadata
  }
  await writeMeta(dir, filtered);
}
