import type { Vector3 } from "three";

export class Param {
    constructor(
        public readonly title: string,
        public readonly help: string  
    ) {}
}

export class FloatParam extends Param {
    private valueInternal: number;
    private validator?: (value: number) => void;

    constructor(
        title: string,
        help: string,
        public readonly min: number,      
        public readonly max: number,      
        public readonly defaultValue: number,
        validator?: (value: number) => void
    ) {
        super(title, help);
        this.valueInternal = defaultValue;
        this.validator = validator;
    }

    get value(): number {
        return this.valueInternal;
    }
    set value(value: number) {
        if (value < this.min || value > this.max) {
            throw new Error(`Value out of range: ${value}`);
        }
        if (this.validator) {
            this.validator(value);
        }
        this.valueInternal = value;
    }
}

export class Vector3Param extends Param {
    value: Vector3;

    constructor(
        title: string,
        help: string,
        public readonly defaultValue: Vector3
    ) {
        super(title, help);
        this.value = defaultValue;
    }
}