import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { smoothstep01, tubeSkinWeights, assignTubeWeights } from './skinning.js';

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

describe('assignTubeWeights', () => {
  it('assigns the two bone indices and unit-weight per vertex', () => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 4);
    const { skinIndex, skinWeight } = assignTubeWeights(geo, 3, 5);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      expect(skinIndex[i * 4]).toBe(3);
      expect(skinIndex[i * 4 + 1]).toBe(5);
      expect(skinWeight[i * 4] + skinWeight[i * 4 + 1]).toBeCloseTo(1, 5);
    }
  });

  it('weights the bottom rim to boneA, mid-shaft single-bone, top rim to boneB', () => {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 4);
    const { skinWeight } = assignTubeWeights(geo, 3, 5);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < -0.4) {
        expect(skinWeight[i * 4]).toBeCloseTo(1, 10);
        expect(skinWeight[i * 4 + 1]).toBeCloseTo(0, 10);
      } else if (Math.abs(y) < 0.01) {
        expect(skinWeight[i * 4]).toBeCloseTo(1, 10);
        expect(skinWeight[i * 4 + 1]).toBeCloseTo(0, 10);
      } else if (y > 0.4) {
        expect(skinWeight[i * 4]).toBeCloseTo(0, 10);
        expect(skinWeight[i * 4 + 1]).toBeCloseTo(1, 10);
      }
    }
  });
});
