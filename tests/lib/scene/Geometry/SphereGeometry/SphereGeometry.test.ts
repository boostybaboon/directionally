import { describe, it, expect } from "vitest";
import { SphereGeometryAsset } from "$lib/scene/Geometry/SphereGeometry/SphereGeometry";

describe("SphereGeometryAsset", () => {
    it("should initialize with default values", () => {
        const geometry = new SphereGeometryAsset();
        
        // Check param values
        expect(geometry.radius.value).toBe(1);
        expect(geometry.widthSegments.value).toBe(32);
        expect(geometry.heightSegments.value).toBe(16);

        // Check underlying geometry parameters
        const sphereGeometry = geometry.getSphereGeometry();
        expect(sphereGeometry.parameters.radius).toBe(1);
        expect(sphereGeometry.parameters.widthSegments).toBe(32);
        expect(sphereGeometry.parameters.heightSegments).toBe(16);
    });

    it("should initialize with custom values", () => {
        const geometry = new SphereGeometryAsset(2, 16, 8);
        
        // Check param values
        expect(geometry.radius.value).toBe(2);
        expect(geometry.widthSegments.value).toBe(16);
        expect(geometry.heightSegments.value).toBe(8);

        // Check underlying geometry parameters
        const sphereGeometry = geometry.getSphereGeometry();
        expect(sphereGeometry.parameters.radius).toBe(2);
        expect(sphereGeometry.parameters.widthSegments).toBe(16);
        expect(sphereGeometry.parameters.heightSegments).toBe(8);
    });

    it("should update both param and geometry when radius changes", () => {
        const geometry = new SphereGeometryAsset();
        const newRadius = 5;
        
        geometry.radius.value = newRadius;
        
        // Check param value
        expect(geometry.radius.value).toBe(newRadius);
        
        // Check underlying geometry
        const sphereGeometry = geometry.getSphereGeometry();
        expect(sphereGeometry.parameters.radius).toBe(newRadius);
        expect(sphereGeometry.parameters.widthSegments).toBe(32); // Should maintain other params
        expect(sphereGeometry.parameters.heightSegments).toBe(16);
        
        // Check base class geometry is updated
        expect(geometry.getGeometry()).toBe(sphereGeometry);
    });

    it("should update both param and geometry when widthSegments changes", () => {
        const geometry = new SphereGeometryAsset();
        const newWidthSegments = 24;
        
        geometry.widthSegments.value = newWidthSegments;
        
        // Check param value
        expect(geometry.widthSegments.value).toBe(newWidthSegments);
        
        // Check underlying geometry
        const sphereGeometry = geometry.getSphereGeometry();
        expect(sphereGeometry.parameters.radius).toBe(1); // Should maintain other params
        expect(sphereGeometry.parameters.widthSegments).toBe(newWidthSegments);
        expect(sphereGeometry.parameters.heightSegments).toBe(16);
        
        // Check base class geometry is updated
        expect(geometry.getGeometry()).toBe(sphereGeometry);
    });

    it("should update both param and geometry when heightSegments changes", () => {
        const geometry = new SphereGeometryAsset();
        const newHeightSegments = 12;
        
        geometry.heightSegments.value = newHeightSegments;
        
        // Check param value
        expect(geometry.heightSegments.value).toBe(newHeightSegments);
        
        // Check underlying geometry
        const sphereGeometry = geometry.getSphereGeometry();
        expect(sphereGeometry.parameters.radius).toBe(1); // Should maintain other params
        expect(sphereGeometry.parameters.widthSegments).toBe(32);
        expect(sphereGeometry.parameters.heightSegments).toBe(newHeightSegments);
        
        // Check base class geometry is updated
        expect(geometry.getGeometry()).toBe(sphereGeometry);
    });

    it("should enforce minimum values for parameters", () => {
        const geometry = new SphereGeometryAsset();
        
        // Radius minimum is 0.1
        geometry.radius.value = 0.1;
        expect(geometry.radius.value).toBe(0.1);
        expect(() => geometry.radius.value = 0).toThrow();
        
        // Width segments minimum is 3
        geometry.widthSegments.value = 3;
        expect(geometry.widthSegments.value).toBe(3);
        expect(() => geometry.widthSegments.value = 2).toThrow();
        
        // Height segments minimum is 2
        geometry.heightSegments.value = 2;
        expect(geometry.heightSegments.value).toBe(2);
        expect(() => geometry.heightSegments.value = 1).toThrow();
    });
}); 