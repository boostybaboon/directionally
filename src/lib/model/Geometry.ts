import * as THREE from 'three';

export abstract class GeometryAsset {
    abstract get threeGeometry(): THREE.BufferGeometry;
}

export class BoxGeometryAsset extends GeometryAsset {
    private _threeGeometry: THREE.BoxGeometry;
    
    constructor(
        public readonly width: number,
        public readonly height: number,
        public readonly depth: number
    ) {
        super();
        this._threeGeometry = new THREE.BoxGeometry(width, height, depth);
    }

    get threeGeometry(): THREE.BoxGeometry {
        return this._threeGeometry;
    }
}

export class PlaneGeometryAsset extends GeometryAsset {
    private _threeGeometry: THREE.PlaneGeometry;
    
    constructor(
        public readonly width: number,
        public readonly height: number
    ) {
        super();
        this._threeGeometry = new THREE.PlaneGeometry(width, height);
    }

    get threeGeometry(): THREE.PlaneGeometry {
        return this._threeGeometry;
    }
}

export class SphereGeometryAsset extends GeometryAsset {
    private _threeGeometry: THREE.SphereGeometry;
    
    constructor(
        public readonly radius: number,
        public readonly widthSegments: number = 32,
        public readonly heightSegments: number = 32
    ) {
        super();
        this._threeGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    }

    get threeGeometry(): THREE.SphereGeometry {
        return this._threeGeometry;
    }
} 