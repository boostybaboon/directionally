// Ambient type declaration for @echogarden/espeak-ng-emscripten.
// The package ships no TypeScript definitions; we declare the minimal surface used by
// EspeakSynthesiser.ts rather than relying on `any` propagating through the codebase.

declare module '@echogarden/espeak-ng-emscripten' {
  export interface EspeakWorker {
    set_voice(voice: string): void;
    set_pitch(pitch: number): void;
    /** Pitch range / expressiveness: 0\u201399. Corresponds to eSpeak -p range flag. */
    set_range(range: number): void;
    set_rate(rate: number): void;
    get_voice(): string;
    get_pitch(): number;
    get_range(): number;
    get_rate(): number;
    get_samplerate(): number;
    synthesize(text: string, callback: (audioData: Int16Array, events: unknown) => void): void;
  }

  export interface EspeakModule {
    eSpeakNGWorker: new () => Promise<EspeakWorker>;
  }

  export interface EspeakInitOptions {
    locateFile?: (path: string) => string;
  }

  type EspeakInitializer = (options?: EspeakInitOptions) => Promise<EspeakModule>;

  const init: EspeakInitializer;
  export default init;
}
