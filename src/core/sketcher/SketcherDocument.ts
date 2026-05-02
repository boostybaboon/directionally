import type { CartoonSketcher } from './CartoonSketcher.js';
import type { SketcherCommand } from './SketcherCommand.js';
import type { SessionSnapshot, SketcherSession } from './types.js';

type HistoryEntry = {
  before: SessionSnapshot;
  after: SessionSnapshot;
  label: string;
};

/**
 * Wraps a CartoonSketcher session with snapshot-based undo/redo.
 *
 * Each mutation records a { before, after } pair of plain-data SessionSnapshots.
 * Undo/redo call sketcher.restoreSnapshot(), which rebuilds the Three.js scene
 * from the snapshot without requiring inverse command logic. This sidesteps
 * bugs caused by stale object references (e.g. dissolved THREE.Group) and
 * incorrect intermediate transforms during multi-step undo chains.
 *
 * All mutations must flow through execute(). Callers supply an onChange
 * callback to keep reactive UI state (canUndo, canRedo) in sync after
 * each execute / undo / redo call.
 *
 * For drag-based transforms the page captures a priorSnapshot at drag-start
 * and passes it as the second arg to execute() so the before-snapshot is
 * taken before the TC gizmo mutates the object.
 *
 * The stack is in-memory only and does not survive page reload.
 */
export class SketcherDocument {
  private readonly stack: HistoryEntry[] = [];
  /** Index of the most-recently applied entry. -1 = nothing applied. */
  private cursor = -1;

  constructor(
    private readonly sketcher: CartoonSketcher,
    private readonly onChange?: () => void,
  ) {}

  /** Live read-only view of the current session (drives rendering). */
  get current(): SketcherSession {
    return this.sketcher.getSession();
  }

  get canUndo(): boolean { return this.cursor >= 0; }
  get canRedo(): boolean { return this.cursor < this.stack.length - 1; }
  get undoLabel(): string | null { return this.cursor >= 0 ? this.stack[this.cursor].label : null; }
  get redoLabel(): string | null { return this.cursor < this.stack.length - 1 ? this.stack[this.cursor + 1].label : null; }

  /**
   * Snapshot the current session for use as a `priorSnapshot` argument.
   * Call this at drag-start before TransformControls mutates the scene; pass
   * the result to execute() at drag-end.
   */
  captureSnapshot(): SessionSnapshot {
    return this.sketcher.takeSnapshot();
  }

  /**
   * Execute a command and record a history entry.
   *
   * @param cmd - The command to execute.
   * @param priorSnapshot - If provided, used as the `before` snapshot instead of
   *   capturing one immediately before execute(). Pass a snapshot captured at
   *   drag-start so the pre-drag state is preserved for undo even through
   *   transform-in-progress mutations.
   */
  execute(cmd: SketcherCommand, priorSnapshot?: SessionSnapshot): void {
    const before = priorSnapshot ?? this.sketcher.takeSnapshot();
    cmd.execute();
    const after = this.sketcher.takeSnapshot();
    // Discard any redo branch above the current position.
    this.stack.splice(this.cursor + 1);
    this.stack.push({ before, after, label: cmd.label });
    this.cursor++;
    this.onChange?.();
  }

  undo(): void {
    if (!this.canUndo) return;
    this.sketcher.restoreSnapshot(this.stack[this.cursor].before);
    this.cursor--;
    this.onChange?.();
  }

  redo(): void {
    if (!this.canRedo) return;
    this.cursor++;
    this.sketcher.restoreSnapshot(this.stack[this.cursor].after);
    this.onChange?.();
  }

  /**
   * Record a history entry for a mutation that already happened outside of
   * execute() (e.g. extrusion commit driven by pointer events).
   */
  record(before: SessionSnapshot, after: SessionSnapshot, label: string): void {
    this.stack.splice(this.cursor + 1);
    this.stack.push({ before, after, label });
    this.cursor++;
    this.onChange?.();
  }

  /**
   * Replace the `after` snapshot of the most-recent history entry without
   * pushing a new one. Used by the inspector spinner to merge all auto-repeat
   * steps into a single undoable operation.
   */
  amendLastEntry(after: SessionSnapshot): void {
    if (this.cursor >= 0) {
      this.stack[this.cursor].after = after;
      this.onChange?.();
    }
  }

  /** Reset the history stack. Call when clearing the entire session. */
  clearStack(): void {
    this.stack.length = 0;
    this.cursor = -1;
  }
}

