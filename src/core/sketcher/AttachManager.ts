import * as THREE from 'three';
import type { AssemblyGroup, FaceGroupInfo, AttachJoint, SketcherPart } from './types.js';

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
let _groupSeq = 1;

/**
 * Manages the joint list and the assembly-group graph.
 *
 * Attach creates a structural THREE.Group containing all parts in the connected
 * component (same as group), plus records an AttachJoint for member-edit re-snap.
 * Pure groups are rigid containers with no joint records.
 *
 * Responsibilities:
 *  - commitAttach(): snap partB to partA face, merge all connected parts into a
 *    fresh THREE.Group, record the joint.
 *  - resolveConstraints(): BFS from moved parts, democratically re-snap each
 *    joint neighbour (the moved part is always the anchor for its direct neighbours).
 *  - replayJoints(): single-part convenience wrapper for resolveConstraints.
 *  - detach(): remove a joint and rebuild groups for the affected component.
 *  - getConnectedIds(): BFS over joints from a part, returns all reachable ids.
 */
export class AttachManager {
  private readonly joints: AttachJoint[] = [];
  private readonly assemblyGroups: AssemblyGroup[] = [];
  /** Ids of AssemblyGroups created by group() (no joint topology). */
  private readonly groupIds = new Set<string>();
  /**
   * Durable group bond components. Each Set lists the part IDs that form one
   * group unit. Unlike groupIds (which tracks ephemeral group object IDs),
   * this persists through attach merges: when commitAttach dissolves the group
   * and folds its members into a larger assembly, these bonds survive so
   * that _rebuildGroupsForParts can reform the group after detaching.
   *
   * Lifecycle:
   *  - createGroup: push a new Set for the grouped members.
   *  - dissolveGroup: remove the Set (explicit ungroup).
   *  - _dissolveGroup: intentionally does NOT touch groupComponents.
   *  - evictFromGroup: delete the evicted part from every Set; prune size-1 Sets.
   *  - dispose: clear the array.
   */
  private readonly groupComponents: Array<Set<string>> = [];

  constructor(private readonly scene: THREE.Scene) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Commit an attach joint: rotate partB so its face (localNormalB) becomes
   * flush against partA's face (localNormalA), snap the contact points, then
   * merge all parts in the connected component into a fresh THREE.Group and
   * record the joint.
   *
   * All four vectors must be in the respective mesh's LOCAL space — typically
   * obtained from the raycast hit's face.normal and matrixWorldInverse.
   *
   * allParts is required to look up SketcherPart objects for group members that
   * are not partA or partB (they may be in the same existing group).
   */
  commitAttach(
    partA: SketcherPart,
    localPointA: THREE.Vector3,
    localNormalA: THREE.Vector3,
    partB: SketcherPart,
    localPointB: THREE.Vector3,
    localNormalB: THREE.Vector3,
    allParts: SketcherPart[],
  ): AttachJoint {
    this._applyJointPosition(partA, localPointA, localNormalA, partB, localPointB, localNormalB);

    const joint: AttachJoint = {
      id: `joint-${_jointSeq++}`,
      partAId: partA.id, localPointA: localPointA.clone(), localNormalA: localNormalA.clone(),
      partBId: partB.id, localPointB: localPointB.clone(), localNormalB: localNormalB.clone(),
    };
    this.joints.push(joint);

    // Merge all parts in the connected component into a single fresh group.
    // Collect part IDs from each side's existing group (or just the part itself).
    const compA = this.groupForPart(partA.id)?.partIds ?? [partA.id];
    const compB = this.groupForPart(partB.id)?.partIds ?? [partB.id];
    const mergedIds = [...new Set([...compA, ...compB])];
    // Dissolve existing groups before creating the fresh combined group to
    // avoid BUG-1 (scale bleed via group.attach on non-uniform-scale parents).
    const dissolved = new Set<string>();
    for (const id of mergedIds) {
      const ag = this.groupForPart(id);
      if (ag && !dissolved.has(ag.id)) { dissolved.add(ag.id); this._dissolveGroup(ag); }
    }
    const partsForGroup = mergedIds
      .map((id) => allParts.find((p) => p.id === id))
      .filter((p): p is SketcherPart => p !== undefined);
    if (partsForGroup.length >= 2) this._createGroup(partsForGroup);

    return joint;
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

        this._applyJointPosition(movedPart, editedPoint, editedNormal, otherPart, otherPoint, otherNormal);
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
   * Remove the joint with the given id, then rebuild groups for all parts that
   * were in the affected component (the group may split into sub-components).
   */
  detach(jointId: string, allParts: SketcherPart[] = []): void {
    const idx = this.joints.findIndex((j) => j.id === jointId);
    if (idx === -1) return;
    const joint = this.joints[idx];
    // Collect all affected part ids before removing the joint.
    const ag = this.groupForPart(joint.partAId) ?? this.groupForPart(joint.partBId);
    const affectedIds = ag ? [...ag.partIds] : [joint.partAId, joint.partBId];
    this.joints.splice(idx, 1);
    this._rebuildGroupsForParts(affectedIds, allParts);
  }

  /**
   * Remove all joints touching a part, then rebuild groups for all parts in
   * the formerly-connected component.
   */
  detachAll(partId: string, allParts: SketcherPart[] = []): void {
    const ag = this.groupForPart(partId);
    const affectedIds = ag ? [...ag.partIds] : [partId];
    for (let i = this.joints.length - 1; i >= 0; i--) {
      if (this.joints[i].partAId === partId || this.joints[i].partBId === partId) {
        this.joints.splice(i, 1);
      }
    }
    this._rebuildGroupsForParts(affectedIds, allParts);
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

  getJoints(): readonly AttachJoint[] { return this.joints; }
  getAssemblyGroups(): readonly AssemblyGroup[] { return this.assemblyGroups; }

  /**
   * Create a group from the given parts at their current world positions.
   * Unlike commitAttach, no face-snap math is performed — parts are grouped as-is.
   * All parts must be standalone (not already in any group).
   */
  createGroup(parts: SketcherPart[]): AssemblyGroup {
    // Dissolve any existing assembly groups for these parts before creating the
    // new combined group. Callers are responsible for passing the full expanded
    // member list (including members of any groups being merged).
    const dissolved = new Set<string>();
    for (const p of parts) {
      const existing = this.groupForPart(p.id);
      if (existing && !dissolved.has(existing.id)) {
        dissolved.add(existing.id);
        // Remove the groupIds entry; the new combined Set will replace it.
        this.groupIds.delete(existing.id);
        this._dissolveGroup(existing);
      }
    }
    // Merge all durable group bond Sets that overlap with the incoming part ids.
    // Example: grouping A+B+D where A+B was already a group bond → one Set {A,B,D}.
    const partIdSet = new Set(parts.map((p) => p.id));
    const mergedWC = new Set<string>(partIdSet);
    const toRemove: number[] = [];
    for (let i = 0; i < this.groupComponents.length; i++) {
      const wc = this.groupComponents[i];
      if ([...wc].some((id) => partIdSet.has(id))) {
        for (const id of wc) mergedWC.add(id);
        toRemove.push(i);
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this.groupComponents.splice(toRemove[i], 1);
    }
    this.groupComponents.push(mergedWC);

    const ag = this._createGroup(parts);
    this.groupIds.add(ag.id);
    return ag;
  }

  /**
   * Dissolve a group by id. All children are returned to scene root
   * at their current world positions. No-op if the group is not a created group.
   */
  dissolveGroup(groupId: string, _allParts?: SketcherPart[]): void {
    const ag = this.assemblyGroups.find((g) => g.id === groupId);
    if (!ag || !this.groupIds.has(groupId)) return;
    // Remove the durable group bond component so the bond is truly gone after an explicit ungroup.
    const wcIdx = this.groupComponents.findIndex(
      (wc) => wc.size === ag.partIds.length && ag.partIds.every((id) => wc.has(id)),
    );
    if (wcIdx !== -1) this.groupComponents.splice(wcIdx, 1);
    this._dissolveGroup(ag);
  }

  /** Return true if the part belongs to a group (not an attach group). */
  isGroup(partId: string): boolean {
    const ag = this.groupForPart(partId);
    return ag ? this.groupIds.has(ag.id) : false;
  }

  /** Return true if the part is in any durable group bond component (even when merged into an attach group). */
  isInGroupComponent(partId: string): boolean {
    return this.groupComponents.some((wc) => wc.has(partId));
  }

  /** Return all durable group bond components as plain arrays (for snapshot serialization). */
  getGroupComponents(): string[][] {
    return this.groupComponents.map((wc) => [...wc]);
  }

  /**
   * Remove the group bond component containing `partId` and rebuild group topology.
   * Used when ungrouping members that are folded into a larger attach assembly:
   * the attach joints remain; parts that are no longer group-connected separate into
   * sub-groups or go standalone depending on their attach connectivity.
   */
  dissolveGroupComponent(partId: string, allParts: SketcherPart[]): void {
    const wcIdx = this.groupComponents.findIndex((wc) => wc.has(partId));
    if (wcIdx === -1) return;
    this.groupComponents.splice(wcIdx, 1);
    const ag = this.groupForPart(partId);
    const affectedIds = ag ? [...ag.partIds] : [partId];
    this._rebuildGroupsForParts(affectedIds, allParts);
  }

  /**
   * Remove a part from its assembly group without removing any joints.
   * Used from removePart() to clean up group membership when a part is deleted.
   * Dissolves the group if it shrinks to one member.
   */
  evictFromGroup(partId: string, _allParts?: SketcherPart[]): void {
    const ag = this.groupForPart(partId);
    if (!ag) return;
    const idx = ag.partIds.indexOf(partId);
    if (idx !== -1) ag.partIds.splice(idx, 1);
    // Remove the evicted part from every group bond component; prune size-1 sets.
    for (const wc of this.groupComponents) { wc.delete(partId); }
    for (let i = this.groupComponents.length - 1; i >= 0; i--) {
      if (this.groupComponents[i].size < 2) this.groupComponents.splice(i, 1);
    }
    if (ag.partIds.length <= 1) {
      this._dissolveGroup(ag);
    }
  }

  /**
   * Record a joint without repositioning partB or modifying groups.
   * Used by CartoonSketcher.restoreSnapshot() and loadDraft() when part
   * world-space transforms have already been applied from snapshot data.
   * Call rebuildGroupsFromSnapshot() after all joints are registered.
   */
  registerJoint(
    partA: SketcherPart, localPointA: THREE.Vector3, localNormalA: THREE.Vector3,
    partB: SketcherPart, localPointB: THREE.Vector3, localNormalB: THREE.Vector3,
  ): AttachJoint {
    const joint: AttachJoint = {
      id: `joint-${_jointSeq++}`,
      partAId: partA.id, localPointA: localPointA.clone(), localNormalA: localNormalA.clone(),
      partBId: partB.id, localPointB: localPointB.clone(), localNormalB: localNormalB.clone(),
    };
    this.joints.push(joint);
    return joint;
  }

  /**
   * Restore assembly groups directly from snapshot data. Call this after all
   * joints have been registered (via registerJoint) and all part world
   * transforms have been set.
   *
   * Groups with isGroup === true (or absent, for backward compat) are registered
   * as pure rigid groups. Others are plain assembly groups (attach groups).
   *
   * Pass `groupComponents` (from SessionSnapshot) when available so durable group
   * bond topology is also restored. Without it, bond components are derived from
   * the group-marked groups (backward-compatible but cannot restore bonds that
   * were merged into a larger attach assembly).
   */
  rebuildGroupsFromSnapshot(
    groups: Array<{ partIds: string[]; isGroup?: boolean }>,
    allParts: SketcherPart[],
    groupComponents?: string[][],
  ): void {
    for (const wg of groups) {
      const parts = wg.partIds
        .map((id) => allParts.find((p) => p.id === id))
        .filter((p): p is SketcherPart => p !== undefined);
      if (parts.length < 2) continue;
      const ag = this._createGroup(parts);
      if (wg.isGroup !== false) {
        // isGroup absent (legacy) or true → group; groupIds marked here;
        // groupComponents handled below to avoid double-adding when using the new format.
        this.groupIds.add(ag.id);
      }
    }
    // Restore durable group bond components.
    if (groupComponents) {
      // New format: use the serialized bond topology directly.
      for (const wc of groupComponents) {
        this.groupComponents.push(new Set(wc));
      }
    } else {
      // Backward compat: derive from current group-marked groups (simple case only).
      for (const ag of this.assemblyGroups) {
        if (this.groupIds.has(ag.id)) {
          this.groupComponents.push(new Set(ag.partIds));
        }
      }
    }
  }

  dispose(): void {
    for (const ag of this.assemblyGroups) {
      this.scene.remove(ag.group);
    }
    this.joints.length = 0;
    this.assemblyGroups.length = 0;
    this.groupIds.clear();
    this.groupComponents.length = 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

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
  private _applyJointPosition(
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
   * After joint removal, dissolve the former group(s) and rebuild new groups
   * by BFS over the remaining joints AND group bond components. Parts with no
   * connections end up at scene root (standalone). A component whose members
   * are all in the same group bond component (and have no attach joints among
   * them) is re-marked as a pure group.
   */
  private _rebuildGroupsForParts(partIds: string[], allParts: SketcherPart[]): void {
    // Dissolve all existing groups containing these parts.
    const dissolved = new Set<string>();
    for (const id of partIds) {
      const ag = this.groupForPart(id);
      if (ag && !dissolved.has(ag.id)) { dissolved.add(ag.id); this._dissolveGroup(ag); }
    }
    // Find connected components via BFS on remaining joints AND group bond components.
    const remaining = new Set(partIds);
    const visited  = new Set<string>();
    for (const startId of remaining) {
      if (visited.has(startId)) continue;
      const component: string[] = [];
      const q = [startId];
      while (q.length > 0) {
        const curr = q.shift()!;
        if (visited.has(curr)) continue;
        visited.add(curr); component.push(curr);
        // Attach joint edges.
        for (const j of this.joints) {
          if (j.partAId === curr && remaining.has(j.partBId) && !visited.has(j.partBId)) q.push(j.partBId);
          else if (j.partBId === curr && remaining.has(j.partAId) && !visited.has(j.partAId)) q.push(j.partAId);
        }
        // Group bond edges.
        for (const wc of this.groupComponents) {
          if (wc.has(curr)) {
            for (const wid of wc) {
              if (remaining.has(wid) && !visited.has(wid)) q.push(wid);
            }
          }
        }
      }
      if (component.length >= 2) {
        const parts = component
          .map((id) => allParts.find((p) => p.id === id))
          .filter((p): p is SketcherPart => p !== undefined);
        if (parts.length >= 2) {
          const ag = this._createGroup(parts);
          // Re-mark as pure group if no attach joints span this component and all
          // its members belong to the same group bond component.
          const hasAttachJoint = this.joints.some(
            (j) => component.includes(j.partAId) && component.includes(j.partBId),
          );
          if (!hasAttachJoint) {
            const wc = this.groupComponents.find((w) => component.every((id) => w.has(id)));
            if (wc) this.groupIds.add(ag.id);
          }
        }
      }
    }
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
    // Remove pure-group marker if present.
    this.groupIds.delete(ag.id);
  }
}
