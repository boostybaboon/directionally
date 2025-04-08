import { describe, it, expect } from "vitest";
import { DirectionalLightAsset } from "$lib/scene/Object3D/Light/DirectionalLight/DirectionalLightAsset";
import { Color } from "three";

describe("DirectionalLight", () => {
    it("should initialize with default values", () => {
        const light = new DirectionalLightAsset();
        
        expect(light.color.value.getHex()).toBe(0xffffff);
        expect(light.intensity).toBe(1);
    });

    it("should set and get color correctly", () => {
        const light = new DirectionalLightAsset();
        const newColor = new Color(0xff0000);
        
        light.color.value = newColor;
        
        expect(light.color.value.equals(newColor)).toBe(true);
        expect(light.getDirectionalLight().color.equals(newColor)).toBe(true);
    });

    it("should set and get intensity correctly", () => {
        const light = new DirectionalLightAsset();
        const newIntensity = 2.5;
        
        light.setIntensity(newIntensity);
        
        expect(light.intensity).toBe(newIntensity);
        expect(light.getDirectionalLight().intensity).toBe(newIntensity);
    });

    it("should inherit position from Object3DAsset", () => {
        const light = new DirectionalLightAsset();
        
        // Test that we can set and get position
        light.position.value.set(1, 2, 3);
        expect(light.position.value.x).toBe(1);
        expect(light.position.value.y).toBe(2);
        expect(light.position.value.z).toBe(3);
    });
}); 