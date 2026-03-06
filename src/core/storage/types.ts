import type { ScriptLine } from '../../lib/sandbox/types.js';

/**
 * A named production document stored persistently.
 * In Phase 1 the content is a flat ScriptLine[] (the sandbox script).
 * Full scene graph serialisation is added in Phase 4.
 */
export type StoredProduction = {
  /** Globally unique identifier (crypto.randomUUID). */
  id: string;
  name: string;
  createdAt: number;  // unix ms
  modifiedAt: number; // unix ms
  script: ScriptLine[];
};
