export interface AnimationData {
    target: string; // Name of the object to animate
    property: string; // Property path (e.g. ".position[y]")
    keyframes: {
        time: number;
        value: number;
    }[];
    duration: number;
    startTime?: number; // Optional start time offset
    endTime?: number; // Optional end time
    loopMode?: 'once' | 'repeat' | 'pingpong'; // Loop mode
    repetitions?: number; // Number of times to repeat (for repeat mode)
} 