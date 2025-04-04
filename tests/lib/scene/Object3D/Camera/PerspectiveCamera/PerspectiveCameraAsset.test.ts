import { describe, it, expect } from 'vitest';
import { PerspectiveCameraAsset } from '$lib/scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset';

describe('PerspectiveCameraAsset', () => {
  it('should initialize with default values', () => {
    const camera = new PerspectiveCameraAsset();

    expect(camera.fov.value).toBe(50); // Default FOV
    expect(camera.aspect.value).toBe(1); // Default aspect ratio
    expect(camera.near.value).toBe(0.1); // Default near plane
    expect(camera.far.value).toBe(2000); // Default far plane
  });

  it('should throw an error if near >= far', () => {
    const camera = new PerspectiveCameraAsset();

    expect(() => {
      camera.near.value = 2500; // Invalid: near >= far
    }).toThrowError('Near plane (2500) must be less than far plane (2000).');
  });

  it('should throw an error if far <= near', () => {
    const camera = new PerspectiveCameraAsset();

    expect(() => {
      camera.far.value = 0.05; // Invalid: far <= near
    }).toThrowError('Far plane (0.05) must be greater than near plane (0.1).');
  });

  it('should allow valid near and far values', () => {
    const camera = new PerspectiveCameraAsset();

    camera.near.value = 0.5; // Valid
    camera.far.value = 1000; // Valid

    expect(camera.near.value).toBe(0.5);
    expect(camera.far.value).toBe(1000);
  });
});