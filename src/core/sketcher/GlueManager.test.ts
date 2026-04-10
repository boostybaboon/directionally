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

  it('creates an AssemblyGroup containing both parts', () => {
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const groups = glue.getAssemblyGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].partIds).toContain(partA.id);
    expect(groups[0].partIds).toContain(partB.id);
  });

  it('adds the group to the scene', () => {
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const ag = glue.getAssemblyGroups()[0];
    expect(scene.getObjectByName(ag.group.name)).toBeTruthy();
  });

  it('repositions partB so it is flush with partA face', () => {
    // partA box at origin: top face contact at local (0, 0.5, 0) = world y = 0.5
    // partB contact is its bottom face at local (0, -0.5, 0); after snap world centre y = 1.0
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(1.0, 3);
  });

  it('gluing a third part expands the same group', () => {
    const partC = makePart(scene, new THREE.Vector3(-5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.commitGlue(partA, new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(1, 0, 0), partC, new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-1, 0, 0));
    const groups = glue.getAssemblyGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0].partIds).toHaveLength(3);
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

  it('returns the group after gluing', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    expect(glue.groupForPart(partA.id)).toBeDefined();
    expect(glue.groupForPart(partB.id)).toBeDefined();
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
    glue.unglue(joint.id, [partA, partB]);
    expect(glue.getJoints()).toHaveLength(0);
  });

  it('dissolves the group when the last joint is removed', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.unglue(joint.id, [partA, partB]);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
  });

  it('returns parts to scene root after dissolve', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.unglue(joint.id, [partA, partB]);
    expect(partA.mesh.parent).toBe(scene);
    expect(partB.mesh.parent).toBe(scene);
  });

  it('splits into two groups when removing a joint in a 3-part chain', () => {
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(4, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    glue.commitGlue(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    // Remove A-B joint: A is isolated, B-C remain grouped
    glue.unglue(glue.getJoints()[0].id, [partA, partB, partC]);
    expect(glue.getAssemblyGroups()).toHaveLength(1);
    expect(glue.getAssemblyGroups()[0].partIds).toContain(partB.id);
    expect(glue.getAssemblyGroups()[0].partIds).toContain(partC.id);
    expect(partA.mesh.parent).toBe(scene);
  });
});

// ── unglueAll ────────────────────────────────────────────────────────────────

describe('GlueManager.unglueAll', () => {
  it('5-cube line: removing the middle cube yields two distinct groups', () => {
    // A–B–C–D–E; remove C → expect groups {A,B} and {D,E}, C at scene root.
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

    glue.unglueAll(pC.id, [pA, pB, pC, pD, pE]);

    const groups = glue.getAssemblyGroups();
    expect(groups).toHaveLength(2);
    const ids0 = groups[0].partIds.slice().sort();
    const ids1 = groups[1].partIds.slice().sort();
    const groupSets = [ids0, ids1].map((g) => g.join(','));
    expect(groupSets).toContain([pA.id, pB.id].sort().join(','));
    expect(groupSets).toContain([pD.id, pE.id].sort().join(','));
    expect(pC.mesh.parent).toBe(scene);
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

    glue.unglueAll(pB.id, [pA, pB, pC]);

    expect(glue.getAssemblyGroups()).toHaveLength(0);
    expect(pA.mesh.parent).toBe(scene);
    expect(pB.mesh.parent).toBe(scene);
    expect(pC.mesh.parent).toBe(scene);
  });
});

// ── replayJoints ─────────────────────────────────────────────────────────────

describe('GlueManager.replayJoints', () => {
  it('repositions partB when partA is moved after gluing', () => {
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
    // partB bottom flush with partA top= 3.5 → partB world y = 4.0
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
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const groupName = glue.getAssemblyGroups()[0].group.name;
    glue.dispose();
    expect(glue.getJoints()).toHaveLength(0);
    expect(glue.getAssemblyGroups()).toHaveLength(0);
    expect(scene.getObjectByName(groupName)).toBeUndefined();
  });
});

// ── faceGroupFromNormal ───────────────────────────────────────────────────────

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

describe('GlueManager.replayJoints — no displacement when assembly group moves as a whole', () => {
  it('produces zero delta when the group containing both parts is translated', () => {
    // Both parts are children of the assembly group. Moving the group shifts both
    // parts by the same world-space offset, so contactA − contactB remains 0.
    const scene = makeScene();
    const glue = new GlueManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    const ag = glue.groupForPart(partA.id)!;

    const wpBefore = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpBefore); // world y = 1.0 after glue

    // Move the entire group.
    ag.group.position.y += 3;
    ag.group.updateMatrixWorld(true);

    // replayJoints must not displace partB relative to its new world position.
    glue.replayJoints(partA, [partA, partB]);

    const wpAfter = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpAfter);
    expect(wpAfter.y).toBeCloseTo(wpBefore.y + 3, 3);
  });
});

// ── _applyJointPosition moves the whole group, so group members follow ────────

describe('GlueManager._applyJointPosition — group members travel together', () => {
  it('when partB is in a group with partC, partC follows when partB is repositioned', () => {
    // Regression for bug where _applyJointPosition modified partB.mesh.position (group-local)
    // but left other group members (partC) at their old world positions.
    //
    // Setup: partB and partC are first glued (B is anchor, C snaps on top of B).
    // Then partA (standalone) glues to bottom of partB — partB's whole group should move,
    // carrying partC along.
    const scene = makeScene();
    const glue = new GlueManager(scene);

    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));  // standalone anchor
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));  // will be repositioned
    const partC = makePart(scene, new THREE.Vector3(5, 5, 0));  // glued to partB, should follow

    // Glue partC on top of partB (partB anchor, partC moves).
    glue.commitGlue(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    // partB unchanged at (5,0,0). partC snaps so its bottom (y–0.5) meets partB top (y+0.5=0.5),
    // giving partC world centre y = 1.0.
    const wpCMid = new THREE.Vector3();
    partC.mesh.getWorldPosition(wpCMid);
    expect(wpCMid.y).toBeCloseTo(1.0, 3); // sanity

    // Now glue partA-top to partB-bottom. partB (and its group) must move to snap flush.
    glue.commitGlue(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    const wpB = new THREE.Vector3();
    const wpC = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpB);
    partC.mesh.getWorldPosition(wpC);

    // partB bottom now at partA top (y=0.5) → partB world centre y = 1.0.
    expect(wpB.y).toBeCloseTo(1.0, 3);
    // partC was 1 unit above partB centre (glued on top), so partC world y = 2.0.
    // With the old bug, partC stayed at y=1.5 (didn't follow the group move).
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

