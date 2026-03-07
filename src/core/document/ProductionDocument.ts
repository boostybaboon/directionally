import type { Command } from './Command.js';
import type { StoredProduction } from '../storage/types.js';

type HistoryEntry = {
  snapshot: StoredProduction;
  label: string;
};

/**
 * Wraps a production document with snapshot-based undo/redo and a
 * named-command execution interface.
 *
 * All mutations must go through execute(). The UI subscribes via onChange;
 * the persistence layer is injected as save() so the class is testable
 * without a real localStorage backend.
 *
 * The undo stack is in-memory only — it does not survive page reload.
 * Every executed command persists its result immediately via save(), so
 * the user always gets a coherent document back after reload.
 */
export class ProductionDocument {
  /** Completed entries: snapshot is the state *after* the command ran. */
  private readonly stack: HistoryEntry[] = [];
  /**
   * Index of the current position in the stack.
   * -1 means we are at the initial state (no commands executed yet,
   * or all commands have been undone).
   */
  private cursor = -1;

  private readonly initial: StoredProduction;
  private readonly onChange: (doc: StoredProduction) => void;
  private readonly save: (doc: StoredProduction) => void;

  constructor(
    initial: StoredProduction,
    onChange: (doc: StoredProduction) => void,
    save: (doc: StoredProduction) => void,
  ) {
    this.initial = initial;
    this.onChange = onChange;
    this.save = save;
  }

  /** The document at the current history position. */
  get current(): StoredProduction {
    return this.cursor === -1 ? this.initial : this.stack[this.cursor].snapshot;
  }

  get canUndo(): boolean { return this.cursor >= 0; }
  get canRedo(): boolean { return this.cursor < this.stack.length - 1; }

  /** Labels of all applied commands in order (up to cursor). */
  get history(): string[] {
    return this.stack.slice(0, this.cursor + 1).map((e) => e.label);
  }

  execute(cmd: Command): void {
    const next = cmd.execute(this.current);
    // Discard any redo branch above the cursor.
    this.stack.splice(this.cursor + 1);
    this.stack.push({ snapshot: next, label: cmd.label });
    this.cursor++;
    this.save(next);
    this.onChange(next);
  }

  undo(): void {
    if (!this.canUndo) return;
    this.cursor--;
    const restored = this.current;
    this.save(restored);
    this.onChange(restored);
  }

  redo(): void {
    if (!this.canRedo) return;
    this.cursor++;
    const restored = this.current;
    this.save(restored);
    this.onChange(restored);
  }
}
