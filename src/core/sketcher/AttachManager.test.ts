import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { AttachManager, faceGroupFromNormal, faceGroupLabel } from './AttachManager.js';
import type { AssemblyGroup, AttachJoint, JointSnapshot, SketcherPart } from './types.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeScene(): THREE.Scene {
  return new THREE.Scene();
}

let _idSeq = 1;
let _groupSeq = 1;

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

/** The part ids covered by `partId`'s mirrored group, or just the part. */
function membersOf(am: AttachManager, partId: string): string[] {
  return am.groupForPart(partId)?.partIds ?? [partId];
}

function snapshotOf(joint: AttachJoint): JointSnapshot {
  return {
    type: joint.type,
    partAId: joint.partAId,
    localPointA: joint.localPointA.toArray() as [number, number, number],
    localNormalA: joint.localNormalA.toArray() as [number, number, number],
    partBId: joint.partBId,
    localPointB: joint.localPointB.toArray() as [number, number, number],
    localNormalB: joint.localNormalB.toArray() as [number, number, number],
  };
}

function jointSnapshot(
  partA: SketcherPart, ptA: THREE.Vector3, nA: THREE.Vector3,
  partB: SketcherPart, ptB: THREE.Vector3, nB: THREE.Vector3,
): JointSnapshot {
  return {
    type: 'snap',
    partAId: partA.id,
    localPointA: ptA.toArray() as [number, number, number],
    localNormalA: nA.toArray() as [number, number, number],
    partBId: partB.id,
    localPointB: ptB.toArray() as [number, number, number],
    localNormalB: nB.toArray() as [number, number, number],
  };
}

/**
 * Mirror a pure group — what the Sketcher's tree `group()` command ends up as.
 * World positions are preserved, as the tree's centroid re-localisation does.
 */
function mirrorGroup(am: AttachManager, scene: THREE.Scene, parts: SketcherPart[], name?: string): AssemblyGroup {
  const group = new THREE.Group();
  scene.add(group);
  for (const p of parts) group.attach(p.mesh);
  return am.adoptGroup(`group-${_groupSeq++}`, group, parts.map((p) => p.id), name, true);
}

/**
 * Mirror an attach the way the Sketcher does: snap partB onto partA's face, then
 * record the joint and rebuild the connected component as one assembly group.
 */
function attach(
  am: AttachManager,
  scene: THREE.Scene,
  partA: SketcherPart, ptA: THREE.Vector3, nA: THREE.Vector3,
  partB: SketcherPart, ptB: THREE.Vector3, nB: THREE.Vector3,
  all: SketcherPart[] = [partA, partB],
): void {
  am.applyJoint(partA, ptA, nA, partB, ptB, nB);
  const members = [...new Set([...membersOf(am, partA.id), ...membersOf(am, partB.id)])];
  const joints = [...am.getJoints().map(snapshotOf), jointSnapshot(partA, ptA, nA, partB, ptB, nB)];

  am.resetGroups();
  const group = new THREE.Group();
  scene.add(group);
  for (const id of members) {
    const member = all.find((p) => p.id === id);
    if (member) group.attach(member.mesh);
  }
  am.adoptGroup(`assembly-${_groupSeq++}`, group, members, undefined, false);
  am.setJoints(joints);
}

// ── Mirror ────────────────────────────────────────────────────────────────────

describe('AttachManager mirror', () => {
  it('setJoints() mirrors the document joints', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));

    am.setJoints([
      {
        ...jointSnapshot(partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0)),
        type: 'rigid' as const,
      },
    ]);

    expect(am.getJoints()).toHaveLength(1);
    expect(am.getJoints()[0].partAId).toBe(partA.id);
    expect(am.getJoints()[0].partBId).toBe(partB.id);
    expect(am.getJoints()[0].type).toBe('rigid');
    expect(am.getJoints()[0].localPointA.y).toBeCloseTo(0.5);

    am.setJoints([]);
    expect(am.getJoints()).toHaveLength(0);
  });

  it('adoptGroup() registers a group under its node id', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(1, 0, 0));

    const ag = mirrorGroup(am, scene, [partA, partB], 'leg');

    expect(ag.id).toBe('group-1');
    expect(ag.group.name).toBe('group-1');
    expect(ag.name).toBe('leg');
    expect(am.getAssemblyGroups()).toHaveLength(1);
    expect(am.groupForPart(partA.id)?.id).toBe(ag.id);
    expect(am.groupForPart(partB.id)?.id).toBe(ag.id);
    expect(am.groupForPart('nope')).toBeUndefined();
  });

  it('isGroup() reports pure groups only', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const [partA, partB, partC] = [0, 1, 2].map((x) => makePart(scene, new THREE.Vector3(x, 0, 0)));

    mirrorGroup(am, scene, [partA, partB]);
    expect(am.isGroup(partA.id)).toBe(true);
    expect(am.isGroup(partC.id)).toBe(false);

    // An attach assembly is a group but not a pure one.
    attach(am, scene, partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partC]);
    expect(am.isGroup(partA.id)).toBe(false);
    expect(am.groupForPart(partA.id)).toBeDefined();
  });

  it('setBonds() drives isInGroupComponent()', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);

    am.setBonds([['a', 'b']]);
    expect(am.isInGroupComponent('a')).toBe(true);
    expect(am.isInGroupComponent('c')).toBe(false);

    am.setBonds([]);
    expect(am.isInGroupComponent('a')).toBe(false);
  });

  it('resetGroups() returns members to the scene root and clears the mirror', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(1, 0, 0));
    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));
    const worldBefore = partB.mesh.getWorldPosition(new THREE.Vector3());

    am.resetGroups();

    expect(am.getAssemblyGroups()).toHaveLength(0);
    expect(am.getJoints()).toHaveLength(0);
    expect(partB.mesh.parent).toBe(scene);
    // World positions survive the return to the root.
    expect(partB.mesh.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(worldBefore.y, 5);
  });

  it('dispose() removes group objects from the scene and clears the mirror', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene);
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    const ag = mirrorGroup(am, scene, [partA, partB]);

    am.dispose();

    expect(am.getJoints()).toHaveLength(0);
    expect(am.getAssemblyGroups()).toHaveLength(0);
    expect(scene.getObjectByName(ag.id)).toBeUndefined();
  });
});

// ── applyJoint ────────────────────────────────────────────────────────────────

describe('AttachManager.applyJoint', () => {
  it('snaps partB flush against partA’s face', () => {
    // partA box at origin: top face contact at local (0, 0.5, 0) = world y = 0.5
    // partB contact is its bottom face at local (0, -0.5, 0); after snap world centre y = 1.0
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));

    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    const wp = new THREE.Vector3();
    partB.mesh.getWorldPosition(wp);
    expect(wp.y).toBeCloseTo(1.0, 3);
    expect(am.getJoints()).toHaveLength(1);
  });

  it('rotates partB so its face normal opposes partA’s before snapping', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(2, 0, 0));
    // Tilt partB so its bottom face no longer points down.
    partB.mesh.rotation.x = Math.PI / 2;
    partB.mesh.updateMatrixWorld(true);

    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

    const wpB = new THREE.Vector3();
    partB.mesh.getWorldPosition(wpB);
    expect(wpB.y).toBeCloseTo(1.0, 3);
    const bottomNormal = new THREE.Vector3(0, -1, 0).transformDirection(partB.mesh.matrixWorld);
    expect(bottomNormal.y).toBeCloseTo(-1, 3);
  });

  it('moves the whole group when the two parts sit in different groups', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0)); // standalone anchor
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0)); // in a group, will be repositioned
    const partC = makePart(scene, new THREE.Vector3(5, 1, 0)); // grouped with partB, must follow

    mirrorGroup(am, scene, [partB, partC]);
    expect(am.groupForPart(partB.id)!.partIds).toContain(partC.id);

    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partC]);

    const wpB = new THREE.Vector3(); partB.mesh.getWorldPosition(wpB);
    const wpC = new THREE.Vector3(); partC.mesh.getWorldPosition(wpC);
    expect(wpB.y).toBeCloseTo(1.0, 3);
    // partC was 1 unit above partB (world), and travelled with it.
    expect(wpC.y).toBeCloseTo(2.0, 3);
  });

  it('moves only the mesh when both parts are in the same group', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    const partD = makePart(scene, new THREE.Vector3(1, 0, 0));

    mirrorGroup(am, scene, [partA, partD]);
    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), [partA, partB, partD]);
    const wpDBefore = partD.mesh.getWorldPosition(new THREE.Vector3());

    // Displace partA within the group (member-edit) and re-solve: partB follows,
    // partD — grouped but not jointed to either — stays put.
    partA.mesh.position.y += 3;
    partA.mesh.updateMatrixWorld(true);
    am.resolveConstraints([partA.id], [partA, partB, partD]);

    const wpA = new THREE.Vector3(); partA.mesh.getWorldPosition(wpA);
    const wpB = new THREE.Vector3(); partB.mesh.getWorldPosition(wpB);
    expect(wpB.y).toBeCloseTo(wpA.y + 1.0, 2);
    expect(partD.mesh.getWorldPosition(new THREE.Vector3()).y).toBeCloseTo(wpDBefore.y, 5);
  });
});

// ── resolveConstraints ────────────────────────────────────────────────────────

describe('AttachManager.resolveConstraints', () => {
  it('repositions the other part when the anchor id is in movedPartIds', () => {
    const scene = makeScene();
    const am = new AttachManager(scene);
    const partA = makePart(scene, new THREE.Vector3(0, 0, 0));
    const partB = makePart(scene, new THREE.Vector3(5, 0, 0));
    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

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
    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

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
    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0));

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
    const all = [partA, partB, partC];

    attach(am, scene, partA, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partB, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), all);
    attach(am, scene, partB, new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 1, 0), partC, new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0, -1, 0), all);

    // Member-edit: displace partA within the combined group.
    partA.mesh.position.y += 5;
    partA.mesh.updateMatrixWorld(true);

    am.resolveConstraints([partA.id], all);

    const wpA = new THREE.Vector3(); partA.mesh.getWorldPosition(wpA);
    const wpB = new THREE.Vector3(); partB.mesh.getWorldPosition(wpB);
    const wpC = new THREE.Vector3(); partC.mesh.getWorldPosition(wpC);
    expect(wpB.y).toBeCloseTo(wpA.y + 1.0, 2); // partB snapped above partA
    expect(wpC.y).toBeCloseTo(wpB.y + 1.0, 2); // partC snapped above partB
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
