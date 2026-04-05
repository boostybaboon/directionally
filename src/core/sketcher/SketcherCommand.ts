/**
 * A named mutation on the sketcher session.
 * SketcherDocument.execute() captures a before/after SessionSnapshot around
 * each command and uses those snapshots for undo/redo — no inverse logic
 * is required here. Commands only need to perform the forward operation.
 */
export interface SketcherCommand {
  /** Human-readable description, e.g. shown in a future history panel. */
  readonly label: string;

  /**
   * Apply the mutation. Called exactly once at initial execution.
   * Undo and redo are handled by SketcherDocument via snapshot restoration.
   */
  execute(): void;
}
