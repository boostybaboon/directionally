import * as THREE from 'three';

/**
 * Colour palette for body regions.
 * Exposed so the character route (and eventually the editor) can override them.
 */
export interface BodyColors {
  skin: number;
  torso: number;
  legs: number;
  shoes: number;
  hands: number;
}

export const DEFAULT_COLORS: BodyColors = {
  skin:  0xf5cba7,
  torso: 0x4466aa,
  legs:  0x334466,
  shoes: 0x222222,
  hands: 0xf0b89a,
};

/** Visual style for the procedural body geometry. */
export type RobotStyle = 'organic' | 'c3po' | 'sonny';

/** Warm gold palette for a C3PO-style robot. */
export const C3PO_COLORS: BodyColors = {
  skin:  0xd4a520,
  torso: 0xc49018,
  legs:  0xb07c10,
  shoes: 0x8b6410,
  hands: 0xd4a520,
};

/** Cool white/silver palette for a Sonny-style robot. */
export const SONNY_COLORS: BodyColors = {
  skin:  0xeaeaea,
  torso: 0xd8e0f0,
  legs:  0xc8d4e8,
  shoes: 0x9aa4b8,
  hands: 0xe2e2f0,
};

/**
 * Per-bone geometry sizing. All values are in centimetres.
 * - `tubeRadiusX` / `tubeRadiusZ`: half-widths of the elliptical tube cross-section
 *   in the bone's local X and Z axes.
 * - `jointRadius`: joint X half-radius. Set to 0 to suppress the joint.
 * - `jointRadiusY`: Y half-height of the joint. Defaults to `jointRadius` (sphere).
 *   Set larger for a tall head.
 * - `jointRadiusZ`: Z half-depth of the joint. Defaults to `jointRadius`.
 *   Set smaller than `jointRadius` for a flat shape (e.g. palm disc).
 * - `jointOffsetY`: translate the joint centre along the bone's local +Y axis (cm).
 *   Set equal to `jointRadiusY` so the base sits flush at the bone origin.
 * - `jointFrustumRatio` (0–1): when present, renders the joint as a frustum.
 *   `jointRadius` is the wide end (+Y, finger side); `jointRadius * ratio` is the
 *   narrow end (-Y, bone origin). Combine with `jointOffsetY = jointRadiusY / 2`.
 * - `jointFrustumRatioZ` (0–1): independent Z taper for the frustum. When set, Z
 *   tapers in the *opposite* direction to X — full `jointRadiusZ` at the bone origin
 *   (wrist, -Y) and `jointRadiusZ * ratio` at the finger end (+Y). Models a palm that
 *   fans outward in width but narrows in thickness toward the knuckles.
 * Tube is suppressed when either radius is 0.
 */
export interface BoneParams {
  tubeRadiusX: number;
  tubeRadiusZ: number;
  jointRadius: number;
  /** Y half-height of the joint; defaults to `jointRadius` (sphere). */
  jointRadiusY?: number;
  /** Z half-depth of the joint; defaults to `jointRadius`. */
  jointRadiusZ?: number;
  /** Local-Y offset of the joint centre in cm (positive = toward child bone). */
  jointOffsetY?: number;
  /** Frustum ratio (0–1): switches joint to a frustum. X fans wide at +Y (knuckle end). */
  jointFrustumRatio?: number;
  /** Independent Z taper for the frustum — Z tapers toward +Y (knuckle end), opposite to X. */
  jointFrustumRatioZ?: number;
}

/** Keyed by bone group name (matching BONE_GROUPS[*].key and BONE_SPECS[*].group). */
export type BoneParamMap = Record<string, BoneParams>;

/** Canonical bone groups for the tuning UI. Symmetric left/right pairs share one entry. */
export const BONE_GROUPS: ReadonlyArray<{ readonly label: string; readonly key: string }> = [
  { label: 'Hips',        key: 'hips'     },
  { label: 'Spine',       key: 'spine'    },
  { label: 'Chest',       key: 'spine1'   },
  { label: 'Upper Chest', key: 'spine2'   },
  { label: 'Neck',        key: 'neck'     },
  { label: 'Head',        key: 'head'     },
  { label: 'Shoulder',    key: 'shoulder' },
  { label: 'Upper Arm',   key: 'arm'      },
  { label: 'Forearm',     key: 'forearm'  },
  { label: 'Hand',        key: 'hand'     },
  { label: 'Upper Leg',   key: 'upleg'    },
  { label: 'Lower Leg',   key: 'leg'      },
  { label: 'Foot',        key: 'foot'     },
  { label: 'Toe',         key: 'toe'      },
  { label: 'Finger',      key: 'finger'   },
];

/**
 * Anatomically-seeded defaults for the Mixamo xbot skeleton.
 * All values are in centimetres. Tune via the character page and bake back here.
 */
export const DEFAULT_BONE_PARAMS: BoneParamMap = {
  //                        rx     rz    joint  (cm)
  hips:     { tubeRadiusX: 10.0, tubeRadiusZ:  7.0, jointRadius:  8.0 },
  spine:    { tubeRadiusX:  9.0, tubeRadiusZ:  6.0, jointRadius:  5.0 },
  spine1:   { tubeRadiusX: 11.0, tubeRadiusZ:  7.0, jointRadius:  5.5 },
  spine2:   { tubeRadiusX: 13.0, tubeRadiusZ:  8.0, jointRadius:  6.0 },
  neck:     { tubeRadiusX:  3.5, tubeRadiusZ:  3.0, jointRadius:  3.5 },
  // Offset ellipsoid: base flush at head-bone origin, extends ~13 cm toward HeadTop_End.
  head:     { tubeRadiusX:  0.0, tubeRadiusZ:  0.0, jointRadius: 10.0, jointRadiusY: 13.0, jointOffsetY: 13.0 },
  shoulder: { tubeRadiusX:  2.0, tubeRadiusZ:  2.0, jointRadius:  5.0 },
  arm:      { tubeRadiusX:  4.0, tubeRadiusZ:  3.5, jointRadius:  4.5 },
  forearm:  { tubeRadiusX:  3.0, tubeRadiusZ:  2.5, jointRadius:  3.5 },
  // Frustum palm: fans wide in X toward knuckles, narrows in Z (side view tapers inward).
  // jointOffsetY = jointRadiusY/2 puts the wrist end flush at the hand-bone origin.
  hand:     { tubeRadiusX:  0.0, tubeRadiusZ:  0.0, jointRadius:  6.0, jointRadiusY: 12.0, jointRadiusZ:  3.0, jointOffsetY:  6.0, jointFrustumRatio: 0.60, jointFrustumRatioZ: 0.70 },
  upleg:    { tubeRadiusX:  7.0, tubeRadiusZ:  5.5, jointRadius:  6.0 },
  leg:      { tubeRadiusX:  5.0, tubeRadiusZ:  4.0, jointRadius:  4.5 },
  foot:     { tubeRadiusX:  4.0, tubeRadiusZ:  3.0, jointRadius:  3.0 },
  toe:      { tubeRadiusX:  2.0, tubeRadiusZ:  2.0, jointRadius:  2.0 },
  finger:   { tubeRadiusX:  1.0, tubeRadiusZ:  1.0, jointRadius:  1.2 },
};

/** Maps Mixamo bone name → colour region + tuning group key. */
interface BoneSpec {
  region: keyof BodyColors;
  group: string;
}

const BONE_SPECS: Record<string, BoneSpec> = {
  // ── Torso ──────────────────────────────────────────────────────────────────
  mixamorigHips:           { region: 'legs',  group: 'hips'     },
  mixamorigSpine:          { region: 'torso', group: 'spine'    },
  mixamorigSpine1:         { region: 'torso', group: 'spine1'   },
  mixamorigSpine2:         { region: 'torso', group: 'spine2'   },
  mixamorigNeck:           { region: 'skin',  group: 'neck'     },
  mixamorigHead:           { region: 'skin',  group: 'head'     },
  // ── Arms ───────────────────────────────────────────────────────────────────
  mixamorigLeftShoulder:   { region: 'torso', group: 'shoulder' },
  mixamorigRightShoulder:  { region: 'torso', group: 'shoulder' },
  mixamorigLeftArm:        { region: 'skin',  group: 'arm'      },
  mixamorigLeftForeArm:    { region: 'skin',  group: 'forearm'  },
  mixamorigRightArm:       { region: 'skin',  group: 'arm'      },
  mixamorigRightForeArm:   { region: 'skin',  group: 'forearm'  },
  // ── Hands / fingers ────────────────────────────────────────────────────────
  mixamorigLeftHand:        { region: 'hands', group: 'hand'   },
  mixamorigRightHand:       { region: 'hands', group: 'hand'   },
  mixamorigLeftHandThumb1:  { region: 'skin',  group: 'finger' },
  mixamorigLeftHandThumb2:  { region: 'skin',  group: 'finger' },
  mixamorigLeftHandThumb3:  { region: 'skin',  group: 'finger' },
  mixamorigLeftHandIndex1:  { region: 'hands', group: 'finger' },
  mixamorigLeftHandIndex2:  { region: 'hands', group: 'finger' },
  mixamorigLeftHandIndex3:  { region: 'hands', group: 'finger' },
  mixamorigLeftHandMiddle1: { region: 'hands', group: 'finger' },
  mixamorigLeftHandMiddle2: { region: 'hands', group: 'finger' },
  mixamorigLeftHandMiddle3: { region: 'hands', group: 'finger' },
  mixamorigLeftHandRing1:   { region: 'hands', group: 'finger' },
  mixamorigLeftHandRing2:   { region: 'hands', group: 'finger' },
  mixamorigLeftHandRing3:   { region: 'hands', group: 'finger' },
  mixamorigLeftHandPinky1:  { region: 'hands', group: 'finger' },
  mixamorigLeftHandPinky2:  { region: 'hands', group: 'finger' },
  mixamorigLeftHandPinky3:  { region: 'hands', group: 'finger' },
  // Finger tips — terminal cap spheres (bones absent in some rigs are silently ignored).
  mixamorigLeftHandThumb4:  { region: 'skin',  group: 'finger' },
  mixamorigLeftHandIndex4:  { region: 'hands', group: 'finger' },
  mixamorigLeftHandMiddle4: { region: 'hands', group: 'finger' },
  mixamorigLeftHandRing4:   { region: 'hands', group: 'finger' },
  mixamorigLeftHandPinky4:  { region: 'hands', group: 'finger' },
  mixamorigRightHandThumb1:  { region: 'skin',  group: 'finger' },
  mixamorigRightHandThumb2:  { region: 'skin',  group: 'finger' },
  mixamorigRightHandThumb3:  { region: 'skin',  group: 'finger' },
  mixamorigRightHandIndex1:  { region: 'hands', group: 'finger' },
  mixamorigRightHandIndex2:  { region: 'hands', group: 'finger' },
  mixamorigRightHandIndex3:  { region: 'hands', group: 'finger' },
  mixamorigRightHandMiddle1: { region: 'hands', group: 'finger' },
  mixamorigRightHandMiddle2: { region: 'hands', group: 'finger' },
  mixamorigRightHandMiddle3: { region: 'hands', group: 'finger' },
  mixamorigRightHandRing1:   { region: 'hands', group: 'finger' },
  mixamorigRightHandRing2:   { region: 'hands', group: 'finger' },
  mixamorigRightHandRing3:   { region: 'hands', group: 'finger' },
  mixamorigRightHandPinky1:  { region: 'hands', group: 'finger' },
  mixamorigRightHandPinky2:  { region: 'hands', group: 'finger' },
  mixamorigRightHandPinky3:  { region: 'hands', group: 'finger' },
  mixamorigRightHandThumb4:  { region: 'skin',  group: 'finger' },
  mixamorigRightHandIndex4:  { region: 'hands', group: 'finger' },
  mixamorigRightHandMiddle4: { region: 'hands', group: 'finger' },
  mixamorigRightHandRing4:   { region: 'hands', group: 'finger' },
  mixamorigRightHandPinky4:  { region: 'hands', group: 'finger' },
  // ── Legs ───────────────────────────────────────────────────────────────────
  mixamorigLeftUpLeg:      { region: 'legs',  group: 'upleg' },
  mixamorigLeftLeg:        { region: 'legs',  group: 'leg'   },
  mixamorigLeftFoot:       { region: 'shoes', group: 'foot'  },
  mixamorigRightUpLeg:     { region: 'legs',  group: 'upleg' },
  mixamorigRightLeg:       { region: 'legs',  group: 'leg'   },
  mixamorigRightFoot:      { region: 'shoes', group: 'foot'  },
  // ── Toes ───────────────────────────────────────────────────────────────────
  mixamorigLeftToeBase:    { region: 'shoes', group: 'toe'   },
  mixamorigRightToeBase:   { region: 'shoes', group: 'toe'   },
  // Toe tips — terminal cap spheres.
  mixamorigLeftToe_End:    { region: 'shoes', group: 'toe'   },
  mixamorigRightToe_End:   { region: 'shoes', group: 'toe'   },
};

const _up = new THREE.Vector3(0, 1, 0);
const JOINT_RADIUS = 1.8; // cm
const BONE_RADIUS  = 0.7; // cm

/**
 * Builds a toon-shaded procedural body on top of an existing Mixamo skeleton.
 *
 * Usage:
 * 1. Load a Mixamo GLB via `GLTFLoader`.
 * 2. `new ProceduralHumanoid(gltf.scene, gltf.animations)`.
 * 3. Add `humanoid.root` to the Three.js scene.
 * 4. Call `humanoid.update(delta)` in the render loop.
 *
 * The original SkinnedMesh is hidden so only the capsule/sphere geometry shows.
 * Bone names must follow the Mixamo GLB convention (`mixamorigHips`, no colon).
 */
export class ProceduralHumanoid {
  readonly root: THREE.Object3D;
  readonly clips: THREE.AnimationClip[];

  private mixer: THREE.AnimationMixer;
  private activeAction: THREE.AnimationAction | null = null;
  private bodyMeshes: THREE.Mesh[] = [];
  private skeletonMeshes: THREE.Mesh[] = [];
  /** Bone→cylinder links; position/rotation/scale are re-synced every frame. */
  private skeletonLinks: Array<{ child: THREE.Bone; mesh: THREE.Mesh }> = [];
  /** Body tube links re-synced every frame when animation moves bone positions. */
  private bodyLinks: Array<{ child: THREE.Bone; mesh: THREE.Mesh; inset: number }> = [];
  /** Lazily-generated in-place variants: kept for potential future use. */
  private inPlaceCache = new Map<string, THREE.AnimationClip>();
  /** Reference to mixamorigHips for runtime root-motion cancellation. */
  private hipsRef: THREE.Bone | null = null;
  /** When true, hips XZ is pinned to 0 each frame so the character animates on the spot. */
  private _inPlaceMode = false;

  constructor(
    gltfScene: THREE.Group,
    clips: THREE.AnimationClip[],
    colors: BodyColors = DEFAULT_COLORS,
    style: RobotStyle = 'organic',
    boneParamMap: BoneParamMap = {},
    insetFactor: number = 0,
  ) {
    this.root = gltfScene;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(gltfScene);

    this._hideSkinnedMeshes();
    this._attachBodyGeom(colors, style, boneParamMap, insetFactor);
    this._attachSkeletonGeom();
    this.setSkeletonVisible(false);

    this.root.traverse((obj) => {
      if (obj instanceof THREE.Bone && obj.name === 'mixamorigHips') this.hipsRef = obj;
    });
  }

  private _hideSkinnedMeshes(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.SkinnedMesh) obj.visible = false;
    });
  }

  private _attachBodyGeom(
    colors: BodyColors,
    style: RobotStyle,
    boneParamMap: BoneParamMap,
    insetFactor: number,
  ): void {
    const mat = (region: keyof BodyColors) =>
      new THREE.MeshToonMaterial({ color: colors[region] });

    // C3PO: 8-sided octagonal tubes, slightly tapered.
    // Organic / Sonny: 16-sided round tubes.
    const isCPO     = style === 'c3po';
    const tubeSides = isCPO ? 8 : 16;
    const topRatio  = isCPO ? 0.84 : 1.0;
    const fallback: BoneParams = { tubeRadiusX: 2, tubeRadiusZ: 2, jointRadius: 2 };

    this.root.traverse((obj) => {
      const spec = BONE_SPECS[obj.name];
      if (!spec) return;

      const bp = boneParamMap[spec.group] ?? DEFAULT_BONE_PARAMS[spec.group] ?? fallback;
      const m  = mat(spec.region);

      // Joint at this bone's origin.
      // - Default: triaxial ellipsoid (sphere when all radii equal).
      // - jointFrustumRatio set: frustum (CylinderGeometry) — wide end at +Y (finger side),
      //   narrow end at -Y (bone origin). jointOffsetY = ry/2 sits the wrist end flush.
      if (bp.jointRadius > 1e-5) {
        const ry = bp.jointRadiusY ?? bp.jointRadius;
        const rz = bp.jointRadiusZ ?? bp.jointRadius;
        let jointGeom: THREE.BufferGeometry;
        if (bp.jointFrustumRatio !== undefined) {
          if (bp.jointFrustumRatioZ !== undefined) {
            // Independent X/Z taper: X fans wide toward +Y (knuckle), Z narrows toward +Y.
            // Start from a unit cylinder (radius=1 at both ends) then reshape each vertex.
            // t=0 → wrist (-Y): xMul=xRatio (narrow), zMul=1 (full depth)
            // t=1 → knuckle (+Y): xMul=1 (wide), zMul=zRatio (thin)
            const xRatio = bp.jointFrustumRatio;
            const zRatio = bp.jointFrustumRatioZ;
            jointGeom = new THREE.CylinderGeometry(1, 1, 1, tubeSides);
            const pos = jointGeom.attributes.position as THREE.BufferAttribute;
            for (let vi = 0; vi < pos.count; vi++) {
              const t = pos.getY(vi) + 0.5; // 0 = wrist, 1 = knuckle
              const xMul = xRatio + t * (1.0 - xRatio); // narrow→wide
              const zMul = 1.0 - t * (1.0 - zRatio);    // full→thin
              pos.setX(vi, pos.getX(vi) * xMul);
              pos.setZ(vi, pos.getZ(vi) * zMul);
            }
            pos.needsUpdate = true;
            jointGeom.computeVertexNormals();
          } else {
            // Uniform frustum: same ratio in X and Z.
            jointGeom = new THREE.CylinderGeometry(1, bp.jointFrustumRatio, 1, tubeSides);
          }
        } else {
          jointGeom = new THREE.SphereGeometry(1, tubeSides, Math.ceil(tubeSides * 0.75));
        }
        const jointMesh = new THREE.Mesh(jointGeom, m);
        jointMesh.scale.set(bp.jointRadius, ry, rz);
        jointMesh.position.y = bp.jointOffsetY ?? 0;
        jointMesh.userData.boneName = obj.name;
        obj.add(jointMesh);
        this.bodyMeshes.push(jointMesh);
      }

      // Tube toward the child bone. Suppressed when either cross-section radius is 0.
      if (bp.tubeRadiusX < 1e-5 || bp.tubeRadiusZ < 1e-5) return;
      const childBone = obj.children.find((c) => c instanceof THREE.Bone) as THREE.Bone | undefined;
      if (!childBone || childBone.position.length() < 1e-5) return;

      // Unit geometry (radius 1, height 1).
      // scale.x / scale.z set the elliptical cross-section and are fixed per-frame.
      // scale.y carries the actual tube length and is updated every frame by _syncBodyLinks.
      const tubeGeom = new THREE.CylinderGeometry(topRatio, 1, 1, tubeSides);
      const tubeMesh = new THREE.Mesh(tubeGeom, m);
      tubeMesh.scale.x = bp.tubeRadiusX;
      tubeMesh.scale.z = bp.tubeRadiusZ;
      const inset = bp.jointRadius * insetFactor;
      tubeMesh.userData.boneName = obj.name;
      this._applyBoneLink(tubeMesh, childBone.position, inset);
      obj.add(tubeMesh);
      this.bodyMeshes.push(tubeMesh);
      this.bodyLinks.push({ child: childBone, mesh: tubeMesh, inset });
    });
  }
  private _attachSkeletonGeom(): void {
    // Thin cylinders from each bone to its child, plus a small joint sphere at each bone.
    // All meshes tagged with userData.boneName for raycasting identification.
    // Colour encodes hierarchy depth: warm orange (root) → blue-purple (deepest leaf).
    // Cylinders gradient from the parent's colour to the child's colour so the
    // parent→child direction is readable without needing to follow the chain mentally.
    //
    // Cylinders use a unit-height geometry (height=1) with scale.y carrying the actual
    // length. This lets _syncSkeletonLinks update position/rotation/scale every frame
    // as the skeleton animates without touching the geometry object itself.
    const allBones: THREE.Bone[] = [];
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Bone) allBones.push(obj);
    });

    let maxDepth = 0;
    const depthMap = new Map<THREE.Bone, number>();
    const measureDepth = (bone: THREE.Bone, d: number) => {
      depthMap.set(bone, d);
      if (d > maxDepth) maxDepth = d;
      bone.children.forEach((c) => { if (c instanceof THREE.Bone) measureDepth(c, d + 1); });
    };
    allBones.filter((b) => !(b.parent instanceof THREE.Bone)).forEach((root) => measureDepth(root, 0));

    const boneColor = (bone: THREE.Bone) => {
      const t = maxDepth > 0 ? depthMap.get(bone)! / maxDepth : 0;
      // Warm orange (#e8622a) at t=0 → cool blue-purple (#5b5fe8) at t=1
      const r = Math.round(0xe8 + t * (0x5b - 0xe8));
      const g = Math.round(0x62 + t * (0x5f - 0x62));
      const b = Math.round(0x2a + t * (0xe8 - 0x2a));
      return new THREE.Color(r / 255, g / 255, b / 255);
    };

    allBones.forEach((bone) => {
      // Small sphere at every joint.
      const jointMat = new THREE.MeshBasicMaterial({ color: boneColor(bone) });
      const jointMesh = new THREE.Mesh(
        new THREE.SphereGeometry(BONE_RADIUS, 6, 4),
        jointMat,
      );
      jointMesh.userData.boneName = bone.name;
      bone.add(jointMesh);
      this.skeletonMeshes.push(jointMesh);

      // Cylinder to each child bone.
      bone.children.forEach((child) => {
        if (!(child instanceof THREE.Bone)) return;
        if (child.position.length() < 1e-5) return;

        // Gradient material: colour blends parent→child per-vertex via vertexColors.
        // Three.js CylinderGeometry top cap = +Y (child end), bottom cap = -Y (parent end).
        const geom = new THREE.CylinderGeometry(BONE_RADIUS * 0.6, BONE_RADIUS, 1, 6);
        const parentColor = boneColor(bone);
        const childColor  = boneColor(child);
        const colors: number[] = [];
        const position = geom.attributes.position;
        for (let i = 0; i < position.count; i++) {
          const y = position.getY(i); // -0.5 (parent) to +0.5 (child) in unit cylinder
          const t2 = y + 0.5; // 0 = parent, 1 = child
          const c = new THREE.Color().lerpColors(parentColor, childColor, t2);
          colors.push(c.r, c.g, c.b);
        }
        geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
        const cylMesh = new THREE.Mesh(geom, mat);
        cylMesh.userData.boneName = bone.name;
        this._applyBoneLink(cylMesh, child.position);
        bone.add(cylMesh);
        this.skeletonMeshes.push(cylMesh);
        this.skeletonLinks.push({ child, mesh: cylMesh });
      });
    });
  }

  /**
   * Positions, rotates and scales `mesh` so it spans from `bone.origin` to `childLocal`.
   * - `inset`: shorten each end by this amount (cm) so tubes don't poke outside joint spheres.
   * Uses only the local position of the child bone (not world transforms) — this is correct
   * because the mesh is parented to the same bone as the vector we're aligning to.
   */
  private _applyBoneLink(mesh: THREE.Mesh, childLocal: THREE.Vector3, inset = 0): void {
    const segLen = childLocal.length();
    const usable = Math.max(0, segLen - 2 * inset);
    mesh.scale.y = usable;

    const mid = childLocal.clone().multiplyScalar(0.5);
    mesh.position.copy(mid);

    const dir = childLocal.clone().normalize();
    const q = new THREE.Quaternion();
    const dot = _up.dot(dir);
    if (dot > 0.9999) {
      q.identity();
    } else if (dot < -0.9999) {
      q.set(1, 0, 0, 0);
    } else {
      const axis = new THREE.Vector3().crossVectors(_up, dir).normalize();
      const angle = Math.acos(dot);
      q.setFromAxisAngle(axis, angle);
    }
    mesh.quaternion.copy(q);
  }

  private _syncSkeletonLinks(): void {
    for (const { child, mesh } of this.skeletonLinks) {
      this._applyBoneLink(mesh, child.position);
    }
  }

  private _syncBodyLinks(): void {
    for (const { child, mesh, inset } of this.bodyLinks) {
      // Preserve the per-bone elliptical scale set at build time.
      const rx = mesh.scale.x;
      const rz = mesh.scale.z;
      this._applyBoneLink(mesh, child.position, inset);
      mesh.scale.x = rx;
      mesh.scale.z = rz;
    }
  }

  /** Advance animations and sync geometry to the skeleton's current pose. */
  update(delta: number): void {
    this.mixer.update(delta);
    // Pin hips translation after the mixer writes it.
    // Mixamo GLBs bake a -90° X rotation into the Armature on export, so the hips
    // bone's local axes are: X = world side-to-side, Y = world forward/back, Z = world up.
    // Zeroing X and Y kills walk/strafe drift; Z stays free for vertical bob and crouch.
    if (this._inPlaceMode && this.hipsRef) {
      this.hipsRef.position.x = 0;
      this.hipsRef.position.y = 0;
    }
    this._syncSkeletonLinks();
    this._syncBodyLinks();
  }

  /** Dispose all procedural geometry and materials, then detach from bone parents. */
  dispose(): void {
    const disposeMesh = (m: THREE.Mesh) => {
      m.parent?.remove(m);
      m.geometry.dispose();
      if (Array.isArray(m.material)) {
        m.material.forEach((mat) => mat.dispose());
      } else {
        (m.material as THREE.Material).dispose();
      }
    };
    this.bodyMeshes.forEach(disposeMesh);
    this.skeletonMeshes.forEach(disposeMesh);
    this.bodyMeshes = [];
    this.skeletonMeshes = [];
    this.bodyLinks = [];
    this.skeletonLinks = [];
    this.mixer.stopAllAction();
  }

  /** Play a clip by name (exact match against the loaded clip list). */
  playClip(name: string, inPlace = false): void {
    this.mixer.stopAllAction();
    const raw = this.clips.find((c) => c.name === name);
    if (!raw) return;
    this._inPlaceMode = inPlace;
    this.mixer.clipAction(raw).play();
  }

  /** Append additional clips to the internal list (used after async GLB loads). */
  addClips(clips: THREE.AnimationClip[]): void {
    this.clips.push(...clips);
  }

  /** Show or hide the body geometry layer. */
  setBodyVisible(visible: boolean): void {
    this.bodyMeshes.forEach((m) => (m.visible = visible));
  }

  /** Lock (or unlock) XZ root motion so the character animates on the spot. */
  setInPlace(enabled: boolean): void {
    this._inPlaceMode = enabled;
  }

  /** Show or hide the skeleton visualisation layer. */
  setSkeletonVisible(visible: boolean): void {
    this.skeletonMeshes.forEach((m) => (m.visible = visible));
  }

  /** All procedural meshes (body + skeleton) — used for raycasting. */
  get allMeshes(): THREE.Mesh[] {
    return [...this.bodyMeshes, ...this.skeletonMeshes];
  }

  /**
   * Returns a version of `source` with all three hips translation channels
   * locked to their first-keyframe values, eliminating root motion drift
   * while preserving the Y (vertical) position so the character stays grounded.
   */
  private _inPlaceClip(source: THREE.AnimationClip): THREE.AnimationClip {
    const cached = this.inPlaceCache.get(source.name);
    if (cached) return cached;

    const tracks = source.tracks.map((track) => {
      // Match hips position tracks: "mixamorigHips.position"
      if (!/mixamorigHips\.position/i.test(track.name)) return track;
      if (!(track instanceof THREE.VectorKeyframeTrack)) return track;

      const values = Array.from(track.values);
      const times  = Array.from(track.times);
      const stride = 3; // X, Y, Z per keyframe

      // Lock X and Z to their first-keyframe values; keep Y as-is.
      const x0 = values[0];
      const z0 = values[2];
      for (let i = 0; i < times.length; i++) {
        values[i * stride + 0] = x0;
        values[i * stride + 2] = z0;
      }
      return new THREE.VectorKeyframeTrack(track.name, times, values);
    });

    const clip = new THREE.AnimationClip(source.name + '__inPlace', source.duration, tracks);
    this.inPlaceCache.set(source.name, clip);
    return clip;
  }
}
