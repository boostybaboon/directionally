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
  /** Local-Z offset of the joint centre in cm — perpendicular to the bone axis. */
  jointOffsetZ?: number;
  /** Frustum ratio (0–1): switches joint to a frustum. X fans wide at +Y (knuckle end). */
  jointFrustumRatio?: number;
  /** Independent Z taper for the frustum — Z tapers toward +Y (knuckle end), opposite to X. */
  jointFrustumRatioZ?: number;
}

/** Keyed by bone group name (matching BONE_GROUPS[*].key and BONE_SPECS[*].group). */
export type BoneParamMap = Record<string, BoneParams>;

/**
 * Parameters for procedural face features placed on the head bone.
 * All values are in centimetres, in head-bone local space.
 * `eyeForwardZ`: positive = face-forward (+Z in Mixamo head-bone local space).
 */
export interface FaceParams {
  /** Radius of each eye sphere (cm). */
  eyeRadius: number;
  /** Half-distance between eye centres on the head X axis (cm). */
  eyeSpacing: number;
  /** Y offset of eye centres above the head ellipsoid centre (cm). */
  eyeRise: number;
  /** Organic only: iris disc radius as a fraction of eyeRadius (0 to suppress). Sits between sclera and pupil. */
  irisScale: number;
  /** Iris colour as a hex integer. */
  irisColor: number;
  /** Nose sphere radius (cm); set to 0 to suppress. Organic only. */
  noseRadius: number;
  /** How far below the head ellipsoid centre the nose sits (cm). */
  noseDrop: number;
  /** X half-width of the mouth ellipsoid (cm); set to 0 to suppress. */
  mouthWidth: number;
  /** Y half-height (thickness) of the mouth ellipsoid (cm). */
  mouthThickness: number;
  /** How far below the head ellipsoid centre the mouth sits (cm). */
  mouthDrop: number;
  /** Left/right ear disc Y/Z radius (cm, 0 = suppressed). */
  earRadius: number;
  /** Crown hair ellipsoid X/Z radius (cm, 0 = suppressed). Organic only. */
  hairRadius: number;
  /** Fringe ellipsoid Z half-depth over the forehead (cm, 0 = no fringe). Organic only. */
  fringeLength: number;
  /** Hair colour as a hex integer. */
  hairColor: number;
  /** Full length of each eyebrow ellipsoid (cm). */
  browLength: number;
  /** Y offset of brow centres above the eye centre (cm). */
  browHeight: number;
  /** Rotation of each brow around its Z axis in degrees; positive = outer end up (natural arch). */
  browAngle: number;
}

export const DEFAULT_FACE_PARAMS: FaceParams = {
  eyeRadius:      2.5,
  eyeSpacing:     4.5,
  eyeRise:       -1.0,
  irisScale:      0.45,
  irisColor:   0x3a6e3a,
  noseRadius:     2.3,
  noseDrop:       5.0,
  mouthWidth:     7.0,
  mouthThickness: 0.4,
  mouthDrop:     10.0,
  earRadius:      3.0,
  hairRadius:    12.0,
  fringeLength:   4.0,
  hairColor:   0x3d2008,
  browLength: 2.5,
  browHeight: 3.5,
  browAngle: 4,
};

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
  hips:     { tubeRadiusX: 16.0, tubeRadiusZ:  9.0, jointRadius:  9.0 },
  spine:    { tubeRadiusX: 15.0, tubeRadiusZ:  9.0, jointRadius:  5.0 },
  spine1:   { tubeRadiusX: 15.5, tubeRadiusZ:  9.5, jointRadius:  5.5 },
  spine2:   { tubeRadiusX: 16.5, tubeRadiusZ: 11.0, jointRadius:  6.0 },
  neck:     { tubeRadiusX:  5.0, tubeRadiusZ:  5.0, jointRadius:  3.5 },
  // Offset ellipsoid: base flush at head-bone origin, extends ~13 cm toward HeadTop_End.
  head:     { tubeRadiusX:  0.0, tubeRadiusZ:  0.0, jointRadius: 11.0, jointRadiusY: 13.0, jointOffsetY: 13.0 },
  shoulder: { tubeRadiusX:  2.0, tubeRadiusZ:  2.0, jointRadius:  5.0 },
  arm:      { tubeRadiusX:  4.0, tubeRadiusZ:  3.5, jointRadius:  4.5 },
  forearm:  { tubeRadiusX:  3.0, tubeRadiusZ:  2.5, jointRadius:  3.5 },
  // Frustum palm: fans wide in X toward knuckles, narrows in Z (side view tapers inward).
  // jointOffsetY = jointRadiusY/2 puts the wrist end flush at the hand-bone origin.
  hand:     { tubeRadiusX:  0.0, tubeRadiusZ:  0.0, jointRadius:  6.0, jointRadiusY: 12.0, jointRadiusZ:  3.0, jointOffsetY:  6.0, jointFrustumRatio: 0.60, jointFrustumRatioZ: 0.70 },
  upleg:    { tubeRadiusX:  7.0, tubeRadiusZ:  5.5, jointRadius:  6.0 },
  leg:      { tubeRadiusX:  5.0, tubeRadiusZ:  4.0, jointRadius:  4.5 },
  foot:     { tubeRadiusX:  5.0, tubeRadiusZ:  3.0, jointRadius:  5.0, jointRadiusY:  6.0, jointRadiusZ:  5.0, jointOffsetY:  2.0, jointOffsetZ: -3.5 },
  toe:      { tubeRadiusX:  5.0, tubeRadiusZ:  2.0, jointRadius:  2.0 },
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
  /** Hemisphere lids per eye — rotation.x is tweened by blink(t). */
  private _upperLids: Array<{ mesh: THREE.Mesh; openRx: number }> = [];
  private _lowerLids: Array<{ mesh: THREE.Mesh; openRx: number }> = [];
  /** Accumulated time for the autonomous blink cycle. */
  private _blinkTimer = 0;
  /** Named Object3D face control pivots — targets for AnimationClip tracks. */
  private _eyePivotL: THREE.Object3D | null = null;
  private _eyePivotR: THREE.Object3D | null = null;
  private _browL: THREE.Object3D | null = null;
  private _browR: THREE.Object3D | null = null;
  private _jawPivot: THREE.Object3D | null = null;
  /** Upper lip TubeGeometry mesh — parented to head, rebuilt on expression change. */
  private _upperLipMesh: THREE.Mesh | null = null;
  /** Lower lip TubeGeometry mesh — child of _jawPivot, rebuilt on expression change. */
  private _lowerLipMesh: THREE.Mesh | null = null;
  /** Dark fill ShapeGeometry — built from the same bezier paths as both lip tubes. */
  private _mouthHoleMesh: THREE.Mesh | null = null;
  /** Sphere end-cap meshes at the four lip corners — updated in setMouth(). */
  private _lipCaps: THREE.Mesh[] = [];
  /** Mouth params retained for geometry rebuilds inside setMouth(). */
  private _mouthParams: { mouthY: number; mouthZ: number; width: number; thickness: number; lipRadius: number; rx: number; ry: number; rz: number; cy: number } | null = null;
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
  /** Neck tube mesh, tagged at build time so the per-frame tilt can be applied after link sync. */
  private _neckTube: THREE.Mesh | null = null;
  /** Tilt angle (degrees) applied to the neck tube top, pivoting around the bone base. */
  private _neckTiltDeg = 0;

  constructor(
    gltfScene: THREE.Group,
    clips: THREE.AnimationClip[],
    colors: BodyColors = DEFAULT_COLORS,
    style: RobotStyle = 'organic',
    boneParamMap: BoneParamMap = {},
    insetFactor: number = 0,
    faceParams: FaceParams = DEFAULT_FACE_PARAMS,
    neckTiltDeg: number = -10,
  ) {
    this.root = gltfScene;
    this.clips = clips;
    this.mixer = new THREE.AnimationMixer(gltfScene);
    this._neckTiltDeg = neckTiltDeg;

    this._hideSkinnedMeshes();
    this._attachBodyGeom(colors, style, boneParamMap, insetFactor);
    this._attachFaceGeom(style, colors, boneParamMap, faceParams);
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
        jointMesh.position.z = bp.jointOffsetZ ?? 0;
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
      if (obj.name === 'mixamorigNeck') this._neckTube = tubeMesh;
    });
  }

  private _attachFaceGeom(
    style: RobotStyle,
    colors: BodyColors,
    boneParamMap: BoneParamMap,
    fp: FaceParams,
  ): void {
    this.root.traverse((obj) => {
      if (obj.name !== 'mixamorigHead') return;

      const headBp  = boneParamMap['head'] ?? DEFAULT_BONE_PARAMS['head'];
      const centreY  = headBp?.jointOffsetY  ?? 0;
      const headW    = headBp?.jointRadius   ?? 11;
      const headH    = headBp?.jointRadiusY  ?? headW;
      const headRz   = headBp?.jointRadiusZ  ?? headW;
      const eyeY     = centreY + fp.eyeRise;
      // Eye Z derived from ellipsoid surface so eyes remain on the face when the head is resized.
      const eyeSurfaceZ = ProceduralHumanoid._ellipsoidSurfaceZ(headW, headH, headRz, centreY, fp.eyeSpacing, eyeY);
      const eyeZ        = eyeSurfaceZ - 1.0;
      const ledColor    = style === 'c3po' ? 0xff6600 : 0x44aaff;

      // Eyes
      for (const x of [-fp.eyeSpacing, fp.eyeSpacing]) {
        if (style === 'organic') {
          // Eye pivot — named node so AnimationClip tracks can target it for gaze animation.
          const isLeft = x < 0;
          const eyePivot = new THREE.Object3D();
          eyePivot.name = isLeft ? 'eyePivotL' : 'eyePivotR';
          eyePivot.position.set(x, eyeY, eyeZ);
          obj.add(eyePivot);
          if (isLeft) this._eyePivotL = eyePivot; else this._eyePivotR = eyePivot;

          // Sclera — warm off-white rather than pure white to soften the stare.
          const scleraMesh = new THREE.Mesh(
            new THREE.SphereGeometry(fp.eyeRadius, 12, 8),
            new THREE.MeshToonMaterial({ color: 0xfff5ee }),
          );
          eyePivot.add(scleraMesh);
          this.bodyMeshes.push(scleraMesh);

          // Iris — spherical cap that conforms to the sclera surface.
          // thetaLength = asin(irisScale) gives the cap whose projected radius equals
          // irisScale * eyeRadius. rotation.x = +π/2 rotates the north pole from +Y to +Z.
          if (fp.irisScale > 1e-5) {
            const irisCap = new THREE.Mesh(
              new THREE.SphereGeometry(fp.eyeRadius + 0.02, 20, 8, 0, Math.PI * 2, 0, Math.asin(Math.min(fp.irisScale, 0.999))),
              new THREE.MeshToonMaterial({ color: fp.irisColor }),
            );
            irisCap.rotation.x = Math.PI / 2;
            eyePivot.add(irisCap);
            this.bodyMeshes.push(irisCap);
          }

          // Pupil — same technique, smaller cap, sits in front of iris.
          const pupilScale = fp.irisScale * 0.35;
          if (pupilScale > 1e-5) {
            const pupilCap = new THREE.Mesh(
              new THREE.SphereGeometry(fp.eyeRadius + 0.04, 16, 6, 0, Math.PI * 2, 0, Math.asin(Math.min(pupilScale, 0.999))),
              new THREE.MeshToonMaterial({ color: 0x1a0f00 }),
            );
            pupilCap.rotation.x = Math.PI / 2;
            eyePivot.add(pupilCap);
            this.bodyMeshes.push(pupilCap);
          }

          // Eyelids — hemispheres pivoting in eye-pivot-local space; blink(t) and setGaze() both work naturally.
          // openRx = (cover - 0.5) * π  — linear map over cover ∈ [0, 0.5]:
          //   cover=0   → openRx=-π/2 → dome faces backward, lid invisible (fully open eye)
          //   cover≈0.35 → openRx≈-0.47 → natural resting eyelid arc visible at top/bottom
          //   cover=0.5  → openRx=0    → rim at equator (half-closed look)
          // blink(t) closes to 0 (rims meet at horizontal midplane) regardless of openRx.
          //
          // Lower lid uses a wrapper with rotation.z=π to flip the dome downward;
          // the mesh's local rotation.x is then identical in semantics to the upper lid.
          const lidMat = new THREE.MeshToonMaterial({ color: colors.skin });
          const lidR = fp.eyeRadius + 0.08;
          {
            const openRx = (0.35 - 0.5) * Math.PI;
            const upperLid = new THREE.Mesh(
              new THREE.SphereGeometry(lidR, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
              lidMat,
            );
            upperLid.rotation.x = openRx;
            eyePivot.add(upperLid);
            this.bodyMeshes.push(upperLid);
            this._upperLids.push({ mesh: upperLid, openRx });
          }
          {
            // Wrapper carries the Z-flip so the mesh's local X axis is clean.
            const lidWrapper = new THREE.Object3D();
            lidWrapper.rotation.z = Math.PI;
            eyePivot.add(lidWrapper);
            const openRx = (0.30 - 0.5) * Math.PI;
            const lowerLid = new THREE.Mesh(
              new THREE.SphereGeometry(lidR, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2),
              lidMat,
            );
            lowerLid.rotation.x = openRx;
            lidWrapper.add(lowerLid);
            this.bodyMeshes.push(lowerLid);
            this._lowerLids.push({ mesh: lowerLid, openRx });
          }

          // Eyebrow pivot — named node for expression animation tracks.
          // Brow length = 1.5× eye diameter = 3× eyeRadius.
          // Pivot is placed at the outer tip; mesh is offset inward so it extends
          // from above the outer eye corner toward the nose bridge.
          const browPivot = new THREE.Object3D();
          browPivot.name = isLeft ? 'browL' : 'browR';
          const browY = eyeY + fp.browHeight;
          // Pivot sits 1/3 of the brow length from the nose (inner) end so that
          // furrowing rotates the inner section down without over-moving the outer end.
          const browOuterX = isLeft ? -(fp.eyeSpacing + 1.3) : (fp.eyeSpacing + 1.3);
          const browPivotX = isLeft
            ? browOuterX + (2 / 3) * fp.browLength
            : browOuterX - (2 / 3) * fp.browLength;
          const browZ = ProceduralHumanoid._ellipsoidSurfaceZ(headW, headH, headRz, centreY, browPivotX, browY);
          browPivot.position.set(browPivotX, browY, browZ);
          browPivot.userData.neutralY = browY;
          browPivot.userData.raiseRange = fp.eyeRadius * 0.9;
          obj.add(browPivot);
          if (isLeft) this._browL = browPivot; else this._browR = browPivot;

          const browHalfLen = fp.browLength / 2;
          const browMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 10, 6),
            new THREE.MeshToonMaterial({ color: fp.hairColor }),
          );
          browMesh.scale.set(browHalfLen * 2, fp.eyeRadius * 0.22, fp.eyeRadius * 0.35);
          // Offset mesh so its centre aligns correctly with the shifted pivot.
          browMesh.position.x = isLeft ? -fp.browLength / 6 : fp.browLength / 6;
          // Arch: positive browAngle lifts outer end; mirror for right brow.
          browMesh.rotation.z = (fp.browAngle * Math.PI / 180) * (isLeft ? 1 : -1);
          // Wrap: positive browWrapAngle swings inner end forward to follow face sphere curvature.
          browMesh.rotation.y = (-26 * Math.PI / 180) * (isLeft ? 1 : -1);
          browPivot.add(browMesh);
          this.bodyMeshes.push(browMesh);
        } else {
          const ledMesh = new THREE.Mesh(
            new THREE.SphereGeometry(fp.eyeRadius, 10, 7),
            new THREE.MeshBasicMaterial({ color: ledColor }),
          );
          ledMesh.position.set(x, eyeY, eyeZ);
          obj.add(ledMesh);
          this.bodyMeshes.push(ledMesh);
        }
      }

      // Nose — organic only: small skin-toned bump below the eyes.
      if (style === 'organic' && fp.noseRadius > 1e-5) {
        const noseMesh = new THREE.Mesh(
          new THREE.SphereGeometry(fp.noseRadius, 10, 7),
          new THREE.MeshToonMaterial({ color: colors.skin }),
        );
        const noseY        = centreY - fp.noseDrop;
        const noseSurfaceZ  = ProceduralHumanoid._ellipsoidSurfaceZ(headW, headH, headRz, centreY, 0, noseY);
        noseMesh.position.set(0, noseY, noseSurfaceZ);
        obj.add(noseMesh);
        this.bodyMeshes.push(noseMesh);
      }

      // Mouth — organic: two TubeGeometry lips sharing corner control points, plus a
      // ShapeGeometry hole built from the same bezier paths.
      // Upper lip is parented to head (fixed). Lower lip is on the jaw pivot.
      // setMouth(smile, open) rebuilds all three geometries from shared control points.
      if (fp.mouthWidth > 1e-5) {
        const mouthY     = centreY - fp.mouthDrop;
        const lipRadius  = fp.mouthWidth * 0.07;
        const mouthSurfZ  = ProceduralHumanoid._ellipsoidSurfaceZ(headW, headH, headRz, centreY, 0, mouthY);
        // Push tube centre forward by lipRadius so the tube back just kisses the surface.
        const mouthZ     = mouthSurfZ + lipRadius;
        if (style === 'organic') {

          // Jaw pivot — lower lip and hole are parented here.
          const jawPivot = new THREE.Object3D();
          jawPivot.name = 'jawPivot';
          jawPivot.position.set(0, mouthY, mouthZ);
          jawPivot.userData.neutralY = mouthY;
          obj.add(jawPivot);
          this._jawPivot = jawPivot;
          this._mouthParams = { mouthY, mouthZ, width: fp.mouthWidth, thickness: fp.mouthThickness, lipRadius, rx: headW, ry: headH, rz: headRz, cy: centreY };

          const lipMat = new THREE.MeshToonMaterial({ color: 0xcc4444, side: THREE.DoubleSide });
          const holeMat = new THREE.MeshToonMaterial({ color: 0x1a0808, side: THREE.DoubleSide });
          const { hw, cornerY, cornerZ, upperCenterY, upperCenterZ, lowerCenterY, lowerCenterZ } = this._mouthControlPoints(fp.mouthWidth, fp.mouthThickness, 0, 0, headW, headH, headRz, centreY, mouthY, 0);

          const upperMesh = new THREE.Mesh(this._buildLipTube(hw, cornerY, cornerZ, upperCenterY, lipRadius, upperCenterZ), lipMat);
          upperMesh.position.set(0, mouthY, mouthZ);
          obj.add(upperMesh);
          this.bodyMeshes.push(upperMesh);
          this._upperLipMesh = upperMesh;

          const lowerMesh = new THREE.Mesh(this._buildLipTube(hw, cornerY, cornerZ, lowerCenterY, lipRadius, lowerCenterZ), lipMat);
          lowerMesh.position.set(0, 0, 0);
          jawPivot.add(lowerMesh);
          this.bodyMeshes.push(lowerMesh);
          this._lowerLipMesh = lowerMesh;

          const holeMesh = new THREE.Mesh(this._buildMouthFill(hw, cornerY, cornerZ, upperCenterY, upperCenterZ, lowerCenterY, lowerCenterZ), holeMat);
          // Positioned at the same local origin as the upper lip mesh.
          holeMesh.position.set(0, mouthY, mouthZ);
          obj.add(holeMesh);
          this.bodyMeshes.push(holeMesh);
          this._mouthHoleMesh = holeMesh;

          const capGeo = () => new THREE.SphereGeometry(lipRadius, 8, 6);
          const capUL = new THREE.Mesh(capGeo(), lipMat); capUL.position.set(-hw, cornerY, cornerZ); upperMesh.add(capUL);
          const capUR = new THREE.Mesh(capGeo(), lipMat); capUR.position.set( hw, cornerY, cornerZ); upperMesh.add(capUR);
          const capLL = new THREE.Mesh(capGeo(), lipMat); capLL.position.set(-hw, cornerY, cornerZ); lowerMesh.add(capLL);
          const capLR = new THREE.Mesh(capGeo(), lipMat); capLR.position.set( hw, cornerY, cornerZ); lowerMesh.add(capLR);
          this._lipCaps = [capUL, capUR, capLL, capLR];
          this.bodyMeshes.push(capUL, capUR, capLL, capLR);
        } else {
          const mouthMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 8),
            new THREE.MeshBasicMaterial({ color: ledColor }),
          );
          mouthMesh.scale.set(fp.mouthWidth, fp.mouthThickness, fp.mouthThickness);
          mouthMesh.position.set(0, mouthY, mouthZ);
          obj.add(mouthMesh);
          this.bodyMeshes.push(mouthMesh);
        }
      }

      // Ears — flattened ellipsoids at the head sides.
      if (fp.earRadius > 1e-5) {
        for (const side of [-1, 1]) {
          const earMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 8),
            new THREE.MeshToonMaterial({ color: colors.skin }),
          );
          const earThickness = fp.earRadius * 0.27;
          earMesh.scale.set(earThickness, fp.earRadius, fp.earRadius);
          earMesh.position.set(
            side * (headW + earThickness * 0.4),
            centreY,
            eyeZ * 0.2,
          );
          obj.add(earMesh);
          this.bodyMeshes.push(earMesh);
        }
      }

      // Hair (organic only) — crown ellipsoid + optional fringe over the forehead.
      if (style === 'organic' && fp.hairRadius > 1e-5) {
        const hairMat = new THREE.MeshToonMaterial({ color: fp.hairColor });

        // Crown: slightly wider than the skull, centred in the upper portion.
        const crownMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 16, 12),
          hairMat,
        );
        crownMesh.scale.set(fp.hairRadius, fp.hairRadius * 0.67, fp.hairRadius * 0.85);
        crownMesh.position.set(0, centreY + headH * 0.4, -fp.hairRadius * 0.05);
        obj.add(crownMesh);
        this.bodyMeshes.push(crownMesh);

        // Fringe: flat ellipsoid draped over the upper forehead.
        if (fp.fringeLength > 1e-5) {
          const fringeMesh = new THREE.Mesh(
            new THREE.SphereGeometry(1, 12, 8),
            hairMat,
          );
          fringeMesh.scale.set(fp.hairRadius * 0.75, fp.hairRadius * 0.67 * 0.25, fp.fringeLength);
          fringeMesh.position.set(0, centreY + headH * 0.55, eyeZ * 0.7);
          obj.add(fringeMesh);
          this.bodyMeshes.push(fringeMesh);
        }
      }
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
    if (this._neckTube && this._neckTiltDeg !== 0) {
      const mesh = this._neckTube;
      const θ = this._neckTiltDeg * (Math.PI / 180);
      const halfLen = mesh.scale.y / 2;
      // Current axis of the tube (local Y) expressed in parent/bone space.
      const localUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
      // Lock the base (bottom rim) to the bone origin — this is the pivot point.
      const base = mesh.position.clone().addScaledVector(localUp, -halfLen);
      // Tilt around parent's X axis (premultiply = applied in parent space).
      const tiltQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), θ);
      mesh.quaternion.premultiply(tiltQ);
      // Reposition so the base stays fixed.
      const newLocalUp = new THREE.Vector3(0, 1, 0).applyQuaternion(mesh.quaternion);
      mesh.position.copy(base).addScaledVector(newLocalUp, halfLen);
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

    // Autonomous blink — suppressed when no clip is playing (T-pose / static preview).
    if (this._upperLids.length > 0) {
      if (!this.activeAction) {
        this.blink(0);
      } else {
        // 15 blinks/min = one blink every 4 s.
        // Each blink: 0–150 ms close, 150–300 ms open, remainder idle.
        const PERIOD = 4.0;
        const HALF   = 0.15;
        this._blinkTimer = (this._blinkTimer + delta) % PERIOD;
        const phase = this._blinkTimer;
        let t = 0;
        if      (phase < HALF)      t = phase / HALF;
        else if (phase < HALF * 2)  t = 1 - (phase - HALF) / HALF;
        this.blink(t);
      }
    }
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
    this._upperLids = [];
    this._lowerLids = [];
    this._eyePivotL = null;
    this._eyePivotR = null;
    this._browL = null;
    this._browR = null;
    this._jawPivot = null;
    this._neckTube = null;
    this._upperLipMesh = null;
    this._lowerLipMesh = null;
    this._mouthHoleMesh = null;
    this._lipCaps = [];
    this._mouthParams = null;
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
    this.activeAction = this.mixer.clipAction(raw);
    this.activeAction.play();
  }

  /** Append additional clips to the internal list (used after async GLB loads). */
  addClips(clips: THREE.AnimationClip[]): void {
    this.clips.push(...clips);
  }

  /** Show or hide the body geometry layer. */
  setBodyVisible(visible: boolean): void {
    this.bodyMeshes.forEach((m) => (m.visible = visible));
  }

  /**
   * Animate a blink. `t=0` is fully open, `t=1` is fully closed.
   * Tweens each lid hemisphere's rotation.x between its resting open angle and π/2
   * (dome facing forward = eye covered). Safe to call every frame.
   */
  blink(t: number): void {
    // closedRx = 0: both hemisphere rims sit at the eye's horizontal midplane and just touch.
    const closedRx = 0;
    for (const lid of this._upperLids) {
      lid.mesh.rotation.x = lid.openRx + t * (closedRx - lid.openRx);
    }
    // Lower lids close upward: their openRx is negative, closedRx is +π/2 in wrapper-local space.
    for (const lid of this._lowerLids) {
      lid.mesh.rotation.x = lid.openRx + t * (closedRx - lid.openRx);
    }
  }

  /**
   * Point both eyes toward a direction. `yaw` rotates left/right (Y axis),
   * `pitch` tilts up/down (X axis), both in radians. Typical range ±0.3 rad.
   */
  setGaze(yaw: number, pitch: number): void {
    for (const pivot of [this._eyePivotL, this._eyePivotR]) {
      if (!pivot) continue;
      pivot.rotation.y = yaw;
      pivot.rotation.x = pitch;
    }
  }

  /**
   * Raise or furrow one or both eyebrows.
   * `raise` ∈ [0, 1]: 0 = neutral, 1 = fully raised.
   * `furrow` ∈ [0, 1]: 0 = neutral, 1 = fully drawn inward (inner corners down).
   */
  setBrow(side: 'left' | 'right' | 'both', raise: number, furrow: number): void {
    const targets = side === 'left'  ? [this._browL]
                  : side === 'right' ? [this._browR]
                  : [this._browL, this._browR];
    for (const brow of targets) {
      if (!brow) continue;
      const neutralY   = brow.userData.neutralY as number;
      const raiseRange = brow.userData.raiseRange as number;
      brow.position.y  = neutralY + raise * raiseRange;
      // Mirror furrow: left pivot -Z rotates inner (nose) end down; right pivot +Z.
      const sign = brow === this._browL ? -1 : 1;
      brow.rotation.z  = furrow * sign * (Math.PI / 6);
    }
  }

  /** Z of the head ellipsoid surface at head-bone local (x, y); 0 if the point is inside the ellipsoid. */
  private static _ellipsoidSurfaceZ(rx: number, ry: number, rz: number, cy: number, x: number, y: number): number {
    const inner = 1 - (x / rx) ** 2 - ((y - cy) / ry) ** 2;
    return inner > 0 ? rz * Math.sqrt(inner) : 0;
  }

  /**
   * Derive the lip-plane rotation angle (°) and corner setback (cm) from the head ellipsoid at the mouth position.
   * lipPlane: rotates the cylinder frame so its +Y aligns with the surface tangent-up direction at (x=0, y=mouthY).
   * lipWrap:  Z setback of the corner at x=hw vs. centre, both on the ellipsoid surface.
   */
  private static _derivedLipGeometry(rx: number, ry: number, rz: number, cy: number, mouthY: number, hw: number): { lipPlane: number; lipWrap: number } {
    const surfZ0  = ProceduralHumanoid._ellipsoidSurfaceZ(rx, ry, rz, cy, 0,  mouthY);
    const surfZhw = ProceduralHumanoid._ellipsoidSurfaceZ(rx, ry, rz, cy, hw, mouthY);
    const lipWrap = Math.max(0, surfZ0 - surfZhw);
    // Tangent-up at (x=0, mouthY): dP/dθ = (0, ry·cos θ, −rz·sin θ) = (0, ry·surfZ0/rz, −rz·(mouthY−cy)/ry).
    // Rotation angle a that maps cylinder +Y → tangent-up: a = atan2(tZ, tY).
    const a = Math.atan2(-rz * rz * (mouthY - cy), ry * ry * surfZ0);
    return { lipPlane: -a * (180 / Math.PI), lipWrap };
  }

  /** Derive shared bezier control dimensions from raw params + expression state. */
  private _mouthControlPoints(width: number, thickness: number, smile: number, open: number,
                              rx: number, ry: number, rz: number, cy: number, mouthY: number,
                              cornerLift: number): {
    hw: number; cornerY: number; cornerZ: number; upperCenterY: number; upperCenterZ: number; lowerCenterY: number; lowerCenterZ: number;
  } {
    const hw                    = width * 0.5;
    // Lip plane and wrap are fully derived from the head ellipsoid at the mouth's Y position.
    const { lipPlane, lipWrap } = ProceduralHumanoid._derivedLipGeometry(rx, ry, rz, cy, mouthY, hw);
    // Step 1: build in upright-cylinder space. Y = up the cylinder, Z = into the sphere.
    // cornerLift is a pure-Y offset so it travels along the cylinder surface, not through it.
    const cy_cyl = smile * thickness * 2.0 + cornerLift;
    const uc_cyl = thickness * 0.5 - cy_cyl;       // bezier compensation: midpoint stays at thickness*0.25
    const lc_cyl = -(thickness * 0.5 + cy_cyl) - open * thickness * 8.0;

    // Step 2: rotate the whole frame by lipPlane around X.
    // This tilts the mouth plane (and its opening direction) as a rigid body.
    const a     = -lipPlane * (Math.PI / 180);
    const cos_a = Math.cos(a);
    const sin_a = Math.sin(a);
    // Rotate (y, z): y' = y*cos - z*sin,  z' = y*sin + z*cos
    // Corner: z_cyl = -lipWrap, then subtract lipWrap*(1-cos_a) so the corner
    // endpoint lands at surfZhw+lipRadius in world space regardless of lipPlane tilt.
    // Algebraically: cy_cyl*sin_a - lipWrap*cos_a - lipWrap*(1-cos_a) = cy_cyl*sin_a - lipWrap.
    const cornerY      = cy_cyl * cos_a + lipWrap * sin_a;
    const cornerZ      = cy_cyl * sin_a - lipWrap;
    // Upper/lower centers: z_cyl = +lipWrap so the bezier at t=0.5 evaluates to
    // ½(−lipWrap) + ½(+lipWrap) = 0, keeping the tube centerline on the surface.
    // Only the Z is corrected; Y (lip shape) is left to uc_cyl/lc_cyl alone.
    const upperCenterY = uc_cyl * cos_a;
    const upperCenterZ = uc_cyl * sin_a + lipWrap * cos_a;
    const lowerCenterY = lc_cyl * cos_a;
    const lowerCenterZ = lc_cyl * sin_a + lipWrap * cos_a;
    return { hw, cornerY, cornerZ, upperCenterY, upperCenterZ, lowerCenterY, lowerCenterZ };
  }

  /**
   * Build a lip TubeGeometry from a QuadraticBezierCurve3.
   * `cornerY`/`cornerZ` set both end-points (non-planar when cornerZ ≠ 0, wrapping to the sphere).
   * `centerY`/`centerZ` set the bezier control point.
   */
  private _buildLipTube(hw: number, cornerY: number, cornerZ: number, centerY: number, lipRadius: number, centerZ = 0): THREE.TubeGeometry {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-hw, cornerY, cornerZ),
      new THREE.Vector3(  0, centerY, centerZ),
      new THREE.Vector3( hw, cornerY, cornerZ),
    );
    return new THREE.TubeGeometry(curve, 20, lipRadius, 8, false);
  }

  /**
   * Build a ShapeGeometry filling the area between the two lip bezier paths.
   * The path runs: left corner → upper bow → right corner → lower bow → close.
   * All coordinates are relative to the jaw-pivot corner line (Y=0 = corner level).
   */
  private _buildMouthFill(
    hw: number, cornerY: number, cornerZ: number,
    upperCenterY: number, upperCenterZ: number,
    lowerCenterY: number, lowerCenterZ: number,
  ): THREE.BufferGeometry {
    const N = 20;
    const upperCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-hw, cornerY, cornerZ),
      new THREE.Vector3(  0, upperCenterY, upperCenterZ),
      new THREE.Vector3( hw, cornerY, cornerZ),
    );
    const lowerCurve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-hw, cornerY, cornerZ),
      new THREE.Vector3(  0, lowerCenterY, lowerCenterZ),
      new THREE.Vector3( hw, cornerY, cornerZ),
    );
    const upper = upperCurve.getPoints(N);
    const lower = lowerCurve.getPoints(N);
    const positions: number[] = [];
    const indices: number[] = [];
    for (let i = 0; i <= N; i++) {
      positions.push(upper[i].x, upper[i].y, upper[i].z);
      positions.push(lower[i].x, lower[i].y, lower[i].z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2, b = i * 2 + 1, c = i * 2 + 2, d = i * 2 + 3;
      indices.push(a, b, c);
      indices.push(b, d, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  /**
   * Drive mouth shape. `smile` ∈ [-1,1]: positive curves/lifts corners, negative frowns.
   * `open` ∈ [0,1] drops the jaw. `cornerLift` overrides the built-in default when provided.
   * Rebuilds all three mouth geometries (cheap at this vertex count).
   */
  setMouth(smile: number, open: number, cornerLift?: number): void {
    if (!this._jawPivot || !this._mouthParams) return;
    const { mouthY, width, thickness, lipRadius, rx, ry, rz, cy } = this._mouthParams;
    const lift = cornerLift ?? 0;
    const { hw, cornerY, cornerZ, upperCenterY, upperCenterZ, lowerCenterY, lowerCenterZ } = this._mouthControlPoints(width, thickness, smile, open, rx, ry, rz, cy, mouthY, lift);

    this._jawPivot.position.y = mouthY;

    if (this._upperLipMesh) {
      this._upperLipMesh.geometry.dispose();
      this._upperLipMesh.geometry = this._buildLipTube(hw, cornerY, cornerZ, upperCenterY, lipRadius, upperCenterZ);
    }

    if (this._lowerLipMesh) {
      this._lowerLipMesh.geometry.dispose();
      this._lowerLipMesh.geometry = this._buildLipTube(hw, cornerY, cornerZ, lowerCenterY, lipRadius, lowerCenterZ);
    }

    if (this._mouthHoleMesh) {
      this._mouthHoleMesh.geometry.dispose();
      this._mouthHoleMesh.geometry = this._buildMouthFill(hw, cornerY, cornerZ, upperCenterY, upperCenterZ, lowerCenterY, lowerCenterZ);
    }

    if (this._lipCaps.length === 4) {
      this._lipCaps[0].position.set(-hw, cornerY, cornerZ);
      this._lipCaps[1].position.set( hw, cornerY, cornerZ);
      this._lipCaps[2].position.set(-hw, cornerY, cornerZ);
      this._lipCaps[3].position.set( hw, cornerY, cornerZ);
    }
  }

  /**
   * @deprecated Use setMouth(0, t) instead.
   */
  setJaw(t: number): void {
    this.setMouth(0, t);
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
