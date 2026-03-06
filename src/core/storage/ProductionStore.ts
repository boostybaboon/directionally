import type { StoredProduction } from './types.js';

/**
 * Persistence service for user productions.
 * All localStorage access is isolated here; callers see only StoredProduction values.
 * Swap the two private helpers to migrate to a server-backed store later.
 */

const STORE_KEY = 'directionally_productions';

function loadAll(): StoredProduction[] {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY) ?? '[]');
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
  create(name: string): StoredProduction {
    const now = Date.now();
    const production: StoredProduction = {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      modifiedAt: now,
      script: [],
    };
    this.save(production);
    return production;
  },
};
