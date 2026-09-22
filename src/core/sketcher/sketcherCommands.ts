import * as THREE from 'three';
import type { CartoonSketcher } from './CartoonSketcher.js';
import type { SketcherPart } from './types.js';
import type { SketcherCommand } from './SketcherCommand.js';
import type { NodeRef } from './documentTree.js';

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

// ── ChangePartLabelCommand ────────────────────────────────────────────────────

export class ChangePartLabelCommand implements SketcherCommand {
  readonly label = 'Rename part';

  constructor(
    private readonly partId: string,
    private readonly newLabel: string | undefined,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.setPartLabel(this.partId, this.newLabel);
  }
}

// ── RenameGroupCommand ────────────────────────────────────────────────────────

export class RenameGroupCommand implements SketcherCommand {
  readonly label = 'Rename group';

  constructor(
    private readonly groupId: string,
    private readonly newName: string | undefined,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.setGroupName(this.groupId, this.newName);
  }
}

// ── TransformPartCommand ──────────────────────────────────────────────────────

/**
 * Records a transform mutation applied by the TransformControls gizmo.
 *
 * The TC gizmo applies the transform to the Three.js object directly, before
 * this command is constructed. execute() only needs to replay attach joints so
 * attached partners stay flush. The actual undo/redo of the transform is handled
 * by SketcherDocument restoring the before/after SetSnapshot (which uses
 * world-space transforms and is immune to stale object references).
 *
 * mode 'group': the whole group moved — pass all group member ids so intra-group
 * joints are pre-visited and only external connections fire.
 * mode 'member': only the edited member moved — pass just its id so the BFS
 * democratically re-snaps all joint neighbours.
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
    private readonly mode: 'group' | 'member' = 'group',
  ) {}

  execute(): void {
    if (!this.movedPartId) return;
    const session = this.sketcher.getSession();
    const part = session.parts.find((p) => p.id === this.movedPartId);
    if (!part) return;
    const ag = this.sketcher.attachManager.groupForPart(this.movedPartId);
    // group: whole assembly moved — seed BFS with all members so intra-group joints are skipped.
    // member: only this part moved — BFS propagates to all joint neighbours.
    const movedIds = this.mode === 'member' ? [part.id] : (ag ? ag.partIds : [part.id]);
    this.sketcher.attachManager.resolveConstraints(movedIds, session.parts);
  }
}

// ── CommitAttachCommand ─────────────────────────────────────────────────────────────

export class CommitAttachCommand implements SketcherCommand {
  readonly label = 'Attach';

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
    this.sketcher.commitAttach(
      this.partA, this.localPointA, this.localNormalA,
      this.partB, this.localPointB, this.localNormalB,
    );
  }
}

// ── DetachAllCommand ──────────────────────────────────────────────────────────────

export class DetachAllCommand implements SketcherCommand {
  readonly label = 'Detach';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.detachAll(this.partId);
  }
}


// ── SnapToFloorCommand ────────────────────────────────────────────────────────

export class SnapToFloorCommand implements SketcherCommand {
  readonly label = 'Snap to floor';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
    private readonly mode: 'group' | 'member' = 'group',
  ) {}

  execute(): void {
    this.sketcher.snapToFloor(this.partId, this.mode);
  }
}

// ── GroupCommand ───────────────────────────────────────────────────────────────────

export class GroupCommand implements SketcherCommand {
  readonly label = 'Group';

  constructor(
    private readonly partIds: string[],
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.group(this.partIds);
  }
}

// ── GroupNodesCommand ───────────────────────────────────────────────────────────────

/**
 * Group nodes as one arrangement, without bonding them: the pass that takes any node by reference,
 * including an instance, which has no mesh of its own to join a rigid unit with.
 */
export class GroupNodesCommand implements SketcherCommand {
  readonly label = 'Group nodes';

  constructor(
    private readonly refs: NodeRef[],
    private readonly sketcher: CartoonSketcher,
    private readonly name?: string,
  ) {}

  execute(): void {
    this.sketcher.groupPure(this.refs, this.name);
  }
}

// ── UngroupCommand ──────────────────────────────────────────────────────────────────

export class UngroupCommand implements SketcherCommand {
  readonly label = 'Ungroup';

  constructor(
    private readonly partId: string,
    private readonly sketcher: CartoonSketcher,
  ) {}

  execute(): void {
    this.sketcher.ungroup(this.partId);
  }
}

// ── OverrideCommand ───────────────────────────────────────────────────────────

/** What a user did inside an instance; each maps to one override the node then carries. */
export type OverrideAction = 'transform' | 'hide' | 'show' | 'remove' | 'revert';

const OVERRIDE_LABELS: Record<OverrideAction, string> = {
  transform: 'Vary instance',
  hide: 'Hide in instance',
  show: 'Show in instance',
  remove: 'Remove from instance',
  revert: 'Revert variation',
};

/**
 * Vary one node of an instance's Definition, or take the variation back. The override lives on the
 * instance's node in the document, so the snapshot pair around the command is what undo restores.
 *
 * A drag reads the live transform at execute() time: the gizmo moves the expansion's object, and the
 * document never saw it.
 */
export class OverrideCommand implements SketcherCommand {
  readonly label: string;

  constructor(
    private readonly sketcher: CartoonSketcher,
    private readonly instancePath: string,
    private readonly nodePath: string,
    private readonly action: OverrideAction,
  ) {
    this.label = OVERRIDE_LABELS[action];
  }

  execute(): void {
    switch (this.action) {
      case 'transform': {
        const transform = this.sketcher.descendantTransform(this.instancePath, this.nodePath);
        if (transform) this.sketcher.setDescendantOverride(this.instancePath, this.nodePath, { transform });
        return;
      }
      case 'hide':
        this.sketcher.setDescendantOverride(this.instancePath, this.nodePath, { hidden: true });
        return;
      case 'show':
        this.sketcher.setDescendantOverride(this.instancePath, this.nodePath, { hidden: false });
        return;
      case 'remove':
        this.sketcher.removeDescendant(this.instancePath, this.nodePath);
        return;
      case 'revert':
        this.sketcher.revertOverride(this.instancePath, this.nodePath);
        return;
    }
  }
}

// ── Transform snapshot helpers ────────────────────────────────────────────────

// (end of file)
