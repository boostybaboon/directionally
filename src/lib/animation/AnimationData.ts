export interface AnimationData {
    target: string; // Name of the object to animate
    property: string; // Property path (e.g. "position.y")
    keyframes: {
        time: number;
        value: number;
    }[];
    duration: number;
} 