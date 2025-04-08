import { describe, it, expect } from "vitest";
import { IntParam } from "$lib/common/Param";

describe("IntParam", () => {
    it("should initialize with integer values", () => {
        const param = new IntParam("test", "doc", 1, 10, 5);
        expect(param.value).toBe(5);
        expect(param.min).toBe(1);
        expect(param.max).toBe(10);
    });

    it("should round non-integer initialization values", () => {
        const param = new IntParam("test", "doc", 1.7, 10.3, 5.6);
        expect(param.value).toBe(6); // 5.6 rounds to 6
        expect(param.min).toBe(2);   // 1.7 ceils to 2
        expect(param.max).toBe(10);  // 10.3 floors to 10
    });

    it("should enforce integer values when setting", () => {
        const param = new IntParam("test", "doc", 1, 10, 5);
        
        param.value = 7.8;
        expect(param.value).toBe(8); // Should round to 8
        
        param.value = 3.2;
        expect(param.value).toBe(3); // Should round to 3
    });

    it("should enforce min/max constraints with integer values", () => {
        const param = new IntParam("test", "doc", 1, 10, 5);
        
        expect(() => param.value = 0.2).toThrow();  // Rounds to 0, below min
        expect(() => param.value = 10.7).toThrow(); // Rounds to 11, above max
        
        param.value = 0.7;
        expect(param.value).toBe(1);  // Rounds to 1, within range
        
        param.value = 10.2;
        expect(param.value).toBe(10); // Rounds to 10, within range
    });
}); 