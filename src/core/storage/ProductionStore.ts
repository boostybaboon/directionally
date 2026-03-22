import type { StoredProduction, NamedScene } from './types.js';
import { defaultSceneShell } from './sceneBuilder.js';

/**
 * Persistence service for user productions.
 * All localStorage access is isolated here; callers see only StoredProduction values.
 * Swap the two private helpers to migrate to a server-backed store later.
 */

const STORE_KEY = 'directionally_productions';

/** Migrate legacy flat `scenes[]` field to the `tree` field introduced in UX2.3. */
function migrateProduction(p: StoredProduction & { scenes?: NamedScene[] }): StoredProduction {
  if (p.scenes && !p.tree) {
    const { scenes, ...rest } = p;
    return { ...rest, tree: scenes };
  }
  return p;
}

function loadAll(): StoredProduction[] {
  try {
    const raw: Array<StoredProduction & { scenes?: NamedScene[] }> = JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
    return raw.map(migrateProduction);
  } catch {
    return [];
  }
}

function saveAll(productions: StoredProduction[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(productions));
}

export const ProductionStore = {
  list(): StoredProduction[] {
    return loadAll().sort((a, b) => b.modifiedAt - a.modifiedAt);
  },

  get(id: string): StoredProduction | undefined {
    return loadAll().find((p) => p.id === id);
  },

  /** Upsert: inserts if new, replaces if id already exists. */
  save(production: StoredProduction): void {
    const rest = loadAll().filter((p) => p.id !== production.id);
    saveAll([...rest, production]);
  },

  delete(id: string): void {
    saveAll(loadAll().filter((p) => p.id !== id));
  },

  /** Create a new empty production, persist it, and return it. */
  create(baseName: string = 'Untitled Production'): StoredProduction {
    const existing = this.list().map((p) => p.name);
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
    this.save(production);
    return production;
  },
};
