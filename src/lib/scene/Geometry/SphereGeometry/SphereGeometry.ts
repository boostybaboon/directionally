import { SphereGeometry } from "three";
import { BufferGeometryAsset } from "../BufferGeometry/BufferGeometry";
import { FloatParam, IntParam } from "$lib/common/Param";

export class SphereGeometryAsset extends BufferGeometryAsset {
    radius: FloatParam;
    widthSegments: IntParam;
    heightSegments: IntParam;

    constructor(radius: number = 1, widthSegments: number = 32, heightSegments: number = 16) {
        const geometry = new SphereGeometry(radius, widthSegments, heightSegments);
        super(geometry);

        this.radius = new FloatParam(
            "Radius",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.radius",
            0.1,  // min
            100,  // max
            radius
        );

        this.widthSegments = new IntParam(
            "Width Segments",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.widthSegments",
            3,    // min
            100,  // max
            widthSegments
        );

        this.heightSegments = new IntParam(
            "Height Segments",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.heightSegments",
            2,    // min
            100,  // max
            heightSegments
        );

        // Set up watchers to recreate geometry when params change
        const updateRadius = (value: number) => {
            const oldGeometry = this.getGeometry() as SphereGeometry;
            oldGeometry.dispose();
            const newGeometry = new SphereGeometry(
                value,
                this.widthSegments.value,
                this.heightSegments.value
            );
            this.setGeometry(newGeometry);
        };

        const updateWidthSegments = (value: number) => {
            const oldGeometry = this.getGeometry() as SphereGeometry;
            oldGeometry.dispose();
            const newGeometry = new SphereGeometry(
                this.radius.value,
                value,
                this.heightSegments.value
            );
            this.setGeometry(newGeometry);
        };

        const updateHeightSegments = (value: number) => {
            const oldGeometry = this.getGeometry() as SphereGeometry;
            oldGeometry.dispose();
            const newGeometry = new SphereGeometry(
                this.radius.value,
                this.widthSegments.value,
                value
            );
            this.setGeometry(newGeometry);
        };

        // Set up parameter change listeners
        this.radius.value = radius;
        this.widthSegments.value = widthSegments;
        this.heightSegments.value = heightSegments;

        // Add listeners after initial values are set
        this.radius.onChange = updateRadius;
        this.widthSegments.onChange = updateWidthSegments;
        this.heightSegments.onChange = updateHeightSegments;
    }

    /**
     * Get the underlying Three.js SphereGeometry instance
     */
    getSphereGeometry(): SphereGeometry {
        return this.getGeometry() as SphereGeometry;
    }
} 