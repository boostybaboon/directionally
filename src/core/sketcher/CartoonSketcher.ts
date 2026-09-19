import * as THREE from 'three';
import { PolygonSketcher } from './PolygonSketcher.js';
import { ExtrusionHandle } from './ExtrusionHandle.js';
import { AttachManager } from './AttachManager.js';
import { PRIMITIVE_PRESETS, PRESET_BY_NAME, buildLatheGeometry } from './geometry.js';
import { buildPartMesh, realiseDocument } from './realise.js';
import type { RefResolver } from './realise.js';
import type { JointSnapshot, PartDraft, SketcherPart, SketcherSession, AssemblyGroup, SketchMode } from './types.js';
import {
  emptyDocument,
  cloneDocument,
  insertPart,
  insertRef,
  groupNodes,
  ungroupNode,
  mergeIntoGroup,
  rebuildGroups,
  addJoint,
  removeJointsTouching,
  addGroupBond,
  removeGroupBondContaining,
  evictFromGroupBonds,
  groupMembersOf,
  collectPartNodes,
  normalizeDocument,
  isPartNode,
  isRefNode,
  findGroupByPath,
  findGroupOfPartId,
  collectPartNodesIn,
  nodeAt,
  pathOfPart,
  pathOfNode,
  removeTreeNode,
  extractDefinition,
  promoteToRoot,
  removePart as removeTreePart,
  setPartColor as setTreePartColor,
  setFaceColor as setTreeFaceColor,
  setFaceTexture as setTreeFaceTexture,
  setPartLabel as setTreePartLabel,
  addLightNode,
  removeLightNode,
  collectLights,
} from './documentTree.js';
import type { NodeRef, PartNode, PartSeed, RefSeed, SetDocument, SetNode } from './documentTree.js';
import type { Transform } from './transform.js';
import type { GeometryConfig, LightConfig, MaterialConfig, Vec3 } from '../domain/types.js';
import type { SetPieceEntry } from '../catalogue/types.js';

const DEFAULT_COLOR = 0x8888cc;

/** Build a raw THREE.Light from a LightConfig (Track SET, N3). Point lights have no
 *  dedicated model-layer asset yet (see SceneBridge.buildLight) but THREE.PointLight
 *  itself is generic, so the Sketcher supports it directly. */
function buildThreeLight(config: LightConfig): THREE.Light | null {
  switch (config.type) {
    case 'directional': {
      const light = new THREE.DirectionalLight(config.color, config.intensity);
      light.position.set(...config.position);
      return light;
    }
    case 'hemisphere': {
      const light = new THREE.HemisphereLight(config.skyColor, config.groundColor, config.intensity);
      if (config.position) light.position.set(...config.position);
      return light;
    }
    case 'spot': {
      const light = new THREE.SpotLight(
        config.color, config.intensity, 0, config.angle ?? Math.PI / 4, config.penumbra ?? 0, config.decay ?? 2,
      );
      light.position.set(...config.position);
      if (config.target) light.target.position.set(...config.target);
      return light;
    }
    case 'point': {
      const light = new THREE.PointLight(config.color, config.intensity, config.distance ?? 0, config.decay ?? 2);
      light.position.set(...config.position);
      return light;
    }
  }
}

/** A live object's local transform, in plain data. */
function transformOf(object: THREE.Object3D): Transform {
  return {
    position: [object.position.x, object.position.y, object.position.z],
    quaternion: [object.quaternion.x, object.quaternion.y, object.quaternion.z, object.quaternion.w],
    scale: [object.scale.x, object.scale.y, object.scale.z],
  };
}

/** Euler XYZ (radians) → quaternion, the transform form a part body stores. */
function eulerToQuaternion(euler: Vec3): [number, number, number, number] {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler));
  return [q.x, q.y, q.z, q.w];
}

/** Plain-data form of a vector, as a document stores it. */
function toTuple(v: THREE.Vector3): [number, number, number] {
  return [v.x, v.y, v.z];
}

type Phase = 'idle' | 'drawing' | 'pending-holes' | 'hole-drawing' | 'extruding' | 'revolve-drawing' | 'pending-revolve';

/**
 * Wires the PolygonSketcher → ExtrusionHandle pipeline into a complete
 * cartoon-style 3D sketching session.
 *
 * Usage:
 *   const sketcher = new CartoonSketcher(scene, camera);
 *   sketcher.startNewSketch();
 *   // … wire mouse events via onMouseMove / onClick / onPointerDown / onPointerUp
 *   sketcher.clearSession();
 *
 * The scene is mutated directly (Three.js helpers, preview meshes, completed parts).
 * The caller is responsible for the render loop.
 */
export class CartoonSketcher {
  private phase: Phase = 'idle';
  private readonly parts: SketcherPart[] = [];
  private _gridSnapSize = 0.1;
  /**
   * All parts ever created in this session, including those currently absent
   * from the scene (removed via removePart). Geometry and material are kept
   * alive here so restoreSnapshot() can reinsert them without re-creating GPU
   * resources. Cleared (and disposed) on clearSession().
   */
  private readonly allParts = new Map<string, SketcherPart>();
  private polygonSketcher: PolygonSketcher | null = null;
  private extrusionHandle: ExtrusionHandle | null = null;
  private outerOutline: THREE.Line | null = null;
  private readonly holeOutlines: THREE.Line[] = [];
  private pendingShape: THREE.Shape | null = null;
  private pendingCentroid: THREE.Vector3 | null = null;
  private nextId = 1;
  private readonly attach: AttachManager;
  /** Lights placed via the catalogue panel (Track SET, N3). */
  private readonly lights: LightConfig[] = [];
  private _environmentMap: string | undefined;
  /** THREE light objects added to the scene, keyed by LightConfig.id, for removeLight/dispose. */
  private readonly lightObjects = new Map<string, THREE.Light>();
  /**
   * The tree document — the set's stored form and the structural source of truth.
   * Meshes are realised from it and transforms are written back into it, so every
   * edit is a document edit (see editDocument).
   */
  private document: SetDocument = emptyDocument();
  /** The live object realised for each group or instance node, by node path — rebuilt on
   *  every sync. A light has none: `placeLight` builds its THREE light. */
  private readonly nodeObjects = new Map<string, THREE.Group>();

  /**
   * Definitions the session expands instances from, injected by the caller (the catalogue
   * is not the Sketcher's to know). Without one, an instance shows nothing.
   */
  private refResolver?: RefResolver;
  /** Instance expansions built by the last sync, so a re-sync can release them. */
  private instanceRoots: THREE.Object3D[] = [];

  /** Called whenever the extrusion depth changes during a drag (phase === 'extruding'). */
  onExtrusionDepthChanged?: (depth: number) => void;
  /** Called when a polygon is closed and the extrusion phase begins. */
  onExtrusionStarted?: () => void;
  /** Called when the outer polygon is closed and the shape is ready for optional holes. */
  onShapeReadyForHoles?: () => void;
  /** Called when the revolve profile polygon is closed and ready to commit. */
  onRevolveReady?: () => void;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
  ) {
    this.attach = new AttachManager(scene);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Begin a new polygon-drawing stroke.
   * @param mode   Drawing mode: 'polygon', 'rectangle', or 'circle'.
   * @param circleSegments  N-gon approximation quality for circle mode (default 32).
   */
  startNewSketch(mode: SketchMode = 'polygon', circleSegments = 32): void {
    this._endCurrentSketch();
    this.phase = 'drawing';
    this.polygonSketcher = new PolygonSketcher();
    this.polygonSketcher.snapSize = this._gridSnapSize;
    this.polygonSketcher.mode = mode;
    this.polygonSketcher.circleSegments = circleSegments;
    this.polygonSketcher.onShapeClosed = (shape, centroid) => {
      this._outerShapeClosed(shape, centroid);
    };
    this.scene.add(this.polygonSketcher.line);
    this.scene.add(this.polygonSketcher.rubberBand);
    this.scene.add(this.polygonSketcher.closureMarker);
  }

  /**
   * Begin a revolve-profile drawing stroke on the XY plane.
   * The Y axis (x=0) is the revolution axis. After the polygon closes,
   * onRevolveReady fires and the phase becomes 'pending-revolve'.
   * Call confirmLathe to commit the part or cancelPendingRevolve to discard.
   */
  startRevolveSketch(): void {
    this._endCurrentSketch();
    this.phase = 'revolve-drawing';
    this.polygonSketcher = new PolygonSketcher();
    this.polygonSketcher.snapSize = this._gridSnapSize;
    this.polygonSketcher.drawPlane = 'xy';
    this.polygonSketcher.onShapeClosed = (shape, centroid) => {
      this._revolutionShapeClosed(shape, centroid);
    };
    this.scene.add(this.polygonSketcher.line);
    this.scene.add(this.polygonSketcher.rubberBand);
    this.scene.add(this.polygonSketcher.closureMarker);
  }

  /**
   * Cancel an in-progress revolve sketch and return to idle.
   * No-op if not currently in the revolve-drawing phase.
   */
  cancelRevolveSketch(): void {
    if (this.phase !== 'revolve-drawing') return;
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /**
   * Cancel the pending revolve profile and return to idle.
   * No-op unless in pending-revolve phase.
   */
  cancelPendingRevolve(): void {
    if (this.phase !== 'pending-revolve') return;
    if (this.outerOutline) {
      this.scene.remove(this.outerOutline);
      this.outerOutline.geometry.dispose();
      (this.outerOutline.material as THREE.Material).dispose();
      this.outerOutline = null;
    }
    this.pendingShape = null;
    this.pendingCentroid = null;
    this.phase = 'idle';
  }

  /**
   * Cancel an in-progress polygon sketch and return to idle.
   * No-op if not currently in the drawing phase.
   */
  cancelSketch(): void {
    if (this.phase !== 'drawing') return;
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /**
   * Begin drawing a hole polygon for the currently-pending outer shape.
   * No-op unless in pending-holes phase.
   */
  addHole(): void {
    if (this.phase !== 'pending-holes') return;
    const holeSketcher = new PolygonSketcher();
    holeSketcher.snapSize = this._gridSnapSize;
    holeSketcher.onShapeClosed = (holeShape, holeCentroid) => {
      this._holeClosed(holeShape, holeCentroid);
    };
    this.polygonSketcher = holeSketcher;
    this.scene.add(holeSketcher.line);
    this.scene.add(holeSketcher.rubberBand);
    this.scene.add(holeSketcher.closureMarker);
    this.phase = 'hole-drawing';
  }

  /**
   * Confirm the pending outer shape (with any holes added so far) and enter
   * the extrusion phase. No-op unless in pending-holes phase.
   */
  confirmShape(): void {
    if (this.phase !== 'pending-holes' || !this.pendingShape || !this.pendingCentroid) return;
    const shape = this.pendingShape;
    const centroid = this.pendingCentroid;
    this.pendingShape = null;
    this.pendingCentroid = null;
    this._beginExtrusion(shape, centroid);
  }

  /**
   * Confirm the pending revolve profile as a solid of revolution.
   * Immediately commits a part — no depth-drag step. The profile drawn in
   * XY mode already has x=radial distance, y=height, so no rotation is applied.
   * No-op unless in pending-revolve phase.
   * @param phiLengthDeg Sweep angle in degrees (1–360). Default 360 = full revolution.
   */
  confirmLathe(phiLengthDeg = 360): void {
    if (this.phase !== 'pending-revolve' || !this.pendingShape || !this.pendingCentroid) return;
    if (this.outerOutline) {
      this.scene.remove(this.outerOutline);
      this.outerOutline.geometry.dispose();
      (this.outerOutline.material as THREE.Material).dispose();
      this.outerOutline = null;
    }
    const shape = this.pendingShape;
    const centroid = this.pendingCentroid;
    this.pendingShape = null;
    this.pendingCentroid = null;
    this.phase = 'idle';

    const phiLength = Math.max(1, Math.min(360, phiLengthDeg)) * Math.PI / 180;
    const profilePoints: [number, number][] = shape.getPoints().map((p) => [p.x, p.y]);
    // Floor-snap on Y: lowest point sits on y = 0 (centroid is (0,0,0) for XY profiles).
    const tmpGeo = buildLatheGeometry(profilePoints, phiLength);
    tmpGeo.computeBoundingBox();
    const minY = tmpGeo.boundingBox!.min.y;
    tmpGeo.dispose();

    const id = `part-${this.nextId++}`;
    const seed: PartSeed = {
      content: {
        id,
        kind: 'lathed',
        name: 'Lathe',
        lathePoints: profilePoints,
        ...(phiLength < Math.PI * 2 - 1e-6 ? { phiLength } : {}),
        color: DEFAULT_COLOR,
      },
      transform: { position: [centroid.x, -minY, centroid.z], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    };
    this.editDocument((doc) => insertPart(doc, seed));
  }

  /**
   * Cancel the current hole drawing and return to the pending-holes state.
   * No-op unless in hole-drawing phase.
   */
  cancelHole(): void {
    if (this.phase !== 'hole-drawing') return;
    this._endHoleSketcher();
    this.phase = 'pending-holes';
    this.onShapeReadyForHoles?.();
  }

  /**
   * Discard the pending outer shape and return to idle.
   * No-op unless in pending-holes phase.
   */
  cancelPendingShape(): void {
    if (this.phase !== 'pending-holes') return;
    if (this.outerOutline) {
      this.scene.remove(this.outerOutline);
      this.outerOutline.geometry.dispose();
      (this.outerOutline.material as THREE.Material).dispose();
      this.outerOutline = null;
    }
    this._disposeHoleOutlines();
    this.pendingShape = null;
    this.pendingCentroid = null;
    this.phase = 'idle';
  }

  /** Remove all parts, joints, groups, and lights, then reset to idle. */
  clearSession(): void {
    this.attach.dispose();
    for (const part of this.parts) {
      part.mesh.removeFromParent();
    }
    this.parts.length = 0;
    // Dispose ALL parts including those hibernated by removePart.
    for (const part of this.allParts.values()) {
      part.mesh.geometry.dispose();
      (part.mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    }
    this.allParts.clear();
    this.nodeObjects.clear();
    this.document = emptyDocument();
    for (const light of this.lightObjects.values()) {
      this.scene.remove(light);
    }
    this.lightObjects.clear();
    this.lights.length = 0;
    this._environmentMap = undefined;
    this._endCurrentSketch();
    this.phase = 'idle';
  }

  /**
   * Insert a preset primitive by name (case-insensitive).
   * Returns the new part so the caller can auto-select it, or null if name is unknown.
   */
  insertPrimitive(name: string): SketcherPart | null {
    const preset = PRESET_BY_NAME.get(name.toLowerCase());
    if (!preset) return null;
    const geometry = preset.geometry();
    geometry.computeBoundingBox();
    // Sit the primitive on the floor (y = 0 ground plane).
    const floorY = -(geometry.boundingBox!.min.y);
    geometry.dispose();
    const id = `part-${this.nextId++}`;
    const seed: PartSeed = {
      content: { id, kind: 'primitive', name: preset.name, color: DEFAULT_COLOR },
      transform: { position: [0, floorY, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] },
    };
    this.editDocument((doc) => insertPart(doc, seed));
    return this.parts.find((p) => p.id === id) ?? null;
  }

  /** All available preset names, in display order. */
  static get presetNames(): string[] {
    return PRIMITIVE_PRESETS.map((p) => p.name);
  }

  /**
   * The instance a mesh belongs to, walking up from the hit — an instance is one unit, so a
   * click anywhere inside its expansion addresses the instance itself.
   */
  instanceFor(object: THREE.Object3D): { path: string; ref: string; group: THREE.Group } | null {
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      const path = node.userData?.sketcherInstancePath as string | undefined;
      if (path === undefined) continue;
      return { path, ref: node.userData.sketcherInstanceRef as string, group: node as THREE.Group };
    }
    return null;
  }

  /** The expansions' meshes, for hit-testing alongside the session's own parts. */
  get instanceMeshes(): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    for (const root of this.instanceRoots) {
      root.traverse((object) => {
        if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh);
      });
    }
    return meshes;
  }

  /**
   * Inject the resolver an instance is expanded with (see `realiseDocument`). The session re-syncs,
   * because a new resolver changes what instances expand to: a caller that has just promoted a
   * selection or stored a new Definition registers it *after* the edit that needs it.
   */
  setRefResolver(resolve?: RefResolver): void {
    this.refResolver = resolve;
    this.writeBack();
    this.syncFromDocument(this.document);
  }

  /**
   * Add a light (Track SET, N3 — catalogue panel "Add" action). A light is a document
   * node, so it undoes, saves and round-trips with the rest of the set; the live THREE
   * light is built from the node on the next sync.
   */
  addLight(config: LightConfig): void {
    this.editDocument((doc) => addLightNode(doc, config));
  }

  /** Remove a light by its id. No-op if not found; a document node, so it undoes. */
  removeLight(id: string): void {
    this.editDocument((doc) => removeLightNode(doc, id));
  }

  /**
   * Build the live THREE light for a config and track it (mirrors SceneBridge's
   * buildLight, kept local so the Sketcher has no dependency on the domain
   * SceneBridge module).
   */
  private placeLight(config: LightConfig): void {
    const light = buildThreeLight(config);
    if (!light) return;
    this.scene.add(light);
    this.lightObjects.set(config.id, light);
    this.lights.push(config);
  }

  /** Currently placed lights, in tree order. */
  getLights(): readonly LightConfig[] {
    return this.lights;
  }

  /**
   * Record the applied HDRI environment (catalogue EnvironmentEntry id).
   * The Sketcher itself has no renderer instance, so it does not load the HDRI
   * texture — the page's onMount effect does that (mirroring Presenter.svelte's
   * RGBELoader + PMREMGenerator pattern) and calls this only to persist the choice
   * in the document.
   */
  setEnvironmentMap(id: string | undefined): void {
    this._environmentMap = id;
  }

  get environmentMap(): string | undefined {
    return this._environmentMap;
  }

  /**
   * Insert one catalogue part — procedural geometry + material — as a tree leaf
   * (Track SET, N3). The part is a single-material mesh with a single face group so
   * it stays editable through the same colour/texture/transform paths as a sketched
   * part, and it keeps the catalogue's own material body (roughness, metalness,
   * texture repeat) rather than collapsing to a flat colour.
   */
  insertCataloguePiece(
    name: string,
    geometry: GeometryConfig,
    material: MaterialConfig,
    position?: Vec3,
    rotation?: Vec3,
    scale?: Vec3,
  ): SketcherPart | null {
    const id = `part-${this.nextId++}`;
    const seed: PartSeed = {
      content: {
        id,
        kind: 'catalogue',
        name,
        geometry,
        material,
        color: material.color,
        faceColors: [material.color],
        faceTextures: [null],
      },
      transform: {
        position: position ?? [0, 0, 0],
        quaternion: rotation ? eulerToQuaternion(rotation) : [0, 0, 0, 1],
        scale: scale ?? [1, 1, 1],
      },
    };
    this.editDocument((doc) => insertPart(doc, seed));
    return this.parts.find((p) => p.id === id) ?? null;
  }

  /**
   * Place a Definition as a new instance (Track SET, N3). The node takes the seed's id when it
   * has one, so a caller that owns the id — an AI edit re-placing a node it read — keeps the
   * instance's identity across turns.
   *
   * A Definition the Sketcher cannot resolve is still inserted: the reference is the
   * document's, and the geometry appears as soon as the resolver knows it.
   */
  insertInstance(seed: RefSeed): string | null {
    let path: string | null = null;
    this.editDocument((doc) => {
      path = pathOfNode(doc, insertRef(doc, seed));
    });
    return path;
  }

  /**
   * Insert a catalogue entry as an instance. The document holds a reference, so the item is
   * never copied and editing its Definition reaches every place it is used; the session
   * expands it for display, and the instance is edited as one unit.
   */
  insertCatalogueEntry(entry: SetPieceEntry): { path: string | null; object: THREE.Group | null } {
    const path = this.insertInstance({
      ref: entry.id,
      name: entry.label,
      role: entry.isSetting === true ? 'structure' : 'prop',
    });
    if (path === null) return { path: null, object: null };
    const object = this.nodeObjects.get(path);
    return { path, object: object instanceof THREE.Group ? object : null };
  }

  /**
   * Promote a node's subtree into a Definition and leave an instance of it in place ("Save
   * selection as Item", N4). Returns the Definition for the caller to store and register with
   * the resolver — the session cannot resolve what the caller has not handed it.
   */
  extractInstance(target: NodeRef, ref: string): SetDocument | null {
    let definition: SetDocument | null = null;
    this.editDocument((doc) => {
      definition = extractDefinition(doc, target, ref);
    });
    return definition;
  }

  /**
   * Remove a node by path or guid. A part keeps `removePart`'s cleanup; anything else — an
   * instance, a group — is dropped with its subtree, which is what the AI diff needs to drop
   * something that was placed (see `applyDraft`).
   */
  removeNode(target: NodeRef): void {
    this.editDocument((doc) => {
      const node = typeof target === 'string' ? nodeAt(doc, target) : target;
      if (!node) return;
      if (isPartNode(node)) {
        removeJointsTouching(doc, node.content.id);
        removeTreePart(doc, node.content.id);
        evictFromGroupBonds(doc, node.content.id);
        return;
      }
      removeTreeNode(doc, node);
    });
  }

  /** The live object realised for a node — an instance's expansion, or a group's group. */
  nodeObject(target: NodeRef): THREE.Object3D | null {
    const node = typeof target === 'string' ? nodeAt(this.document, target) : target;
    if (!node) return null;
    const path = pathOfNode(this.document, node);
    return path === null ? null : this.nodeObjects.get(path) ?? null;
  }

  /** Update a part's colour, resetting all face colours to a uniform value. */
  setPartColor(id: string, color: number): void {
    this.editDocument((doc) => setTreePartColor(doc, id, color));
  }

  /** Set (or clear, with undefined) a part's semantic label. No-op for unknown id. */
  setPartLabel(id: string, label: string | undefined): void {
    this.editDocument((doc) => setTreePartLabel(doc, id, label));
  }

  /** Set (or clear, with undefined) a group's semantic name. No-op for unknown group. */
  setGroupName(groupId: string, name: string | undefined): void {
    // The mirror's group id is the group node's own id, so it addresses the document directly.
    if (!this.attach.getAssemblyGroups().some((g) => g.id === groupId)) return;
    this.editDocument((doc) => {
      const node = findGroupByPath(doc, groupId);
      if (!node) return;
      if (name === undefined) delete node.name;
      else node.name = name;
    });
  }

  /** Update the colour of a single draw group. Does not change part.color. */
  setFaceColor(id: string, materialIndex: number, color: number): void {
    this.editDocument((doc) => setTreeFaceColor(doc, id, materialIndex, color));
  }

  /**
   * Assign a texture (data URL) to a single draw group, replacing any previous
   * texture on that slot. Pass null to clear the texture.
   */
  setFaceTexture(id: string, materialIndex: number, dataUrl: string | null): void {
    this.editDocument((doc) => setTreeFaceTexture(doc, id, materialIndex, dataUrl));
  }

  /**
   * Duplicate a part. The clone is offset by +1 on X and auto-returned so the
   * caller can select it. Returns null if the part is not found.
   */
  duplicatePart(id: string): SketcherPart | null {
    const src = this.parts.find((p) => p.id === id);
    if (!src) return null;
    const newId = `part-${this.nextId++}`;
    const content = this.partToLeaf(src);
    content.id = newId;
    // Offset by +1 on local X, mirroring the old mesh-clone behaviour.
    const transform: Transform = {
      ...transformOf(src.mesh),
      position: [src.mesh.position.x + 1, src.mesh.position.y, src.mesh.position.z],
    };
    this.editDocument((doc) => insertPart(doc, { content, transform }));
    return this.parts.find((p) => p.id === newId) ?? null;
  }

  /**
   * Remove a single part by id. Its joints and group bonds are dropped; if it was
   * in a group that now has only one member, that group is dissolved.
   */
  removePart(id: string): void {
    this.editDocument((doc) => {
      removeJointsTouching(doc, id);
      const group = findGroupOfPartId(doc, id);
      removeTreePart(doc, id);
      evictFromGroupBonds(doc, id);
      const lastChild = group?.children[0];
      if (group && group.children.length === 1 && lastChild && isPartNode(lastChild)) {
        ungroupNode(doc, lastChild.content.id);
      }
    });
  }

  /**
   * Translate a part (or its entire assembly group) downward so its lowest
   * vertex sits exactly on y = 0.
   *
   * mode 'group' (default): moves the whole group — or the standalone mesh —
   * so no joint re-evaluation is needed (the entire assembly moved uniformly).
   *
   * mode 'member': snaps only this mesh in group-edit mode, then calls
   * resolveConstraints so attach neighbours re-snap. Correct for non-rotated
   * groups (the group's Y offset is accounted for by the world-space box).
   */
  snapToFloor(id: string, mode: 'group' | 'member' = 'group'): void {
    const part = this.parts.find((p) => p.id === id);
    if (!part) return;
    if (mode === 'member') {
      const box = new THREE.Box3().setFromObject(part.mesh);
      part.mesh.position.y -= box.min.y;
      part.mesh.updateWorldMatrix(false, true);
      this.attach.resolveConstraints([id], this.parts);
    } else {
      const ag = this.attach.groupForPart(id);
      const root: THREE.Object3D = ag ? ag.group : part.mesh;
      const box = new THREE.Box3().setFromObject(root);
      root.position.y -= box.min.y;
    }
  }

  /**
   * Group the given parts into a single rigid group at their current world
   * positions. All parts must be standalone (not already in any assembly group).
   * Returns the new AssemblyGroup, or null if the input is invalid.
   */
  group(partIds: string[], name?: string): AssemblyGroup | null {
    if (partIds.length < 2) return null;
    // Each selected part stands for the group that owns it, when it has one — so grouping a
    // member of a group brings that whole group, and a group can be grouped into another.
    const targets = [...new Set(partIds.flatMap((id) => {
      const ag = this.attach.groupForPart(id);
      if (ag) return [ag.id];
      // A part's guid, or the path of a node that has no part of its own — an instance.
      return pathOfPart(this.document, id) || nodeAt(this.document, id) ? [id] : [];
    }))];
    if (targets.length < 2) return null;

    let created: SetNode | null = null;
    this.editDocument((doc) => {
      const members = targets.map((target) => nodeAt(doc, target)).filter((n): n is SetNode => n !== null);
      if (members.length < 2) return;
      const memberIds = members.flatMap((node) => {
        const under = collectPartNodesIn(node.children).map((part) => part.content.id);
        return isPartNode(node) ? [node.content.id, ...under] : under;
      });
      // Siblings nest where they stand — that is how a group-of-groups is built…
      created = groupNodes(doc, members, name);
      if (!created) {
        // …and members from different branches come to the document root first, as before.
        for (const node of members) promoteToRoot(doc, node);
        created = groupNodes(doc, members, name);
      }
      if (created) addGroupBond(doc, memberIds);
    });
    if (!created) return null;
    const path = pathOfNode(this.document, created);
    return path ? this.attach.getAssemblyGroups().find((ag) => ag.id === path) ?? null : null;
  }

  /**
   * Dissolve the group that contains the given part, returning all members
   * to the scene root at their current world positions. Its group bond goes too,
   * so a later detach cannot reform it.
   * No-op if the part is not in a group.
   */
  ungroup(partId: string): void {
    this.editDocument((doc) => {
      if (findGroupOfPartId(doc, partId)) ungroupNode(doc, partId);
      removeGroupBondContaining(doc, partId);
    });
  }

  /**
   * Attach partB to partA: rotate and translate partB — or its whole group, when the
   * parts sit in different groups — so partB's contact point and normal meet partA's,
   * record the joint, then merge every part in the connected component into one
   * assembly group.
   *
   * Neither side is "parent": re-evaluating the recipe repositions whichever side
   * moved relative to the other. All four vectors are in the respective mesh's LOCAL
   * space — typically a raycast hit's face.normal and matrixWorldInverse.
   */
  commitAttach(
    partA: SketcherPart,
    localPointA: THREE.Vector3,
    localNormalA: THREE.Vector3,
    partB: SketcherPart,
    localPointB: THREE.Vector3,
    localNormalB: THREE.Vector3,
  ): void {
    this.attach.applyJoint(partA, localPointA, localNormalA, partB, localPointB, localNormalB);
    this.editDocument((doc) => {
      const members = [...new Set([...groupMembersOf(doc, partA.id), ...groupMembersOf(doc, partB.id)])];
      addJoint(doc, {
        type: 'snap',
        partAId: partA.id,
        localPointA: toTuple(localPointA),
        localNormalA: toTuple(localNormalA),
        partBId: partB.id,
        localPointB: toTuple(localPointB),
        localNormalB: toTuple(localNormalB),
      });
      mergeIntoGroup(doc, members);
    });
  }

  /**
   * Remove every joint touching a part, then rebuild its component's group topology:
   * parts still connected by joints or by a durable group bond reform as groups, the
   * rest return to the scene root.
   */
  detachAll(partId: string): void {
    this.editDocument((doc) => {
      const affected = groupMembersOf(doc, partId);
      removeJointsTouching(doc, partId);
      rebuildGroups(doc, affected);
    });
  }

  /** Current attach joints, in document order. */
  getJoints(): readonly JointSnapshot[] {
    return this.document.joints;
  }

  /** Return a snapshot of the current session. */
  getSession(): SketcherSession {
    return {
      parts: [...this.parts],
      joints: [...this.attach.getJoints()],
      assemblyGroups: [...this.attach.getAssemblyGroups()],
      lights: [...this.lights],
      environmentMap: this._environmentMap,
    };
  }

  /**
   * Expose the AttachManager so the page can read attach topology (groupForPart,
   * getAssemblyGroups, isGroup, isInGroupComponent, getJoints) and drive the joint
   * solver (resolveConstraints) directly.
   */
  get attachManager(): AttachManager {
    return this.attach;
  }

  get currentPhase(): Phase {
    return this.phase;
  }

  /** Number of holes added to the pending shape so far. 0 when not in pending-holes state. */
  get pendingHoleCount(): number {
    return this.pendingShape?.holes.length ?? 0;
  }

  /**
   * Set the grid snap size used by the polygon sketcher.
   * Takes effect on the current sketch (if active) and all future sketches.
   */
  set gridSnapSize(n: number) {
    this._gridSnapSize = n;
    if (this.polygonSketcher) this.polygonSketcher.snapSize = n;
  }

  get gridSnapSize(): number {
    return this._gridSnapSize;
  }

  /**
   * Programmatically set the extrusion depth (e.g. from a numeric input).
   * No-op when not in the extruding phase.
   */
  setExtrusionDepth(d: number): void {
    if (!this.extrusionHandle || this.phase !== 'extruding') return;
    const oldMesh = this.extrusionHandle.mesh;
    const newMesh = this.extrusionHandle.setDepth(d);
    this.scene.remove(oldMesh);
    this.scene.add(newMesh);
  }

  // ── Mouse event handlers (NDC coords) ──────────────────────────────────────

  onMouseMove(ndcX: number, ndcY: number): void {
    if (this.phase === 'drawing' || this.phase === 'hole-drawing' || this.phase === 'revolve-drawing') {
      this.polygonSketcher?.onMouseMove(ndcX, ndcY, this.camera);
    }
  }

  onClick(ndcX: number, ndcY: number): void {
    if (this.phase === 'drawing' || this.phase === 'hole-drawing' || this.phase === 'revolve-drawing') {
      this.polygonSketcher?.onClick(ndcX, ndcY, this.camera);
    }
  }

  /**
   * Call from a pointerdown event. Returns true if the extrusion handle
   * consumed the event (caller should suppress orbit controls for this gesture).
   */
  onPointerDown(ndcX: number, ndcY: number): boolean {
    if (this.phase !== 'extruding' || !this.extrusionHandle) return false;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hits = raycaster.intersectObject(this.extrusionHandle.handle, true);
    if (hits.length === 0) return false;
    this.extrusionHandle.startDrag(hits[0].point.y);
    return true;
  }

  /**
   * Call from a pointermove event while a drag may be active.
   * Returns the updated mesh if a rebuild occurred.
   */
  onPointerMove(ndcX: number, ndcY: number): THREE.Mesh | null {
    if (this.phase !== 'extruding' || !this.extrusionHandle?.isDragging) return null;
    // Project mouse onto a vertical plane at the handle's world X/Z to track Y.
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const handlePos = this.extrusionHandle.handle.position;
    const vertPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1).applyQuaternion(this.camera.quaternion).normalize(), 0);
    vertPlane.constant = -vertPlane.normal.dot(handlePos);
    const hit = new THREE.Vector3();
    if (!raycaster.ray.intersectPlane(vertPlane, hit)) return null;
    const oldMesh = this.extrusionHandle.mesh;
    const newMesh = this.extrusionHandle.onDrag(hit.y);
    if (newMesh) {
      this.scene.remove(oldMesh);
      this.scene.add(newMesh);
    }
    return newMesh;
  }

  /** Call from a pointerup event to commit the extrusion. */
  onPointerUp(): void {
    if (this.phase !== 'extruding' || !this.extrusionHandle) return;
    this.extrusionHandle.endDrag();
  }

  dispose(): void {
    this.attach.dispose();
    this.clearSession();
  }

  /**
   * The current session as a plain-data document — a detached copy, so a caller can
   * persist or diff it without touching live state. Live transforms are written back
   * first (the gizmo mutates meshes, not the document).
   */
  toDocument(): SetDocument {
    this.writeBack();
    return cloneDocument(this.document);
  }

  /** A plain-data snapshot of the current session, for undo/redo and drag bookkeeping. */
  takeSnapshot(): SetDocument {
    return this.toDocument();
  }

  /**
   * Replace the session with a snapshot. Every mesh is reused by part id where the
   * snapshot still holds it, so selection and gizmo identity survive undo/redo;
   * geometry of parts the snapshot does not know is disposed.
   */
  restoreSnapshot(snapshot: SetDocument): void {
    this.document = normalizeDocument(cloneDocument(snapshot));
    this.syncFromDocument(this.document);
  }

  /** Rebuild the Three.js scene from a tree document (the inverse of toDocument). */
  loadDocument(doc: SetDocument): void {
    this.document = normalizeDocument(cloneDocument(doc));
    this.syncFromDocument(this.document);
  }

  /**
   * Apply a mutation to the document tree and re-derive the scene from it. Live
   * transforms are written back first, so a mutation that follows a gizmo drag sees
   * the dragged positions; the tree — not the mesh — is what the edit changes.
   */
  private editDocument(edit: (doc: SetDocument) => void): void {
    this.writeBack();
    edit(this.document);
    this.syncFromDocument(this.document);
  }

  /**
   * Adopt live object state into the document: each part leaf's transform and body
   * from its mesh, each group node's transform from its THREE.Group, and the
   * environment. Structure — membership, joints, bonds, lights — is already
   * document-owned and is not re-derived.
   */
  private writeBack(): void {
    const walk = (nodes: SetNode[], parentPath: string) => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath}/${node.id}` : node.id;
        if (isPartNode(node)) {
          const live = this.allParts.get(node.content.id);
          if (live) {
            node.content = this.partToLeaf(live);
            node.transform = transformOf(live.mesh);
          }
        } else {
          const live = this.nodeObjects.get(path);
          if (live) {
            live.updateMatrix();
            node.transform = transformOf(live);
          }
        }
        walk(node.children, path);
      }
    };
    walk(this.document.root, '');

    if (this._environmentMap !== undefined) this.document.environmentMap = this._environmentMap;
    else delete this.document.environmentMap;
  }

  /**
   * Expand an instance into one live group at the node's transform. The expansion is the
   * Definition's own geometry, so it is deliberately *not* registered as session parts: the
   * instance is edited as a unit, and its internals belong to the Definition (10.4's
   * overrides are where they become addressable).
   */
  private realiseInstance(node: SetNode, path: string): THREE.Group {
    const t = node.transform;
    const instance = new THREE.Group();
    instance.name = path;
    instance.position.set(t.position[0], t.position[1], t.position[2]);
    instance.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
    instance.scale.set(t.scale[0], t.scale[1], t.scale[2]);
    // Tagged with the node's path, which is how a hit inside it resolves to the instance, and
    // with its Definition, which is what an edit-source action needs.
    instance.userData = { sketcherInstancePath: path, sketcherInstanceRef: node.ref };

    const definition = this.refResolver?.(node.ref!);
    if (definition) {
      const realised = realiseDocument(definition, this.refResolver);
      for (const child of [...realised.children]) instance.add(child);
    }
    return instance;
  }

  /** Release an instance expansion: its geometry and materials are not the session's. */
  private disposeInstance(root: THREE.Object3D): void {
    root.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        (material as THREE.MeshStandardMaterial).map?.dispose();
        material.dispose();
      }
    });
    root.removeFromParent();
  }

  /** Serialise one live part into a part body — its transform lives on the node. */
  private partToLeaf(p: SketcherPart): PartDraft {
    const leaf: PartDraft = {
      id: p.id,
      kind: p.shapePoints !== null
        ? 'sketch'
        : p.lathePoints !== null
          ? 'lathed'
          : p.geometry
            ? 'catalogue'
            : 'primitive',
      name: p.name,
      ...(p.label !== undefined ? { label: p.label } : {}),
      ...(p.geometry !== undefined ? { geometry: p.geometry } : {}),
      ...(p.material !== undefined ? { material: p.material } : {}),
      color: p.color,
      faceColors: [...p.faceColors],
      faceTextures: [...p.faceTextures],
    };
    if (p.shapePoints !== null) {
      leaf.shapePoints = p.shapePoints;
      leaf.depth = p.depth;
      if (p.holes && p.holes.length > 0) leaf.holes = p.holes;
    }
    if (p.lathePoints !== null) {
      leaf.lathePoints = p.lathePoints;
      if (p.lathePhiLength !== null && p.lathePhiLength < Math.PI * 2 - 1e-6) {
        leaf.phiLength = p.lathePhiLength;
      }
    }
    return leaf;
  }

  /**
   * Rebuild the Three.js scene to match the document. All currently-present meshes are
   * removed; the subset the document still holds is re-added at their LOCAL transforms,
   * re-parented into a THREE.Group per group node; joints, groups and bonds are mirrored
   * into the AttachManager (no repositioning — positions already reflect the attached state).
   */
  private syncFromDocument(doc: SetDocument): void {
    // Collect part bodies by guid from the tree.
    const partLeaves = new Map<string, PartDraft>();
    for (const node of collectPartNodes(doc)) partLeaves.set(node.content.id, node.content);

    // Release the last instance expansions (their meshes and materials are theirs alone),
    // then dissolve current groups and clear joint/group state.
    for (const root of this.instanceRoots) this.disposeInstance(root);
    this.instanceRoots = [];
    this.attach.resetGroups();
    this.nodeObjects.clear();

    // Dispose meshes no longer in the tree.
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      if (!partLeaves.has(p.id)) {
        p.mesh.removeFromParent();
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => { m.map?.dispose(); m.dispose(); });
        this.parts.splice(i, 1);
        this.allParts.delete(p.id);
      }
    }

    // Reuse existing meshes (update transform) + realise new ones, in tree order.
    const existing = new Map(this.parts.map((p) => [p.id, p]));
    this.parts.length = 0;
    this.nextId = 1;

    const buildPart = (node: PartNode): SketcherPart | null => {
      const pd = node.content;
      const t = node.transform;
      const prev = existing.get(pd.id);
      if (prev) {
        const mesh = prev.mesh;
        mesh.position.set(t.position[0], t.position[1], t.position[2]);
        mesh.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
        mesh.scale.set(t.scale[0], t.scale[1], t.scale[2]);
        mesh.updateWorldMatrix(false, true);
        // Re-apply colour/faces/textures so undo/redo of colour edits is visual too.
        const mats = mesh.material as THREE.MeshStandardMaterial[];
        const cols = pd.faceColors ?? mats.map(() => pd.color);
        const texs = pd.faceTextures ?? mats.map(() => null);
        mats.forEach((m, i) => {
          if (m.map) { m.map.dispose(); m.map = null; }
          const url = texs[i] ?? null;
          if (url) {
            m.map = new THREE.TextureLoader().load(url);
            m.color.set(0xffffff);
          } else {
            m.color.setHex(cols[i] ?? pd.color);
          }
          m.needsUpdate = true;
        });
        // Update the live wrapper in place (preserve object identity for selection/gizmo).
        prev.depth = pd.kind === 'sketch' ? (pd.depth ?? 0) : 0;
        prev.name = pd.name;
        prev.label = pd.label;
        prev.geometry = pd.geometry;
        prev.material = pd.material;
        prev.color = pd.color;
        prev.shapePoints = pd.kind === 'sketch' ? (pd.shapePoints ?? null) : null;
        prev.holes = pd.holes ?? null;
        prev.lathePoints = pd.kind === 'lathed' ? (pd.lathePoints ?? null) : null;
        prev.lathePhiLength = pd.kind === 'lathed' ? (pd.phiLength ?? Math.PI * 2) : null;
        prev.faceColors = pd.faceColors ? [...pd.faceColors] : mats.map(() => pd.color);
        prev.faceTextures = pd.faceTextures ? [...pd.faceTextures] : mats.map(() => null);
        this.parts.push(prev);
        this.allParts.set(prev.id, prev);
        const num = parseInt(pd.id.replace('part-', ''), 10);
        if (!isNaN(num) && num >= this.nextId) this.nextId = num + 1;
        return prev;
      }

      const mesh = buildPartMesh(pd, t);
      if (!mesh) return null;
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      const faceColors = pd.faceColors ? [...pd.faceColors] : mats.map(() => pd.color);
      const faceTextures = pd.faceTextures ? [...pd.faceTextures] : mats.map(() => null);
      const part: SketcherPart = {
        id: pd.id,
        mesh,
        depth: pd.kind === 'sketch' ? (pd.depth ?? 0) : 0,
        centroid: new THREE.Vector3(),
        name: pd.name,
        label: pd.label,
        geometry: pd.geometry,
        material: pd.material,
        color: pd.color,
        shapePoints: pd.kind === 'sketch' ? (pd.shapePoints ?? null) : null,
        holes: pd.holes ?? null,
        lathePoints: pd.kind === 'lathed' ? (pd.lathePoints ?? null) : null,
        lathePhiLength: pd.kind === 'lathed' ? (pd.phiLength ?? Math.PI * 2) : null,
        faceColors,
        faceTextures,
      };
      this.parts.push(part);
      this.allParts.set(part.id, part);
      const num = parseInt(pd.id.replace('part-', ''), 10);
      if (!isNaN(num) && num >= this.nextId) this.nextId = num + 1;
      return part;
    };

    // Walk the tree, building parts and adopting groups at every depth: a nested group's
    // THREE.Group is parented into its parent's object, so a group's transform composes with
    // its children's exactly as the document says.
    const walkTree = (nodes: SetNode[], parentPath: string, parentObject: THREE.Object3D) => {
      for (const node of nodes) {
        const path = parentPath ? `${parentPath}/${node.id}` : node.id;
        if (isPartNode(node)) {
          const part = buildPart(node);
          if (part) parentObject.add(part.mesh);
        } else if (isRefNode(node)) {
          const instance = this.realiseInstance(node, path);
          parentObject.add(instance);
          this.nodeObjects.set(path, instance);
          this.instanceRoots.push(instance);
        } else if (node.role === 'structure') {
          const t = node.transform;
          const group = new THREE.Group();
          group.position.set(t.position[0], t.position[1], t.position[2]);
          group.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
          group.scale.set(t.scale[0], t.scale[1], t.scale[2]);
          parentObject.add(group);
          this.nodeObjects.set(path, group);
          walkTree(node.children, path, group);
          const memberIds = collectPartNodesIn(node.children).map((part) => part.content.id);
          this.attach.adoptGroup(path, group, memberIds, node.name, node.isGroup);
        }
        // A light node has no scene object of its own: `placeLight` builds its THREE light.
      }
    };
    walkTree(doc.root, '', this.scene);

    // Mirror the attach topology: joints and the durable group bonds.
    this.attach.setJoints(doc.joints.filter((js) => partLeaves.has(js.partAId) && partLeaves.has(js.partBId)));
    this.attach.setBonds(doc.groupComponents ?? []);

    // Clear + re-add lights from the tree.
    for (const light of this.lightObjects.values()) this.scene.remove(light);
    this.lightObjects.clear();
    this.lights.length = 0;
    for (const config of collectLights(doc)) this.placeLight(config);
    this._environmentMap = doc.environmentMap;
  }

  // ── Private ─────────────────────────────────────────────────────────────────

   private _beginExtrusion(shape: THREE.Shape, centroid: THREE.Vector3): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
    if (this.outerOutline) {
      this.scene.remove(this.outerOutline);
      this.outerOutline.geometry.dispose();
      (this.outerOutline.material as THREE.Material).dispose();
      this.outerOutline = null;
    }
    this._disposeHoleOutlines();

    this.phase = 'extruding';
    const shapePoints: [number, number][] = shape.getPoints().map((v) => [v.x, v.y]);
    const holePoints: [number, number][][] = shape.holes.map((h) => h.getPoints().map((v) => [v.x, v.y]));
    const handle = new ExtrusionHandle(shape, centroid);
    handle.onExtrusionComplete = (mesh, depth) => {
      this._commitPart(mesh, depth, centroid, shapePoints, holePoints);
    };
    handle.onDepthChanged = (depth) => { this.onExtrusionDepthChanged?.(depth); };
    this.extrusionHandle = handle;
    this.scene.add(handle.handle);
    this.scene.add(handle.mesh);
    this.onExtrusionStarted?.();
  }

  private _commitPart(mesh: THREE.Mesh, depth: number, centroid: THREE.Vector3, shapePoints: [number, number][], holes: [number, number][][] = []): void {
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.extrusionHandle.handle.geometry.dispose();
      this.extrusionHandle.handle.children.forEach((c) => ((c as THREE.Mesh).geometry as THREE.BufferGeometry)?.dispose());
      (this.extrusionHandle.handle.material as THREE.Material).dispose();
      this.extrusionHandle = null;
    }
    // Commit the sketch via the tree; the reconcile rebuilds the mesh, so dispose the preview.
    mesh.removeFromParent();
    mesh.geometry.dispose();
    (mesh.material as THREE.MeshStandardMaterial[]).forEach((m) => { m.map?.dispose(); m.dispose(); });
    const id = `part-${this.nextId++}`;
    const seed: PartSeed = {
      content: {
        id,
        kind: 'sketch',
        name: 'Shape',
        shapePoints,
        depth,
        ...(holes.length > 0 ? { holes } : {}),
        color: DEFAULT_COLOR,
      },
      transform: transformOf(mesh),
    };
    this.editDocument((doc) => insertPart(doc, seed));
    this.phase = 'idle';
  }

  private _disposeHoleOutlines(): void {
    for (const line of this.holeOutlines) {
      this.scene.remove(line);
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    }
    this.holeOutlines.length = 0;
  }

  private _endCurrentSketch(): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
    if (this.outerOutline) {
      this.scene.remove(this.outerOutline);
      this.outerOutline.geometry.dispose();
      (this.outerOutline.material as THREE.Material).dispose();
      this.outerOutline = null;
    }
    this._disposeHoleOutlines();
    if (this.extrusionHandle) {
      this.scene.remove(this.extrusionHandle.handle);
      this.scene.remove(this.extrusionHandle.mesh);
      this.extrusionHandle.dispose();
      this.extrusionHandle = null;
    }
    this.pendingShape = null;
    this.pendingCentroid = null;
  }

  private _endHoleSketcher(): void {
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
  }

  private _revolutionShapeClosed(shape: THREE.Shape, centroid: THREE.Vector3): void {
    // PolygonSketcher.reset() clears its line in-place immediately after firing
    // onShapeClosed, so build a fresh outline from the shape points here.
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.dispose();
      this.polygonSketcher = null;
    }
    // Revolve profile lives in the XY plane: shape.x = world X, shape.y = world Y.
    const pts = shape.getPoints();
    const worldPts = pts.map((p) => new THREE.Vector3(p.x, p.y, 0));
    worldPts.push(worldPts[0].clone()); // close the loop
    const geo = new THREE.BufferGeometry().setFromPoints(worldPts);
    const mat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
    this.outerOutline = new THREE.Line(geo, mat);
    this.outerOutline.renderOrder = 999;
    this.scene.add(this.outerOutline);

    this.pendingShape = shape;
    this.pendingCentroid = centroid;
    this.phase = 'pending-revolve';
    this.onRevolveReady?.();
  }

  private _outerShapeClosed(shape: THREE.Shape, centroid: THREE.Vector3): void {
    // Keep the closed outline visible as a context guide during hole drawing.
    // The PolygonSketcher resets its own line geometry immediately after firing
    // onShapeClosed, so we build a fresh line from the shape points here rather
    // than saving the now-empty sketcher line.
    if (this.polygonSketcher) {
      this.scene.remove(this.polygonSketcher.line);
      this.scene.remove(this.polygonSketcher.rubberBand);
      this.scene.remove(this.polygonSketcher.closureMarker);
      this.polygonSketcher.rubberBand.geometry.dispose();
      this.polygonSketcher.closureMarker.geometry.dispose();
      (this.polygonSketcher.rubberBand.material as THREE.Material).dispose();
      (this.polygonSketcher.closureMarker.material as THREE.Material).dispose();
      this.polygonSketcher = null;
    }
    const cx = centroid.x;
    const cz = centroid.z;
    const worldPts = shape.getPoints().map((p) => new THREE.Vector3(p.x + cx, 0, cz - p.y));
    worldPts.push(worldPts[0].clone());
    const outlineGeo = new THREE.BufferGeometry().setFromPoints(worldPts);
    const outlineMat = new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false });
    this.outerOutline = new THREE.Line(outlineGeo, outlineMat);
    this.outerOutline.renderOrder = 999;
    this.scene.add(this.outerOutline);
    this.pendingShape = shape;
    this.pendingCentroid = centroid;
    this.phase = 'pending-holes';
    this.onShapeReadyForHoles?.();
  }

  private _holeClosed(holeShape: THREE.Shape, holeCentroid: THREE.Vector3): void {
    this._endHoleSketcher();
    this.phase = 'pending-holes';

    if (!this.pendingShape || !this.pendingCentroid) {
      this.onShapeReadyForHoles?.();
      return;
    }

    // Translate hole points from hole-centroid-relative space to outer-centroid-relative space.
    // _closeShape maps: shape.x = world.x - cx, shape.y = cz - world.z
    // So hole.x + (hcx - cx) and hole.y + (cz - hcz) gives outer space.
    const cx = this.pendingCentroid.x;
    const cz = this.pendingCentroid.z;
    const hcx = holeCentroid.x;
    const hcz = holeCentroid.z;
    const dx = hcx - cx;
    const dy = cz - hcz;
    const translatedPts = holeShape.getPoints().map((p) => new THREE.Vector2(p.x + dx, p.y + dy));

    // Bounding-box pre-check: skip holes that obviously extend outside the outer shape.
    const outerPts = this.pendingShape.getPoints();
    const outerMinX = Math.min(...outerPts.map((p) => p.x));
    const outerMaxX = Math.max(...outerPts.map((p) => p.x));
    const outerMinY = Math.min(...outerPts.map((p) => p.y));
    const outerMaxY = Math.max(...outerPts.map((p) => p.y));
    const holeMinX = Math.min(...translatedPts.map((p) => p.x));
    const holeMaxX = Math.max(...translatedPts.map((p) => p.x));
    const holeMinY = Math.min(...translatedPts.map((p) => p.y));
    const holeMaxY = Math.max(...translatedPts.map((p) => p.y));
    if (holeMinX < outerMinX || holeMaxX > outerMaxX || holeMinY < outerMinY || holeMaxY > outerMaxY) {
      // Hole extends outside the outer shape; discard silently.
      this.onShapeReadyForHoles?.();
      return;
    }

    const holePath = new THREE.Path(translatedPts);
    this.pendingShape.holes.push(holePath);

    // Build a fresh line outline for the accepted hole so the user can see where
    // prior holes are while drawing subsequent ones.
    const worldPts = translatedPts.map((p) => {
      return new THREE.Vector3(p.x + cx, 0, cz - p.y);
    });
    worldPts.push(worldPts[0].clone());
    const holeGeo = new THREE.BufferGeometry().setFromPoints(worldPts);
    const holeMat = new THREE.LineBasicMaterial({ color: 0xffaa00, depthTest: false });
    const holeLine = new THREE.Line(holeGeo, holeMat);
    holeLine.renderOrder = 999;
    this.scene.add(holeLine);
    this.holeOutlines.push(holeLine);

    this.onShapeReadyForHoles?.();
  }
}
