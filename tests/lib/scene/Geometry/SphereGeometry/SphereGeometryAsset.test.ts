import { describe, it, expect, beforeEach } from "vitest";
import { SphereGeometryAsset } from "$lib/scene/Geometry/SphereGeometry/SphereGeometryAsset";

describe("SphereGeometryAsset", () => {
    let asset: SphereGeometryAsset;

    beforeEach(() => {
        asset = new SphereGeometryAsset();
    });

    it("should create with default values", () => {
        expect(asset.radius.value).toBe(1);
        expect(asset.widthSegments.value).toBe(32);
        expect(asset.heightSegments.value).toBe(16);
        expect(asset.phiStart.value).toBe(0);
        expect(asset.phiLength.value).toBe(Math.PI * 2);
        expect(asset.thetaStart.value).toBe(0);
        expect(asset.thetaLength.value).toBe(Math.PI);

        // Check underlying geometry parameters
        const geometry = asset.getSphereGeometry();
        expect(geometry.parameters.radius).toBe(1);
        expect(geometry.parameters.widthSegments).toBe(32);
        expect(geometry.parameters.heightSegments).toBe(16);
        expect(geometry.parameters.phiStart).toBe(0);
        expect(geometry.parameters.phiLength).toBe(Math.PI * 2);
        expect(geometry.parameters.thetaStart).toBe(0);
        expect(geometry.parameters.thetaLength).toBe(Math.PI);
    });

    it("should initialize with custom values", () => {
        const customAsset = new SphereGeometryAsset(2, 16, 8, Math.PI, Math.PI, Math.PI / 2, Math.PI / 2);
        
        expect(customAsset.radius.value).toBe(2);
        expect(customAsset.widthSegments.value).toBe(16);
        expect(customAsset.heightSegments.value).toBe(8);
        expect(customAsset.phiStart.value).toBe(Math.PI);
        expect(customAsset.phiLength.value).toBe(Math.PI);
        expect(customAsset.thetaStart.value).toBe(Math.PI / 2);
        expect(customAsset.thetaLength.value).toBe(Math.PI / 2);

        // Check underlying geometry parameters
        const geometry = customAsset.getSphereGeometry();
        expect(geometry.parameters.radius).toBe(2);
        expect(geometry.parameters.widthSegments).toBe(16);
        expect(geometry.parameters.heightSegments).toBe(8);
        expect(geometry.parameters.phiStart).toBe(Math.PI);
        expect(geometry.parameters.phiLength).toBe(Math.PI);
        expect(geometry.parameters.thetaStart).toBe(Math.PI / 2);
        expect(geometry.parameters.thetaLength).toBe(Math.PI / 2);
    });

    it("should update geometry when radius changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.radius.value = 2;
        expect(geometry.parameters.radius).toBe(2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when widthSegments changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.widthSegments.value = 16;
        expect(geometry.parameters.widthSegments).toBe(16);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when heightSegments changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.heightSegments.value = 8;
        expect(geometry.parameters.heightSegments).toBe(8);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when phiStart changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.phiStart.value = Math.PI;
        expect(geometry.parameters.phiStart).toBe(Math.PI);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when phiLength changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.phiLength.value = Math.PI;
        expect(geometry.parameters.phiLength).toBe(Math.PI);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when thetaStart changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.thetaStart.value = Math.PI / 2;
        expect(geometry.parameters.thetaStart).toBe(Math.PI / 2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should update geometry when thetaLength changes", () => {
        const geometry = asset.getSphereGeometry();
        asset.thetaLength.value = Math.PI / 2;
        expect(geometry.parameters.thetaLength).toBe(Math.PI / 2);
        expect(asset.getGeometry()).toBe(geometry);
    });

    it("should validate widthSegments minimum value", () => {
        expect(() => {
            asset.widthSegments.value = 2;
        }).toThrow();
    });

    it("should validate heightSegments minimum value", () => {
        expect(() => {
            asset.heightSegments.value = 1;
        }).toThrow();
    });

    it("should validate radius minimum value", () => {
        expect(() => {
            asset.radius.value = -1;
        }).toThrow();
    });

    it("should validate phiLength maximum value", () => {
        expect(() => {
            asset.phiLength.value = Math.PI * 3;
        }).toThrow();
    });

    it("should validate thetaLength maximum value", () => {
        expect(() => {
            asset.thetaLength.value = Math.PI * 2;
        }).toThrow();
    });
}); 