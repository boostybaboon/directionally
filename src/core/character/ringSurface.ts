/**
 * The ring system's parameter surface (HP-7.5): every numeric setting that
 * shapes the loft, in one file, so ring customisations are data rather than
 * magic numbers scattered through `buildBoneRings` and the port functions.
 * Values are the current defaults, extracted unchanged.
 */

// ── Ring cross-section defaults ──────────────────────────────────────────────

/** A bone group's ring cross-section: X half-width, Z half-depth, forward offset (cm). */
export interface RingParam {
  rx: number;
  rz: number;
  fwd: number;
}

export type RingParamMap = Record<string, RingParam>;

/**
 * Neutral per-group ring cross-sections. Mirrors the cross-section half of
 * `DEFAULT_BONE_PARAMS` (the `tubeRadiusX/Z` + `tubeOffsetForward` fields) until
 * the tube/SDF bodies are retired; `head` is absent because it stays an
 * ellipsoid, not a ring.
 */
export const DEFAULT_RING_PARAMS: RingParamMap = {
  hips:     { rx: 15.0, rz: 10.0, fwd: 1.0 },
  spine:    { rx: 15.0, rz: 10.0, fwd: 1.5 },
  spine1:   { rx: 15.5, rz: 11.0, fwd: 2.5 },
  spine2:   { rx: 16.5, rz: 11.0, fwd: 2.5 },
  neck:     { rx:  5.0, rz:  5.0, fwd: -1.0 },
  shoulder: { rx:  2.0, rz:  2.0, fwd: 0.0 },
  arm:      { rx:  4.0, rz:  3.5, fwd: 0.0 },
  forearm:  { rx:  3.0, rz:  2.5, fwd: 0.0 },
  hand:     { rx:  0.0, rz:  0.0, fwd: 0.0 },
  upleg:    { rx:  7.0, rz:  5.5, fwd: 0.0 },
  leg:      { rx:  5.0, rz:  4.0, fwd: 0.0 },
  foot:     { rx:  5.0, rz:  3.0, fwd: 0.0 },
  toe:      { rx:  5.0, rz:  2.0, fwd: 0.0 },
  finger:   { rx:  1.0, rz:  1.0, fwd: 0.0 },
};

/** Cross-section ramp: hold the bone's own radius until this `t`, then taper to the child. */
export const TAPER_HOLD = 0.7;

// ── Hips girdle ──────────────────────────────────────────────────────────────
/** Crotch sits this fraction of the femur length above the leg joint. */
export const GIRDLE_CROTCH_FRACTION = 0.15;
/** Hip ring widens the waist radius by this much (cm). */
export const GIRDLE_HIP_WIDENING = 2;
/** Crotch/waist rings add this padding onto the waist radius (cm). */
export const GIRDLE_WAIST_PADDING = 1;

// ── Upper leg ────────────────────────────────────────────────────────────────
/** Ring positions as a fraction of femur length, crotch → knee. */
export const UPLEG_STOPS = [0.25, 0.32, 0.4, 0.5, 0.65, 0.8] as const;
/** Parent (hips) blend fades to zero by this `t`. */
export const UPLEG_PARENT_FADE_T = 0.4;
/** Parent blend fade span (in `t`). */
export const UPLEG_PARENT_FADE_SPAN = 0.15;
/** Parent blend maximum weight (at the back of the thigh). */
export const UPLEG_PARENT_MAX_WEIGHT = 0.5;

// ── Palm envelope ────────────────────────────────────────────────────────────
/** Extra lateral padding beyond the finger tube radius (cm). */
export const PALM_MARGIN = 1;
export const PALM_WRIST_RX = 3;
export const PALM_WRIST_RZ = 2.5;
export const PALM_RZ = 2;
/** Palm ring `t` stops (the pinky knuckle `fullT` is appended). */
export const PALM_STOPS = [0, 0.4, 0.6] as const;
/** Middle thumb-port bracket ring sits at this `t`. */
export const PALM_THUMB_BRACKET_T = 0.2;

// ── Thumb ────────────────────────────────────────────────────────────────────
/** Thumb skin starts this far along the bone axis (× thumb radius). */
export const THUMB_START_OFFSET_FACTOR = 1.3;
/** …capped at this fraction of the thumb length. */
export const THUMB_START_OFFSET_MAX_FRACTION = 0.5;

// ── Spine2 shoulder girdle ───────────────────────────────────────────────────
export const SHOULDER_GIRDLE_RING_COUNT = 8;
/** Gaussian spread of the girdle's depth bulge around the shoulder joint (cm). */
export const SHOULDER_GIRDLE_SIGMA = 2.5;
/** Fallback shoulder-joint `t` when no shoulder/arm child is present. */
export const SHOULDER_GIRDLE_JOINT_FALLBACK_T = 0.65;

// ── Ports / weld weights ─────────────────────────────────────────────────────
/** Crotch chord vertex weights: hips + both upper legs. */
export const LEG_FAN_CHORD_WEIGHTS = [0.5, 0.25, 0.25] as const;
/** Girdle arc vertices blend toward the leg up to this weight (front). */
export const LEG_FAN_ARC_MAX_WEIGHT = 0.4;
/** Thumb-port cut widths (× thumb radius): ends vs middle bulge. */
export const THUMB_PORT_END_WIDTH = 1.2;
export const THUMB_PORT_MIDDLE_WIDTH = 2.0;
/** Shoulder-port cut widths (× arm radius): ends vs middle (deltoid). */
export const SHOULDER_PORT_WIDTH = 1.0;
export const SHOULDER_PORT_MIDDLE_WIDTH = 1.2;
/** Number of girdle rings each shoulder port spans. */
export const SHOULDER_PORT_BRACKET_COUNT = 3;

// ── Skinning ─────────────────────────────────────────────────────────────────
/** Fraction of a segment over which a bone blends onto its child. */
export const TUBE_WEIGHT_INFLUENCE = 0.3;

// ── Junction specs (HP-7.5 checkbox 2) ──────────────────────────────────────

/**
 * A fan partitions a parent ring into child rings and lofts each child ring to
 * its plate (legs: hemi-disks off the girdle; hand: web-chord plates off the
 * knuckle). A side-port cuts a hole across a run of parent bracket rings and
 * welds one or more child rings to the boundary (thumb → palm, arms → chest).
 */
export type PortSpec = FanPortSpec | SidePortSpec;

export interface LegFanSpec {
  kind: 'fan';
  fan: 'leg';
  /** Bone-name regex matching the parent(s) whose ring carries the port. */
  parent: RegExp;
  /** Bone-name regex matching the children the port welds (descendants of `parent`). */
  child: RegExp;
  /** Crotch chord vertex weights: hips + both upper legs. */
  chordWeights: readonly number[];
  /** Max girdle-arc weight blended toward the leg (front). */
  arcMaxWeight: number;
}

export interface HandFanSpec {
  kind: 'fan';
  fan: 'hand';
  parent: RegExp;
  child: RegExp;
}

export type FanPortSpec = LegFanSpec | HandFanSpec;

export interface SidePortSpec {
  kind: 'sidePort';
  /** Bracket-run selection: thumb spans the palm run; shoulder spans a centred girdle run. */
  bracket: 'thumb' | 'shoulder';
  parent: RegExp;
  child: RegExp;
  /** Number of bracket rings a shoulder port spans. */
  bracketCount?: number;
  /** Cut half-width multiplier at the run ends (× child radius). */
  endWidth: number;
  /** Cut half-width multiplier at the run middle (× child radius). */
  middleWidth: number;
  /** Child radius fallback when `params(child)` is absent. */
  fallbackRadius: number;
}

/** The four junction welds as data, in build order. */
export const PORT_SPECS: readonly PortSpec[] = [
  {
    kind: 'fan', fan: 'leg',
    parent: /^mixamorigHips$/,
    child: /UpLeg$/,
    chordWeights: LEG_FAN_CHORD_WEIGHTS,
    arcMaxWeight: LEG_FAN_ARC_MAX_WEIGHT,
  },
  {
    kind: 'fan', fan: 'hand',
    parent: /^mixamorig(Left|Right)Hand$/,
    child: /Hand(Index|Middle|Ring|Pinky)1$/,
  },
  {
    kind: 'sidePort', bracket: 'thumb',
    parent: /^mixamorig(Left|Right)Hand$/,
    child: /HandThumb1$/,
    endWidth: THUMB_PORT_END_WIDTH,
    middleWidth: THUMB_PORT_MIDDLE_WIDTH,
    fallbackRadius: 1,
  },
  {
    kind: 'sidePort', bracket: 'shoulder',
    parent: /^mixamorigSpine2$/,
    child: /^mixamorig(Left|Right)Arm$/,
    bracketCount: SHOULDER_PORT_BRACKET_COUNT,
    endWidth: SHOULDER_PORT_WIDTH,
    middleWidth: SHOULDER_PORT_MIDDLE_WIDTH,
    fallbackRadius: 4,
  },
];

// ── Envelope specs (HP-7.5) ─────────────────────────────────────────────────

/** The ring shape a bone group's envelope takes. */
export type EnvelopeShape =
  | 'generic'      // hold-then-taper ramp to the child
  | 'hips'         // pelvis girdle below the origin + generic up-ramp
  | 'upleg'        // dense rings near the crotch, blended toward the hips
  | 'palm'         // finger-derived flattened wedge
  | 'thumb'        // distally-offset ramp (starts outside the palm)
  | 'spine2'       // shoulder girdle: neck-tapered, depth bulge at the shoulder joint
  | 'absorbed';    // no rings (clavicle volume lives in the Spine2 girdle)

/**
 * Selects the envelope shape for a bone group. The numeric tuning for each
 * shape lives in the constants above; the shapes themselves are procedural
 * builders in `ringGraph.ts` (they read live child transforms, so they can't
 * be pure data).
 */
export interface RingEnvelopeSpec {
  group: string;
  shape: EnvelopeShape;
  /** Bone-name regex narrowing the spec within a group (thumb within `finger`). */
  name?: RegExp;
}

/** The per-group envelope shapes, in priority order. Unlisted groups are `generic`. */
export const RING_ENVELOPE_SPECS: readonly RingEnvelopeSpec[] = [
  { group: 'hips', shape: 'hips' },
  { group: 'upleg', shape: 'upleg' },
  { group: 'hand', shape: 'palm' },
  { group: 'shoulder', shape: 'absorbed' },
  { group: 'spine2', shape: 'spine2' },
  { group: 'finger', shape: 'thumb', name: /Thumb1$/ },
];