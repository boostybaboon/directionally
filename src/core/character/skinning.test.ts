import { describe, it, expect } from 'vitest';
import { smoothstep01, tubeSkinWeights } from './skinning.js';

describe('smoothstep01', () => {
  it('clamps outside [0,1]', () => {
    expect(smoothstep01(-1)).toBe(0);
    expect(smoothstep01(2)).toBe(1);
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
  });

  it('is monotonic', () => {
    expect(smoothstep01(0.25)).toBeLessThan(smoothstep01(0.5));
    expect(smoothstep01(0.5)).toBeLessThan(smoothstep01(0.75));
  });
});

describe('tubeSkinWeights', () => {
  it('always sums to 1', () => {
    for (let i = 0; i <= 20; i++) {
      const [a, b] = tubeSkinWeights(i / 20);
      expect(a + b).toBeCloseTo(1, 10);
    }
  });

  it('is single-bone mid-segment and blends only at the far end', () => {
    expect(tubeSkinWeights(0)).toEqual([1, 0]);
    expect(tubeSkinWeights(0.5)).toEqual([1, 0]);
    const [endA, endB] = tubeSkinWeights(1);
    expect(endA).toBeCloseTo(0, 10);
    expect(endB).toBeCloseTo(1, 10);
  });
});
