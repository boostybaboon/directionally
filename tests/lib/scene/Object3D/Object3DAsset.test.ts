import { describe, it, expect, beforeEach } from 'vitest';
import { Object3DAsset } from "$lib/scene/Object3D/Object3DAsset";
import { Vector3, MathUtils } from "three";

describe("Object3DAsset", () => {
    it("should set and get the position field correctly", () => {
        const asset = new Object3DAsset();

        // Default position
        expect(asset.position.value.equals(new Vector3(0, 0, 0))).toBe(true);

        // Update position
        const newPosition = new Vector3(1, 2, 3);
        asset.position.value.copy(newPosition);

        // Verify updated position
        expect(asset.position.value.equals(newPosition)).toBe(true);
    });

    describe("rotation handling", () => {
        let asset: Object3DAsset;

        beforeEach(() => {
            asset = new Object3DAsset();
        });

        describe("up and lookAt", () => {
            it("should handle basic up/lookAt rotation", () => {
                const up = new Vector3(0, 1, 0);
                const lookAt = new Vector3(0, 0, -1);
                
                asset.setRotationFromUpLookAt(up, lookAt);
                
                const result = asset.getUpLookAt();
                expect(result.up.normalize().equals(up.normalize())).toBe(true);
                
                // Compare the direction to the lookAt point, not the point itself
                const expectedDir = lookAt.clone().normalize();
                const actualDir = result.lookAt.clone().sub(asset.position.value).normalize();
                expect(actualDir.equals(expectedDir)).toBe(true);
            });

            it("should handle non-standard up vector", () => {
                const up = new Vector3(0, 0, 1);  // Using +Z as up
                const lookAt = new Vector3(1, 0, 0);  // Looking along +X
                
                asset.setRotationFromUpLookAt(up, lookAt);
                
                const result = asset.getUpLookAt();
                
                // Check that up direction is preserved (dot product should be close to 1)
                const upDot = result.up.normalize().dot(up.normalize());
                expect(Math.abs(upDot)).toBeCloseTo(1, 3);
                
                // Check that we're looking in the right direction
                const lookAtDir = result.lookAt.clone().sub(asset.position.value).normalize();
                const expectedDir = lookAt.clone().normalize();
                const lookAtDot = lookAtDir.dot(expectedDir);
                expect(Math.abs(lookAtDot)).toBeCloseTo(1, 3);
            });
        });

        describe("euler angles", () => {
            it("should handle basic euler rotations", () => {
                const x = 90;  // 90 degrees around X
                const y = 45;  // 45 degrees around Y
                const z = 30;  // 30 degrees around Z
                
                asset.setRotationFromEuler(x, y, z);
                
                const result = asset.getEuler();
                expect(Math.abs(result.x - x)).toBeLessThan(0.001);
                expect(Math.abs(result.y - y)).toBeLessThan(0.001);
                expect(Math.abs(result.z - z)).toBeLessThan(0.001);
            });

            it("should handle full rotation", () => {
                asset.setRotationFromEuler(360, 360, 360);
                
                const result = asset.getEuler();
                // Should normalize to 0 degrees
                expect(Math.abs(result.x)).toBeLessThan(0.001);
                expect(Math.abs(result.y)).toBeLessThan(0.001);
                expect(Math.abs(result.z)).toBeLessThan(0.001);
            });
        });

        describe("axis angle", () => {
            it("should handle basic axis angle rotation", () => {
                const axis = new Vector3(1, 0, 0);  // X axis
                const angle = 90;  // 90 degrees
                
                asset.setRotationFromAxisAngle(axis, angle);
                
                const result = asset.getAxisAngle();
                expect(result.axis.equals(axis)).toBe(true);
                expect(Math.abs(result.angle - angle)).toBeLessThan(0.001);
            });

            it("should normalize the axis", () => {
                const axis = new Vector3(2, 0, 0);  // Non-normalized X axis
                const angle = 45;
                
                asset.setRotationFromAxisAngle(axis, angle);
                
                const result = asset.getAxisAngle();
                expect(result.axis.length()).toBeCloseTo(1);
                expect(result.axis.equals(axis.normalize())).toBe(true);
                expect(Math.abs(result.angle - angle)).toBeLessThan(0.001);
            });
        });

        describe("cross-conversion", () => {
            it("should maintain rotation when converting between formats", () => {
                // Set using euler
                const originalEuler = { x: 30, y: 45, z: 60 };
                asset.setRotationFromEuler(originalEuler.x, originalEuler.y, originalEuler.z);
                
                // Get as axis-angle
                const asAxisAngle = asset.getAxisAngle();
                
                // Set using that axis-angle
                asset.setRotationFromAxisAngle(asAxisAngle.axis, asAxisAngle.angle);
                
                // Get back as euler
                const finalEuler = asset.getEuler();
                
                // Should be approximately the same
                expect(Math.abs(finalEuler.x - originalEuler.x)).toBeLessThan(0.001);
                expect(Math.abs(finalEuler.y - originalEuler.y)).toBeLessThan(0.001);
                expect(Math.abs(finalEuler.z - originalEuler.z)).toBeLessThan(0.001);
            });

            it("should handle special case of identity rotation", () => {
                // Set identity rotation using euler
                asset.setRotationFromEuler(0, 0, 0);
                
                // Check axis-angle representation
                const asAxisAngle = asset.getAxisAngle();
                expect(asAxisAngle.angle).toBeCloseTo(0);
                // When angle is 0, axis can be arbitrary but should be normalized
                expect(asAxisAngle.axis.length()).toBeCloseTo(1);
            });
        });
    });
});
