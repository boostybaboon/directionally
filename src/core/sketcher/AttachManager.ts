import * as THREE from 'three';
import type { AssemblyGroup, FaceGroupInfo, AttachJoint, JointSnapshot, SketcherPart } from './types.js';

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

// ── AttachManager ───────────────────────────────────────────────────────────────

let _jointSeq = 1;

/**
 * The attach runtime: the joint solver over live meshes, plus a mirror of the
 * document's attach topology — its joints, its group nodes and their durable bonds.
 *
 * The document is the source of truth: the Sketcher edits the tree and rebuilds
 * this mirror on every sync, so nothing here decides structure. What lives here is
 * the mesh-space maths a document cannot express:
 *
 *  - applyJoint(): rotate/translate a part — or its whole group — so two local
 *    contact points and normals coincide.
 *  - resolveConstraints(): BFS from moved parts, democratically re-snapping each
 *    joint neighbour (the moved part is always the anchor for its direct neighbours).
 */
export class AttachManager {
  /** Mirror of the document's joints, rebuilt by setJoints(). */
  private readonly joints: AttachJoint[] = [];
  /** Mirror of the document's group nodes. */
  private readonly assemblyGroups: AssemblyGroup[] = [];
  /** Ids of the mirrored groups that are pure groups rather than attach assemblies. */
  private readonly groupIds = new Set<string>();
  /** Mirror of the document's durable group bond components. */
  private bonds: string[][] = [];

  constructor(private readonly scene: THREE.Scene) {}

  // ── Mirror (rebuilt from the document on every sync) ───────────────────────

  /** Replace the joint mirror with the document's joints. */
  setJoints(snapshots: readonly JointSnapshot[]): void {
    this.joints.length = 0;
    for (const js of snapshots) {
      this.joints.push({
        id: `joint-${_jointSeq++}`,
        type: js.type,
        partAId: js.partAId,
        localPointA: toVector3(js.localPointA),
        localNormalA: toVector3(js.localNormalA),
        partBId: js.partBId,
        localPointB: toVector3(js.localPointB),
        localNormalB: toVector3(js.localNormalB),
      });
    }
  }

  /** Replace the durable group bond mirror. */
  setBonds(bonds: readonly string[][]): void {
    this.bonds = bonds.map((bond) => [...bond]);
  }

  /**
   * Register a group node's already-realised THREE.Group. `nodeId` is the node's
   * name segment, so a group keeps its identity across a sync; `isGroup`
   * distinguishes a pure group (true) from an attach assembly (false).
   */
  adoptGroup(nodeId: string, group: THREE.Group, partIds: string[], name?: string, isGroup?: boolean): AssemblyGroup {
    group.name = nodeId;
    const ag: AssemblyGroup = { id: nodeId, ...(name !== undefined ? { name } : {}), group, partIds };
    this.assemblyGroups.push(ag);
    if (isGroup !== false) this.groupIds.add(ag.id);
    return ag;
  }

  /** Return all group members to scene root (world preserved) and clear the mirror. Meshes are NOT disposed. */
  resetGroups(): void {
    for (const ag of this.assemblyGroups) {
      for (const child of [...ag.group.children]) this.scene.attach(child);
      this.scene.remove(ag.group);
    }
    this.joints.length = 0;
    this.assemblyGroups.length = 0;
    this.groupIds.clear();
    this.bonds = [];
  }

  /** Drop the mirror and remove the group objects it owns from the scene. */
  dispose(): void {
    for (const ag of this.assemblyGroups) {
      this.scene.remove(ag.group);
    }
    this.joints.length = 0;
    this.assemblyGroups.length = 0;
    this.groupIds.clear();
    this.bonds = [];
  }

  // ── Queries over the mirror ────────────────────────────────────────────────

  /** Find the group that contains the given part id, if any. */
  groupForPart(partId: string): AssemblyGroup | undefined {
    return this.assemblyGroups.find((g) => g.partIds.includes(partId));
  }

  getJoints(): readonly AttachJoint[] { return this.joints; }
  getAssemblyGroups(): readonly AssemblyGroup[] { return this.assemblyGroups; }

  /** True when the part belongs to a pure group (not an attach assembly). */
  isGroup(partId: string): boolean {
    const ag = this.groupForPart(partId);
    return ag ? this.groupIds.has(ag.id) : false;
  }

  /** True when the part is in any durable group bond, even merged into an attach assembly. */
  isInGroupComponent(partId: string): boolean {
    return this.bonds.some((bond) => bond.includes(partId));
  }

  // ── Joint solver ──────────────────────────────────────────────────────────

  /**
   * Rotate `other` so its face normal (otherNormal) becomes anti-parallel to
   * `edited`'s face normal, then translate to snap their contact points together.
   *
   * `edited` is the anchor (its world transform is unchanged).
   * `other` is the part that moves.
   *
   * When both parts are in the SAME assembly group (member-edit mode), `target`
   * is `other.mesh` — a child of the group. Rotations and translations are
   * converted from world space to group-local space to avoid applying world-space
   * deltas to local-space properties.
   *
   * When `other` is in a different group or is standalone, `target` is either the
   * group root or the mesh at scene root — and the direct world-space maths apply.
   */
  applyJoint(
    edited: SketcherPart, editedPoint: THREE.Vector3, editedNormal: THREE.Vector3,
    other: SketcherPart,  otherPoint: THREE.Vector3,  otherNormal: THREE.Vector3,
  ): void {
    edited.mesh.updateWorldMatrix(true, false);
    other.mesh.updateWorldMatrix(true, false);

    const groupOther  = this.groupForPart(other.id);
    const groupEdited = this.groupForPart(edited.id);
    // Move the whole group only when other is in a DIFFERENT group to edited.
    const target =
      groupOther && (!groupEdited || groupEdited.id !== groupOther.id)
        ? groupOther.group
        : other.mesh;

    // Step 1: rotate so other's face normal becomes anti-parallel to edited's face normal.
    const worldNormalEdited = editedNormal.clone().transformDirection(edited.mesh.matrixWorld).normalize();
    const worldNormalOther  = otherNormal.clone().transformDirection(other.mesh.matrixWorld).normalize();
    const targetNormal = worldNormalEdited.clone().negate();
    if (worldNormalOther.dot(targetNormal) < 0.9999) {
      const rotQ = new THREE.Quaternion().setFromUnitVectors(worldNormalOther, targetNormal);
      // Convert world-space rotation to target's parent-local space.
      // For scene-root targets the parent quaternion is identity, so localRotQ === rotQ.
      const parentQ = new THREE.Quaternion();
      target.parent!.getWorldQuaternion(parentQ);
      const localRotQ = parentQ.clone().invert().multiply(rotQ).multiply(parentQ);
      target.quaternion.premultiply(localRotQ);
      target.updateWorldMatrix(false, true);
      other.mesh.updateWorldMatrix(true, false);
    }

    // Step 2: translate to snap contact points.
    const worldPointEdited = editedPoint.clone().applyMatrix4(edited.mesh.matrixWorld);
    const worldPointOther  = otherPoint.clone().applyMatrix4(other.mesh.matrixWorld);
    const delta = worldPointEdited.clone().sub(worldPointOther);
    // Use worldToLocal so the delta is correctly transformed into target's parent space.
    // For scene-root targets (parent is scene with identity matrix) this is a no-op.
    const worldOrigin = new THREE.Vector3();
    target.getWorldPosition(worldOrigin);
    worldOrigin.add(delta);
    target.parent!.worldToLocal(worldOrigin);
    target.position.copy(worldOrigin);
    target.updateWorldMatrix(false, true);
  }

  /**
   * BFS from each moved part through the joint graph, democratically re-snapping
   * each unvisited neighbour. The moved part is always the anchor for its direct
   * neighbours; those neighbours propagate further as anchors for their own
   * neighbours. A visited set prevents cycles and oscillation.
   *
   * For group-level transport, pass all group member ids so intra-group joints
   * are pre-visited and skipped. External connections on any member still fire.
   */
  resolveConstraints(movedPartIds: string[], allParts: SketcherPart[]): void {
    const visited = new Set<string>(movedPartIds);
    const queue = [...movedPartIds];

    while (queue.length > 0) {
      const movedId = queue.shift()!;
      const movedPart = allParts.find((p) => p.id === movedId);
      if (!movedPart) continue;

      for (const joint of this.joints) {
        let editedPoint: THREE.Vector3;
        let editedNormal: THREE.Vector3;
        let otherPoint: THREE.Vector3;
        let otherNormal: THREE.Vector3;
        let otherPart: SketcherPart | undefined;

        if (joint.partAId === movedId) {
          otherPart = allParts.find((p) => p.id === joint.partBId);
          editedPoint = joint.localPointA; editedNormal = joint.localNormalA;
          otherPoint  = joint.localPointB; otherNormal  = joint.localNormalB;
        } else if (joint.partBId === movedId) {
          otherPart = allParts.find((p) => p.id === joint.partAId);
          editedPoint = joint.localPointB; editedNormal = joint.localNormalB;
          otherPoint  = joint.localPointA; otherNormal  = joint.localNormalA;
        } else {
          continue;
        }

        if (!otherPart || visited.has(otherPart.id)) continue;
        visited.add(otherPart.id);
        queue.push(otherPart.id);

        this.applyJoint(movedPart, editedPoint, editedNormal, otherPart, otherPoint, otherNormal);
      }
    }
  }
}

function toVector3(v: [number, number, number]): THREE.Vector3 {
  return new THREE.Vector3(v[0], v[1], v[2]);
}
