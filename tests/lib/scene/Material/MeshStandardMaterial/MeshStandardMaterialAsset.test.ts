import { describe, it, expect } from 'vitest';
import { MeshStandardMaterialAsset } from '$lib/scene/Material/MeshStandardMaterial/MeshStandardMaterialAsset';
import { Color } from 'three';

describe('MeshStandardMaterialAsset', () => {
    it('should create with default values', () => {
        const material = new MeshStandardMaterialAsset();
        expect(material.color.value.getHex()).toBe(0xffffff);
        expect(material.roughness.value).toBe(1.0);
        expect(material.metalness.value).toBe(0.0);
        expect(material.emissive.value.getHex()).toBe(0x000000);
        expect(material.emissiveIntensity.value).toBe(1.0);
        expect(material.wireframe.value).toBe(false);
        expect(material.flatShading.value).toBe(false);
    });

    it('should create with custom values', () => {
        const material = new MeshStandardMaterialAsset(
            0xff0000,  // red
            0.5,       // roughness
            0.8,       // metalness
            0x00ff00,  // green emissive
            2.0,       // emissive intensity
            true,      // wireframe
            true       // flat shading
        );

        expect(material.color.value.getHex()).toBe(0xff0000);
        expect(material.roughness.value).toBe(0.5);
        expect(material.metalness.value).toBe(0.8);
        expect(material.emissive.value.getHex()).toBe(0x00ff00);
        expect(material.emissiveIntensity.value).toBe(2.0);
        expect(material.wireframe.value).toBe(true);
        expect(material.flatShading.value).toBe(true);
    });

    it('should update material when color changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.color.value = new Color(0xff0000);
        expect(threeMaterial.color.getHex()).toBe(0xff0000);
    });

    it('should update material when roughness changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.roughness.value = 0.5;
        expect(threeMaterial.roughness).toBe(0.5);
    });

    it('should update material when metalness changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.metalness.value = 0.8;
        expect(threeMaterial.metalness).toBe(0.8);
    });

    it('should update material when emissive changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.emissive.value = new Color(0x00ff00);
        expect(threeMaterial.emissive.getHex()).toBe(0x00ff00);
    });

    it('should update material when emissiveIntensity changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.emissiveIntensity.value = 2.0;
        expect(threeMaterial.emissiveIntensity).toBe(2.0);
    });

    it('should update material when wireframe changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.wireframe.value = true;
        expect(threeMaterial.wireframe).toBe(true);
    });

    it('should update material when flatShading changes', () => {
        const material = new MeshStandardMaterialAsset();
        const threeMaterial = material.getMeshStandardMaterial();
        
        material.flatShading.value = true;
        expect(threeMaterial.flatShading).toBe(true);
    });
}); 