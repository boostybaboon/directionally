import { describe, it, expect, beforeEach } from "vitest";
import { MeshAsset } from "$lib/scene/Object3D/Mesh/MeshAsset";
import { PlaneGeometryAsset } from "$lib/scene/Geometry/PlaneGeometry/PlaneGeometryAsset";
import { MeshStandardMaterialAsset } from "$lib/scene/Material/MeshStandardMaterial/MeshStandardMaterialAsset";
import { Color, Vector3 } from "three";

describe("MeshAsset", () => {
    let mesh: MeshAsset;
    let geometry: PlaneGeometryAsset;
    let material: MeshStandardMaterialAsset;

    beforeEach(() => {
        geometry = new PlaneGeometryAsset(1, 1);
        material = new MeshStandardMaterialAsset();
        mesh = new MeshAsset(geometry, material);
    });

    it("should initialize with provided geometry and material", () => {
        expect(mesh.getGeometry()).toBe(geometry);
        expect(mesh.getMaterial()).toBe(material);
    });

    it("should update position when position is set", () => {
        const position = mesh.position.value;
        position.set(1, 2, 3);
        mesh.position.value = position;
        expect(mesh.getMesh().position.x).toBe(1);
        expect(mesh.getMesh().position.y).toBe(2);
        expect(mesh.getMesh().position.z).toBe(3);
    });

    it("should update material when material properties change", () => {
        material.color.value = new Color(0xff0000);
        expect(mesh.getMesh().material.color.getHex()).toBe(0xff0000);
    });

    it("should update geometry when geometry properties change", () => {
        geometry.width.value = 2;
        expect(mesh.getMesh().geometry.parameters.width).toBe(2);
    });

    it("should update rotation when rotation is set", () => {
        const rotation = new Vector3(Math.PI/2, 0, 0);
        mesh.rotation.value = rotation;
        expect(mesh.getMesh().rotation.x).toBe(Math.PI/2);
        expect(mesh.getMesh().rotation.y).toBe(0);
        expect(mesh.getMesh().rotation.z).toBe(0);
    });

    it("should update scale when scale is set", () => {
        const scale = new Vector3(2, 3, 4);
        mesh.scale.value = scale;
        expect(mesh.getMesh().scale.x).toBe(2);
        expect(mesh.getMesh().scale.y).toBe(3);
        expect(mesh.getMesh().scale.z).toBe(4);
    });

    it("should set rotation from Euler angles", () => {
        mesh.setRotationFromEuler(Math.PI/2, Math.PI/4, Math.PI/6);
        expect(mesh.getMesh().rotation.x).toBe(Math.PI/2);
        expect(mesh.getMesh().rotation.y).toBe(Math.PI/4);
        expect(mesh.getMesh().rotation.z).toBe(Math.PI/6);
    });
}); 