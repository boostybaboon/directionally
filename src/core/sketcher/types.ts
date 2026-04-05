import type * as THREE from 'three';

export type SketcherPart = {
  id: string;
  mesh: THREE.Mesh;
  depth: number;
  centroid: THREE.Vector3;
  /** Display name shown in the HUD (e.g. 'Box', 'Cylinder', 'Shape'). */
  name: string;
  /** Hex colour integer, e.g. 0x8888cc. Kept in sync with mesh.material.color. */
  color: number;
  /**
   * XZ shape points for sketch parts (from THREE.Shape.getPoints()), null for
   * primitives. Required by loadDraft() to reconstruct ExtrudeGeometry after
   * a page reload.
   */
  shapePoints: [number, number][] | null;
};

/**
 * Records two world-surface contact points (in each part's local space) that
 * define a glue joint. The joint is satisfied when the two local points occupy
 * the same world-space position.
 *
 * Neither side is "parent" — re-evaluating the recipe repositions whichever
 * side moved relative to the other.
 */
export type GlueJoint = {
  id: string;
  partAId: string;
  /** Contact point in partA's mesh local space. */
  localPointA: THREE.Vector3;
  /** Face normal at the contact point, in partA's local space. */
  localNormalA: THREE.Vector3;
  partBId: string;
  /** Contact point in partB's mesh local space. */
  localPointB: THREE.Vector3;
  /** Face normal at the contact point, in partB's local space. */
  localNormalB: THREE.Vector3;
};

/**
 * A persistent THREE.Group that owns all parts in a connected joint component.
 * Created when the first joint between two parts is committed; grows as more
 * parts are glued; shrinks or dissolves when joints are removed.
 */
export type AssemblyGroup = {
  id: string;
  group: THREE.Group;
  /** Mirrors group.children membership by part id. */
  partIds: string[];
};

export type SketcherSession = {
  parts: SketcherPart[];
  joints: GlueJoint[];
  assemblyGroups: AssemblyGroup[];
};

/**
 * Describes one face group of a mesh geometry: a representative local-space
 * normal and a human-readable HUD label. Stored as geometry.userData.faceGroups
 * at construction time so runtime code never needs to branch on geometry type.
 */
export type FaceGroupInfo = {
  normal: THREE.Vector3;
  label: string;
};

// ── Snapshot types (used by SketcherDocument for undo/redo) ──────────────────

export type PartSnapshot = {
  id: string;
  /** World-space position — correct regardless of group parentage. */
  worldPosition: [number, number, number];
  worldQuaternionXYZW: [number, number, number, number];
  worldScale: [number, number, number];
  color: number;
};

export type JointSnapshot = {
  partAId: string;
  /** Local-space — unchanged by group transforms. */
  localPointA: [number, number, number];
  localNormalA: [number, number, number];
  partBId: string;
  localPointB: [number, number, number];
  localNormalB: [number, number, number];
};

/**
 * Plain-data snapshot of an entire session, used by SketcherDocument for
 * undo/redo. Mesh geometry and material are NOT cloned — the mesh objects
 * stay alive in CartoonSketcher's allParts pool and are reused on restore.
 * Only currently-present parts are listed; absent (soft-removed) parts are
 * omitted and restored from the pool by id on demand.
 */
export type SessionSnapshot = {
  parts: PartSnapshot[];
  joints: JointSnapshot[];
};

// ── Draft types (used by CartoonSketcher.toDraft / loadDraft for persistence) ─

/**
 * JSON-serializable description of a single part. Geometry is stored as either
 * a primitive name ('Box', 'Cylinder', …) or the XZ shape points + depth for
 * sketch-extruded parts. World-space transforms allow correct restoration
 * regardless of prior group membership.
 */
export type PartDraft = {
  id: string;
  kind: 'primitive' | 'sketch';
  name: string;
  shapePoints?: [number, number][];
  depth?: number;
  position: [number, number, number];
  quaternion: [number, number, number, number];
  scale: [number, number, number];
  color: number;
};

export type SketcherDraft = {
  version: 2;
  parts: PartDraft[];
  joints: JointSnapshot[];
};
