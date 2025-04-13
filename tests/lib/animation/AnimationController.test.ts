import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationController } from '$lib/animation/AnimationController';
import type { Sequencer } from '$lib/animation/AnimationController';
import * as THREE from 'three';

describe('AnimationController', () => {
    let mockSequencer: Sequencer;
    let controller: AnimationController;
    let object: THREE.Object3D;
    let mockMixer: THREE.AnimationMixer;
    let mockAction: THREE.AnimationAction;
    let scheduledCallbacks: Array<{ callback: (time: number) => void, time: number }>;

    beforeEach(() => {
        scheduledCallbacks = [];
        mockSequencer = {
            schedule: vi.fn((callback: (time: number) => void, time: number) => {
                scheduledCallbacks.push({ callback, time });
            }),
            clear: vi.fn(),
            start: vi.fn(),
            pause: vi.fn(),
            seconds: 0
        };
        controller = new AnimationController(mockSequencer);
        object = new THREE.Object3D();
    });

    describe('setupAnimation', () => {
        it('should schedule animation updates', () => {
            controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

            expect(mockSequencer.schedule).toHaveBeenCalled();
            expect(scheduledCallbacks.length).toBe(1);
        });

        it('should update object position based on keyframes', () => {
            controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

            // Execute the start callback to begin animation
            const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
            expect(startCallback).toBeDefined();
            startCallback!(0);

            // Simulate animation at t=0.5
            mockSequencer.seconds = 0.5;
            controller.setTime(0.5);
            controller.update(0);
            expect(object.position.y).toBeCloseTo(0.5);
        });
    });

    describe('play/pause', () => {
        it('should start sequencer when playing', () => {
            controller.play();
            expect(mockSequencer.start).toHaveBeenCalled();
        });

        it('should pause sequencer when pausing', () => {
            controller.pause();
            expect(mockSequencer.pause).toHaveBeenCalled();
        });

        it('should not reset animation time when pausing', () => {
            // Setup animation
            controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

            // Execute the start callback to begin animation
            const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
            expect(startCallback).toBeDefined();
            startCallback!(0);

            // Play animation and move to middle
            controller.play();
            mockSequencer.seconds = 0.5;
            controller.setTime(0.5);
            controller.update(0);
            const positionAtMiddle = object.position.y;

            // Pause animation
            controller.pause();

            // Position should not change after pause
            expect(object.position.y).toBe(positionAtMiddle);
            expect(object.position.y).not.toBe(0);
        });

        it('should preserve animation time when resuming from pause', () => {
            // Setup animation
            controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

            // Execute the start callback to begin animation
            const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
            expect(startCallback).toBeDefined();
            startCallback!(0);

            // Play animation and move to middle
            controller.play();
            mockSequencer.seconds = 0.5;
            controller.setTime(0.5);
            controller.update(0);
            const positionAtMiddle = object.position.y;

            // Pause animation
            controller.pause();

            // Resume animation
            controller.play();

            // Position should not change after resuming
            expect(object.position.y).toBe(positionAtMiddle);
            expect(object.position.y).not.toBe(0);
        });
    });

    it('should set time correctly', () => {
        // Setup animation
        controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Set time
        controller.setTime(0.5);
        controller.update(0);

        // Verify sequencer time was set
        expect(mockSequencer.seconds).toBe(0.5);
    });

    it('should update animation correctly', () => {
        // Setup animation
        controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Update animation
        controller.update(1/60);

        // No direct way to verify mixer update, but this should not throw
    });

    it('should maintain object position when paused', () => {
        // Setup animation
        controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Play animation and simulate some time passing
        controller.play();
        mockSequencer.seconds = 0.5;
        controller.setTime(0.5);
        controller.update(0);
        const positionBeforePause = object.position.y;

        // Pause animation
        controller.pause();

        // Position should not change after pause
        expect(object.position.y).toBe(positionBeforePause);
        expect(object.position.y).not.toBe(0);
    });

    it('should preserve animation time when pausing and resuming', () => {
        // Setup animation
        controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Play animation and simulate some time passing
        controller.play();
        mockSequencer.seconds = 0.5;
        controller.setTime(0.5);
        controller.update(0);
        const positionBeforePause = object.position.y;

        // Pause animation
        controller.pause();

        // Resume animation
        controller.play();

        // Animation should resume from where it was paused
        expect(object.position.y).toBe(positionBeforePause);
        expect(object.position.y).not.toBe(0);

        // Update animation and verify it continues from paused position
        mockSequencer.seconds = 0.6;
        controller.setTime(0.6);
        controller.update(0);
        expect(object.position.y).toBeCloseTo(0.6);
    });

    it('should not reset animation time when resuming from pause', () => {
        // Setup animation
        controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Play animation and move to middle
        controller.play();
        mockSequencer.seconds = 0.5;
        controller.setTime(0.5);
        controller.update(0);
        const positionAtMiddle = object.position.y;

        // Pause animation
        controller.pause();

        // Resume animation
        controller.play();

        // The scheduled callback should not be called when resuming
        expect(mockSequencer.schedule).toHaveBeenCalledTimes(1);
        expect(object.position.y).toBe(positionAtMiddle);
    });

    it('should handle Tone.js transport behavior correctly', () => {
        // Setup animation
        controller.setupAnimation(object, '.position[y]', [0, 1], [0, 1], 1);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Play animation and move to middle
        controller.play();
        mockSequencer.seconds = 0.5;
        controller.setTime(0.5);
        controller.update(0);
        const positionAtMiddle = object.position.y;

        // Pause animation
        controller.pause();

        // Resume animation
        controller.play();

        // Position should not change after resuming
        expect(object.position.y).toBe(positionAtMiddle);
        expect(object.position.y).not.toBe(0);
    });

    it('should preserve animation state during pause/resume cycles', () => {
        // Setup a simple animation
        const trackName = 'test.position[y]';
        const times = [0, 1];
        const values = [0, 1];
        const duration = 1;

        controller.setupAnimation(object, trackName, times, values, duration);

        // Execute the start callback to begin animation
        const startCallback = scheduledCallbacks.find(cb => cb.time === 0)?.callback;
        expect(startCallback).toBeDefined();
        startCallback!(0);

        // Simulate playing for 0.5 seconds
        mockSequencer.seconds = 0.5;
        controller.setTime(0.5);
        controller.update(0);

        // Get animation state before pause
        const mixer = (controller as any).mixer as THREE.AnimationMixer;
        const anim = (controller as any).animationDict[trackName][0].anim as THREE.AnimationAction;
        const timeBeforePause = anim.time;

        // Pause
        controller.pause();
        expect(anim.paused).toBe(true);

        // Resume
        controller.play();
        expect(anim.paused).toBe(false);
        expect(anim.time).toBe(timeBeforePause);

        // Verify mixer time is preserved
        expect(mixer.time).toBeGreaterThan(0);
    });
}); 