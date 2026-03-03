# Directionally

A browser-based 3D scene presentation engine built with SvelteKit, Three.js, and Tone.js.

## Commands

```bash
yarn dev --open       # http://localhost:5173
yarn check            # svelte-check type checking
yarn test             # run tests once
yarn test:watch       # interactive watch mode
yarn build
yarn preview
```

## TTS landscape

The project supports three voice synthesis modes selectable at runtime:

| Mode | Engine | Download | Quality | Notes |
|---|---|---|---|---|
| **eSpeak** (default) | `@echogarden/espeak-ng-emscripten` | ~20 MB (cached) | Robotic formant synthesis | 100+ languages, RP/US/NYC accents, `+m1`–`+m8` / `+f1`–`+f5` variants, `+klatt`, `+robosoft`, etc. Consistent across all browsers/devices. |
| **Browser voices** | Web Speech API | None | Varies by OS/browser | Google neural voices in Chrome are genuinely good. Firefox on Linux falls back to eSpeak or Festival (OS-level). Unpredictable cross-platform. |
| **Kokoro** | `kokoro-js` / onnxruntime-web | ~92 MB (cached) | Neural, high quality | Requires SIMD — will fail on older CPUs/browsers. Falls back to browser voices automatically. |

### Non-neural options not yet implemented

**SVOX Pico** (`@echogarden/svoxpico-wasm`, 928 KB engine + ~5 MB voice data) would be a meaningful
quality step up from eSpeak — HMM-based, the original Android TTS voice. Estimated ~a day's work:
the WASM build exists but ships only raw C bindings (`pico_putTextUtf8`, `pico_getData` polling loop);
a higher-level `synthesise(text)` wrapper and Emscripten `FS.createDataFile` asset loading would need
to be written from scratch. Best fit for a narrator voice rather than robot characters.

**MBROLA** diphone synthesis (via eSpeak phoneme output → MBROLA renderer) would be a further step up,
but no browser WASM build of MBROLA exists — would require compiling from C source.

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```bash
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```bash
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```bash
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.
