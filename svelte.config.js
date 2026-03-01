import adapter from 'svelte-adapter-azure-swa';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		adapter: adapter({
			esbuildOptions: {
				// onnxruntime-node is a native addon used by kokoro-js.
				// It must never be bundled — all pages have ssr=false so it
				// never executes server-side. Marking it (and its parent
				// packages) external prevents the Azure adapter's esbuild
				// pass from following the require() chain into the .node files.
				external: ['onnxruntime-node', 'kokoro-js', '@huggingface/transformers'],
			},
		})
	}
};

export default config;
