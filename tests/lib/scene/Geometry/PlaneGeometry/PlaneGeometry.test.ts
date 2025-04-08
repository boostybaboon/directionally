import { describe, it, expect } from "vitest";
import { PlaneGeometryAsset } from "$lib/scene/Geometry/PlaneGeometry/PlaneGeometry";

describe("PlaneGeometryAsset", () => {
    it("should initialize with default values", () => {
        const geometry = new PlaneGeometryAsset();
        
        expect(geometry.width.value).toBe(1);
        expect(geometry.height.value).toBe(1);
    });

    it("should initialize with custom values", () => {
        const geometry = new PlaneGeometryAsset(2, 3);
        
        expect(geometry.width.value).toBe(2);
        expect(geometry.height.value).toBe(3);
    });

    it("should update the underlying geometry when width changes", () => {
        const geometry = new PlaneGeometryAsset();
        const newWidth = 5;
        
        geometry.width.value = newWidth;
        
        expect(geometry.getPlaneGeometry().parameters.width).toBe(newWidth);
    });

    it("should update the underlying geometry when height changes", () => {
        const geometry = new PlaneGeometryAsset();
        const newHeight = 5;
        
        geometry.height.value = newHeight;
        
        expect(geometry.getPlaneGeometry().parameters.height).toBe(newHeight);
    });
}); 