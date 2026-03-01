import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	optimizeDeps: {
		// Prevent Vite's Node.js pre-bundler from loading these packages.
		// @huggingface/transformers → kokoro-js → onnxruntime-node ships a native
		// binary compiled with AVX instructions; if Vite pre-bundles any of them it
		// runs in the Node.js process and crashes with SIGILL on CPUs without AVX.
		// The browser build is safe: our onnxruntime-node stub alias intercepts the
		// import before it reaches the native addon.
		exclude: ['@huggingface/transformers', 'kokoro-js', 'onnxruntime-node']
	},
	resolve: {
		alias: {
			'onnxruntime-node': path.resolve('./src/lib/tts/onnxruntime-node-stub.ts')
		}
	}
});
