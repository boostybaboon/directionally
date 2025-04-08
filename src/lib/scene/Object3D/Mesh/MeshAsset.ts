import { Mesh, Vector3, Euler } from "three";
import { Object3DAsset } from "../Object3DAsset";
import { BufferGeometryAsset } from "../../Geometry/BufferGeometry/BufferGeometryAsset";
import { MaterialAsset } from "../../Material/MaterialAsset";
import { Vector3Param } from "$lib/common/Param";

export class MeshAsset extends Object3DAsset {
    private _mesh: Mesh;
    private _geometry: BufferGeometryAsset;
    private _material: MaterialAsset;
    rotation: Vector3Param;
    scale: Vector3Param;

    constructor(geometry: BufferGeometryAsset, material: MaterialAsset) {
        const mesh = new Mesh(geometry.getGeometry(), material.getMaterial());
        super(mesh);
        this._mesh = mesh;
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
        
        // Debug: Log initial position
        console.log('MeshAsset created with initial position:', this._mesh.position);
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
} 