import { DEFAULT_BONE_PARAMS } from './ProceduralHumanoid.js';
import type { BoneParamMap, BoneParams } from './ProceduralHumanoid.js';

/**
 * Semantic character-shape schema (HP-0.5). The low-dimensional, Mii-like surface
 * an LLM or human can fill confidently — maps onto the high-dimensional
 * `BoneParamMap` below. Each slider is normalised so its neutral position
 * reproduces `DEFAULT_BONE_PARAMS` exactly. Doubles as ROADMAP_AI.md's AI-1
 * character-generation schema.
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
 * Maps the semantic sliders onto the full `BoneParamMap`. Every per-slider scale
 * is multiplicative and equals 1.0 at neutral, so `semanticToBoneParams(
 * DEFAULT_SEMANTIC)` reproduces `DEFAULT_BONE_PARAMS`; all sliders are monotonic
 * and clamped, so no input can produce NaN.
 */
export function semanticToBoneParams(s: SemanticCharacter): BoneParamMap {
  const build = clamp11(s.build);
  const fem = clamp11(s.feminineMasculine);

  const buildScale = 1 + build * 0.2;                              // 0.8..1.2
  const muscleScale = 1 + (clamp01(s.muscularity) - 0.5) * 0.4;    // 0.8..1.2
  const headScale = 1 + (0.5 - clamp01(s.age)) * 0.3;              // young 1.15 .. old 0.85
  const hipScale = 1 - fem * 0.15;                                 // fem 1.15 .. masc 0.85
  const shoulderScale = 1 + fem * 0.15;                            // fem 0.85 .. masc 1.15
  const waistScale = 1 - fem * 0.05;

  const groupScales: Record<string, number> = {
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

  const out: BoneParamMap = {};
  for (const [key, scale] of Object.entries(groupScales)) {
    const base = DEFAULT_BONE_PARAMS[key];
    if (base) out[key] = scaleCrossSection(base, scale);
  }
  return out;
}
