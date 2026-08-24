import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { capsuleSDF, ellipsoidSDF, smoothMin, smoothUnionField, primitiveDistances } from './sdf.js';

describe('capsuleSDF', () => {
  const a = new THREE.Vector3(0, 0, 0);
  const b = new THREE.Vector3(0, 10, 0);

  it('is negative inside and zero on the surface', () => {
    expect(capsuleSDF(new THREE.Vector3(0, 5, 0), a, b, 2)).toBeCloseTo(-2);
    expect(capsuleSDF(new THREE.Vector3(0, 5, 2), a, b, 2)).toBeCloseTo(0);
  });

  it('rounds the end caps (distance to the endpoint sphere)', () => {
    expect(capsuleSDF(new THREE.Vector3(0, 12, 0), a, b, 2)).toBeCloseTo(0);
    expect(capsuleSDF(new THREE.Vector3(0, 15, 0), a, b, 2)).toBeCloseTo(3);
  });
});

describe('ellipsoidSDF', () => {
  it('is exact for a sphere', () => {
    const c = new THREE.Vector3(0, 0, 0);
    const r = new THREE.Vector3(3, 3, 3);
    expect(ellipsoidSDF(new THREE.Vector3(0, 0, 3), c, r)).toBeCloseTo(0);
    expect(ellipsoidSDF(new THREE.Vector3(0, 0, 0), c, r)).toBeCloseTo(-3);
  });

  it('scales with the smallest radius for an ellipsoid', () => {
    const c = new THREE.Vector3(0, 0, 0);
    const r = new THREE.Vector3(1, 4, 1);
    expect(ellipsoidSDF(new THREE.Vector3(1, 0, 0), c, r)).toBeCloseTo(0);
  });
});

describe('smoothMin', () => {
  it('degenerates to Math.min when k = 0', () => {
    expect(smoothMin(1, 5, 0)).toBe(1);
  });

  it('blends and bulges below the plain min (smooth union)', () => {
    expect(smoothMin(0, 1, 2)).toBeCloseTo(-0.125, 5);
    expect(smoothMin(0, 1, 2)).toBeLessThan(0);
    expect(smoothMin(0, 1, 2)).toBeGreaterThan(-1);
  });

  it('approaches the plain min far from the blend boundary', () => {
    expect(smoothMin(-5, 5, 0.5)).toBeCloseTo(-5, 5);
  });
});

describe('smoothUnionField', () => {
  const prims = [
    { kind: 'capsule' as const, a: new THREE.Vector3(-3, 0, 0), b: new THREE.Vector3(-1, 0, 0), radius: 1, bone: 0 },
    { kind: 'capsule' as const, a: new THREE.Vector3(1, 0, 0), b: new THREE.Vector3(3, 0, 0), radius: 1, bone: 1 },
  ];

  it('is Infinity with no primitives', () => {
    expect(smoothUnionField(new THREE.Vector3(0, 0, 0), [], 1)).toBe(Infinity);
  });

  it('matches per-primitive distances near a single primitive', () => {
    const p = new THREE.Vector3(-2, 0, 1);
    const d = primitiveDistances(p, prims);
    expect(smoothUnionField(p, prims, 0)).toBe(Math.min(d[0], d[1]));
  });
});
