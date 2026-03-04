// @echogarden/espeak-ng-emscripten is imported dynamically — the WASM module and
// its companion espeak-ng.data must not load at module-parse time in Node.js (SSR).
// The dynamic import defers loading until synthesise() is called, which only ever
// happens in the browser.

import type { ESpeakConfig } from '../../core/domain/types.js';
import type { EspeakWorker } from '@echogarden/espeak-ng-emscripten';

// eSpeak-NG raw parameter defaults (confirmed via get_rate/get_pitch/get_range).
const DEFAULT_VOICE = 'en-us';
const DEFAULT_PITCH = 50;        // 0–99 integer scale
const DEFAULT_PITCH_RANGE = 50;  // 0–99 integer scale; higher = more expressive intonation
const DEFAULT_RATE = 175;        // words per minute
const SAMPLE_RATE = 22050;       // Hz — fixed output sample rate from the WASM module

let worker: EspeakWorker | null = null;
let initPromise: Promise<EspeakWorker> | null = null;

async function getWorker(): Promise<EspeakWorker> {
  if (worker) return worker;
  if (initPromise) return initPromise;

  // Assign synchronously before any await so concurrent callers share this promise.
  initPromise = (async () => {
    const { default: EspeakInitializer } = await import('@echogarden/espeak-ng-emscripten');
    // The package's pre.js defines its own locateFile using import.meta.url, deriving
    // the data file path relative to the script's location. In production, Rollup
    // bundles the module into _app/immutable/chunks/, so espeak-ng.data must live there
    // (handled by viteStaticCopy in vite.config.ts). No locateFile override is needed.
    const m = await EspeakInitializer({});
    const instance: EspeakWorker = await new m.eSpeakNGWorker();
    worker = instance;
    return instance;
  })();

  return initPromise;
}

/**
 * Synthesise a single line of speech using eSpeak-NG WASM and return a Web Audio
 * AudioBuffer. Synthesis is near-instant (formant, not neural) — typically <50ms
 * even on mobile, so all lines for a scene are ready well before the user presses play.
 *
 * @param text     The text to speak.
 * @param config   eSpeak voice/pitch/pitchRange/rate overrides (defaults: en-us, 50, 50, 175).
 * @param audioCtx The AudioContext to create the buffer on (use Tone.getContext().rawContext).
 */
export async function synthesise(
  text: string,
  config: ESpeakConfig | undefined,
  audioCtx: AudioContext,
): Promise<AudioBuffer> {
  const w = await getWorker();

  // eSpeak-NG worker retains settings between calls — always set all four params
  // to avoid bleed from a previous synthesis with different voice/pitch/rate.
  w.set_voice(config?.voice ?? DEFAULT_VOICE);
  w.set_pitch(config?.pitch ?? DEFAULT_PITCH);
  w.set_range(config?.pitchRange ?? DEFAULT_PITCH_RANGE);
  w.set_rate(config?.rate ?? DEFAULT_RATE);

  // synthesize() calls userCallback synchronously for each audio chunk as the C
  // eSpeak engine produces it. audioData is Int16 PCM at SAMPLE_RATE Hz.
  const int16Chunks: Int16Array[] = [];
  w.synthesize(text, (audioData: Int16Array) => {
    if (audioData?.length > 0) int16Chunks.push(new Int16Array(audioData));
  });

  // Convert Int16 PCM (range −32768…32767) to Float32 (−1.0…1.0).
  const totalSamples = int16Chunks.reduce((n, c) => n + c.length, 0);
  const float32 = new Float32Array(Math.max(1, totalSamples));
  let offset = 0;
  for (const chunk of int16Chunks) {
    for (let i = 0; i < chunk.length; i++) {
      float32[offset++] = chunk[i] / 32768;
    }
  }

  const audioBuffer = audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
  audioBuffer.copyToChannel(float32, 0);
  return audioBuffer;
}
