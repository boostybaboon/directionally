import adapter from 'svelte-adapter-azure-swa';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			esbuildOptions: {
				// onnxruntime-node is a native addon used by kokoro-js — must never be bundled.
				// espeak-ng-emscripten is excluded because its WASM is loaded at runtime via
				// Emscripten locateFile; bundling it would break the .data file fetch path.
				// All pages have ssr=false so none of this code runs server-side.
				external: [
					'onnxruntime-node',
					'kokoro-js',
					'@huggingface/transformers',
					'@echogarden/espeak-ng-emscripten',
				],
			},
		})
	}
};

export default config;
