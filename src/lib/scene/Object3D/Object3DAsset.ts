//https://threejs.org/docs/#api/en/core/Object3D

import { Vector3Param } from "../../common/Param";
import { Vector3, Quaternion, MathUtils, Object3D, Euler, Matrix4 } from "three";

export class Object3DAsset {
    public readonly object3D: Object3D;
    public readonly position: Vector3Param;
    public readonly rotation: Vector3Param;
    public readonly scale: Vector3Param;
    private _lastRotationMethod: 'euler' | 'axisAngle' | 'upLookAt' | null = null;
    private _lastUpLookAt: { up: Vector3, lookAt: Vector3 } | null = null;

    constructor(object3D: Object3D = new Object3D()) {
        this.object3D = object3D;
        
        // Initialize position parameter
        this.position = new Vector3Param(
            "Position",
            "The position of the object in 3D space",
            new Vector3(0, 0, 0)
        );
        
        // Initialize rotation parameter (in radians)
        this.rotation = new Vector3Param(
            "Rotation",
            "The rotation of the object in Euler angles (radians)",
            new Vector3(0, 0, 0)
        );
        
        // Initialize scale parameter
        this.scale = new Vector3Param(
            "Scale",
            "The scale of the object along each axis",
            new Vector3(1, 1, 1)
        );

        // Set up change handlers
        this.position.onChange = (newValue) => {
            this.object3D.position.copy(newValue);
        };

        this.rotation.onChange = (newValue) => {
            this.object3D.rotation.set(newValue.x, newValue.y, newValue.z);
            this._lastRotationMethod = 'euler';
            this._lastUpLookAt = null;
        };

        this.scale.onChange = (newValue) => {
            this.object3D.scale.copy(newValue);
        };

        // Initialize object3D properties
        this.object3D.position.copy(this.position.value);
        this.object3D.rotation.set(
            this.rotation.value.x,
            this.rotation.value.y,
            this.rotation.value.z
        );
        this.object3D.scale.copy(this.scale.value);
    }

    /**
     * Set rotation from up vector and lookAt point in world coordinates
     * @param up The up vector
     * @param lookAt The point to look at in world coordinates
     */
    setRotationFromUpLookAt(up: Vector3, lookAt: Vector3): void {
        this.object3D.up.copy(up);
        this.object3D.lookAt(lookAt);
        // Update rotation parameter from Object3D
        this.rotation.value.copy(this.object3D.rotation);
        this._lastRotationMethod = 'upLookAt';
        this._lastUpLookAt = {
            up: up.clone(),
            lookAt: lookAt.clone()
        };
    }

    /**
     * Set rotation from Euler angles in degrees (XYZ order)
     * @param x Rotation around X axis in degrees
     * @param y Rotation around Y axis in degrees
     * @param z Rotation around Z axis in degrees
     */
    setRotationFromEuler(x: number, y: number, z: number): void {
        // Convert degrees to radians
        const euler = new Euler(
            x * Math.PI / 180,
            y * Math.PI / 180,
            z * Math.PI / 180
        );
        this.object3D.rotation.copy(euler);
        this.rotation.value.copy(this.object3D.rotation);
        this._lastRotationMethod = 'euler';
        this._lastUpLookAt = null;
    }

    /**
     * Set rotation from axis and angle
     * @param axis The axis of rotation
     * @param angleDegrees The angle of rotation in degrees
     */
    setRotationFromAxisAngle(axis: Vector3, angleDegrees: number): void {
        const quaternion = new Quaternion();
        quaternion.setFromAxisAngle(axis.normalize(), angleDegrees * Math.PI / 180);
        this.object3D.quaternion.copy(quaternion);
        this.rotation.value.copy(this.object3D.rotation);
        this._lastRotationMethod = 'axisAngle';
        this._lastUpLookAt = null;
    }

    /**
     * Get the current up vector and lookAt point if they were explicitly set
     * @returns Object containing up vector and lookAt point, or null if rotation was set through other means
     */
    getUpLookAt(): { up: Vector3, lookAt: Vector3 } | null {
        if (this._lastRotationMethod !== 'upLookAt' || !this._lastUpLookAt) {
            return null;
        }
        return {
            up: this._lastUpLookAt.up.clone(),
            lookAt: this._lastUpLookAt.lookAt.clone()
        };
    }

    /**
     * Get the current rotation as Euler angles in degrees (XYZ order)
     * @returns Object containing x, y, z rotations in degrees
     */
    getEuler(): { x: number, y: number, z: number } {
        const x = MathUtils.radToDeg(this.object3D.rotation.x);
        const y = MathUtils.radToDeg(this.object3D.rotation.y);
        const z = MathUtils.radToDeg(this.object3D.rotation.z);
        
        // Normalize angles to [0, 360)
        return {
            x: ((x % 360) + 360) % 360,
            y: ((y % 360) + 360) % 360,
            z: ((z % 360) + 360) % 360
        };
    }

    /**
     * Get the current rotation as axis and angle
     * @returns Object containing normalized axis vector and angle in degrees
     */
    getAxisAngle(): { axis: Vector3, angle: number } {
        const axis = new Vector3();
        const angle = 2 * Math.acos(this.object3D.quaternion.w);
        const s = Math.sqrt(1 - this.object3D.quaternion.w * this.object3D.quaternion.w);
        
        if (s < 0.0001) {
            axis.set(1, 0, 0);
        } else {
            axis.set(
                this.object3D.quaternion.x / s,
                this.object3D.quaternion.y / s,
                this.object3D.quaternion.z / s
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
        return this.object3D.quaternion.clone();
    }

    /**
     * Get the underlying Three.js Object3D instance
     * @returns The wrapped Object3D instance
     */
    getObject3D(): Object3D {
        return this.object3D;
    }
}