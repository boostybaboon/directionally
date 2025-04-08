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
        // Create initial geometry with constructor values
        const geometry = new PlaneGeometry(width, height, widthSegments, heightSegments);
        super(geometry);

        // Initialize parameters with correct min/max values
        this.width = new FloatParam(
            "Width",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.width",
            width,   // default from constructor
            0,      // min
            Infinity  // max - no upper limit
        );

        this.height = new FloatParam(
            "Height",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.height",
            height,  // default from constructor
            0,      // min
            Infinity  // max - no upper limit
        );

        this.widthSegments = new IntParam(
            "Width Segments",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.widthSegments",
            1,      // min
            Infinity,  // max - no upper limit
            widthSegments  // default from constructor
        );

        this.heightSegments = new IntParam(
            "Height Segments",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.heightSegments",
            1,      // min
            Infinity,  // max - no upper limit
            heightSegments  // default from constructor
        );

        // Set up change handlers to update the geometry
        this.width.onChange = () => this.updateGeometry();
        this.height.onChange = () => this.updateGeometry();
        this.widthSegments.onChange = () => this.updateGeometry();
        this.heightSegments.onChange = () => this.updateGeometry();

        // Set initial values
        this.width.value = width;
        this.height.value = height;
        this.widthSegments.value = widthSegments;
        this.heightSegments.value = heightSegments;
    }

    getPlaneGeometry(): PlaneGeometry {
        return this.getGeometry() as PlaneGeometry;
    }

    protected updateGeometry(): void {
        // Create a new geometry with the current parameter values
        const newGeometry = new PlaneGeometry(
            this.width.value,
            this.height.value,
            this.widthSegments.value,
            this.heightSegments.value
        );

        // Get the existing geometry and copy the new one's attributes
        const geometry = this.getPlaneGeometry();
        geometry.copy(newGeometry);

        // Force update the parameters
        Object.assign(geometry.parameters, {
            width: this.width.value,
            height: this.height.value,
            widthSegments: this.widthSegments.value,
            heightSegments: this.heightSegments.value
        });
    }
} 