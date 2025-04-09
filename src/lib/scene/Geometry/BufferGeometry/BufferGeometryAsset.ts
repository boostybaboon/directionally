import { BufferGeometry } from "three";
import { Asset } from "$lib/common/Asset";
import type { PropertyDescriptor } from "$lib/common/Asset";

export class BufferGeometryAsset extends Asset {
    private _geometry: BufferGeometry;

    constructor(geometry: BufferGeometry) {
        super();
        this._geometry = geometry;
    }

    /**
     * Get the underlying Three.js BufferGeometry instance
     */
    getGeometry(): BufferGeometry {
        return this._geometry;
    }

    /**
     * Set the underlying Three.js BufferGeometry instance
     */
    protected setGeometry(geometry: BufferGeometry): void {
        this._geometry = geometry;
    }

    getProperties(): Map<string, PropertyDescriptor> {
        // BufferGeometry doesn't have any parameters in the base class
        return new Map<string, PropertyDescriptor>();
    }
} 