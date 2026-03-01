// kokoro-js is imported dynamically so this module is safe to import in any context.
// The native onnxruntime-node binary (a transitive dep) would crash the Node.js
// SSR process if loaded at module-parse time; the dynamic import defers loading
// until synthesise() is actually called, which only ever happens in the browser.

import type { KokoroVoice } from '../../core/domain/types.js';

type KokoroTTSType = Awaited<ReturnType<typeof import('kokoro-js')['KokoroTTS']['from_pretrained']>>;

const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
const DEFAULT_KOKORO_VOICE = 'af_sky';

/** Singleton Kokoro model instance, initialised on first call to synthesise(). */
let tts: KokoroTTSType | null = null;
let loadPromise: Promise<KokoroTTSType> | null = null;

async function getModel(
  onProgress?: (label: string, progress: number) => void
): Promise<KokoroTTSType> {
  if (tts) return tts;
  if (loadPromise) return loadPromise;

  // Assign synchronously before any await so concurrent callers share this promise.
  loadPromise = (async () => {
    const { KokoroTTS } = await import('kokoro-js');
    const instance = await KokoroTTS.from_pretrained(MODEL_ID, {
      dtype: 'q8',
      device: 'wasm',
      progress_callback: onProgress
        ? (info: { status: string; name?: string; progress?: number }) => {
            if (info.status === 'progress') {
              onProgress(info.name ?? 'model', info.progress ?? 0);
            }
          }
        : undefined,
    });
    tts = instance;
    return instance;
  })();

  return loadPromise;
}

/**
 * Synthesise a single line of speech and return a Web Audio AudioBuffer
 * ready to schedule via Tone.js.
 *
 * @param text      The text to speak.
 * @param voice     Kokoro voice ID (or undefined for default).
 * @param audioCtx  The AudioContext to create the buffer on (use Tone.getContext().rawContext).
 * @param onProgress  Optional progress callback forwarded to the model loader.
 */
export async function synthesise(
  text: string,
  voice: KokoroVoice | undefined,
  audioCtx: AudioContext,
  onProgress?: (label: string, progress: number) => void
): Promise<AudioBuffer> {
  const model = await getModel(onProgress);
  const kokoroVoice = voice ?? DEFAULT_KOKORO_VOICE;
  // Cast to the kokoro-js literal union; our KokoroVoice type is a subset of its voices.
  const voiceName = kokoroVoice as Parameters<typeof model.generate>[1] extends { voice?: infer V } ? NonNullable<V> : never;
  const rawAudio = await model.generate(text, { voice: voiceName });

  const { audio, sampling_rate } = rawAudio;
  const buffer = audioCtx.createBuffer(1, audio.length, sampling_rate);
  buffer.copyToChannel(new Float32Array(audio), 0);
  return buffer;
}

/** Pre-warm: start model download/init without waiting for first utterance. */
export function prewarm(onProgress?: (label: string, progress: number) => void): void {
  getModel(onProgress).catch(() => {
    // swallow — surface errors at synthesis time instead
  });
}

/**
 * Tests whether Kokoro WASM synthesis is actually available in this browser/CPU.
 *
 * WebAssembly.validate() is insufficient: it checks the browser's WASM parser,
 * not whether the underlying CPU can execute the SIMD instructions onnxruntime-web
 * emits. An actual tiny synthesis attempt is the only reliable probe. onnxruntime-web
 * rejects immediately (no model download required) if the backend is unsupported.
 *
 * Result is cached — only one probe attempt per page load.
 */
let _available: boolean | null = null;
let _probePromise: Promise<boolean> | null = null;

export function isAvailable(audioCtx: AudioContext): Promise<boolean> {
  if (_available !== null) return Promise.resolve(_available);
  if (_probePromise) return _probePromise;
  _probePromise = synthesise('hi', undefined, audioCtx)
    .then(() => { _available = true; return true; })
    .catch(() => { _available = false; return false; });
  return _probePromise;
}
