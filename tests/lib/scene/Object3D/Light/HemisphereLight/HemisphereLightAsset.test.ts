import { describe, it, expect, beforeEach } from "vitest";
import { HemisphereLightAsset } from "$lib/scene/Object3D/Light/HemisphereLight/HemisphereLightAsset";
import { Color } from "three";

describe("HemisphereLightAsset", () => {
    let asset: HemisphereLightAsset;

    beforeEach(() => {
        asset = new HemisphereLightAsset();
    });

    it("should initialize with default values", () => {
        // Sky color (inherited from Light)
        expect(asset.color.value.getHex()).toBe(0xffffff);
        // Ground color
        expect(asset.groundColor.value.getHex()).toBe(0xffffff);
        expect(asset.intensity.value).toBe(1);
    });

    it("should update light when sky color changes", () => {
        const light = asset.getLight();
        asset.color.value = new Color(0xff0000);
        expect(light.color.getHex()).toBe(0xff0000);
    });

    it("should update light when ground color changes", () => {
        const light = asset.getHemisphereLight();
        asset.groundColor.value = new Color(0x00ff00);
        expect(light.groundColor.getHex()).toBe(0x00ff00);
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
        asset.position.value.set(1, 2, 3);
        expect(asset.position.value.x).toBe(1);
        expect(asset.position.value.y).toBe(2);
        expect(asset.position.value.z).toBe(3);
    });
}); 