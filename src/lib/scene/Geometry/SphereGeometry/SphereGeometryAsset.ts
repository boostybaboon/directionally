import { SphereGeometry } from "three";
import { BufferGeometryAsset } from "../BufferGeometry/BufferGeometryAsset";
import { FloatParam, IntParam } from "$lib/common/Param";
import { Asset } from "../../../common/Asset";
import type { PropertyDescriptor } from "$lib/common/Asset";

export class SphereGeometryAsset extends BufferGeometryAsset {
    radius: FloatParam;
    widthSegments: IntParam;
    heightSegments: IntParam;
    phiStart: FloatParam;
    phiLength: FloatParam;
    thetaStart: FloatParam;
    thetaLength: FloatParam;

    constructor(
        radius: number = 1,
        widthSegments: number = 32,
        heightSegments: number = 16,
        phiStart: number = 0,
        phiLength: number = Math.PI * 2,
        thetaStart: number = 0,
        thetaLength: number = Math.PI
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

        // Initialize parameters
        this.radius = new FloatParam(
            "Radius",
            "The radius of the sphere",
            radius,
            0,
            Infinity,
            (value: number) => {
                if (value < 0) throw new Error("Radius must be non-negative");
            }
        );

        this.widthSegments = new IntParam(
            "Width Segments",
            "Number of horizontal segments",
            3,
            Infinity,
            widthSegments
        );

        this.heightSegments = new IntParam(
            "Height Segments",
            "Number of vertical segments",
            2,
            Infinity,
            heightSegments
        );

        this.phiStart = new FloatParam(
            "Phi Start",
            "Horizontal starting angle",
            phiStart,
            0,
            Math.PI * 2,
            (value: number) => {
                if (value < 0 || value > Math.PI * 2) throw new Error("Phi start must be between 0 and 2π");
            }
        );

        this.phiLength = new FloatParam(
            "Phi Length",
            "Horizontal sweep angle size",
            phiLength,
            0,
            Math.PI * 2,
            (value: number) => {
                if (value < 0 || value > Math.PI * 2) throw new Error("Phi length must be between 0 and 2π");
            }
        );

        this.thetaStart = new FloatParam(
            "Theta Start",
            "Vertical starting angle",
            thetaStart,
            0,
            Math.PI,
            (value: number) => {
                if (value < 0 || value > Math.PI) throw new Error("Theta start must be between 0 and π");
            }
        );

        this.thetaLength = new FloatParam(
            "Theta Length",
            "Vertical sweep angle size",
            thetaLength,
            0,
            Math.PI,
            (value: number) => {
                if (value < 0 || value > Math.PI) throw new Error("Theta length must be between 0 and π");
            }
        );

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

    getProperties(): Map<string, PropertyDescriptor> {
        const properties = new Map<string, PropertyDescriptor>();

        // Add radius property
        properties.set("radius", {
            title: this.radius.title,
            help: this.radius.help,
            type: "float",
            min: this.radius.min,
            max: this.radius.max,
            defaultValue: this.radius.defaultValue,
            value: this.radius.value,
            onChange: (value: number) => this.radius.value = value
        });

        // Add widthSegments property
        properties.set("widthSegments", {
            title: this.widthSegments.title,
            help: this.widthSegments.help,
            type: "int",
            min: this.widthSegments.min,
            max: this.widthSegments.max,
            defaultValue: this.widthSegments.defaultValue,
            value: this.widthSegments.value,
            onChange: (value: number) => this.widthSegments.value = value
        });

        // Add heightSegments property
        properties.set("heightSegments", {
            title: this.heightSegments.title,
            help: this.heightSegments.help,
            type: "int",
            min: this.heightSegments.min,
            max: this.heightSegments.max,
            defaultValue: this.heightSegments.defaultValue,
            value: this.heightSegments.value,
            onChange: (value: number) => this.heightSegments.value = value
        });

        return properties;
    }
} 