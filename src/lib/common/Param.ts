import type { Vector3, Color } from "three";

export class Param {
    onChange?: (value: any) => void;

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
        if (this.onChange) {
            this.onChange(value);
        }
    }
}

export class Vector3Param extends Param {
    private _value: Vector3;
    private _defaultValue: Vector3;

    constructor(
        title: string,
        help: string,
        defaultValue: Vector3
    ) {
        super(title, help);
        this._defaultValue = defaultValue.clone();
        this._value = defaultValue.clone();
        console.log('Vector3Param created with default value:', this._defaultValue);
    }

    get value(): Vector3 {
        return this._value;
    }

    set value(newValue: Vector3) {
        console.log('Vector3Param value being set to:', newValue);
        this._value.copy(newValue);
        if (this.onChange) {
            this.onChange(newValue);
        }
    }

    get defaultValue(): Vector3 {
        return this._defaultValue;
    }

    resetToDefault(): void {
        this.value = this._defaultValue.clone();
    }
}

export class ColorParam extends Param {
    private _value: Color;

    constructor(
        title: string,
        help: string,
        public readonly defaultValue: Color
    ) {
        super(title, help);
        this._value = defaultValue.clone();
    }

    get value(): Color {
        return this._value;
    }

    set value(newColor: Color) {
        this._value.copy(newColor);
        if (this.onChange) {
            this.onChange(newColor);
        }
    }

    resetToDefault(): void {
        this.value = this.defaultValue.clone();
    }
}

export class IntensityParam extends FloatParam {
    constructor(
        title: string,
        help: string,
        defaultValue: number = 1.0
    ) {
        super(
            title,
            help,
            0,  // min: lights can't have negative intensity
            Infinity,  // max: no practical upper limit
            defaultValue
        );
    }
}

export class IntParam extends FloatParam {
    constructor(
        name: string,
        documentation: string,
        min: number,
        max: number,
        initialValue: number
    ) {
        // Ensure min, max, and initial value are integers
        const intMin = Math.ceil(min);
        const intMax = Math.floor(max);
        const intInitialValue = Math.round(initialValue);

        super(name, documentation, intMin, intMax, intInitialValue);
    }

    set value(newValue: number) {
        // Validate before rounding
        if (newValue < this.min || newValue > this.max) {
            throw new Error(`Value out of range: ${newValue}`);
        }
        // Round to nearest integer before setting
        super.value = Math.round(newValue);
    }

    get value(): number {
        return Math.round(super.value);
    }
}

export class BooleanParam extends Param {
    private _value: boolean;

    constructor(
        title: string,
        help: string,
        public readonly defaultValue: boolean
    ) {
        super(title, help);
        this._value = defaultValue;
    }

    get value(): boolean {
        return this._value;
    }

    set value(newValue: boolean) {
        this._value = newValue;
        if (this.onChange) {
            this.onChange(newValue);
        }
    }
}