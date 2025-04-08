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

    constructor(geometry: BufferGeometryAsset, material: MaterialAsset, mesh?: Mesh) {
        const threeMesh = mesh || new Mesh(geometry.getGeometry(), material.getMaterial());
        super(threeMesh);
        this._mesh = threeMesh;
        this._geometry = geometry;
        this._material = material;

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