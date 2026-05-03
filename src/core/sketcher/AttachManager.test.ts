import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { AttachManager, faceGroupFromNormal, faceGroupLabel } from './AttachManager.js';
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
    holes: null,
    lathePoints: null,
    lathePhiLength: null,
    faceColors: [0x8888cc],
    faceTextures: [null],
  };
}

// ── commitAttach ──────────────────────────────────────────────────────────────────

describe('AttachManager.commitAttach', () => {
  let scene: THREE.Scene;
  let am: AttachManager;
  let partA: SketcherPart;
  let partB: SketcherPart;

  beforeEach(() => {
    scene = makeScene();
    am = new AttachManager(scene);
    partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    partB = makePart(scene, new THREE.Vector3(5, 0, 0));
  });

  it('creates an AssemblyGroup for the two attached parts', () => {
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    expect(am.getAssemblyGroups()).toHaveLength(1);
    const ag = am.getAssemblyGroups()[0];
    expect(ag.partIds).toContain(partA.id);
    expect(ag.partIds).toContain(partB.id);
  });

  it('adds one new group object to the scene', () => {
    const childCount = scene.children.length;
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    // The scene gains the group; the two meshes are re-parented inside it.
    expect(scene.children.length).toBe(childCount - 2 + 1);
  });

  it('repositions partB so it is flush with partA face', () => {
    // partA box at origin: top face contact at local (0, 0.5, 0) = world y = 0.5
    // partB contact is its bottom face at local (0, -0.5, 0); after snap world centre y = 1.0
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(1.0, 3);
  });

  it('records a joint with correct part ids', () => {
    const joint = am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    expect(joint.partAId).toBe(partA.id);
    expect(joint.partBId).toBe(partB.id);
  });

  it('stores the joint in getJoints()', () => {
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    expect(am.getJoints()).toHaveLength(1);
  });

  it('gluing a third part into the same component merges into one group', () => {
    const partC = makePart(scene, new THREE.Vector3(-5, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    am.commitAttach(partA, new THREE.Vector3(0.5, 0, 0), new THREE.Vector3(1, 0, 0), partC, new THREE.Vector3(-0.5, 0, 0), new THREE.Vector3(-1, 0, 0), [partA, partB, partC]);
    expect(am.getJoints()).toHaveLength(2);
    expect(am.getAssemblyGroups()).toHaveLength(1);
    expect(am.getAssemblyGroups()[0].partIds).toHaveLength(3);
  });
});

// ── getConnectedIds ───────────────────────────────────────────────────────────

describe('AttachManager.getConnectedIds', () => {
  it('returns only the start id when no joints exist', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const ids = am.getConnectedIds(partA.id);
    expect(ids).toEqual([partA.id]);
  });

  it('traverses transitive connections', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(4, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    am.commitAttach(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partC]);
    const ids = am.getConnectedIds(partA.id);
    expect(ids.sort()).toEqual([partA.id, partB.id, partC.id].sort());
  });
});

// ── groupForPart ─────────────────────────────────────────────────────────────

describe('AttachManager.groupForPart', () => {
  it('returns undefined for a standalone part', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    expect(am.groupForPart(partA.id)).toBeUndefined();
  });

  it('returns the attach group after attaching', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    expect(am.groupForPart(partA.id)).toBeDefined();
    expect(am.groupForPart(partB.id)).toBeDefined();
    expect(am.groupForPart(partA.id)!.id).toBe(am.groupForPart(partB.id)!.id);
  });
});

// ── detach + dissolve ─────────────────────────────────────────────────────────

describe('AttachManager.detach', () => {
  it('removes the joint', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    am.detach(joint.id, [partA, partB]);
    expect(am.getJoints()).toHaveLength(0);
  });

  it('dissolves the group after detach: both parts return to standalone', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const joint = am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    am.detach(joint.id, [partA, partB]);
    expect(am.getAssemblyGroups()).toHaveLength(0);
    expect(partA.mesh.parent).toBe(scene);
    expect(partB.mesh.parent).toBe(scene);
  });

  it('removing one joint from a 3-part chain splits into two groups', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(4, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    am.commitAttach(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partC]);
    // Remove A-B joint: A becomes standalone, B-C stay in their own group.
    am.detach(am.getJoints()[0].id, [partA, partB, partC]);
    expect(am.getJoints()).toHaveLength(1);
    expect(am.getJoints()[0].partAId).toBe(partB.id);
    expect(am.getAssemblyGroups()).toHaveLength(1);
    expect(am.groupForPart(partA.id)).toBeUndefined();
    expect(am.groupForPart(partB.id)).toBeDefined();
    expect(am.groupForPart(partC.id)).toBeDefined();
  });
});

// ── detachAll ────────────────────────────────────────────────────────────────

describe('AttachManager.detachAll', () => {
  it('5-cube line: removing the middle cube splits into two groups', () => {
    // A–B–C–D–E; remove C → groups {A,B} and {D,E} survive, C is standalone.
    const scene = makeScene();
    const am = new AttachManager(scene);
    const [pA, pB, pC, pD, pE] = [0, 2, 4, 6, 8].map(
      (x) => makePart(scene, new THREE.Vector3(x, 0, 0)),
    );
    const n = new THREE.Vector3(0, 1, 0);
    const nN = new THREE.Vector3(0, -1, 0);
    const pt = new THREE.Vector3(0, 0.5, 0);
    const pb = new THREE.Vector3(0, -0.5, 0);
    const all = [pA, pB, pC, pD, pE];
    am.commitAttach(pA, pt, n, pB, pb, nN, all);
    am.commitAttach(pB, pt, n, pC, pb, nN, all);
    am.commitAttach(pC, pt, n, pD, pb, nN, all);
    am.commitAttach(pD, pt, n, pE, pb, nN, all);

    am.detachAll(pC.id, all);

    expect(am.getJoints()).toHaveLength(2);
    expect(am.getAssemblyGroups()).toHaveLength(2);
    expect(am.groupForPart(pC.id)).toBeUndefined();
    // Remaining joints must be A-B and D-E.
    const remainIds = am.getJoints().map((j) => `${j.partAId}-${j.partBId}`);
    expect(remainIds).toContain(`${pA.id}-${pB.id}`);
    expect(remainIds).toContain(`${pD.id}-${pE.id}`);
  });

  it('3-cube line: removing the middle cube dissolves the group entirely', () => {
    // A–B–C; remove B → A and C standalone, 0 assembly groups.
    const scene = makeScene();
    const am = new AttachManager(scene);
    const [pA, pB, pC] = [0, 2, 4].map(
      (x) => makePart(scene, new THREE.Vector3(x, 0, 0)),
    );
    const n = new THREE.Vector3(0, 1, 0);
    const nN = new THREE.Vector3(0, -1, 0);
    const pt = new THREE.Vector3(0, 0.5, 0);
    const pb = new THREE.Vector3(0, -0.5, 0);
    const all = [pA, pB, pC];
    am.commitAttach(pA, pt, n, pB, pb, nN, all);
    am.commitAttach(pB, pt, n, pC, pb, nN, all);

    am.detachAll(pB.id, all);

    expect(am.getAssemblyGroups()).toHaveLength(0);
    expect(pA.mesh.parent).toBe(scene);
    expect(pB.mesh.parent).toBe(scene);
    expect(pC.mesh.parent).toBe(scene);
  });
});

// ── replayJoints ─────────────────────────────────────────────────────────────

describe('AttachManager.replayJoints — mover follows when anchor is moved', () => {
  it('produces correct world position when anchor is translated and replayJoints called', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);

    // Move partA up by 3 units via its group, then replay.
    const ag = am.groupForPart(partA.id)!;
    ag.group.position.y += 3;
    ag.group.updateMatrixWorld(true);

    am.replayJoints(partA, [partA, partB]);

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(4.0, 3);
  });
});

// ── dispose ───────────────────────────────────────────────────────────────────

describe('AttachManager.dispose', () => {
  it('clears all joints and groups and removes group objects from scene', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    // Use a group so there is a scene object to remove.
    const ag = am.createGroup([partA, partB]);
    const groupName = ag.group.name;
    am.dispose();
    expect(am.getJoints()).toHaveLength(0);
    expect(am.getAssemblyGroups()).toHaveLength(0);
    expect(scene.getObjectByName(groupName)).toBeUndefined();
  });
});

// ── resolveConstraints ────────────────────────────────────────────────────────

describe('AttachManager.resolveConstraints', () => {
  it('repositions the other part when the anchor id is in movedPartIds', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);

    const ag = am.groupForPart(partA.id)!;
    ag.group.position.y += 5;
    ag.group.updateMatrixWorld(true);

    am.resolveConstraints([partA.id], [partA, partB]);

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(6.0, 3); // 5 + 1 (partB centre above contact)
  });

  it('democratic: anchor follows when the joint partner id is in movedPartIds', () => {
    // Both parts are in the same group. In member-edit mode, moving partB should
    // cause partA to re-snap to partB (democratic — moved part is the input).
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);

    // Displace partB in group-local space (simulates member-edit drag).
    partB.mesh.position.y += 10;
    partB.mesh.updateMatrixWorld(true);

    am.resolveConstraints([partB.id], [partA, partB]);

    // partA should have moved so that its top face meets partB's new bottom face.
    const wpA = new THREE.Vector3();
    partA.mesh.getWorldPosition(wpA);
    const wpB = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpB);
    // partB's bottom contact is at wpB.y - 0.5, partA's top must match → partA.y = wpB.y - 1
    expect(wpA.y).toBeCloseTo(wpB.y - 1.0, 2);
  });

  it('skips joints whose parts are not in movedPartIds', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(10, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);

    const settled = new THREE.Vector3();
    partB.mesh.getWorldPosition(settled);

    am.resolveConstraints([partC.id], [partA, partB, partC]);

    const wpB = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpB);
    expect(wpB.y).toBeCloseTo(settled.y, 5);
  });

  it('BFS chain: resolving A also propagates to C via B (A–B–C)', () => {
    // In member-edit, moving partA should snap partB (direct joint), then snap
    // partC via BFS because partB becomes the new anchor for the B–C joint.
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(10, 0, 0));

    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);
    am.commitAttach(partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partC]);

    // Member-edit: displace partA within the combined group.
    partA.mesh.position.y += 5;
    partA.mesh.updateMatrixWorld(true);

    am.resolveConstraints([partA.id], [partA, partB, partC]);

    const wpA = new THREE.Vector3(); partA.mesh.getWorldPosition(wpA);
    const wpB = new THREE.Vector3(); partB.mesh.getWorldPosition(wpB);
    const wpC = new THREE.Vector3(); partC.mesh.getWorldPosition(wpC);
    expect(wpB.y).toBeCloseTo(wpA.y + 1.0, 2); // partB snapped above partA
    expect(wpC.y).toBeCloseTo(wpB.y + 1.0, 2); // partC snapped above partB
  });
});

// ── replayJoints — snap-back and group-move behaviour ────────────────────────

describe('AttachManager.replayJoints — democratic: anchor follows the displaced partner', () => {
  it('partA follows when partB (joint partner) is displaced in member-edit', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);

    // Both are in the same group. Displace partB in group-local space.
    partB.mesh.position.y = 10;
    partB.mesh.updateMatrixWorld(true);

    am.replayJoints(partB, [partA, partB]);

    const wpA = new THREE.Vector3();
    const wpB = new THREE.Vector3();
    partA.mesh.getWorldPosition(wpA);
    partB.mesh.getWorldPosition(wpB);
    expect(wpA.y).toBeCloseTo(wpB.y - 1.0, 2);
  });
});

describe('AttachManager.replayJoints — group moves as a whole when anchor is in group', () => {
  it('member-edit on grouped partA snaps attached partB via the joint', () => {
    // partA and partD are grouped: moving partA in member-edit should snap
    // partB (am joint A-B) to follow, while partD stays in place.
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    const partD = makePart(scene, new THREE.Vector3(1, 0, 0));

    am.createGroup([partA, partD]);
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partD]);

    const wpBefore = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpBefore);

    // Member-edit: displace partA within the merged group.
    partA.mesh.position.y += 3;
    partA.mesh.updateMatrixWorld(true);

    am.replayJoints(partA, [partA, partB, partD]);

    const wpA = new THREE.Vector3(); partA.mesh.getWorldPosition(wpA);
    const wpB = new THREE.Vector3(); partB.mesh.getWorldPosition(wpB);
    expect(wpB.y).toBeCloseTo(wpBefore.y + 3, 3); // partB followed partA via am joint
  });
});

// ── _applyJointPosition moves the whole group ───────────────────────────────

describe('AttachManager._applyJointPosition — group members travel together', () => {
  it('when partB is grouped with partC, partC follows when the attach constraint repositions partB', () => {
    // Setup: partB and partC are first grouped into a rigid group.
    // Then partA (standalone) attaches to the bottom of partB.
    // The constraint must move the whole group (carrying partC).
    const scene = makeScene();
    const am = new AttachManager(scene);

    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));  // standalone anchor
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));  // in group, will be repositioned
    const partC = makePart(scene, new THREE.Vector3(5, 1, 0));  // grouped with partB, should follow

    // Group partB and partC into a rigid group (B is centre, C is 1 unit above).
    am.createGroup([partB, partC]);

    // Sanity: partB and partC should be in the same group now.
    const groupB = am.groupForPart(partB.id);
    expect(groupB).toBeDefined();
    expect(groupB!.partIds).toContain(partC.id);

    // Get partC world position before am constraint fires.
    const wpCBefore = new THREE.Vector3();
    partC.mesh.getWorldPosition(wpCBefore);

    // Attach partA-top to partB-bottom. partB's whole group must move to snap flush.
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partC]);

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

// ── T11-6: group bond survives detach of an attached part ─────────────────────

describe('AttachManager group bond survives attach-then-detach (T11-6)', () => {
  it('detaching C from [A,B group + C attached] restores the group for A and B', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(1, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(0, 5, 0));

    // Group A and B together.
    am.createGroup([partA, partB]);
    expect(am.isGroup(partA.id)).toBe(true);

    // Attach C to B — this merges everything into one assembly (no longer a pure group).
    am.commitAttach(
      partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
      [partA, partB, partC],
    );
    expect(am.getAssemblyGroups()).toHaveLength(1);
    expect(am.isGroup(partA.id)).toBe(false); // merged group is not pure group
    expect(am.isInGroupComponent(partA.id)).toBe(true); // but bond still tracked

    // Detach C.
    am.detachAll(partC.id, [partA, partB, partC]);

    // A and B should be back in a group; C should be standalone.
    expect(am.getAssemblyGroups()).toHaveLength(1);
    expect(am.isGroup(partA.id)).toBe(true);
    expect(am.isGroup(partB.id)).toBe(true);
    expect(am.groupForPart(partC.id)).toBeUndefined();
    expect(partC.mesh.parent).toBe(scene);
  });

  it('explicit ungroup then detach does NOT restore the group', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(1, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(0, 5, 0));

    am.createGroup([partA, partB]);
    am.commitAttach(
      partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
      [partA, partB, partC],
    );

    // There's no pure group to ungroup right now (it's merged). But suppose
    // the user undoes the attach (snapshot restore) and then ungrouped — simulate
    // that by dissolving group component directly via dissolveGroup on the
    // original group's parts. We can test by verifying isInGroupComponent after
    // a dissolveGroup would clear the bond.
    // Instead, test the simpler case: group A-B, immediately dissolveGroup, then
    // confirm ungluing a hypothetical C would not restore the bond.
    const scene2 = makeScene();
    const g2 = new AttachManager(scene2);
    const a2 = makePart(scene2, new THREE.Vector3(0, 0, 0));
    const b2 = makePart(scene2, new THREE.Vector3(1, 0, 0));
    const c2 = makePart(scene2, new THREE.Vector3(0, 5, 0));
    const wg = g2.createGroup([a2, b2]);
    g2.dissolveGroup(wg.id);
    // Bond removed: isInGroupComponent should be false.
    expect(g2.isInGroupComponent(a2.id)).toBe(false);
    // Attach c2 to a2 (no group bond in scope).
    g2.commitAttach(
      a2, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      c2, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
      [a2, b2, c2],
    );
    g2.detachAll(c2.id, [a2, b2, c2]);
    // Without a group bond, a2 and b2 must be standalone after detach.
    expect(g2.groupForPart(a2.id)).toBeUndefined();
    expect(g2.groupForPart(b2.id)).toBeUndefined();
  });

  it('getGroupComponents returns serializable arrays and rebuildGroupsFromSnapshot restores them', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(1, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(0, 5, 0));

    am.createGroup([partA, partB]);
    am.commitAttach(
      partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
      [partA, partB, partC],
    );

    // Serialize the group components.
    const serialized = am.getGroupComponents();
    expect(serialized).toHaveLength(1);
    expect(serialized[0].sort()).toEqual([partA.id, partB.id].sort());

    // Restore into a fresh AttachManager (simulates undo/redo snapshot restore).
    const scene2 = makeScene();
    const am2 = new AttachManager(scene2);
    const a2 = { ...partA, mesh: partA.mesh };
    const b2 = { ...partB, mesh: partB.mesh };
    const c2 = { ...partC, mesh: partC.mesh };
    scene2.add(a2.mesh, b2.mesh, c2.mesh);

    // Simulate: merged attach group [A,B,C] (isGroup=false) in snapshot, plus group components [[A,B]].
    am2.rebuildGroupsFromSnapshot(
      [{ partIds: [partA.id, partB.id, partC.id], isGroup: false }],
      [a2, b2, c2],
      serialized,
    );
    // group bond restored via group components param.
    expect(am2.isInGroupComponent(partA.id)).toBe(true);
    expect(am2.isInGroupComponent(partB.id)).toBe(true);
    expect(am2.isInGroupComponent(partC.id)).toBe(false);
  });
});

// ── dissolveGroupComponent ────────────────────────────────────────────────────

describe('AttachManager.dissolveGroupComponent', () => {
  it('ungrouping a grouped member in a mixed assembly separates non-jointed members', () => {
    // A+B group, C attached to B. After dissolveGroupComponent(A):
    // A has no am joints → standalone. B+C still am-jointed → am group.
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(1, 0, 0));
    const partC = makePart(scene, new THREE.Vector3(0, 5, 0));

    am.createGroup([partA, partB]);
    am.commitAttach(
      partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0),
      partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0),
      [partA, partB, partC],
    );

    am.dissolveGroupComponent(partA.id, [partA, partB, partC]);

    expect(am.isInGroupComponent(partA.id)).toBe(false);
    expect(am.groupForPart(partA.id)).toBeUndefined();
    expect(partA.mesh.parent).toBe(scene);

    const bcGroup = am.groupForPart(partB.id);
    expect(bcGroup).toBeDefined();
    expect(bcGroup!.partIds).toContain(partC.id);
    expect(am.isGroup(partB.id)).toBe(false); // it's an attach group, not a pure group
  });

  it('no-op when partId is not in any group component', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    am.commitAttach(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB]);

    // partA is in an attach group, not a group component — dissolveGroupComponent should no-op.
    am.dissolveGroupComponent(partA.id, [partA, partB]);

    expect(am.getAssemblyGroups()).toHaveLength(1); // am group unchanged
    expect(am.getJoints()).toHaveLength(1);
  });
});

// ── createGroup — group merging ──────────────────────────────────────────────

describe('AttachManager.createGroup — group merging', () => {
  it('merges a standalone part into an existing group', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const a = makePart(scene);
    const b = makePart(scene, new THREE.Vector3(1, 0, 0));
    const d = makePart(scene, new THREE.Vector3(2, 0, 0));

    am.createGroup([a, b]);
    // Merge D into A+B.
    am.createGroup([a, b, d]);

    const ag = am.groupForPart(a.id);
    expect(ag).toBeDefined();
    expect(ag!.partIds).toHaveLength(3);
    expect(ag!.partIds).toContain(d.id);
    // Only one assembly group should exist (old one dissolved).
    expect(am.getAssemblyGroups()).toHaveLength(1);
    // One merged group component covering all three.
    expect(am.getGroupComponents()).toHaveLength(1);
    expect(am.getGroupComponents()[0].sort()).toEqual([a.id, b.id, d.id].sort());
  });

  it('merges two independent groups into one', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const a = makePart(scene);
    const b = makePart(scene, new THREE.Vector3(1, 0, 0));
    const c = makePart(scene, new THREE.Vector3(2, 0, 0));
    const d = makePart(scene, new THREE.Vector3(3, 0, 0));

    am.createGroup([a, b]);
    am.createGroup([c, d]);
    // Group all four together (caller has expanded both groups to their full member lists).
    am.createGroup([a, b, c, d]);

    // All four should be in one group.
    const ag = am.groupForPart(a.id);
    expect(ag).toBeDefined();
    expect(ag!.partIds).toHaveLength(4);
    expect(am.getAssemblyGroups()).toHaveLength(1);
    expect(am.getGroupComponents()).toHaveLength(1);
    expect(am.getGroupComponents()[0].sort()).toEqual([a.id, b.id, c.id, d.id].sort());
  });
});

