import { DEFAULT_BONE_PARAMS } from './ProceduralHumanoid.js';
import type { BoneParamMap, BoneParams } from './ProceduralHumanoid.js';
import { DEFAULT_RING_PARAMS, BUST_MAX_AMP } from './ringSurface.js';
import type { RingParamMap } from './ringSurface.js';

/**
 * Semantic character-shape schema (HP-0.5). The low-dimensional, Mii-like surface
 * an LLM or human can fill confidently — maps onto the ring surface's per-group
 * cross-sections (`RingParamMap`, the primary output) and, until the tube/SDF
 * bodies retire, the legacy `BoneParamMap`. Each slider is normalised so its
 * neutral position reproduces the defaults exactly. Doubles as ROADMAP_AI.md's
 * AI-1 character-generation schema.
 */
export type SemanticCharacter = {
  /** 0..1, 0.5 = default. Whole-body height via uniform root scale. */
  height: number;
  /** -1..1, 0 = default. Slim (−) to heavy (+). */
  build: number;
  /** 0..1, 0.5 = default. Muscle mass in limbs and shoulders. */
  muscularity: number;
  /** 0..1, 0.5 = default. Young (larger head) to old (smaller head). */
  age: number;
  /** -1..1, 0 = default. Feminine (−: wide hips/narrow shoulders) to masculine (+). */
  feminineMasculine: number;
};

export const DEFAULT_SEMANTIC: SemanticCharacter = {
  height: 0.5,
  build: 0,
  muscularity: 0.5,
  age: 0.5,
  feminineMasculine: 0,
};

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp11(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/**
 * Uniform scale for the character root. Height cannot be expressed through
 * `BoneParams` — those only control cross-section, not bone length — so the
 * route applies this to `humanoid.root.scale`.
 */
export function semanticHeightScale(s: SemanticCharacter): number {
  // 0 → 0.85, 0.5 → 1, 1 → 1.15
  return 1 + (clamp01(s.height) - 0.5) * 0.3;
}

/** Scales a group's cross-section fields (radii only — offsets/ratios untouched). */
function scaleCrossSection(bp: BoneParams, s: number): BoneParams {
  const out: BoneParams = {
    ...bp,
    tubeRadiusX: bp.tubeRadiusX * s,
    tubeRadiusZ: bp.tubeRadiusZ * s,
    jointRadius: bp.jointRadius * s,
  };
  if (bp.jointRadiusY !== undefined) out.jointRadiusY = bp.jointRadiusY * s;
  if (bp.jointRadiusZ !== undefined) out.jointRadiusZ = bp.jointRadiusZ * s;
  return out;
}

/**
 * Per-group cross-section scale from the five sliders. Every scale is
 * multiplicative and equals 1.0 at neutral; all are monotonic and clamped, so
 * no input can produce NaN.
 */
function groupScales(s: SemanticCharacter): Record<string, number> {
  const build = clamp11(s.build);
  const fem = clamp11(s.feminineMasculine);

  const buildScale = 1 + build * 0.2;                              // 0.8..1.2
  const muscleScale = 1 + (clamp01(s.muscularity) - 0.5) * 0.4;    // 0.8..1.2
  const headScale = 1 + (0.5 - clamp01(s.age)) * 0.3;              // young 1.15 .. old 0.85
  const hipScale = 1 - fem * 0.15;                                 // fem 1.15 .. masc 0.85
  const shoulderScale = 1 + fem * 0.15;                            // fem 0.85 .. masc 1.15
  const waistScale = 1 - fem * 0.05;

  return {
    hips: buildScale * hipScale,
    spine: buildScale * waistScale,
    spine1: buildScale * waistScale,
    spine2: buildScale * waistScale,
    neck: buildScale,
    head: headScale,
    shoulder: buildScale * muscleScale * shoulderScale,
    arm: buildScale * muscleScale,
    forearm: buildScale * muscleScale,
    hand: muscleScale,
    upleg: buildScale * muscleScale * hipScale,
    leg: buildScale * muscleScale,
    foot: buildScale,
    toe: buildScale,
    finger: 1,
  };
}

/**
 * Maps the semantic sliders onto the ring surface's per-group cross-sections.
 * `semanticToRingParams(DEFAULT_SEMANTIC)` reproduces `DEFAULT_RING_PARAMS`.
 */
export function semanticToRingParams(s: SemanticCharacter): RingParamMap {
  const out: RingParamMap = {};
  for (const [key, scale] of Object.entries(groupScales(s))) {
    const base = DEFAULT_RING_PARAMS[key];
    if (base) out[key] = { rx: base.rx * scale, rz: base.rz * scale, fwd: base.fwd };
  }
  // Chest relief (HP-9): the feminine slider grows a subtle double-convex front
  // bulge on the Spine2 girdle; masculine and neutral keep it a pure ellipse.
  const bust = Math.max(0, -clamp11(s.feminineMasculine)) * BUST_MAX_AMP;
  if (bust > 0) out.spine2.bust = bust;
  return out;
}

/**
 * Maps the semantic sliders onto the full `BoneParamMap` (tubes/SDF/face, and
 * the persisted design schema until those bodies retire). `semanticToBoneParams(
 * DEFAULT_SEMANTIC)` reproduces `DEFAULT_BONE_PARAMS`.
 */
export function semanticToBoneParams(s: SemanticCharacter): BoneParamMap {
  const out: BoneParamMap = {};
  for (const [key, scale] of Object.entries(groupScales(s))) {
    const base = DEFAULT_BONE_PARAMS[key];
    if (base) out[key] = scaleCrossSection(base, scale);
  }
  return out;
}

