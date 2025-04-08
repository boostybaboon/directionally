import { SphereGeometry } from "three";
import { BufferGeometryAsset } from "../BufferGeometry/BufferGeometryAsset";
import { FloatParam, IntParam } from "$lib/common/Param";

export class SphereGeometryAsset extends BufferGeometryAsset {
    radius: FloatParam;
    widthSegments: IntParam;
    heightSegments: IntParam;
    phiStart: FloatParam;
    phiLength: FloatParam;
    thetaStart: FloatParam;
    thetaLength: FloatParam;

    constructor(
        radius: number = 1,  // Three.js default
        widthSegments: number = 32, // Three.js default
        heightSegments: number = 16, // Three.js default
        phiStart: number = 0, // Three.js default
        phiLength: number = Math.PI * 2, // Three.js default
        thetaStart: number = 0, // Three.js default
        thetaLength: number = Math.PI // Three.js default
    ) {
        const geometry = new SphereGeometry(
            radius,
            widthSegments,
            heightSegments,
            phiStart,
            phiLength,
            thetaStart,
            thetaLength
        );
        super(geometry);

        // Expose only the properties we want users to be able to modify
        this.radius = new FloatParam(
            "Radius",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.radius",
            0,  // min
            Infinity,  // max
            1   // default matches Three.js
        );

        this.widthSegments = new IntParam(
            "Width Segments",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.widthSegments",
            3,  // min (sphere needs at least 3 segments)
            Infinity,
            32  // default matches Three.js
        );

        this.heightSegments = new IntParam(
            "Height Segments",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.heightSegments",
            2,  // min (sphere needs at least 2 segments)
            Infinity,
            16  // default matches Three.js
        );

        this.phiStart = new FloatParam(
            "Phi Start",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.phiStart",
            0,
            Math.PI * 2,
            0
        );

        this.phiLength = new FloatParam(
            "Phi Length",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.phiLength",
            0,
            Math.PI * 2,
            Math.PI * 2
        );

        this.thetaStart = new FloatParam(
            "Theta Start",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.thetaStart",
            0,
            Math.PI,
            0
        );

        this.thetaLength = new FloatParam(
            "Theta Length",
            "https://threejs.org/docs/#api/en/geometries/SphereGeometry.thetaLength",
            0,
            Math.PI,
            Math.PI
        );

        // Set initial values from constructor
        this.radius.value = radius;
        this.widthSegments.value = widthSegments;
        this.heightSegments.value = heightSegments;
        this.phiStart.value = phiStart;
        this.phiLength.value = phiLength;
        this.thetaStart.value = thetaStart;
        this.thetaLength.value = thetaLength;

        // Set up change handlers to update the geometry
        this.radius.onChange = () => this.updateGeometry();
        this.widthSegments.onChange = () => this.updateGeometry();
        this.heightSegments.onChange = () => this.updateGeometry();
        this.phiStart.onChange = () => this.updateGeometry();
        this.phiLength.onChange = () => this.updateGeometry();
        this.thetaStart.onChange = () => this.updateGeometry();
        this.thetaLength.onChange = () => this.updateGeometry();
    }

    /**
     * Update the underlying Three.js geometry with current parameter values
     */
    private updateGeometry(): void {
        const newGeometry = new SphereGeometry(
            this.radius.value,
            this.widthSegments.value,
            this.heightSegments.value,
            this.phiStart.value,
            this.phiLength.value,
            this.thetaStart.value,
            this.thetaLength.value
        );
        this.getGeometry().copy(newGeometry);
        newGeometry.dispose(); // Clean up the temporary geometry
    }

    /**
     * Get the underlying Three.js SphereGeometry instance
     */
    getSphereGeometry(): SphereGeometry {
        return this.getGeometry() as SphereGeometry;
    }
} 