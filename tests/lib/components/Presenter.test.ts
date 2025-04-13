import { describe, it, expect, vi, beforeEach } from 'vitest';
import { sceneStore } from '$lib/stores/scene';
import { PerspectiveCameraAsset } from '$lib/scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset';
import * as THREE from 'three';
import { get } from 'svelte/store';
import { JSDOM } from 'jsdom';

// Set up JSDOM environment
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;

describe('Presenter', () => {
  let mockCamera: PerspectiveCameraAsset;
  let mockScene: THREE.Scene;
  let mockRenderer: THREE.WebGLRenderer;
  let mockCanvas: HTMLCanvasElement;
  let mockContainer: HTMLDivElement;

  beforeEach(() => {
    // Create mock camera
    mockCamera = new PerspectiveCameraAsset();
    const camera = mockCamera.getCamera();
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);

    // Create mock scene
    mockScene = new THREE.Scene();

    // Create mock canvas and container
    mockCanvas = document.createElement('canvas');
    mockContainer = document.createElement('div');
    mockContainer.appendChild(mockCanvas);

    // Create mock renderer
    mockRenderer = {
      setSize: vi.fn(),
      render: vi.fn(),
      domElement: mockCanvas
    } as unknown as THREE.WebGLRenderer;

    // Mock scene store
    sceneStore.set({
      scene: mockScene,
      camera: mockCamera,
      assets: [],
      selectedAsset: null
    });
  });

  it('should update camera aspect ratio when canvas size changes', () => {
    const width = 800;
    const height = 600;
    const aspect = width / height;

    // Set container size
    Object.defineProperty(mockContainer, 'clientWidth', { value: width });
    Object.defineProperty(mockContainer, 'clientHeight', { value: height });

    // Call handleResize
    mockCamera.updateAspectRatio(width, height);

    // Get the camera from the store
    const camera = get(sceneStore).camera;
    const perspectiveCamera = camera?.getCamera() as THREE.PerspectiveCamera;

    // Verify the aspect ratio was updated
    expect(perspectiveCamera.aspect).toBe(aspect);
  });

  it('should handle window resize events', () => {
    const newWidth = 1024;
    const newHeight = 768;
    const newAspect = newWidth / newHeight;

    // Set container size
    Object.defineProperty(mockContainer, 'clientWidth', { value: newWidth });
    Object.defineProperty(mockContainer, 'clientHeight', { value: newHeight });

    // Call handleResize
    mockCamera.updateAspectRatio(newWidth, newHeight);

    // Get the camera from the store
    const camera = get(sceneStore).camera;
    const perspectiveCamera = camera?.getCamera() as THREE.PerspectiveCamera;

    // Verify the aspect ratio was updated
    expect(perspectiveCamera.aspect).toBe(newAspect);
  });
}); 