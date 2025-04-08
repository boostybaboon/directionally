import { describe, it, expect, beforeEach } from "vitest";
import { MaterialAsset } from "$lib/scene/Material/MaterialAsset";
import { Material, MeshBasicMaterial } from "three";

describe("MaterialAsset", () => {
    let material: MaterialAsset;
    let threeMaterial: Material;

    beforeEach(() => {
        // Using MeshBasicMaterial as a concrete implementation for testing
        threeMaterial = new MeshBasicMaterial();
        material = new MaterialAsset(threeMaterial);
    });

    it("should initialize with default values", () => {
        expect(material.opacity.value).toBe(1.0);
        expect(material.transparent.value).toBe(false);
        expect(material.visible.value).toBe(true);
        expect(material.side.value).toBe(0); // FrontSide = 0
        expect(material.needsUpdate.value).toBe(false);
    });

    it("should update opacity and automatically set transparent", () => {
        material.opacity.value = 0.5;
        expect(threeMaterial.opacity).toBe(0.5);
        expect(threeMaterial.transparent).toBe(true);
        expect(material.transparent.value).toBe(true);
    });

    it("should update transparent property", () => {
        material.transparent.value = true;
        expect(threeMaterial.transparent).toBe(true);
    });

    it("should update visible property", () => {
        material.visible.value = false;
        expect(threeMaterial.visible).toBe(false);
    });

    it("should update side property", () => {
        material.side.value = 1; // BackSide = 1
        expect(threeMaterial.side).toBe(1);
    });

    it("should validate opacity range", () => {
        expect(() => {
            material.opacity.value = -0.1;
        }).toThrow();
        expect(() => {
            material.opacity.value = 1.1;
        }).toThrow();
    });

    it("should validate side values", () => {
        expect(() => {
            material.side.value = 3; // Invalid side value
        }).toThrow();
    });

    it("should update needsUpdate flag", () => {
        material.needsUpdate.value = true;
        expect(material.needsUpdate.value).toBe(true);
        
        material.needsUpdate.value = false;
        expect(material.needsUpdate.value).toBe(false);
    });
}); 