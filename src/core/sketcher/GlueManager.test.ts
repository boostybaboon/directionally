import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GlueManager, faceGroupFromNormal, faceGroupLabel } from './GlueManager.js';
import type { SketcherPart } from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

let _idSeq = 1;

function makePart(scene: THREE.Scene, position = new THREE.Vector3()): SketcherPart {
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(position);
  mesh.updateMatrixWorld(true);
  scene.add(mesh);
  return {
    id: `part-${_idSeq++}`,
    mesh,
    depth: 1,
    centroid: position.clone(),
    name: 'Box',
    color: 0x8888cc,
    shapePoints: null,
    faceColors: [0x8888cc],
    faceTextures: [null],
  };
}

// ── commitGlue ────────────────────────────────────────────────────────────────

describe('GlueManager.commitGlue', () => {
  let scene: THREE.Scene;
  let glue: GlueManager;
  let partA: SketcherPart;
  let partB: SketcherPart;

  beforeEach(() => {
    scene = makeScene();
    glue = new GlueManager(scene);
    partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    partB = makePart(scene, new THREE.Vector3(5, 0, 0));
  });

  it('records a joint with correct part ids', () => {
    const joint = glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    expect(joint.partAId).toBe(partA.id);
    expect(joint.partBId).toBe(partB.id);
  });

  it('stores the joint in getJoints()', () => {
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    expect(glue.getJoints()).toHaveLength(1);
  });

  it('does not create an AssemblyGroup (SA15: glue is a live constraint)', () => {
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    expect(glue.getAssemblyGroups()).toHaveLength(0);
  });

  it('does not add a new object to the scene (SA15: no group created)', () => {
    const childCount = scene.children.length;
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    expect(scene.children.length).toBe(childCount);
  });

  it('repositions partB so it is flush with partA face', () => {
    // partA box at origin: top face contact at local (0, 0.5, 0) = world y = 0.5
    // partB contact is its bottom face at local (0, -0.5, 0); after snap world centre y = 1.0
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(1.0, 3);
  });

  it('gluing a third part records a second joint and still no groups', () => {
    const partC = makePart(scene, new THREE.Vector3(-5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.commitGlue(partA, new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(1, 0, 0), partC, new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-1, 0, 0));
    expect(glue.getJoints()).toHaveLength(2);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
  });
});

// ── getConnectedIds ───────────────────────────────────────────────────────────

describe('GlueManager.getConnectedIds', () => {
  it('returns only the start id when no joints exist', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const ids = glue.getConnectedIds(partA.id);
    expect(ids).toEqual([partA.id]);
  });

  it('traverses transitive connections', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(4, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.commitGlue(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const ids = glue.getConnectedIds(partA.id);
    expect(ids.sort()).toEqual([partA.id, partB.id, partC.id].sort());
  });
});

// ── groupForPart ─────────────────────────────────────────────────────────────

describe('GlueManager.groupForPart', () => {
  it('returns undefined for an unglued part', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    expect(glue.groupForPart(partA.id)).toBeUndefined();
  });

  it('returns undefined after gluing (SA15: glue does not create groups)', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    expect(glue.groupForPart(partA.id)).toBeUndefined();
    expect(glue.groupForPart(partB.id)).toBeUndefined();
  });
});

// ── unglue + dissolve ─────────────────────────────────────────────────────────

describe('GlueManager.unglue', () => {
  it('removes the joint', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.unglue(joint.id);
    expect(glue.getJoints()).toHaveLength(0);
  });

  it('no group to dissolve: getAssemblyGroups stays empty after unglue (SA15)', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.unglue(joint.id);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
  });

  it('parts remain at scene root before and after unglue (SA15: glue never reparents)', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.unglue(joint.id);
    expect(partA.mesh.parent).toBe(scene);
    expect(partB.mesh.parent).toBe(scene);
  });

  it('removing one joint from a 3-part chain leaves the remaining joint intact', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(4, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.commitGlue(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    // Remove A-B joint: only B-C joint remains; no groups (SA15)
    glue.unglue(glue.getJoints()[0].id);
    expect(glue.getJoints()).toHaveLength(1);
    expect(glue.getJoints()[0].partAId).toBe(partB.id);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
    expect(partA.mesh.parent).toBe(scene);
  });
});

// ── unglueAll ────────────────────────────────────────────────────────────────

describe('GlueManager.unglueAll', () => {
  it('5-cube line: removing the middle cube removes two joints; remainder intact', () => {
    // A–B–C–D–E; remove C → joints A-B and D-E survive, B-C and C-D removed. 0 groups.
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const [pA, pB, pC, pD, pE] = [0, 2, 4, 6, 8].map(
      (x) => makePart(scene, new THREE.Vector3(x, 0, 0)),
    );
    const n = new THREE.Vector3(0, 1, 0);
    const nN = new THREE.Vector3(0, -1, 0);
    const pt = new THREE.Vector3(0, 0.5, 0);
    const pb = new THREE.Vector3(0, -0.5, 0);
    glue.commitGlue(pA, pt, n, pB, pb, nN);
    glue.commitGlue(pB, pt, n, pC, pb, nN);
    glue.commitGlue(pC, pt, n, pD, pb, nN);
    glue.commitGlue(pD, pt, n, pE, pb, nN);

    glue.unglueAll(pC.id);

    expect(glue.getJoints()).toHaveLength(2);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
    expect(pC.mesh.parent).toBe(scene);
    // Remaining joints must be A-B and D-E.
    const remainIds = glue.getJoints().map((j) => `${j.partAId}-${j.partBId}`);
    expect(remainIds).toContain(`${pA.id}-${pB.id}`);
    expect(remainIds).toContain(`${pD.id}-${pE.id}`);
  });

  it('3-cube line: removing the middle cube leaves two standalone parts (no groups)', () => {
    // A–B–C; remove B → A and C at scene root, 0 assembly groups.
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const [pA, pB, pC] = [0, 2, 4].map(
      (x) => makePart(scene, new THREE.Vector3(x, 0, 0)),
    );
    const n = new THREE.Vector3(0, 1, 0);
    const nN = new THREE.Vector3(0, -1, 0);
    const pt = new THREE.Vector3(0, 0.5, 0);
    const pb = new THREE.Vector3(0, -0.5, 0);
    glue.commitGlue(pA, pt, n, pB, pb, nN);
    glue.commitGlue(pB, pt, n, pC, pb, nN);

    glue.unglueAll(pB.id);

    expect(glue.getAssemblyGroups()).toHaveLength(0);
    expect(pA.mesh.parent).toBe(scene);
    expect(pB.mesh.parent).toBe(scene);
    expect(pC.mesh.parent).toBe(scene);
  });
});

// ── replayJoints ─────────────────────────────────────────────────────────────

describe('GlueManager.replayJoints — mover follows when anchor is moved', () => {
  it('produces correct world position when anchor is translated and replayJoints called', () => {
    // partA is the joint anchor; partB is the mover.
    // Under SA15 both parts stay at scene root. Moving partA then replaying
    // should reposition partB so the contact faces stay flush.
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    // Move partA up by 3 units, then replay.
    partA.mesh.position.y += 3;
    partA.mesh.updateMatrixWorld(true);

    glue.replayJoints(partA, [partA, partB]);

    partB.mesh.updateMatrixWorld(true);
    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(4.0, 3);
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('GlueManager.dispose', () => {
  it('clears all joints and groups and removes group objects from scene', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    // Use a weld group so there is a scene object to remove.
    const ag = glue.createWeldGroup([partA, partB]);
    const groupName = ag.group.name;
    glue.dispose();
    expect(glue.getJoints()).toHaveLength(0);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
    expect(scene.getObjectByName(groupName)).toBeUndefined();
  });
});

// ── resolveConstraints ────────────────────────────────────────────────────────

describe('GlueManager.resolveConstraints', () => {
  it('repositions the mover when the anchor id is included in movedPartIds', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    partA.mesh.position.y += 5;
    partA.mesh.updateMatrixWorld(true);

    glue.resolveConstraints([partA.id], [partA, partB]);

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(6.0, 3); // 5 + 1 (partB centre above contact)
  });

  it('snaps mover back when the mover id is included in movedPartIds', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    partB.mesh.position.y = 20;
    partB.mesh.updateMatrixWorld(true);

    glue.resolveConstraints([partB.id], [partA, partB]);

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(1.0, 3);
  });

  it('skips joints whose parts are not in movedPartIds', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(10, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    const settled = new THREE.Vector3();
    partB.mesh.getWorldPosition(settled);

    glue.resolveConstraints([partC.id], [partA, partB, partC]);

    const wpB = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpB);
    expect(wpB.y).toBeCloseTo(settled.y, 5);
  });

  it('resolves all joints touching a moved weld group when group member ids are passed', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partD = makePart(scene, new THREE.Vector3(1, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));

    const ag = glue.createWeldGroup([partA, partD]);
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const initialWp = new THREE.Vector3();
    partB.mesh.getWorldPosition(initialWp);

    ag.group.position.y += 4;
    ag.group.updateMatrixWorld(true);

    glue.resolveConstraints([partA.id, partD.id], [partA, partB, partD]);

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(initialWp.y + 4, 3);
  });
});

// ── replayJoints — snap-back and group-move behaviour ────────────────────────

describe('GlueManager.replayJoints — snap-back when partBId is moved independently', () => {
  it('snaps partB back to the joint position when partB is displaced', () => {
    // partA is the joint anchor (partAId); partB is the snapped part (partBId).
    // Moving partB independently then calling replayJoints(partB) must restore the joint.
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    // Displace partB away from its joint-satisfying position.
    partB.mesh.position.y = 10;
    partB.mesh.updateMatrixWorld(true);

    glue.replayJoints(partB, [partA, partB]);

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    // After snap-back: partB bottom flush with partA top → partB world y = 1.0.
    expect(wp.y).toBeCloseTo(1.0, 3);
  });
});

describe('GlueManager.replayJoints — weld group moves as a whole when anchor is in weld', () => {
  it('partB follows when partA (in a weld group) is translated and replayJoints is called', () => {
    // SA15: create a weld group {partA, partD}, then glue partB to partA (anchor).
    // Translate the weld group → partB must follow.
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    const partD = makePart(scene, new THREE.Vector3(1, 0, 0));

    // Form a weld group A+D.
    const ag = glue.createWeldGroup([partA, partD]);

    // Glue partB to partA (partA is the anchor).
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    partB.mesh.updateMatrixWorld(true);
    const wpAfterGlue = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpAfterGlue); // should be y ≈ 1.0

    // Move the weld group up.
    ag.group.position.y += 3;
    ag.group.updateMatrixWorld(true);

    glue.replayJoints(partA, [partA, partB, partD]);

    const wpAfterMove = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpAfterMove);
    expect(wpAfterMove.y).toBeCloseTo(wpAfterGlue.y + 3, 3);
  });
});

// ── _applyJointPosition moves the whole weld group ──────────────────────────

describe('GlueManager._applyJointPosition — weld group members travel together', () => {
  it('when partB is welded to partC, partC follows when the glue constraint repositions partB', () => {
    // Setup: partB and partC are first WELDED into a rigid group.
    // Then partA (standalone) glues to the bottom of partB.
    // The constraint must move the whole weld group (carrying partC).
    const scene = makeScene();
    const glue = new GlueManager(scene);

    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));  // standalone anchor
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));  // in weld group, will be repositioned
    const partC = makePart(scene, new THREE.Vector3(5, 1, 0));  // welded to partB, should follow

    // Weld partB and partC into a rigid group (B is centre, C is 1 unit above).
    glue.createWeldGroup([partB, partC]);

    // Sanity: partB and partC should be in the same group now.
    const groupB = glue.groupForPart(partB.id);
    expect(groupB).toBeDefined();
    expect(groupB!.partIds).toContain(partC.id);

    // Get partC world position before glue constraint fires.
    const wpCBefore = new THREE.Vector3();
    partC.mesh.getWorldPosition(wpCBefore);

    // Glue partA-top to partB-bottom. partB's whole weld group must move to snap flush.
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    const wpB = new THREE.Vector3();
    const wpC = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpB);
    partC.mesh.getWorldPosition(wpC);

    // partB bottom now at partA top (y=0.5) → partB world centre y = 1.0.
    expect(wpB.y).toBeCloseTo(1.0, 3);
    // partC was 1 unit above partB (world), so partC world y = 2.0.
    expect(wpC.y).toBeCloseTo(2.0, 3);
  });
});

// ── faceGroupFromNormal ───────────────────────────────────────────────────────

function meshWithGroups(groups: { normal: THREE.Vector3; label: string }[]): THREE.Mesh {
  const geo = new THREE.BufferGeometry();
  geo.userData.faceGroups = groups;
  return new THREE.Mesh(geo);
}

describe('faceGroupFromNormal', () => {
  it('picks the group with the matching normal exactly', () => {
    const mesh = meshWithGroups([
      { normal: new THREE.Vector3(1, 0, 0),  label: '+X' },
      { normal: new THREE.Vector3(-1, 0, 0), label: '-X' },
      { normal: new THREE.Vector3(0, 1, 0),  label: 'Top' },
      { normal: new THREE.Vector3(0, -1, 0), label: 'Bottom' },
      { normal: new THREE.Vector3(0, 0, 1),  label: '+Z' },
      { normal: new THREE.Vector3(0, 0, -1), label: '-Z' },
    ]);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(1, 0, 0))).toBe(0);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(-1, 0, 0))).toBe(1);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, 1, 0))).toBe(2);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, -1, 0))).toBe(3);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, 0, 1))).toBe(4);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, 0, -1))).toBe(5);
  });

  it('picks the closest group when the normal is off-axis', () => {
    const mesh = meshWithGroups([
      { normal: new THREE.Vector3(1, 0, 0),  label: '+X' },
      { normal: new THREE.Vector3(-1, 0, 0), label: '-X' },
      { normal: new THREE.Vector3(0, 1, 0),  label: 'Top' },
      { normal: new THREE.Vector3(0, -1, 0), label: 'Bottom' },
    ]);
    // Mostly upward — should resolve to 'Top' (index 2).
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0.1, 0.99, 0.1).normalize())).toBe(2);
  });

  it('works with a 3-group cylinder-style layout', () => {
    const mesh = meshWithGroups([
      { normal: new THREE.Vector3(1, 0, 0),  label: 'Barrel' },
      { normal: new THREE.Vector3(0, 1, 0),  label: 'Top cap' },
      { normal: new THREE.Vector3(0, -1, 0), label: 'Bottom cap' },
    ]);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, 1, 0))).toBe(1);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, -1, 0))).toBe(2);
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(1, 0, 0))).toBe(0);
  });

  it('returns 0 when geometry has no faceGroups userData', () => {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry());
    expect(faceGroupFromNormal(mesh, new THREE.Vector3(0, 1, 0))).toBe(0);
  });
});

// ── faceGroupLabel ────────────────────────────────────────────────────────────

describe('faceGroupLabel', () => {
  it('returns the label for the given group index', () => {
    const geo = new THREE.BufferGeometry();
    geo.userData.faceGroups = [
      { normal: new THREE.Vector3(1, 0, 0),  label: '+X' },
      { normal: new THREE.Vector3(-1, 0, 0), label: '-X' },
      { normal: new THREE.Vector3(0, 1, 0),  label: 'Top' },
    ];
    expect(faceGroupLabel(geo, 0)).toBe('+X');
    expect(faceGroupLabel(geo, 1)).toBe('-X');
    expect(faceGroupLabel(geo, 2)).toBe('Top');
  });

  it('returns "?" for out-of-range index', () => {
    const geo = new THREE.BufferGeometry();
    geo.userData.faceGroups = [{ normal: new THREE.Vector3(0, 1, 0), label: 'Top' }];
    expect(faceGroupLabel(geo, 99)).toBe('?');
  });

  it('returns "?" when geometry has no faceGroups userData', () => {
    expect(faceGroupLabel(new THREE.BufferGeometry(), 0)).toBe('?');
  });
});

