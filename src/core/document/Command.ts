import type { StoredProduction } from '../storage/types.js';

/**
 * A named, pure transformation on a production document.
 * ProductionDocument.execute() applies the command, captures a snapshot
 * before and after for undo/redo, and persists the result.
 *
 * Commands do not implement their own inverse — undo is handled by the
 * snapshot history in ProductionDocument.
 */
export interface Command {
  /** Produce the next document state. Must not mutate the input. */
  execute(doc: StoredProduction): StoredProduction;
  /** Human-readable description shown in the history log. */
  readonly label: string;
}
