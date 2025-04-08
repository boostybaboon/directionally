import { describe, it, expect, beforeEach } from "vitest";
import { PlaneGeometryAsset } from "$lib/scene/Geometry/PlaneGeometry/PlaneGeometryAsset";

describe("PlaneGeometryAsset", () => {
    let asset: PlaneGeometryAsset;

    beforeEach(() => {
        asset = new PlaneGeometryAsset();
    });

    it("should create with default values", () => {
        expect(asset.width.value).toBe(1);
        expect(asset.height.value).toBe(1);
        expect(asset.widthSegments.value).toBe(1);
        expect(asset.heightSegments.value).toBe(1);

        // Check underlying geometry parameters
        const geometry = asset.getPlaneGeometry();
        expect(geometry.parameters.width).toBe(1);
        expect(geometry.parameters.height).toBe(1);
        expect(geometry.parameters.widthSegments).toBe(1);
        expect(geometry.parameters.heightSegments).toBe(1);
    });

    it("should initialize with custom values", () => {
        const customAsset = new PlaneGeometryAsset(2, 3, 4, 5);
        
        expect(customAsset.width.value).toBe(2);
        expect(customAsset.height.value).toBe(3);
        expect(customAsset.widthSegments.value).toBe(4);
        expect(customAsset.heightSegments.value).toBe(5);

        // Check underlying geometry parameters
        const geometry = customAsset.getPlaneGeometry();
        expect(geometry.parameters.width).toBe(2);
        expect(geometry.parameters.height).toBe(3);
        expect(geometry.parameters.widthSegments).toBe(4);
        expect(geometry.parameters.heightSegments).toBe(5);
    });

    it("should update geometry when width changes", () => {
        const geometry = asset.getPlaneGeometry();
        asset.width.value = 2;
        expect(geometry.parameters.width).toBe(2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when height changes", () => {
        const geometry = asset.getPlaneGeometry();
        asset.height.value = 2;
        expect(geometry.parameters.height).toBe(2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when widthSegments changes", () => {
        const geometry = asset.getPlaneGeometry();
        asset.widthSegments.value = 2;
        expect(geometry.parameters.widthSegments).toBe(2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when heightSegments changes", () => {
        const geometry = asset.getPlaneGeometry();
        asset.heightSegments.value = 2;
        expect(geometry.parameters.heightSegments).toBe(2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should validate width minimum value", () => {
        expect(() => {
            asset.width.value = -1;
        }).toThrow();
    });

    it("should validate height minimum value", () => {
        expect(() => {
            asset.height.value = -1;
        }).toThrow();
    });

    it("should validate widthSegments minimum value", () => {
        expect(() => {
            asset.widthSegments.value = 0;
        }).toThrow();
    });

    it("should validate heightSegments minimum value", () => {
        expect(() => {
            asset.heightSegments.value = 0;
        }).toThrow();
    });
}); 