import * as THREE from 'three';
import type { AssemblyGroup, FaceGroupInfo, GlueJoint, SketcherPart } from './types.js';

// ── Face-group label helpers (diagnostic HUD) ───────────────────────────────

/**
 * Identify the face group from a raycast hit's face.normal (in the mesh's
 * LOCAL space). Reads the candidate normals baked into geometry.userData.faceGroups
 * at construction time — no runtime checks on geometry type.
 * Returns 0 if the geometry carries no face-group data.
 */
export function faceGroupFromNormal(mesh: THREE.Mesh, localNormal: THREE.Vector3): number {
  const groups: FaceGroupInfo[] | undefined = mesh.geometry.userData.faceGroups;
  if (!groups?.length) return 0;
  let best = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < groups.length; i++) {
    const d = groups[i].normal.dot(localNormal);
    if (d > bestDot) { bestDot = d; best = i; }
  }
  return best;
}

/**
 * Return a human-readable label for a face group.
 * Reads from face-group data baked into geometry.userData.faceGroups.
 * Returns '?' for unknown indices.
 */
export function faceGroupLabel(geometry: THREE.BufferGeometry, groupIndex: number): string {
  const groups: FaceGroupInfo[] | undefined = geometry.userData.faceGroups;
  return groups?.[groupIndex]?.label ?? '?';
}

// ── GlueManager ───────────────────────────────────────────────────────────────

let _jointSeq = 1;
let _groupSeq = 1;

/**
 * Manages the joint list and the weld-group graph.
 *
 * SA15 semantics: glue is a *live positional constraint* between two
 * independent scene entities (standalone meshes or weld groups). Calling
 * commitGlue() snaps the mover to the anchor and records the joint; it does
 * NOT reparent any mesh into a shared group. After every TC commit,
 * resolveConstraints() re-satisfies all joints that involve the moved entity.
 *
 * Weld groups remain structural containers (rigid units moved as one); glue
 * joints are logical constraints between those entities.
 *
 * Responsibilities:
 *  - commitGlue(): position partB flush to partA face, record the joint.
 *  - resolveConstraints(): re-satisfy all joints touching a set of moved parts.
 *  - replayJoints(): single-part convenience wrapper for resolveConstraints.
 *  - unglue(): remove a joint.
 *  - getConnectedIds(): BFS over joints from a part, returns all reachable ids.
 */
export class GlueManager {
  private readonly joints: GlueJoint[] = [];
  private readonly assemblyGroups: AssemblyGroup[] = [];
  /** Ids of AssemblyGroups created by weld (no joint topology). */
  private readonly weldGroupIds = new Set<string>();

  constructor(private readonly scene: THREE.Scene) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Commit a glue joint: rotate partB so its face (localNormalB) becomes
   * flush against partA's face (localNormalA), then snap the contact points,
   * and record the joint.
   *
   * SA15: parts remain at their current hierarchy level — no THREE.Group is
   * created. The joint is a live constraint re-satisfied by resolveConstraints()
   * after every transform commit.
   *
   * All four vectors must be in the respective mesh's LOCAL space — typically
   * obtained from the raycast hit's face.normal and matrixWorldInverse.
   */
  commitGlue(
    partA: SketcherPart,
    localPointA: THREE.Vector3,
    localNormalA: THREE.Vector3,
    partB: SketcherPart,
    localPointB: THREE.Vector3,
    localNormalB: THREE.Vector3,
  ): GlueJoint {
    this._applyJointPosition(partA, localPointA, localNormalA, partB, localPointB, localNormalB);

    const joint: GlueJoint = {
      id: `joint-${_jointSeq++}`,
      partAId: partA.id, localPointA: localPointA.clone(), localNormalA: localNormalA.clone(),
      partBId: partB.id, localPointB: localPointB.clone(), localNormalB: localNormalB.clone(),
    };
    this.joints.push(joint);
    // SA15: no group merging — parts remain at their current hierarchy level.
    return joint;
  }

  /**
   * Re-satisfy all joints that involve any of the moved parts.
   *
   * For each joint touching a moved part:
   *   - If the anchor side (partAId) moved → reposition the mover to follow.
   *   - If the mover side (partBId) moved independently → snap it back to satisfy
   *     the constraint (live constraint semantics; the anchor wins).
   *
   * When a moved part lives inside a weld group, the whole group is moved by
   * _applyJointPosition (it picks up groupForPart automatically).
   */
  resolveConstraints(movedPartIds: string[], allParts: SketcherPart[]): void {
    const movedSet = new Set(movedPartIds);
    for (const joint of this.joints) {
      if (!movedSet.has(joint.partAId) && !movedSet.has(joint.partBId)) continue;
      const partA = allParts.find((p) => p.id === joint.partAId);
      const partB = allParts.find((p) => p.id === joint.partBId);
      if (partA && partB) {
        this._applyJointPosition(
          partA, joint.localPointA, joint.localNormalA,
          partB, joint.localPointB, joint.localNormalB,
        );
      }
    }
  }

  /**
   * Re-evaluate all joints that touch `movedPart` after a transform.
   * For each joint, reposition the OTHER part relative to the moved one.
   */
  replayJoints(movedPart: SketcherPart, allParts: SketcherPart[]): void {
    this.resolveConstraints([movedPart.id], allParts);
  }

  /**
   * Remove the joint with the given id. Under SA15, no group topology
   * changes are needed — joints are purely logical constraints.
   */
  unglue(jointId: string, _allParts?: SketcherPart[]): void {
    const idx = this.joints.findIndex((j) => j.id === jointId);
    if (idx !== -1) this.joints.splice(idx, 1);
  }

  /**
   * Remove all joints touching a part. Used by the "Unglue selected" action.
   */
  unglueAll(partId: string, _allParts?: SketcherPart[]): void {
    for (let i = this.joints.length - 1; i >= 0; i--) {
      if (this.joints[i].partAId === partId || this.joints[i].partBId === partId) {
        this.joints.splice(i, 1);
      }
    }
  }

  /** BFS over all joints, returns all part-ids reachable from startId. */
  getConnectedIds(startId: string): string[] {
    const visited = new Set<string>([startId]);
    const queue = [startId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const j of this.joints) {
        if (j.partAId === current && !visited.has(j.partBId)) {
          visited.add(j.partBId);
          queue.push(j.partBId);
        } else if (j.partBId === current && !visited.has(j.partAId)) {
          visited.add(j.partAId);
          queue.push(j.partAId);
        }
      }
    }
    return [...visited];
  }

  /** Find the AssemblyGroup that contains the given part id, if any. */
  groupForPart(partId: string): AssemblyGroup | undefined {
    return this.assemblyGroups.find((g) => g.partIds.includes(partId));
  }

  getJoints(): readonly GlueJoint[] { return this.joints; }
  getAssemblyGroups(): readonly AssemblyGroup[] { return this.assemblyGroups; }

  /**
   * Create a weld group from the given parts at their current world positions.
   * Unlike commitGlue, no face-snap math is performed — parts are grouped as-is.
   * All parts must be standalone (not already in any group).
   */
  createWeldGroup(parts: SketcherPart[]): AssemblyGroup {
    const ag = this._createGroup(parts);
    this.weldGroupIds.add(ag.id);
    return ag;
  }

  /**
   * Dissolve a weld group by id. All children are returned to scene root
   * at their current world positions. No-op if the group is not a weld group.
   */
  dissolveWeldGroup(groupId: string, _allParts?: SketcherPart[]): void {
    const ag = this.assemblyGroups.find((g) => g.id === groupId);
    if (!ag || !this.weldGroupIds.has(groupId)) return;
    this._dissolveGroup(ag);
  }

  /** Return true if the part belongs to a weld group (not a glue group). */
  isWeldGroup(partId: string): boolean {
    const ag = this.groupForPart(partId);
    return ag ? this.weldGroupIds.has(ag.id) : false;
  }

  /**
   * Remove a part from its assembly group without removing any joints.
   * Used from removePart() to clean up weld group membership when a part is deleted.
   * Dissolves the group if it shrinks to one member.
   */
  evictFromGroup(partId: string, _allParts?: SketcherPart[]): void {
    const ag = this.groupForPart(partId);
    if (!ag) return;
    const idx = ag.partIds.indexOf(partId);
    if (idx !== -1) ag.partIds.splice(idx, 1);
    if (ag.partIds.length <= 1) {
      this._dissolveGroup(ag);
    }
  }

  /**
   * Record a joint without repositioning partB.
   * Used by CartoonSketcher.restoreSnapshot() and loadDraft() to rebuild the
   * joint graph after world-space transforms have already been applied.
   * SA15: no group merging — parts remain at their current hierarchy level.
   */
  registerJoint(
    partA: SketcherPart, localPointA: THREE.Vector3, localNormalA: THREE.Vector3,
    partB: SketcherPart, localPointB: THREE.Vector3, localNormalB: THREE.Vector3,
  ): GlueJoint {
    const joint: GlueJoint = {
      id: `joint-${_jointSeq++}`,
      partAId: partA.id, localPointA: localPointA.clone(), localNormalA: localNormalA.clone(),
      partBId: partB.id, localPointB: localPointB.clone(), localNormalB: localNormalB.clone(),
    };
    this.joints.push(joint);
    // SA15: no group merging — parts remain at their current hierarchy level.
    return joint;
  }

  dispose(): void {
    for (const ag of this.assemblyGroups) {
      this.scene.remove(ag.group);
    }
    this.joints.length = 0;
    this.assemblyGroups.length = 0;
    this.weldGroupIds.clear();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Rotate partB so its face normal (localNormalB) becomes flush against
   * partA's face (anti-parallel to localNormalA), then translate to snap
   * the contact points together.
   *
   * If partB is in a weld group and partA is NOT in the same weld group,
   * the whole weld group is moved (so all group members travel together).
   * Otherwise partB's mesh is moved directly.
   */
  private _applyJointPosition(
    partA: SketcherPart, localPointA: THREE.Vector3, localNormalA: THREE.Vector3,
    partB: SketcherPart, localPointB: THREE.Vector3, localNormalB: THREE.Vector3,
  ): void {
    partA.mesh.updateWorldMatrix(true, false);
    partB.mesh.updateWorldMatrix(true, false);

    const groupB = this.groupForPart(partB.id);
    const groupA = this.groupForPart(partA.id);
    const target =
      groupB && (!groupA || groupA.id !== groupB.id)
        ? groupB.group
        : partB.mesh;

    // Step 1: rotate so B's face normal becomes anti-parallel to A's face normal.
    const worldNormalA = localNormalA.clone().transformDirection(partA.mesh.matrixWorld).normalize();
    const worldNormalB = localNormalB.clone().transformDirection(partB.mesh.matrixWorld).normalize();
    const targetNormal = worldNormalA.clone().negate();
    if (worldNormalB.dot(targetNormal) < 0.9999) {
      const rotQ = new THREE.Quaternion().setFromUnitVectors(worldNormalB, targetNormal);
      target.quaternion.premultiply(rotQ);
      target.updateWorldMatrix(false, true);
      partB.mesh.updateWorldMatrix(true, false);
    }

    // Step 2: translate to snap contact points.
    const worldPointA = localPointA.clone().applyMatrix4(partA.mesh.matrixWorld);
    const worldPointB = localPointB.clone().applyMatrix4(partB.mesh.matrixWorld);
    const delta = worldPointA.clone().sub(worldPointB);
    target.position.add(delta);
    target.updateWorldMatrix(false, true);
  }

  private _createGroup(parts: SketcherPart[]): AssemblyGroup {
    const group = new THREE.Group();
    group.name = `assembly-${_groupSeq++}`;
    // Position group at AABB centroid of members for a well-placed gizmo pivot.
    const box = new THREE.Box3();
    for (const p of parts) {
      p.mesh.updateWorldMatrix(true, false);
      box.expandByObject(p.mesh);
    }
    box.getCenter(group.position);
    this.scene.add(group);

    for (const p of parts) {
      group.attach(p.mesh); // preserves world transform
    }

    const ag: AssemblyGroup = {
      id: group.name,
      group,
      partIds: parts.map((p) => p.id),
    };
    this.assemblyGroups.push(ag);
    return ag;
  }

  private _dissolveGroup(ag: AssemblyGroup): void {
    // Re-parent all children back to scene root preserving world transforms.
    for (const child of [...ag.group.children]) {
      this.scene.attach(child);
    }
    this.scene.remove(ag.group);
    const idx = this.assemblyGroups.indexOf(ag);
    if (idx !== -1) this.assemblyGroups.splice(idx, 1);
    // Remove weld marker if present.
    this.weldGroupIds.delete(ag.id);
  }
}
