import { Mesh, Vector3, Euler } from "three";
import { Object3DAsset } from "../Object3DAsset";
import type { BufferGeometryAsset } from "$lib/scene/Geometry/BufferGeometry/BufferGeometryAsset";
import type { MaterialAsset } from "$lib/scene/Material/MaterialAsset";
import { Vector3Param } from "$lib/common/Param";
import { Asset } from "../../../common/Asset";
import type { PropertyDescriptor } from "$lib/common/Asset";
import type { HierarchicalProperties } from "../../../common/Asset";

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

        // Set up change handlers for geometry and material
        (this._geometry as Asset).getProperties().forEach((prop: PropertyDescriptor, key: string) => {
            if (prop.onChange) {
                const originalOnChange = prop.onChange;
                prop.onChange = (value: any) => {
                    originalOnChange(value);
                    this.updateGeometry();
                };
            }
        });

        (this._material as Asset).getProperties().forEach((prop: PropertyDescriptor, key: string) => {
            if (prop.onChange) {
                const originalOnChange = prop.onChange;
                prop.onChange = (value: any) => {
                    originalOnChange(value);
                    this.updateMaterial();
                };
            }
        });
    }

    getProperties(): Map<string, PropertyDescriptor> {
        // MeshAsset inherits properties from Object3DAsset
        return super.getProperties();
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

    getHierarchicalProperties(title: string): HierarchicalProperties {
        const result: HierarchicalProperties = {
            title,
            properties: this.getProperties(),
            children: []
        };

        // Add Object3D properties first
        const object3DProps: HierarchicalProperties = {
            title: 'Object3D',
            properties: super.getProperties(),
            children: []
        };
        result.children.push(object3DProps);

        // Add Geometry properties second
        const geometryProps = this._geometry.getHierarchicalProperties('Geometry');
        result.children.push(geometryProps);

        // Add Material properties last
        const materialProps = this._material.getHierarchicalProperties('Material');
        result.children.push(materialProps);

        return result;
    }
} 