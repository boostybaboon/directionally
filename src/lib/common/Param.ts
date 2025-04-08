import { Vector3, Color } from "three";

export type ParamType = 'int' | 'float' | 'vector3' | 'color' | 'boolean';

export abstract class Param<T> {
    protected _value: T;
    protected _defaultValue: T;
    protected _title: string;
    protected _help: string;
    protected _onChange?: (value: T) => void;

    constructor(title: string, help: string, defaultValue: T) {
        this._title = title;
        this._help = help;
        this._defaultValue = defaultValue;
        this._value = defaultValue;
    }

    protected cloneValue(value: T): T {
        if (value instanceof Vector3 || value instanceof Color) {
            return value.clone();
        }
        return value;
    }

    protected abstract getType(): ParamType;

    get title(): string {
        return this._title;
    }

    get help(): string {
        return this._help;
    }

    get value(): T {
        return this._value;
    }

    set value(value: T) {
        this._value = value;
        if (this._onChange) {
            this._onChange(this._value);
        }
    }

    get defaultValue(): T {
        return this._defaultValue;
    }

    set onChange(handler: (value: T) => void) {
        this._onChange = handler;
    }
}

export class FloatParam extends Param<number> {
    private _min?: number;
    private _max?: number;
    private _validator?: (value: number) => void;

    constructor(
        title: string,
        help: string,
        defaultValue: number,
        min?: number,
        max?: number,
        validator?: (value: number) => void
    ) {
        super(title, help, defaultValue);
        this._min = min;
        this._max = max;
        this._validator = validator;
        this._value = defaultValue;
    }

    protected getType(): ParamType {
        return 'float';
    }

    get min(): number | undefined {
        return this._min;
    }

    get max(): number | undefined {
        return this._max;
    }

    get value(): number {
        return this._value;
    }

    set value(newValue: number) {
        // Call custom validator first if it exists
        if (this._validator) {
            this._validator(newValue);
        }

        // Then validate min/max
        if (this._min !== undefined && newValue < this._min) {
            throw new Error(`Value ${newValue} is less than minimum ${this._min}`);
        }
        if (this._max !== undefined && newValue > this._max) {
            throw new Error(`Value ${newValue} is greater than maximum ${this._max}`);
        }

        this._value = newValue;
        if (this._onChange) {
            this._onChange(newValue);
        }
    }
}

export class IntParam extends Param<number> {
    private _min: number;
    private _max: number;

    constructor(title: string, help: string, min: number, max: number, defaultValue: number) {
        super(title, help, Math.round(defaultValue));
        this._min = Math.ceil(min);
        this._max = Math.floor(max);
    }

    get min(): number {
        return this._min;
    }

    get max(): number {
        return this._max;
    }

    set value(newValue: number) {
        const roundedValue = Math.round(newValue);
        if (roundedValue < this._min || roundedValue > this._max) {
            throw new Error(`Value must be between ${this._min} and ${this._max}`);
        }
        this._value = roundedValue;
        if (this._onChange) {
            this._onChange(roundedValue);
        }
    }

    get value(): number {
        return this._value;
    }

    get defaultValue(): number {
        return this._defaultValue;
    }

    protected getType(): ParamType {
        return 'int';
    }
}

export class Vector3Param extends Param<Vector3> {
    constructor(
        title: string,
        help: string,
        defaultValue: Vector3
    ) {
        super(title, help, defaultValue.clone());
        this._value = defaultValue.clone();
    }

    protected getType(): ParamType {
        return 'vector3';
    }

    get value(): Vector3 {
        return this._value;
    }

    set value(newValue: Vector3) {
        if (!this._value) {
            this._value = newValue.clone();
        } else {
            this._value.copy(newValue);
        }

        if (this._onChange) {
            this._onChange(this._value);
        }
    }
}

export class ColorParam extends Param<Color> {
    constructor(
        title: string,
        help: string,
        defaultValue: Color
    ) {
        super(title, help, defaultValue.clone());
        this._value = defaultValue.clone();
    }

    protected getType(): ParamType {
        return 'color';
    }

    get value(): Color {
        return this._value;
    }

    set value(newColor: Color) {
        if (!this._value) {
            this._value = newColor.clone();
        } else {
            this._value.copy(newColor);
        }
        if (this._onChange) {
            this._onChange(this._value);
        }
    }
}

export class BooleanParam extends Param<boolean> {
    constructor(
        title: string,
        help: string,
        defaultValue: boolean
    ) {
        super(title, help, defaultValue);
    }

    protected getType(): ParamType {
        return 'boolean';
    }
}

export class IntensityParam extends FloatParam {
    constructor(
        title: string,
        help: string,
        defaultValue: number
    ) {
        super(title, help, defaultValue, 0, Number.MAX_VALUE);
        this._value = defaultValue;
    }

    get value(): number {
        return this._value;
    }

    set value(newValue: number) {
        if (newValue < 0) {
            throw new Error(`Light intensity cannot be negative (got ${newValue})`);
        }
        this._value = newValue;
        if (this._onChange) {
            this._onChange(newValue);
        }
    }
}