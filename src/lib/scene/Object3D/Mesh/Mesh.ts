import { Mesh } from "three";
import { Object3DAsset } from "../Object3DAsset";
import { BufferGeometryAsset } from "../../Geometry/BufferGeometry/BufferGeometry";
import { MaterialAsset } from "../../Material/Material/Material";

export class MeshAsset extends Object3DAsset {
    private _mesh: Mesh;
    private _geometry: BufferGeometryAsset;
    private _material: MaterialAsset;

    constructor(geometry: BufferGeometryAsset, material: MaterialAsset) {
        const mesh = new Mesh(geometry.getGeometry(), material.getMaterial());
        super(mesh);
        this._mesh = mesh;
        this._geometry = geometry;
        this._material = material;
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
} 