import { describe, it, expect } from 'vitest';
import { Object3DAsset } from "$lib/scene/Object3D/Object3DAsset";
import { Vector3 } from "three";

describe("Object3DAsset", () => {
    it("should set and get the position field correctly", () => {
        const asset = new Object3DAsset();

        // Default position
        expect(asset.position.value.equals(new Vector3(0, 0, 0))).toBe(true);

        // Update position
        const newPosition = new Vector3(1, 2, 3);
        asset.position.value.copy(newPosition);

        // Verify updated position
        expect(asset.position.value.equals(newPosition)).toBe(true);
    });
});
