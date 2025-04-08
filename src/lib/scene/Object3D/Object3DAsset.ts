//https://threejs.org/docs/#api/en/core/Object3D

import { Vector3Param } from "$lib/common/Param";
import { Vector3, Quaternion, MathUtils, Object3D } from "three";

export class Object3DAsset {
    private _object3D: Object3D;
    position: Vector3Param;
    private _up: Vector3;
    private _lookAt: Vector3;

    constructor(object3D: Object3D = new Object3D()) {
        this._object3D = object3D;
        this.position = new Vector3Param(
            "Position",
            "https://threejs.org/docs/index.html#api/en/core/Object3D.position",
            this._object3D.position
        );
        // Initialize with default values
        this._up = new Vector3(0, 1, 0);
        this._lookAt = new Vector3(0, 0, -1);

        // Debug: Log initial position
        console.log('Object3DAsset created with initial position:', this._object3D.position);
    }

    /**
     * Set rotation from up vector and lookAt point in world coordinates
     * @param up The up vector
     * @param lookAt The point to look at in world coordinates
     */
    setRotationFromUpLookAt(up: Vector3, lookAt: Vector3): void {
        this._up.copy(up);
        this._lookAt.copy(lookAt);
        this._object3D.up.copy(up);
        this._object3D.lookAt(lookAt);
    }

    /**
     * Set rotation from Euler angles in degrees (XYZ order)
     * @param x Rotation around X axis in degrees
     * @param y Rotation around Y axis in degrees
     * @param z Rotation around Z axis in degrees
     */
    setRotationFromEuler(x: number, y: number, z: number): void {
        // Convert to radians and normalize to [-π, π]
        const xRad = MathUtils.degToRad(x) % (2 * Math.PI);
        const yRad = MathUtils.degToRad(y) % (2 * Math.PI);
        const zRad = MathUtils.degToRad(z) % (2 * Math.PI);
        
        this._object3D.rotation.set(xRad, yRad, zRad);
    }

    /**
     * Set rotation from axis and angle
     * @param axis The axis of rotation
     * @param angleDegrees The angle in degrees
     */
    setRotationFromAxisAngle(axis: Vector3, angleDegrees: number): void {
        this._object3D.quaternion.setFromAxisAngle(
            axis.normalize(),
            MathUtils.degToRad(angleDegrees)
        );
    }

    /**
     * Get the current up vector and lookAt point
     * @returns Object containing up vector and lookAt point
     */
    getUpLookAt(): { up: Vector3, lookAt: Vector3 } {
        return {
            up: this._up.clone(),
            lookAt: this._lookAt.clone()
        };
    }

    /**
     * Get the current rotation as Euler angles in degrees (XYZ order)
     * @returns Object containing x, y, z rotations in degrees
     */
    getEuler(): { x: number, y: number, z: number } {
        return {
            x: MathUtils.radToDeg(this._object3D.rotation.x),
            y: MathUtils.radToDeg(this._object3D.rotation.y),
            z: MathUtils.radToDeg(this._object3D.rotation.z)
        };
    }

    /**
     * Get the current rotation as axis and angle
     * @returns Object containing normalized axis vector and angle in degrees
     */
    getAxisAngle(): { axis: Vector3, angle: number } {
        const axis = new Vector3();
        const angle = 2 * Math.acos(this._object3D.quaternion.w);
        const s = Math.sqrt(1 - this._object3D.quaternion.w * this._object3D.quaternion.w);
        
        if (s < 0.0001) {
            axis.set(1, 0, 0);
        } else {
            axis.set(
                this._object3D.quaternion.x / s,
                this._object3D.quaternion.y / s,
                this._object3D.quaternion.z / s
            ).normalize();
        }
        
        return {
            axis,
            angle: MathUtils.radToDeg(angle)
        };
    }

    /**
     * Get the raw quaternion (for internal use)
     * @returns The current rotation quaternion
     */
    getQuaternion(): Quaternion {
        return this._object3D.quaternion.clone();
    }

    /**
     * Get the underlying Three.js Object3D instance
     * @returns The wrapped Object3D instance
     */
    getObject3D(): Object3D {
        return this._object3D;
    }
}