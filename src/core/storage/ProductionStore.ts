import type { StoredProduction, NamedScene } from './types.js';

/**
 * Persistence service for user productions.
 * Backed by IndexedDB with a synchronous in-memory cache so reads are instant.
 * Writes update the cache immediately then persist to IndexedDB asynchronously —
 * callers that read list() after save() always see the correct state.
 *
 * Call init() once at app startup before any other method.
 * To migrate to a server-backed store: replace the idb* helpers and init().
 */

const DB_NAME = 'directionally';
const STORE_NAME = 'productions';
const DB_VERSION = 1;
const LS_MIGRATE_KEY = 'directionally_productions';

/** Migrate legacy flat `scenes[]` field to the `tree` field introduced in UX2.3. */
function migrateProduction(p: StoredProduction & { scenes?: NamedScene[] }): StoredProduction {
  if (p.scenes && !p.tree) {
    const { scenes, ...rest } = p;
    return { ...rest, tree: scenes };
  }
  return p;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db: IDBDatabase, production: StoredProduction): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(production);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbDelete(db: IDBDatabase, id: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

function idbGetAll(db: IDBDatabase): Promise<StoredProduction[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result as StoredProduction[]);
    req.onerror = () => reject(req.error);
  });
}

let _db: IDBDatabase | null = null;
let _cache: StoredProduction[] = [];

export const ProductionStore = {
  /**
   * Opens the IndexedDB database and populates the in-memory cache.
   * One-way migration: existing localStorage productions are imported then removed.
   */
  async init(): Promise<void> {
    _db = await openDB();

    const lsRaw = localStorage.getItem(LS_MIGRATE_KEY);
    if (lsRaw) {
      try {
        const legacy: Array<StoredProduction & { scenes?: NamedScene[] }> = JSON.parse(lsRaw);
        for (const p of legacy) {
          await idbPut(_db, migrateProduction(p));
        }
      } catch {
        // Corrupt localStorage data — skip migration silently.
      }
      localStorage.removeItem(LS_MIGRATE_KEY);
    }

    const all = await idbGetAll(_db);
    _cache = all.map(migrateProduction);
  },

  /** Returns all productions sorted by most-recently modified. Synchronous — reads from cache. */
  list(): StoredProduction[] {
    return [..._cache].sort((a, b) => b.modifiedAt - a.modifiedAt);
  },

  /** Returns a single production by id. Synchronous — reads from cache. */
  get(id: string): StoredProduction | undefined {
    return _cache.find((p) => p.id === id);
  },

  /** Upsert — updates the cache synchronously then persists to IndexedDB. */
  async save(production: StoredProduction): Promise<void> {
    const i = _cache.findIndex((p) => p.id === production.id);
    if (i >= 0) _cache[i] = production; else _cache.push(production);
    if (_db) await idbPut(_db, production);
  },

  async delete(id: string): Promise<void> {
    _cache = _cache.filter((p) => p.id !== id);
    if (_db) await idbDelete(_db, id);
  },

  /** Creates a new empty production, persists it, and returns it. */
  async create(baseName: string = 'Untitled Production'): Promise<StoredProduction> {
    const existing = _cache.map((p) => p.name);
    let name = baseName;
    let n = 2;
    while (existing.includes(name)) { name = `${baseName} ${n++}`; }
    const now = Date.now();
    const production: StoredProduction = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      modifiedAt: now,
      actors: [],
      tree: [],
      activeSceneId: undefined,
      script: [],
    };
    _cache.push(production);
    if (_db) await idbPut(_db, production);
    return production;
  },
};
