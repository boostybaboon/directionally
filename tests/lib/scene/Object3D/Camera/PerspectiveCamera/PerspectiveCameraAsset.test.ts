import { describe, it, expect } from 'vitest';
import { PerspectiveCameraAsset } from '$lib/scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset';
import { PerspectiveCamera } from 'three';

describe('PerspectiveCameraAsset', () => {
  it('should initialize with default values', () => {
    const camera = new PerspectiveCameraAsset();

    expect(camera.fov).toBe(50); // Default FOV
    expect(camera.near).toBe(0.1); // Default near plane
    expect(camera.far).toBe(2000); // Default far plane
  });

  it('should throw an error if near >= far', () => {
    const camera = new PerspectiveCameraAsset();

    expect(() => {
      camera.near = 2500; // Invalid: near >= far
    }).toThrowError('Near plane (2500) must be less than far plane (2000).');
  });

  it('should throw an error if far <= near', () => {
    const camera = new PerspectiveCameraAsset();

    expect(() => {
      camera.far = 0.05; // Invalid: far <= near
    }).toThrowError('Far plane (0.05) must be greater than near plane (0.1).');
  });

  it('should allow valid near and far values', () => {
    const camera = new PerspectiveCameraAsset();

    camera.near = 0.5; // Valid
    camera.far = 1000; // Valid

    expect(camera.near).toBe(0.5);
    expect(camera.far).toBe(1000);
  });

  it('should update the underlying Three.js camera when properties change', () => {
    const threeCamera = new PerspectiveCamera();
    const camera = new PerspectiveCameraAsset(threeCamera);

    camera.fov = 60;
    expect(threeCamera.fov).toBe(60);

    camera.near = 1;
    expect(threeCamera.near).toBe(1);

    camera.far = 1000;
    expect(threeCamera.far).toBe(1000);
  });
});