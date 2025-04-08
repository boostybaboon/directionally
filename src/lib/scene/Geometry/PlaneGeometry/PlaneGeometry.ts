import { PlaneGeometry } from "three";
import { BufferGeometryAsset } from "../BufferGeometry/BufferGeometry";
import { FloatParam } from "$lib/common/Param";

export class PlaneGeometryAsset extends BufferGeometryAsset {
    width: FloatParam;
    height: FloatParam;

    constructor(width: number = 1, height: number = 1) {
        const geometry = new PlaneGeometry(width, height);
        super(geometry);

        this.width = new FloatParam(
            "Width",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.width",
            0.1,  // min
            100,  // max
            width
        );

        this.height = new FloatParam(
            "Height",
            "https://threejs.org/docs/#api/en/geometries/PlaneGeometry.height",
            0.1,  // min
            100,  // max
            height
        );

        // Set up watchers to recreate geometry when params change
        Object.defineProperty(this.width, 'value', {
            get: () => (this.getGeometry() as PlaneGeometry).parameters.width,
            set: (value: number) => {
                const oldGeometry = this.getGeometry() as PlaneGeometry;
                oldGeometry.dispose();
                const newGeometry = new PlaneGeometry(value, this.height.value);
                this.setGeometry(newGeometry);
            }
        });

        Object.defineProperty(this.height, 'value', {
            get: () => (this.getGeometry() as PlaneGeometry).parameters.height,
            set: (value: number) => {
                const oldGeometry = this.getGeometry() as PlaneGeometry;
                oldGeometry.dispose();
                const newGeometry = new PlaneGeometry(this.width.value, value);
                this.setGeometry(newGeometry);
            }
        });
    }

    /**
     * Get the underlying Three.js PlaneGeometry instance
     */
    getPlaneGeometry(): PlaneGeometry {
        return this.getGeometry() as PlaneGeometry;
    }
} 