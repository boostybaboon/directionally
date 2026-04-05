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
 * Manages the flat joint list and the persistent THREE.Group assembly graph.
 *
 * Responsibilities:
 *  - commitGlue(): position partB flush to partA face, record the joint,
 *    form/expand the shared group.
 *  - replayJoints(): re-evaluate all joints touching a given part after it
 *    has been transformed, repositioning its joint partners.
 *  - unglue(): remove a joint, run BFS to split or dissolve group if needed.
 *  - getConnectedIds(): BFS over joints from a part, returns all reachable ids.
 */
export class GlueManager {
  private readonly joints: GlueJoint[] = [];
  private readonly assemblyGroups: AssemblyGroup[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Commit a glue joint: rotate partB so its face (localNormalB) becomes
   * flush against partA's face (localNormalA), then snap the contact points,
   * record the joint, and merge both parts into one persistent THREE.Group.
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

    this._mergeIntoGroup(partA, partB);
    return joint;
  }

  /**
   * Re-evaluate all joints that touch `movedPart` after a transform.
   * For each joint, reposition the OTHER part relative to the moved one.
   */
  replayJoints(movedPart: SketcherPart, allParts: SketcherPart[]): void {
    for (const joint of this.joints) {
      if (joint.partAId === movedPart.id) {
        const partB = allParts.find((p) => p.id === joint.partBId);
        if (partB) this._applyJointPosition(
          movedPart, joint.localPointA, joint.localNormalA,
          partB, joint.localPointB, joint.localNormalB,
        );
      } else if (joint.partBId === movedPart.id) {
        const partA = allParts.find((p) => p.id === joint.partAId);
        if (partA) this._applyJointPosition(
          partA, joint.localPointA, joint.localNormalA,
          movedPart, joint.localPointB, joint.localNormalB,
        );
      }
    }
  }

  /**
   * Remove the joint with the given id. Runs BFS on the remaining joint
   * graph to split or dissolve the group if the component is now disconnected.
   */
  unglue(jointId: string, allParts: SketcherPart[]): void {
    const idx = this.joints.findIndex((j) => j.id === jointId);
    if (idx === -1) return;
    const [removed] = this.joints.splice(idx, 1);

    // Find the group that contained both parts.
    const group = this.assemblyGroups.find(
      (g) => g.partIds.includes(removed.partAId) && g.partIds.includes(removed.partBId),
    );
    if (!group) return;

    // BFS to find connected components within the group's part set.
    const components = this._connectedComponents(group.partIds);

    if (components.length === 1) {
      // Still connected — group shrinks if one part has no remaining joints.
      // (nothing to do; parts stay in the group)
      return;
    }

    // Dissolve the old group and rebuild one group per component.
    this._dissolveGroup(group, allParts);

    for (const component of components) {
      if (component.length === 1) {
        // Single isolated part — return to scene root.
        const part = allParts.find((p) => p.id === component[0]);
        if (part) {
          this.scene.attach(part.mesh); // preserves world transform
        }
      } else {
        const parts = component
          .map((id) => allParts.find((p) => p.id === id))
          .filter(Boolean) as SketcherPart[];
        this._createGroup(parts);
      }
    }
  }

  /**
   * Remove all joints touching a part and rebuild affected groups.
   * Convenience wrapper used by the "Unglue selected" action.
   */
  unglueAll(partId: string, allParts: SketcherPart[]): void {
    const touching = this.joints.filter(
      (j) => j.partAId === partId || j.partBId === partId,
    );
    for (const j of touching) {
      this.unglue(j.id, allParts);
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
   * Remove a part from its assembly group without removing any joints.
   * Used after `unglueAll` to clean up residual group membership when
   * the group remained connected (unglue skips group changes in that case).
   * Dissolves the group if it shrinks to one member.
   */
  evictFromGroup(partId: string, allParts: SketcherPart[]): void {
    const ag = this.groupForPart(partId);
    if (!ag) return;
    const idx = ag.partIds.indexOf(partId);
    if (idx !== -1) ag.partIds.splice(idx, 1);
    if (ag.partIds.length <= 1) {
      this._dissolveGroup(ag, allParts);
    }
  }

  dispose(): void {
    for (const ag of this.assemblyGroups) {
      this.scene.remove(ag.group);
    }
    this.joints.length = 0;
    this.assemblyGroups.length = 0;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  /**
   * Rotate partB so its face normal (localNormalB) becomes flush against
   * partA's face (anti-parallel to localNormalA), then translate to snap
   * the contact points together. Moves partB's assembly group if one exists
   * (so all group members travel together), unless partA is in the same group.
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

  /**
   * Merge partA and partB into a single AssemblyGroup.
   * If either already belongs to a group, the groups are merged.
   * Uses THREE.attach() to re-parent while preserving world transforms.
   */
  private _mergeIntoGroup(partA: SketcherPart, partB: SketcherPart): void {
    const groupA = this.groupForPart(partA.id);
    const groupB = this.groupForPart(partB.id);

    if (!groupA && !groupB) {
      // Neither in a group — create new group containing both.
      this._createGroup([partA, partB]);
    } else if (groupA && !groupB) {
      // partA has a group; absorb partB into it.
      groupA.group.attach(partB.mesh);
      groupA.partIds.push(partB.id);
    } else if (!groupA && groupB) {
      // partB has a group; absorb partA into it.
      groupB.group.attach(partA.mesh);
      groupB.partIds.push(partA.id);
    } else if (groupA && groupB && groupA.id !== groupB.id) {
      // Both in different groups — merge groupB into groupA.
      for (const child of [...groupB.group.children]) {
        groupA.group.attach(child);
      }
      groupA.partIds.push(...groupB.partIds);
      this.scene.remove(groupB.group);
      const idx = this.assemblyGroups.indexOf(groupB);
      if (idx !== -1) this.assemblyGroups.splice(idx, 1);
    }
    // If groupA === groupB, both already in the same group — nothing to do.
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

  private _dissolveGroup(ag: AssemblyGroup, allParts: SketcherPart[]): void {
    // Re-parent all children back to scene root preserving world transforms.
    for (const child of [...ag.group.children]) {
      this.scene.attach(child);
    }
    this.scene.remove(ag.group);
    const idx = this.assemblyGroups.indexOf(ag);
    if (idx !== -1) this.assemblyGroups.splice(idx, 1);
  }

  /** Partition a set of partIds into connected components using current joints. */
  private _connectedComponents(partIds: string[]): string[][] {
    const remaining = new Set(partIds);
    const components: string[][] = [];

    while (remaining.size > 0) {
      const start = remaining.values().next().value as string;
      const component: string[] = [];
      const queue = [start];
      remaining.delete(start);

      while (queue.length) {
        const current = queue.shift()!;
        component.push(current);
        for (const j of this.joints) {
          let neighbour: string | null = null;
          if (j.partAId === current) neighbour = j.partBId;
          else if (j.partBId === current) neighbour = j.partAId;
          if (neighbour && remaining.has(neighbour)) {
            remaining.delete(neighbour);
            queue.push(neighbour);
          }
        }
      }
      components.push(component);
    }
    return components;
  }
}
