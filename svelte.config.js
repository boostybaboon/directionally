import adapter from 'svelte-adapter-azure-swa';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			customStaticWebAppConfig: {
				routes: [
					// espeak-ng.data has no content hash in its filename, so it must not
					// inherit the year-long immutable cache applied to /_app/immutable/*.
					// A 1-day TTL ensures CDN edges pick up a new file within 24 hours
					// after a package upgrade and redeploy, without any manual cache purge.
					{
						route: '/_app/immutable/chunks/espeak-ng.data',
						headers: { 'cache-control': 'public, max-age=86400' },
					},
				],
			},
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
