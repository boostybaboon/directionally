import { describe, it, expect, beforeEach } from "vitest";
import { DirectionalLightAsset } from "$lib/scene/Object3D/Light/DirectionalLight/DirectionalLightAsset";
import { Color } from "three";

describe("DirectionalLightAsset", () => {
    let asset: DirectionalLightAsset;

    beforeEach(() => {
        asset = new DirectionalLightAsset();
    });

    it("should initialize with default values", () => {
        expect(asset.color.value.getHex()).toBe(0xffffff);
        expect(asset.intensity.value).toBe(1);
    });

    it("should update light when color changes", () => {
        const light = asset.getLight();
        asset.color.value = new Color(0xff0000);
        expect(light.color.getHex()).toBe(0xff0000);
    });

    it("should update light when intensity changes", () => {
        const light = asset.getLight();
        asset.intensity.value = 0.5;
        expect(light.intensity).toBe(0.5);
    });

    it("should validate intensity minimum value", () => {
        expect(() => {
            asset.intensity.value = -1;
        }).toThrow();
    });

    it("should inherit position from Object3DAsset", () => {
        // Test that we can set and get position
        asset.position.value.set(1, 2, 3);
        expect(asset.position.value.x).toBe(1);
        expect(asset.position.value.y).toBe(2);
        expect(asset.position.value.z).toBe(3);
    });
}); 