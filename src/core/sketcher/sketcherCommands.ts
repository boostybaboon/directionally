import * as THREE from 'three';
import type { CartoonSketcher } from './CartoonSketcher.js';
import type { SketcherPart } from './types.js';
import type { SketcherCommand } from './SketcherCommand.js';

// ── InsertPartCommand ─────────────────────────────────────────────────────────

export class InsertPartCommand implements SketcherCommand {
  readonly label: string;
  private part: SketcherPart | null = null;

  constructor(
    private readonly kind: string,
    private readonly sketcher: CartoonSketcher,
  ) {
    this.label = `Insert ${kind}`;
  }

  execute(): void {
    this.part = this.sketcher.insertPrimitive(this.kind);
  }

  /** The created part, available after execute() for auto-selection. */
  get insertedPart(): SketcherPart | null { return this.part; }
}

// ── DuplicatePartCommand ──────────────────────────────────────────────────────

export class DuplicatePartCommand implements SketcherCommand {
  readonly label = 'Duplicate';
  private clone: SketcherPart | null = null;

  constructor(
    private readonly sourceId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.clone = this.sketcher.duplicatePart(this.sourceId);
  }

  /** The duplicated part, available after execute() for auto-selection. */
  get clonedPart(): SketcherPart | null { return this.clone; }
}

// ── DeletePartCommand ─────────────────────────────────────────────────────────

export class DeletePartCommand implements SketcherCommand {
  readonly label = 'Delete part';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.removePart(this.partId);
  }
}

// ── ChangeColorCommand ────────────────────────────────────────────────────────

export class ChangeColorCommand implements SketcherCommand {
  readonly label = 'Change color';

  constructor(
    private readonly partId: string,
    private readonly newColor: number,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.setPartColor(this.partId, this.newColor);
  }
}

// ── ChangeFaceColorCommand ────────────────────────────────────────────────────

export class ChangeFaceColorCommand implements SketcherCommand {
  readonly label = 'Change face color';

  constructor(
    private readonly partId: string,
    private readonly materialIndex: number,
    private readonly newColor: number,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.setFaceColor(this.partId, this.materialIndex, this.newColor);
  }
}

// ── ApplyTextureCommand ───────────────────────────────────────────────────────

export class ApplyTextureCommand implements SketcherCommand {
  readonly label = 'Apply texture';

  constructor(
    private readonly partId: string,
    private readonly materialIndex: number,
    private readonly dataUrl: string | null,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.setFaceTexture(this.partId, this.materialIndex, this.dataUrl);
  }
}

// ── TransformPartCommand ──────────────────────────────────────────────────────

/**
 * Records a transform mutation applied by the TransformControls gizmo.
 *
 * The TC gizmo applies the transform to the Three.js object directly, before
 * this command is constructed. execute() only needs to replay glue joints so
 * glued partners stay flush. The actual undo/redo of the transform is handled
 * by SketcherDocument restoring the before/after SessionSnapshot (which uses
 * world-space transforms and is immune to stale object references).
 *
 * Usage in the page:
 *   1. Capture priorSnapshot = sketcherDoc.captureSnapshot() at drag start.
 *   2. At drag end: sketcherDoc.execute(new TransformPartCommand(...), priorSnapshot).
 */
export class TransformPartCommand implements SketcherCommand {
  readonly label = 'Transform';

  constructor(
    private readonly sketcher: CartoonSketcher,
    private readonly movedPartId: string | null,
  ) {}

  execute(): void {
    if (!this.movedPartId) return;
    const session = this.sketcher.getSession();
    const part = session.parts.find((p) => p.id === this.movedPartId);
    if (part) this.sketcher.glueManager.replayJoints(part, session.parts);
  }
}

// ── CommitGlueCommand ─────────────────────────────────────────────────────────

export class CommitGlueCommand implements SketcherCommand {
  readonly label = 'Glue';

  constructor(
    private readonly sketcher: CartoonSketcher,
    private readonly partA: SketcherPart,
    private readonly localPointA: THREE.Vector3,
    private readonly localNormalA: THREE.Vector3,
    private readonly partB: SketcherPart,
    private readonly localPointB: THREE.Vector3,
    private readonly localNormalB: THREE.Vector3,
  ) {}

  execute(): void {
    this.sketcher.glueManager.commitGlue(
      this.partA, this.localPointA, this.localNormalA,
      this.partB, this.localPointB, this.localNormalB,
    );
  }
}

// ── UnglueAllCommand ──────────────────────────────────────────────────────────

export class UnglueAllCommand implements SketcherCommand {
  readonly label = 'Unglue';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.glueManager.unglueAll(this.partId, this.sketcher.getSession().parts);
  }
}


// ── SnapToFloorCommand ────────────────────────────────────────────────────────

export class SnapToFloorCommand implements SketcherCommand {
  readonly label = 'Snap to floor';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.snapToFloor(this.partId);
  }
}

// ── WeldCommand ───────────────────────────────────────────────────────────────

export class WeldCommand implements SketcherCommand {
  readonly label = 'Weld';

  constructor(
    private readonly partIds: string[],
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.weld(this.partIds);
  }
}

// ── UnweldCommand ─────────────────────────────────────────────────────────────

export class UnweldCommand implements SketcherCommand {
  readonly label = 'Unweld';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.unweld(this.partId);
  }
}

// ── Transform snapshot helpers ────────────────────────────────────────────────

// (end of file)
