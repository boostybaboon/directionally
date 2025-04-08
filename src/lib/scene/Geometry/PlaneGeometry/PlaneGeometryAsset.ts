import { PlaneGeometry } from "three";
import { BufferGeometryAsset } from "../BufferGeometry/BufferGeometryAsset";
import { FloatParam, IntParam } from "$lib/common/Param";

export class PlaneGeometryAsset extends BufferGeometryAsset {
    width: FloatParam;
    height: FloatParam;
    widthSegments: IntParam;
    heightSegments: IntParam;

    constructor(
        width: number = 1,  // Three.js default
        height: number = 1, // Three.js default
        widthSegments: number = 1, // Three.js default
        heightSegments: number = 1  // Three.js default
    ) {
        const geometry = new PlaneGeometry(width, height, widthSegments, heightSegments);
        super(geometry);

        // Expose only the properties we want users to be able to modify
        this.width = new FloatParam(
            "Width",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.width",
            0,  // min
            Infinity,  // max
            1   // default matches Three.js
        );

        this.height = new FloatParam(
            "Height",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.height",
            0,
            Infinity,
            1
        );

        this.widthSegments = new IntParam(
            "Width Segments",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.widthSegments",
            1,  // min
            Infinity,
            1   // default matches Three.js
        );

        this.heightSegments = new IntParam(
            "Height Segments",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.heightSegments",
            1,
            Infinity,
            1
        );

        // Set initial values from constructor
        this.width.value = width;
        this.height.value = height;
        this.widthSegments.value = widthSegments;
        this.heightSegments.value = heightSegments;

        // Set up change handlers to update the geometry
        this.width.onChange = () => this.updateGeometry();
        this.height.onChange = () => this.updateGeometry();
        this.widthSegments.onChange = () => this.updateGeometry();
        this.heightSegments.onChange = () => this.updateGeometry();
    }

    private updateGeometry() {
        const newGeometry = new PlaneGeometry(
            this.width.value,
            this.height.value,
            this.widthSegments.value,
            this.heightSegments.value
        );
        this.getGeometry().copy(newGeometry);
    }

    /**
     * Get the underlying Three.js PlaneGeometry instance
     */
    getPlaneGeometry(): PlaneGeometry {
        return this.getGeometry() as PlaneGeometry;
    }
} 