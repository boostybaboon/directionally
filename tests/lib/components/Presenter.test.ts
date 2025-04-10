import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/svelte';
import Presenter from '$lib/components/Presenter.svelte';
import { sceneStore } from '$lib/stores/scene';
import * as THREE from 'three';

describe('Presenter', () => {
    let mockCamera: THREE.PerspectiveCamera;
    let mockRenderer: THREE.WebGLRenderer;
    let mockCanvas: HTMLCanvasElement;

    beforeEach(() => {
        // Create mock camera
        mockCamera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
        vi.spyOn(mockCamera, 'updateProjectionMatrix');
        sceneStore.loadScene(mockCamera, []);

        // Create mock canvas with specific dimensions
        mockCanvas = document.createElement('canvas');
        Object.defineProperty(mockCanvas, 'clientWidth', { value: 800 });
        Object.defineProperty(mockCanvas, 'clientHeight', { value: 600 });

        // Mock WebGLRenderer
        mockRenderer = {
            setSize: vi.fn(),
            render: vi.fn(),
            dispose: vi.fn()
        } as unknown as THREE.WebGLRenderer;

        // Mock THREE.WebGLRenderer constructor
        vi.spyOn(THREE, 'WebGLRenderer').mockReturnValue(mockRenderer);
    });

    afterEach(() => {
        cleanup();
        vi.clearAllMocks();
    });

    it('should set correct aspect ratio on initial render', async () => {
        // Render the component
        const { component } = render(Presenter);

        // Wait for next tick to allow component to mount
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify renderer was called with correct dimensions
        expect(mockRenderer.setSize).toHaveBeenCalledWith(800, 600);
        
        // Verify camera aspect ratio was updated
        expect(mockCamera.aspect).toBe(800 / 600);
        expect(mockCamera.updateProjectionMatrix).toHaveBeenCalled();
    });

    it('should handle window resize correctly', async () => {
        // Render the component
        const { component } = render(Presenter);

        // Wait for next tick
        await new Promise(resolve => setTimeout(resolve, 0));

        // Simulate window resize
        Object.defineProperty(mockCanvas, 'clientWidth', { value: 1024 });
        Object.defineProperty(mockCanvas, 'clientHeight', { value: 768 });
        
        // Trigger resize event
        window.dispatchEvent(new Event('resize'));

        // Wait for next tick
        await new Promise(resolve => setTimeout(resolve, 0));

        // Verify renderer was called with new dimensions
        expect(mockRenderer.setSize).toHaveBeenCalledWith(1024, 768);
        
        // Verify camera aspect ratio was updated
        expect(mockCamera.aspect).toBe(1024 / 768);
        expect(mockCamera.updateProjectionMatrix).toHaveBeenCalled();
    });
}); 