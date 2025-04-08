import { describe, it, expect, beforeEach } from 'vitest';
import { Object3DAsset } from "$lib/scene/Object3D/Object3DAsset";
import { Object3D, Vector3, Euler } from "three";

describe("Object3DAsset", () => {
    let asset: Object3DAsset;
    let object3D: Object3D;

    beforeEach(() => {
        object3D = new Object3D();
        asset = new Object3DAsset(object3D);
    });

    it("should initialize with default values", () => {
        expect(asset.position.value.x).toBe(0);
        expect(asset.position.value.y).toBe(0);
        expect(asset.position.value.z).toBe(0);
        expect(asset.rotation.value.x).toBe(0);
        expect(asset.rotation.value.y).toBe(0);
        expect(asset.rotation.value.z).toBe(0);
        expect(asset.scale.value.x).toBe(1);
        expect(asset.scale.value.y).toBe(1);
        expect(asset.scale.value.z).toBe(1);
    });

    it("should update position", () => {
        asset.position.value = new Vector3(1, 2, 3);
        expect(object3D.position.x).toBe(1);
        expect(object3D.position.y).toBe(2);
        expect(object3D.position.z).toBe(3);
    });

    it("should update rotation", () => {
        asset.rotation.value = new Vector3(Math.PI/2, Math.PI/4, Math.PI/6);
        expect(object3D.rotation.x).toBe(Math.PI/2);
        expect(object3D.rotation.y).toBe(Math.PI/4);
        expect(object3D.rotation.z).toBe(Math.PI/6);
    });

    it("should update scale", () => {
        asset.scale.value = new Vector3(2, 3, 4);
        expect(object3D.scale.x).toBe(2);
        expect(object3D.scale.y).toBe(3);
        expect(object3D.scale.z).toBe(4);
    });

    it("should set rotation from Euler angles", () => {
        asset.setRotationFromEuler(90, 45, 30);
        expect(object3D.rotation.x).toBeCloseTo(Math.PI/2);
        expect(object3D.rotation.y).toBeCloseTo(Math.PI/4);
        expect(object3D.rotation.z).toBeCloseTo(Math.PI/6);
    });

    it("should set rotation from axis and angle", () => {
        const axis = new Vector3(1, 0, 0);
        asset.setRotationFromAxisAngle(axis, 90);
        const quaternion = object3D.quaternion;
        expect(quaternion.x).toBeCloseTo(Math.sin(Math.PI/4));
        expect(quaternion.w).toBeCloseTo(Math.cos(Math.PI/4));
    });

    it("should set rotation from up and lookAt vectors", () => {
        const up = new Vector3(0, 1, 0);
        const lookAt = new Vector3(0, 0, -1);
        asset.setRotationFromUpLookAt(up, lookAt);
        expect(object3D.up.x).toBe(0);
        expect(object3D.up.y).toBe(1);
        expect(object3D.up.z).toBe(0);
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

    describe("up/lookAt rotation handling", () => {
        it("should store up/lookAt values when set", () => {
            const up = new Vector3(0, 1, 0);
            const lookAt = new Vector3(0, 0, -1);
            
            asset.setRotationFromUpLookAt(up, lookAt);
            
            const result = asset.getUpLookAt();
            expect(result).not.toBeNull();
            const nonNullResult = result as { up: Vector3, lookAt: Vector3 };
            expect(nonNullResult.up.equals(up)).toBe(true);
            expect(nonNullResult.lookAt.equals(lookAt)).toBe(true);
        });

        it("should return null when rotation was set via Euler angles", () => {
            // First set via up/lookAt
            asset.setRotationFromUpLookAt(new Vector3(0, 1, 0), new Vector3(0, 0, -1));
            
            // Then set via Euler angles
            asset.setRotationFromEuler(90, 0, 0);
            
            const result = asset.getUpLookAt();
            expect(result).toBeNull();
        });

        it("should return null when rotation was set via axis-angle", () => {
            // First set via up/lookAt
            asset.setRotationFromUpLookAt(new Vector3(0, 1, 0), new Vector3(0, 0, -1));
            
            // Then set via axis-angle
            asset.setRotationFromAxisAngle(new Vector3(1, 0, 0), 90);
            
            const result = asset.getUpLookAt();
            expect(result).toBeNull();
        });

        it("should return null when rotation was set via direct rotation parameter", () => {
            // First set via up/lookAt
            asset.setRotationFromUpLookAt(new Vector3(0, 1, 0), new Vector3(0, 0, -1));
            
            // Then set via direct rotation parameter
            asset.rotation.value = new Vector3(Math.PI/2, 0, 0);
            
            const result = asset.getUpLookAt();
            expect(result).toBeNull();
        });

        it("should maintain up/lookAt values when position changes", () => {
            const up = new Vector3(0, 1, 0);
            const lookAt = new Vector3(0, 0, -1);
            
            asset.setRotationFromUpLookAt(up, lookAt);
            asset.position.value = new Vector3(1, 2, 3);
            
            const result = asset.getUpLookAt();
            expect(result).not.toBeNull();
            const nonNullResult = result as { up: Vector3, lookAt: Vector3 };
            expect(nonNullResult.up.equals(up)).toBe(true);
            expect(nonNullResult.lookAt.equals(lookAt)).toBe(true);
        });

        it("should handle non-standard up vectors", () => {
            const up = new Vector3(0, 0, 1);  // Using +Z as up
            const lookAt = new Vector3(1, 0, 0);  // Looking along +X
            
            asset.setRotationFromUpLookAt(up, lookAt);
            
            const result = asset.getUpLookAt();
            expect(result).not.toBeNull();
            const nonNullResult = result as { up: Vector3, lookAt: Vector3 };
            expect(nonNullResult.up.equals(up)).toBe(true);
            expect(nonNullResult.lookAt.equals(lookAt)).toBe(true);
        });

        it("should handle multiple up/lookAt changes", () => {
            // First up/lookAt
            asset.setRotationFromUpLookAt(new Vector3(0, 1, 0), new Vector3(0, 0, -1));
            
            // Second up/lookAt
            const up = new Vector3(0, 0, 1);
            const lookAt = new Vector3(1, 0, 0);
            asset.setRotationFromUpLookAt(up, lookAt);
            
            const result = asset.getUpLookAt();
            expect(result).not.toBeNull();
            const nonNullResult = result as { up: Vector3, lookAt: Vector3 };
            expect(nonNullResult.up.equals(up)).toBe(true);
            expect(nonNullResult.lookAt.equals(lookAt)).toBe(true);
        });

        it("should handle up/lookAt after other rotation methods", () => {
            // First set via Euler angles
            asset.setRotationFromEuler(90, 0, 0);
            
            // Then set via up/lookAt
            const up = new Vector3(0, 1, 0);
            const lookAt = new Vector3(0, 0, -1);
            asset.setRotationFromUpLookAt(up, lookAt);
            
            const result = asset.getUpLookAt();
            expect(result).not.toBeNull();
            const nonNullResult = result as { up: Vector3, lookAt: Vector3 };
            expect(nonNullResult.up.equals(up)).toBe(true);
            expect(nonNullResult.lookAt.equals(lookAt)).toBe(true);
        });
    });
});