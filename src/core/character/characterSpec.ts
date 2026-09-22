import { DEFAULT_SEMANTIC, semanticHeightScale } from './semanticParams.js';
import type { SemanticCharacter } from './semanticParams.js';
import { DEFAULT_FACE_PARAMS } from './ProceduralHumanoid.js';
import type { FaceParams } from './ProceduralHumanoid.js';
import { SKIN_TONES, OUTFIT_PRESETS, DEFAULT_OUTFIT, HAIR_COLORS } from './clothing.js';
import type { Outfit } from './clothing.js';

/**
 * Level-0 character API (HP-10): the minimal, AI-fillable surface for describing
 * a character in natural language. Every field is optional — defaults reproduce
 * the neutral character. An LLM fills this JSON and the app resolves it into the
 * humanoid's concrete inputs via `resolveCharacterSpec`.
 */
export interface CharacterSpec {
  /** 0..1, 0.5 = default. Whole-body height (root scale). */
  height?: number;
  /** -1..1, 0 = default. Slim (−) to heavy (+). */
  build?: number;
  /** 0..1, 0.5 = default. Muscle mass in limbs/shoulders. */
  muscularity?: number;
  /** 0..1, 0.5 = default. Young (larger head) to old (smaller head). */
  age?: number;
  /** -1..1, 0 = default. Feminine (−) to masculine (+). */
  feminineMasculine?: number;
  /** Skin tone: a `SKIN_TONES` label ('Fair'…'Deep') or a hex number. */
  skinTone?: string | number;
  /** Hair colour (hex). */
  hairColor?: number;
  /** 0..1, 0 = default. Blends `hairColor` toward grey (salt-and-pepper/age). */
  hairGreying?: number;
  /** Iris/eye colour (hex). */
  eyeColor?: number;
  /** Outfit preset key: 'casual' | 'teeShorts' | 'layered' | 'bare'. */
  outfit?: string;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function clamp11(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/** Linear blend of two 24-bit colours (0..1). */
function blendColor(a: number, b: number, t: number): number {
  const r = ((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t;
  const g = ((a >> 8) & 0xff) + (((b >> 8) & 0xff) - ((a >> 8) & 0xff)) * t;
  const bl = (a & 0xff) + ((b & 0xff) - (a & 0xff)) * t;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(bl);
}

const GREY_HAIR = HAIR_COLORS.find((c) => c.label === 'Grey')?.color ?? 0x9a9a9a;

/** Resolve a skin tone (label or hex) to a hex; defaults to `Light`. */
export function resolveSkinTone(tone?: string | number): number {
  if (typeof tone === 'number') return tone;
  if (typeof tone === 'string') {
    const match = SKIN_TONES.find((s) => s.label.toLowerCase() === tone.toLowerCase());
    if (match) return match.color;
    const hex = Number.parseInt(tone.replace(/^#/, ''), 16);
    if (Number.isFinite(hex)) return hex;
  }
  return SKIN_TONES[1].color;
}

/** Clamp a spec to safe ranges, applying defaults for any missing field. */
export function validateCharacterSpec(spec: CharacterSpec): Required<CharacterSpec> {
  return {
    height: clamp01(spec.height ?? DEFAULT_SEMANTIC.height),
    build: clamp11(spec.build ?? DEFAULT_SEMANTIC.build),
    muscularity: clamp01(spec.muscularity ?? DEFAULT_SEMANTIC.muscularity),
    age: clamp01(spec.age ?? DEFAULT_SEMANTIC.age),
    feminineMasculine: clamp11(spec.feminineMasculine ?? DEFAULT_SEMANTIC.feminineMasculine),
    skinTone: spec.skinTone ?? 'Light',
    hairColor: spec.hairColor ?? DEFAULT_FACE_PARAMS.hairColor,
    hairGreying: clamp01(spec.hairGreying ?? 0),
    eyeColor: spec.eyeColor ?? DEFAULT_FACE_PARAMS.irisColor,
    outfit: spec.outfit ?? 'casual',
  };
}

export interface ResolvedCharacter {
  semantic: SemanticCharacter;
  skinColor: number;
  faceParams: FaceParams;
  outfit: Outfit;
  /** Root scale factor (applied to `humanoid.root.scale`). */
  heightScale: number;
}

/**
 * Resolve a spec into the humanoid's high-level inputs. Ring/bone params still
 * derive from `semantic` via `semanticToRingParams` / `semanticToBoneParams`.
 */
export function resolveCharacterSpec(spec: CharacterSpec): ResolvedCharacter {
  const v = validateCharacterSpec(spec);
  const semantic: SemanticCharacter = {
    height: v.height,
    build: v.build,
    muscularity: v.muscularity,
    age: v.age,
    feminineMasculine: v.feminineMasculine,
  };
  return {
    semantic,
    skinColor: resolveSkinTone(v.skinTone),
    faceParams: {
      ...DEFAULT_FACE_PARAMS,
      hairColor: v.hairGreying > 0 ? blendColor(v.hairColor, GREY_HAIR, v.hairGreying) : v.hairColor,
      irisColor: v.eyeColor,
    },
    outfit: OUTFIT_PRESETS[v.outfit] ?? DEFAULT_OUTFIT,
    heightScale: semanticHeightScale(semantic),
  };
}
