import { describe, it, expect } from 'vitest';
import { DEFAULT_BONE_PARAMS } from './ProceduralHumanoid.js';
import { DEFAULT_RING_PARAMS, BUST_MAX_AMP } from './ringSurface.js';
import {
  DEFAULT_SEMANTIC,
  semanticToBoneParams,
  semanticToRingParams,
  semanticHeightScale,
  type SemanticCharacter,
} from './semanticParams.js';

function s(patch: Partial<SemanticCharacter>): SemanticCharacter {
  return { ...DEFAULT_SEMANTIC, ...patch };
}

describe('semanticToBoneParams', () => {
  it('reproduces DEFAULT_BONE_PARAMS at the neutral position', () => {
    expect(semanticToBoneParams(DEFAULT_SEMANTIC)).toEqual(DEFAULT_BONE_PARAMS);
  });

  it('height is monotonic through the root-scale channel', () => {
    expect(semanticHeightScale(s({ height: 0 }))).toBeCloseTo(0.85);
    expect(semanticHeightScale(s({ height: 0.5 }))).toBeCloseTo(1);
    expect(semanticHeightScale(s({ height: 1 }))).toBeCloseTo(1.15);
  });

  it('build scales torso girth monotonically', () => {
    const slim = semanticToBoneParams(s({ build: -1 }));
    const heavy = semanticToBoneParams(s({ build: 1 }));
    expect(slim.hips.tubeRadiusX).toBeLessThan(heavy.hips.tubeRadiusX);
    expect(slim.spine2.tubeRadiusZ).toBeLessThan(heavy.spine2.tubeRadiusZ);
  });

  it('muscularity scales limb and shoulder mass monotonically', () => {
    const weak = semanticToBoneParams(s({ muscularity: 0 }));
    const strong = semanticToBoneParams(s({ muscularity: 1 }));
    expect(weak.arm.jointRadius).toBeLessThan(strong.arm.jointRadius);
    expect(weak.shoulder.jointRadius).toBeLessThan(strong.shoulder.jointRadius);
  });

  it('feminineMasculine swaps hip vs shoulder girth', () => {
    const feminine = semanticToBoneParams(s({ feminineMasculine: -1 }));
    const masculine = semanticToBoneParams(s({ feminineMasculine: 1 }));
    expect(feminine.hips.tubeRadiusX).toBeGreaterThan(masculine.hips.tubeRadiusX);
    expect(feminine.shoulder.tubeRadiusX).toBeLessThan(masculine.shoulder.tubeRadiusX);
  });

  it('age scales head size monotonically (younger = larger head)', () => {
    const young = semanticToBoneParams(s({ age: 0 }));
    const old = semanticToBoneParams(s({ age: 1 }));
    expect(young.head.jointRadiusY!).toBeGreaterThan(old.head.jointRadiusY!);
  });

  it('produces finite, clamped values across the full input range', () => {
    for (let i = 0; i < 200; i++) {
      const t = i / 199;
      const params = semanticToBoneParams({
        height: t,
        build: t * 2 - 1,
        muscularity: t,
        age: t,
        feminineMasculine: t * 2 - 1,
      });
      for (const bp of Object.values(params)) {
        expect(Number.isFinite(bp.tubeRadiusX)).toBe(true);
        expect(Number.isFinite(bp.jointRadius)).toBe(true);
      }
    }
  });
});

describe('semanticToRingParams', () => {
  it('reproduces DEFAULT_RING_PARAMS at the neutral position', () => {
    expect(semanticToRingParams(DEFAULT_SEMANTIC)).toEqual(DEFAULT_RING_PARAMS);
  });

  it('scales only cross-section radii, leaving forward offsets untouched', () => {
    const heavy = semanticToRingParams(s({ build: 1 }));
    expect(heavy.hips.rx).toBeCloseTo(DEFAULT_RING_PARAMS.hips.rx * 1.2);
    expect(heavy.hips.fwd).toBeCloseTo(DEFAULT_RING_PARAMS.hips.fwd);
    expect(heavy.hips.rz).toBeCloseTo(DEFAULT_RING_PARAMS.hips.rz * 1.2);
  });

  it('feminineMasculine swaps hip vs shoulder girth', () => {
    const feminine = semanticToRingParams(s({ feminineMasculine: -1 }));
    const masculine = semanticToRingParams(s({ feminineMasculine: 1 }));
    expect(feminine.hips.rx).toBeGreaterThan(masculine.hips.rx);
    expect(feminine.shoulder.rx).toBeLessThan(masculine.shoulder.rx);
  });

  it('omits the head group (it stays an ellipsoid, not a ring)', () => {
    expect(semanticToRingParams(DEFAULT_SEMANTIC).head).toBeUndefined();
  });

  it('feminine grows chest relief; masculine and neutral stay flat', () => {
    expect(semanticToRingParams(DEFAULT_SEMANTIC).spine2.bust).toBeUndefined();
    expect(semanticToRingParams(s({ feminineMasculine: 1 })).spine2.bust).toBeUndefined();
    const feminine = semanticToRingParams(s({ feminineMasculine: -1 }));
    expect(feminine.spine2.bust).toBeCloseTo(BUST_MAX_AMP);
    const half = semanticToRingParams(s({ feminineMasculine: -0.5 }));
    expect(half.spine2.bust).toBeCloseTo(BUST_MAX_AMP * 0.5);
  });
});
