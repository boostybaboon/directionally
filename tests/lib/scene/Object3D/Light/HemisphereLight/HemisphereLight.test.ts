import { describe, it, expect } from "vitest";
import { HemisphereLightAsset } from "$lib/scene/Object3D/Light/HemisphereLight/HemisphereLight";
import { Color } from "three";

describe("HemisphereLightAsset", () => {
    it("should initialize with default values", () => {
        const light = new HemisphereLightAsset();
        
        // Sky color (inherited from Light)
        expect(light.color.value.getHex()).toBe(0xffffff);
        // Ground color
        expect(light.groundColor.value.getHex()).toBe(0xffffff);
        expect(light.intensity.value).toBe(1);
    });

    it("should set and get sky color correctly", () => {
        const light = new HemisphereLightAsset();
        const newColor = new Color(0xff0000);
        
        light.color.value = newColor;
        
        expect(light.color.value.equals(newColor)).toBe(true);
        expect(light.getHemisphereLight().color.equals(newColor)).toBe(true);
    });

    it("should set and get ground color correctly", () => {
        const light = new HemisphereLightAsset();
        const newColor = new Color(0x00ff00);
        
        light.groundColor.value = newColor;
        
        expect(light.groundColor.value.equals(newColor)).toBe(true);
        expect(light.getHemisphereLight().groundColor.equals(newColor)).toBe(true);
    });

    it("should set and get intensity correctly", () => {
        const light = new HemisphereLightAsset();
        const newIntensity = 2.5;
        
        light.intensity.value = newIntensity;
        
        expect(light.intensity.value).toBe(newIntensity);
        expect(light.getHemisphereLight().intensity).toBe(newIntensity);
    });

    it("should inherit position from Object3DAsset", () => {
        const light = new HemisphereLightAsset();
        
        light.position.value.set(1, 2, 3);
        expect(light.position.value.x).toBe(1);
        expect(light.position.value.y).toBe(2);
        expect(light.position.value.z).toBe(3);
    });
}); 