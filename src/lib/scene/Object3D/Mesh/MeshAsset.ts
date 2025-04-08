import { Mesh, Vector3, Euler } from "three";
import { Object3DAsset } from "../Object3DAsset";
import { BufferGeometryAsset } from "../../Geometry/BufferGeometry/BufferGeometryAsset";
import { MaterialAsset } from "../../Material/MaterialAsset";
import { Vector3Param } from "$lib/common/Param";
import { Asset } from "../../../common/Asset";
import type { PropertyDescriptor } from "../../../common/Asset";

export class MeshAsset extends Object3DAsset {
    private _mesh: Mesh;
    private _geometry: BufferGeometryAsset;
    private _material: MaterialAsset;
    rotation: Vector3Param;
    scale: Vector3Param;

    constructor(geometry: BufferGeometryAsset, material: MaterialAsset, mesh?: Mesh) {
        const threeMesh = mesh || new Mesh(geometry.getGeometry(), material.getMaterial());
        super(threeMesh);
        this._mesh = threeMesh;
        this._geometry = geometry;
        this._material = material;

        // Initialize rotation and scale parameters
        this.rotation = new Vector3Param(
            "Rotation",
            "https://threejs.org/docs/#api/en/core/Object3D.rotation",
            new Vector3(0, 0, 0)
        );

        this.scale = new Vector3Param(
            "Scale",
            "https://threejs.org/docs/#api/en/core/Object3D.scale",
            new Vector3(1, 1, 1)
        );

        // Set up change handlers
        this.rotation.onChange = (newRotation) => {
            this._mesh.rotation.setFromVector3(newRotation);
        };

        this.scale.onChange = (newScale) => {
            this._mesh.scale.copy(newScale);
        };

        // Update the mesh when geometry or material changes
        this.updateGeometry();
        this.updateMaterial();
    }

    getProperties(): Map<string, PropertyDescriptor> {
        // MeshAsset doesn't have any properties of its own
        // It inherits Object3D properties and delegates to geometry and material
        return new Map();
    }

    /**
     * Get the underlying Three.js Mesh instance
     */
    getMesh(): Mesh {
        return this._mesh;
    }

    /**
     * Get the geometry asset
     */
    getGeometry(): BufferGeometryAsset {
        return this._geometry;
    }

    /**
     * Get the material asset
     */
    getMaterial(): MaterialAsset {
        return this._material;
    }

    /**
     * Set rotation using Euler angles (in radians)
     */
    setRotationFromEuler(x: number, y: number, z: number): void {
        const newRotation = new Vector3(x, y, z);
        this.rotation.value = newRotation;
    }

    /**
     * Update the mesh's geometry from the geometry asset
     */
    private updateGeometry(): void {
        this._mesh.geometry = this._geometry.getGeometry();
    }

    /**
     * Update the mesh's material from the material asset
     */
    private updateMaterial(): void {
        this._mesh.material = this._material.getMaterial();
    }
} 