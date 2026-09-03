import { describe, it, expect } from 'vitest';
import { DEFAULT_SEMANTIC } from './semanticParams.js';
import { DEFAULT_FACE_PARAMS } from './ProceduralHumanoid.js';
import { SKIN_TONES, OUTFIT_PRESETS, DEFAULT_OUTFIT } from './clothing.js';
import { resolveCharacterSpec, resolveSkinTone, validateCharacterSpec } from './characterSpec.js';

describe('characterSpec', () => {
  it('applies defaults for an empty spec (neutral character)', () => {
    const r = resolveCharacterSpec({});
    expect(r.semantic).toEqual(DEFAULT_SEMANTIC);
    expect(r.skinColor).toBe(SKIN_TONES[1].color); // Light
    expect(r.faceParams.hairColor).toBe(DEFAULT_FACE_PARAMS.hairColor);
    expect(r.faceParams.irisColor).toBe(DEFAULT_FACE_PARAMS.irisColor);
    expect(r.outfit).toBe(DEFAULT_OUTFIT);
    expect(r.heightScale).toBeCloseTo(1);
  });

  it('clamps out-of-range sliders to safe bounds', () => {
    const v = validateCharacterSpec({ height: 5, build: -2, feminineMasculine: 3 });
    expect(v.height).toBe(1);
    expect(v.build).toBe(-1);
    expect(v.feminineMasculine).toBe(1);
  });

  it('resolves a skin-tone label, hex, and maps hair/eye colour + outfit', () => {
    const r = resolveCharacterSpec({ skinTone: 'Deep', hairColor: 0x000000, eyeColor: 0x0000ff, outfit: 'bare' });
    expect(r.skinColor).toBe(SKIN_TONES[5].color);
    expect(r.faceParams.hairColor).toBe(0x000000);
    expect(r.faceParams.irisColor).toBe(0x0000ff);
    expect(r.outfit).toBe(OUTFIT_PRESETS.bare);
  });

  it('accepts a hex skin tone directly', () => {
    expect(resolveSkinTone(0x123456)).toBe(0x123456);
    expect(resolveSkinTone('#123456')).toBe(0x123456);
  });

  it('blends hair toward grey as hairGreying increases', () => {
    const hair = 0x1a1a1a; // black
    const grey = resolveCharacterSpec({ hairColor: hair, hairGreying: 1 }).faceParams.hairColor;
    expect(grey).toBe(0x9a9a9a); // fully grey
    const untouched = resolveCharacterSpec({ hairColor: hair, hairGreying: 0 }).faceParams.hairColor;
    expect(untouched).toBe(hair);
    const mixed = resolveCharacterSpec({ hairColor: hair, hairGreying: 0.5 }).faceParams.hairColor;
    expect(mixed).not.toBe(hair);
    expect(mixed).not.toBe(grey);
  });
});
