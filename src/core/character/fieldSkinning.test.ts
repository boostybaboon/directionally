import { describe, it, expect } from 'vitest';
import { deriveFieldWeights } from './fieldSkinning.js';

describe('deriveFieldWeights', () => {
  it('always returns four influences that sum to 1', () => {
    const { indices, weights } = deriveFieldWeights([0, 10, 20], [0, 1, 2], 2);
    expect(indices.length).toBe(4);
    expect(weights.length).toBe(4);
    expect(weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
  });

  it('prefers the nearest bone', () => {
    const { indices, weights } = deriveFieldWeights([0, 10, 20], [0, 1, 2], 2);
    expect(indices[0]).toBe(0);
    expect(weights[0]).toBeGreaterThan(0.9);
  });

  it('blends two near bones around a joint', () => {
    const { indices, weights } = deriveFieldWeights([0, 0.5, 20], [0, 1, 2], 2);
    expect(indices[0]).toBe(0);
    expect(indices[1]).toBe(1);
    expect(weights[0]).toBeGreaterThan(0.4);
    expect(weights[1]).toBeGreaterThan(0.4);
  });

  it('aggregates primitives that share a bone', () => {
    const { indices, weights } = deriveFieldWeights([0, 0, 20], [0, 0, 2], 2);
    expect(indices[0]).toBe(0);
    expect(weights[0]).toBeGreaterThan(0.999);
    expect(weights[1]).toBeLessThan(0.001);
  });
});
