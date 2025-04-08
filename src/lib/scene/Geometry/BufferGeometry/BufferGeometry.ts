import { BufferGeometry } from "three";

export class BufferGeometryAsset {
    private _geometry: BufferGeometry;

    constructor(geometry: BufferGeometry) {
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
} 