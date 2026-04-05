import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { SketcherDocument } from './SketcherDocument.js';
import { CartoonSketcher } from './CartoonSketcher.js';
import {
  InsertPartCommand,
  DuplicatePartCommand,
  DeletePartCommand,
  ChangeColorCommand,
  TransformPartCommand,
  CommitGlueCommand,
  UnglueAllCommand,
} from './sketcherCommands.js';
import type { SketcherCommand } from './SketcherCommand.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeSketcher() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera();
  return { scene, sketcher: new CartoonSketcher(scene, camera) };
}

function makeDoc(sketcher: CartoonSketcher) {
  const onChange = vi.fn();
  const doc = new SketcherDocument(sketcher, onChange);
  return { doc, onChange };
}

/** Minimal stub command for testing SketcherDocument isolation. */
function makeStubCmd(label = 'Stub'): SketcherCommand & { executeCalls: number } {
  let executeCalls = 0;
  return {
    label,
    execute() { executeCalls++; },
    get executeCalls() { return executeCalls; },
  };
}

function glueAB(sketcher: CartoonSketcher, pA: NonNullable<ReturnType<CartoonSketcher['insertPrimitive']>>, pB: NonNullable<ReturnType<CartoonSketcher['insertPrimitive']>>) {
  return sketcher.glueManager.commitGlue(
    pA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
    pB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
  );
}

// ── SketcherDocument (document-level) ────────────────────────────────────────

describe('SketcherDocument', () => {
  it('starts with canUndo=false and canRedo=false', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    expect(doc.canUndo).toBe(false);
    expect(doc.canRedo).toBe(false);
  });

  it('execute() calls cmd.execute() and sets canUndo=true', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const cmd = makeStubCmd();
    doc.execute(cmd);
    expect(cmd.executeCalls).toBe(1);
    expect(doc.canUndo).toBe(true);
    expect(doc.canRedo).toBe(false);
  });

  it('execute() fires onChange', () => {
    const { sketcher } = makeSketcher();
    const { doc, onChange } = makeDoc(sketcher);
    doc.execute(makeStubCmd());
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('undo() restores the before-snapshot and fires onChange', () => {
    const { sketcher } = makeSketcher();
    const { doc, onChange } = makeDoc(sketcher);
    doc.execute(new InsertPartCommand('box', sketcher));
    expect(sketcher.getSession().parts).toHaveLength(1);
    onChange.mockClear();
    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(0);
    expect(doc.canUndo).toBe(false);
    expect(doc.canRedo).toBe(true);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('redo() restores the after-snapshot and fires onChange', () => {
    const { sketcher } = makeSketcher();
    const { doc, onChange } = makeDoc(sketcher);
    doc.execute(new InsertPartCommand('box', sketcher));
    doc.undo();
    onChange.mockClear();
    doc.redo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(doc.canRedo).toBe(false);
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('undo() while canUndo=false is a no-op', () => {
    const { sketcher } = makeSketcher();
    const { doc, onChange } = makeDoc(sketcher);
    doc.undo();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('redo() while canRedo=false is a no-op', () => {
    const { sketcher } = makeSketcher();
    const { doc, onChange } = makeDoc(sketcher);
    doc.redo();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('execute() after undo discards the redo branch', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    doc.execute(new InsertPartCommand('box', sketcher));
    doc.execute(new InsertPartCommand('box', sketcher));
    doc.undo();
    doc.execute(new InsertPartCommand('sphere', sketcher));
    expect(doc.canRedo).toBe(false);
    doc.undo();
    doc.undo();
    expect(doc.canUndo).toBe(false);
  });

  it('clearStack() resets canUndo and canRedo', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    doc.execute(new InsertPartCommand('box', sketcher));
    doc.clearStack();
    expect(doc.canUndo).toBe(false);
    expect(doc.canRedo).toBe(false);
  });

  it('captureSnapshot() returns the current session as plain data', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    sketcher.insertPrimitive('box');
    const snap = doc.captureSnapshot();
    expect(snap.parts).toHaveLength(1);
    expect(snap.joints).toHaveLength(0);
  });

  it('record() creates an undoable entry for an already-committed mutation', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const before = doc.captureSnapshot();
    sketcher.insertPrimitive('box');
    const after = doc.captureSnapshot();
    doc.record(before, after, 'Commit sketch');
    expect(doc.canUndo).toBe(true);
    expect(sketcher.getSession().parts).toHaveLength(1);
    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(0);
    expect(doc.canUndo).toBe(false);
    doc.redo();
    expect(sketcher.getSession().parts).toHaveLength(1);
  });

  it('execute() with priorSnapshot uses it as the before-state', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    const priorSnap = doc.captureSnapshot();
    // Simulate TC moving the part before execute() is called.
    part.mesh.position.set(7, 0, 0);
    part.mesh.updateWorldMatrix(false, true);
    doc.execute(new TransformPartCommand(sketcher, part.id), priorSnap);
    // After execute: part is at (7,0,0)
    expect(sketcher.getSession().parts[0].mesh.position.x).toBeCloseTo(7, 4);
    // Undo should restore the before-snapshot where part was at (0,0,0).
    doc.undo();
    expect(sketcher.getSession().parts[0].mesh.position.x).toBeCloseTo(0, 4);
  });
});

// ── InsertPartCommand ─────────────────────────────────────────────────────────

describe('InsertPartCommand', () => {
  it('execute() adds a part to the session', () => {
    const { sketcher } = makeSketcher();
    const cmd = new InsertPartCommand('box', sketcher);
    cmd.execute();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(cmd.insertedPart).not.toBeNull();
  });

  it('doc.undo() removes the inserted part', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    doc.execute(new InsertPartCommand('box', sketcher));
    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(0);
  });

  it('doc.redo() re-inserts the part with the same id', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const cmd = new InsertPartCommand('box', sketcher);
    doc.execute(cmd);
    const partId = cmd.insertedPart!.id;
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(partId);
  });

  it('insertedPart label matches the primitive kind', () => {
    const { sketcher } = makeSketcher();
    const cmd = new InsertPartCommand('cylinder', sketcher);
    cmd.execute();
    expect(cmd.insertedPart?.name).toBe('Cylinder');
  });
});

// ── DuplicatePartCommand ──────────────────────────────────────────────────────

describe('DuplicatePartCommand', () => {
  it('execute() adds a second part', () => {
    const { sketcher } = makeSketcher();
    const original = sketcher.insertPrimitive('box')!;
    const cmd = new DuplicatePartCommand(original.id, sketcher);
    cmd.execute();
    expect(sketcher.getSession().parts).toHaveLength(2);
    expect(cmd.clonedPart?.id).not.toBe(original.id);
  });

  it('doc.undo() removes the clone', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const original = sketcher.insertPrimitive('box')!;
    doc.execute(new DuplicatePartCommand(original.id, sketcher));
    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(original.id);
  });

  it('doc.redo() re-adds the same clone', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const original = sketcher.insertPrimitive('box')!;
    const cmd = new DuplicatePartCommand(original.id, sketcher);
    doc.execute(cmd);
    const cloneId = cmd.clonedPart!.id;
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().parts).toHaveLength(2);
    expect(sketcher.getSession().parts.map((p) => p.id)).toContain(cloneId);
  });
});

// ── DeletePartCommand ─────────────────────────────────────────────────────────

describe('DeletePartCommand', () => {
  it('execute() removes the part', () => {
    const { sketcher } = makeSketcher();
    const part = sketcher.insertPrimitive('box')!;
    const cmd = new DeletePartCommand(part.id, sketcher);
    cmd.execute();
    expect(sketcher.getSession().parts).toHaveLength(0);
  });

  it('doc.undo() restores the part', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    const id = part.id;
    doc.execute(new DeletePartCommand(id, sketcher));
    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(id);
  });

  it('doc.redo() removes the part again', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    doc.execute(new DeletePartCommand(part.id, sketcher));
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().parts).toHaveLength(0);
  });

  it('doc.undo() restores joints that existed before deletion', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(3, 0, 0);
    pB.mesh.updateMatrixWorld(true);
    glueAB(sketcher, pA, pB);
    expect(sketcher.getSession().joints).toHaveLength(1);

    doc.execute(new DeletePartCommand(pB.id, sketcher));
    expect(sketcher.getSession().joints).toHaveLength(0);

    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(2);
    // Joint is restored because the snapshot captured it before deletion.
    expect(sketcher.getSession().joints).toHaveLength(1);
  });
});

// ── ChangeColorCommand ────────────────────────────────────────────────────────

describe('ChangeColorCommand', () => {
  it('execute() changes the part colour', () => {
    const { sketcher } = makeSketcher();
    const part = sketcher.insertPrimitive('box')!;
    const original = part.color;
    const cmd = new ChangeColorCommand(part.id, 0xff0000, sketcher);
    cmd.execute();
    expect(sketcher.getSession().parts[0].color).toBe(0xff0000);
    expect(sketcher.getSession().parts[0].color).not.toBe(original);
  });

  it('doc.undo() restores the original colour', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    const original = part.color;
    doc.execute(new ChangeColorCommand(part.id, 0xff0000, sketcher));
    doc.undo();
    expect(sketcher.getSession().parts[0].color).toBe(original);
  });

  it('doc.redo() re-applies the new colour', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    doc.execute(new ChangeColorCommand(part.id, 0xff0000, sketcher));
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().parts[0].color).toBe(0xff0000);
  });
});

// ── TransformPartCommand ──────────────────────────────────────────────────────

describe('TransformPartCommand', () => {
  it('doc.undo() restores the pre-drag world position (priorSnapshot pattern)', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    const initialX = part.mesh.position.x;
    const initialY = part.mesh.position.y;
    const priorSnap = doc.captureSnapshot();
    part.mesh.position.set(5, 5, 5);
    part.mesh.updateWorldMatrix(false, true);
    doc.execute(new TransformPartCommand(sketcher, part.id), priorSnap);
    expect(sketcher.getSession().parts[0].mesh.position.x).toBeCloseTo(5, 4);
    doc.undo();
    expect(sketcher.getSession().parts[0].mesh.position.x).toBeCloseTo(initialX, 4);
    expect(sketcher.getSession().parts[0].mesh.position.y).toBeCloseTo(initialY, 4);
  });

  it('doc.redo() re-applies the post-drag position', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const part = sketcher.insertPrimitive('box')!;
    const priorSnap = doc.captureSnapshot();
    part.mesh.position.set(5, 5, 5);
    part.mesh.updateWorldMatrix(false, true);
    doc.execute(new TransformPartCommand(sketcher, part.id), priorSnap);
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().parts[0].mesh.position.x).toBeCloseTo(5, 4);
  });
});

// ── CommitGlueCommand ─────────────────────────────────────────────────────────

describe('CommitGlueCommand', () => {
  let scene: THREE.Scene;
  let sketcher: CartoonSketcher;
  let pA: ReturnType<CartoonSketcher['insertPrimitive']>;
  let pB: ReturnType<CartoonSketcher['insertPrimitive']>;

  beforeEach(() => {
    ({ scene, sketcher } = makeSketcher());
    pA = sketcher.insertPrimitive('box')!;
    pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(5, 0, 0);
    pB.mesh.updateMatrixWorld(true);
  });

  it('execute() records a joint and forms a group', () => {
    const cmd = new CommitGlueCommand(
      sketcher,
      pA!, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pB!, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    );
    cmd.execute();
    expect(sketcher.getSession().joints).toHaveLength(1);
    expect(sketcher.getSession().assemblyGroups).toHaveLength(1);
  });

  it('doc.undo() removes the joint and dissolves the group', () => {
    const { doc } = makeDoc(sketcher);
    doc.execute(new CommitGlueCommand(
      sketcher,
      pA!, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pB!, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    ));
    doc.undo();
    expect(sketcher.getSession().joints).toHaveLength(0);
    expect(sketcher.getSession().assemblyGroups).toHaveLength(0);
  });

  it('doc.redo() re-establishes the joint', () => {
    const { doc } = makeDoc(sketcher);
    doc.execute(new CommitGlueCommand(
      sketcher,
      pA!, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pB!, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    ));
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().joints).toHaveLength(1);
    expect(sketcher.getSession().assemblyGroups).toHaveLength(1);
  });
});

// ── UnglueAllCommand ──────────────────────────────────────────────────────────

describe('UnglueAllCommand', () => {
  it('execute() removes all joints for the part', () => {
    const { sketcher } = makeSketcher();
    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(3, 0, 0);
    pB.mesh.updateMatrixWorld(true);
    glueAB(sketcher, pA, pB);
    const cmd = new UnglueAllCommand(pA.id, sketcher);
    cmd.execute();
    expect(sketcher.getSession().joints).toHaveLength(0);
    expect(sketcher.getSession().assemblyGroups).toHaveLength(0);
  });

  it('doc.undo() re-registers the saved joints', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(3, 0, 0);
    pB.mesh.updateMatrixWorld(true);
    glueAB(sketcher, pA, pB);
    doc.execute(new UnglueAllCommand(pA.id, sketcher));
    doc.undo();
    expect(sketcher.getSession().joints).toHaveLength(1);
    expect(sketcher.getSession().assemblyGroups).toHaveLength(1);
  });

  it('doc.redo() removes the joints again', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);
    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(3, 0, 0);
    pB.mesh.updateMatrixWorld(true);
    glueAB(sketcher, pA, pB);
    doc.execute(new UnglueAllCommand(pA.id, sketcher));
    doc.undo();
    doc.redo();
    expect(sketcher.getSession().joints).toHaveLength(0);
  });
});

// ── Integration: undo/redo glue chains ───────────────────────────────────────

describe('undo/redo glue integration', () => {
  /**
   * Regression: after undoing CommitGlue(A-B), B used to vanish because
   * scene.attach(B.mesh) during group BFS-split accumulated incorrect world
   * transforms. With snapshot-based undo, B's world position is restored from
   * the plain-data snapshot taken before the glue was committed.
   */
  it('undo of CommitGlue restores B to its pre-glue world position', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);

    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(4, 0, 0);
    pB.mesh.updateWorldMatrix(false, true);

    const bxBefore = pB.mesh.position.x;

    doc.execute(new CommitGlueCommand(
      sketcher,
      pA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    ));

    doc.undo();

    const bPart = sketcher.getSession().parts.find((p) => p.id === pB.id)!;
    expect(bPart).toBeDefined();
    bPart.mesh.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    bPart.mesh.matrixWorld.decompose(pos, new THREE.Quaternion(), new THREE.Vector3());
    expect(pos.x).toBeCloseTo(bxBefore, 3);
  });

  /**
   * Regression: undo CommitGlue(A-B) from an A-B-C chain used to leave B
   * at a garbage world position, or entirely absent from the scene.
   */
  it('undoing A-B glue from A-B-C chain leaves B at correct world position', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);

    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    const pC = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(4, 0, 0);
    pB.mesh.updateWorldMatrix(false, true);
    pC.mesh.position.set(8, 0, 0);
    pC.mesh.updateWorldMatrix(false, true);

    // Glue B onto A
    doc.execute(new CommitGlueCommand(
      sketcher,
      pA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    ));

    // Record B's world position after A-B is glued
    const bPos = new THREE.Vector3();
    pB.mesh.updateWorldMatrix(true, false);
    pB.mesh.matrixWorld.decompose(bPos, new THREE.Quaternion(), new THREE.Vector3());
    const bxAfterAB = bPos.x;

    // Glue C onto B
    doc.execute(new CommitGlueCommand(
      sketcher,
      pB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    ));

    // Now undo twice (undo C-B, then undo A-B)
    doc.undo(); // undo C-B
    doc.undo(); // undo A-B

    const bPart = sketcher.getSession().parts.find((p) => p.id === pB.id)!;
    expect(bPart).toBeDefined();
    bPart.mesh.updateWorldMatrix(true, false);
    const restored = new THREE.Vector3();
    bPart.mesh.matrixWorld.decompose(restored, new THREE.Quaternion(), new THREE.Vector3());
    // B should be at its original standalone position (before any glue).
    expect(restored.x).toBeCloseTo(4, 3);
  });

  /**
   * Regression: redo after (insert A, insert B, glue B→A, move group, undo, undo)
   * used to leave the gizmo at the right place but the mesh stationary because
   * TransformPartCommand stored a stale THREE.Group reference that had been
   * dissolved during undo. Snapshot-based redo restores the after-snapshot
   * directly, which contains the correct world positions.
   */
  it('redo of group-move after undo/undo/redo/redo cycle positions parts correctly', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);

    const pA = sketcher.insertPrimitive('box')!;
    const pB = sketcher.insertPrimitive('box')!;
    pB.mesh.position.set(3, 0, 0);
    pB.mesh.updateWorldMatrix(false, true);

    // Glue B onto A
    doc.execute(new CommitGlueCommand(
      sketcher,
      pA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      pB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
    ));

    // Simulate TC moving the group: capture pre-drag snapshot, move, then execute.
    const priorSnap = doc.captureSnapshot();
    const ag = sketcher.getSession().assemblyGroups[0];
    ag.group.position.set(10, 0, 0);
    ag.group.updateWorldMatrix(false, true);
    doc.execute(new TransformPartCommand(sketcher, pA.id), priorSnap);

    // Verify parts moved with the group.
    pA.mesh.updateWorldMatrix(true, false);
    const ax = new THREE.Vector3();
    pA.mesh.matrixWorld.decompose(ax, new THREE.Quaternion(), new THREE.Vector3());
    const aXAfterMove = ax.x;

    // Undo the move, undo the glue.
    doc.undo(); // undo move
    doc.undo(); // undo glue

    // Redo the glue, redo the move.
    doc.redo(); // redo glue
    doc.redo(); // redo move

    // After redo, pA's world x should match what it was right after the group move.
    pA.mesh.updateWorldMatrix(true, false);
    const axAfterRedo = new THREE.Vector3();
    pA.mesh.matrixWorld.decompose(axAfterRedo, new THREE.Quaternion(), new THREE.Vector3());
    expect(axAfterRedo.x).toBeCloseTo(aXAfterMove, 3);
  });

  it('multiple undo/redo cycles remain stable', () => {
    const { sketcher } = makeSketcher();
    const { doc } = makeDoc(sketcher);

    const pA = sketcher.insertPrimitive('box')!;
    doc.execute(new ChangeColorCommand(pA.id, 0xff0000, sketcher));
    doc.execute(new ChangeColorCommand(pA.id, 0x00ff00, sketcher));

    doc.undo();
    doc.undo();
    doc.redo();
    doc.redo();

    expect(sketcher.getSession().parts[0].color).toBe(0x00ff00);
  });
});
