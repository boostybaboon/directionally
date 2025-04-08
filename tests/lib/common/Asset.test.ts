import { describe, it, expect, beforeEach } from "vitest";
import { MeshAsset } from "$lib/scene/Object3D/Mesh/MeshAsset";
import { SphereGeometryAsset } from "$lib/scene/Geometry/SphereGeometry/SphereGeometryAsset";
import { MeshStandardMaterialAsset } from "$lib/scene/Material/MeshStandardMaterial/MeshStandardMaterialAsset";
import { Vector3, Color } from "three";

describe("Asset Property Tree", () => {
    let mesh: MeshAsset;
    let geometry: SphereGeometryAsset;
    let material: MeshStandardMaterialAsset;

    beforeEach(() => {
        // Create a sphere with a standard material
        geometry = new SphereGeometryAsset(1, 32, 32);
        material = new MeshStandardMaterialAsset(0xff0000, 0.5, 0.5);
        mesh = new MeshAsset(geometry, material);
    });

    it("should get hierarchical properties from a mesh", () => {
        const properties = mesh.getHierarchicalProperties("Sphere");

        // Verify the hierarchy structure
        expect(properties.title).toBe("Sphere");
        expect(properties.children.length).toBe(3); // Object3D, Geometry, Material

        // Find each child by title
        const object3DProps = properties.children.find(c => c.title === "Object3D");
        const geometryProps = properties.children.find(c => c.title === "Geometry");
        const materialProps = properties.children.find(c => c.title === "Material");

        expect(object3DProps).toBeDefined();
        expect(geometryProps).toBeDefined();
        expect(materialProps).toBeDefined();

        // Verify Object3D properties
        expect(object3DProps?.properties.has("position")).toBe(true);
        expect(object3DProps?.properties.has("rotation")).toBe(true);
        expect(object3DProps?.properties.has("scale")).toBe(true);

        // Verify Geometry properties
        expect(geometryProps?.properties.has("radius")).toBe(true);
        expect(geometryProps?.properties.has("widthSegments")).toBe(true);
        expect(geometryProps?.properties.has("heightSegments")).toBe(true);

        // Verify Material properties
        expect(materialProps?.properties.has("color")).toBe(true);
        expect(materialProps?.properties.has("roughness")).toBe(true);
        expect(materialProps?.properties.has("metalness")).toBe(true);
    });

    it("should reflect property changes in the tree", () => {
        const properties = mesh.getHierarchicalProperties("Sphere");
        const materialProps = properties.children.find(c => c.title === "Material")!;

        // Change the material color
        const colorProp = materialProps.properties.get("color")!;
        colorProp.onChange!(new Color(0x00ff00));

        // Get fresh properties and verify the change
        const newProperties = mesh.getHierarchicalProperties("Sphere");
        const newMaterialProps = newProperties.children.find(c => c.title === "Material")!;
        const newColorProp = newMaterialProps.properties.get("color")!;

        expect(newColorProp.value.getHex()).toBe(0x00ff00);
        expect(material.color.value.getHex()).toBe(0x00ff00);
    });

    it("should reflect geometry changes in the tree", () => {
        const properties = mesh.getHierarchicalProperties("Sphere");
        const geometryProps = properties.children.find(c => c.title === "Geometry")!;

        // Change the sphere radius
        const radiusProp = geometryProps.properties.get("radius")!;
        radiusProp.onChange!(2);

        // Get fresh properties and verify the change
        const newProperties = mesh.getHierarchicalProperties("Sphere");
        const newGeometryProps = newProperties.children.find(c => c.title === "Geometry")!;
        const newRadiusProp = newGeometryProps.properties.get("radius")!;

        expect(newRadiusProp.value).toBe(2);
        expect(geometry.radius.value).toBe(2);
    });

    it("should reflect transform changes in the tree", () => {
        const properties = mesh.getHierarchicalProperties("Sphere");
        const object3DProps = properties.children.find(c => c.title === "Object3D")!;

        // Change the position
        const positionProp = object3DProps.properties.get("position")!;
        const newPosition = new Vector3(1, 2, 3);
        positionProp.onChange!(newPosition);

        // Get fresh properties and verify the change
        const newProperties = mesh.getHierarchicalProperties("Sphere");
        const newObject3DProps = newProperties.children.find(c => c.title === "Object3D")!;
        const newPositionProp = newObject3DProps.properties.get("position")!;

        expect(newPositionProp.value).toEqual(newPosition);
        expect(mesh.position.value).toEqual(newPosition);
        expect(mesh.getObject3D().position).toEqual(newPosition);
    });
}); 