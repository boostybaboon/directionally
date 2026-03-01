import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		// onnxruntime-node is a native Node.js addon bundled with kokoro-js.
		// It must never be included in a browser or SSR build:
		//  - browser: no native addons, and onnxruntime-web is the correct backend
		//  - SSR: ssr=false on all pages so this code never runs server-side
		// The resolve.alias approach is unreliable for production Rollup builds because
		// package exports maps take precedence. A Rollup plugin intercepts earlier and
		// is not affected by exports resolution order.
		{
			name: 'stub-onnxruntime-node',
			resolveId(id) {
				if (id === 'onnxruntime-node') return '\0onnxruntime-node-stub';
			},
			load(id) {
				if (id === '\0onnxruntime-node-stub') return 'export default {};';
			},
		},
	],
	optimizeDeps: {
		// Prevent Vite's dev-server pre-bundler from loading these packages in Node.js.
		// In the browser the stub plugin above handles onnxruntime-node; kokoro-js and
		// @huggingface/transformers are excluded to avoid pulling in the native addon
		// during the pre-bundling step (which runs in Node.js and would SIGILL on CPUs
		// without AVX).
		exclude: ['@huggingface/transformers', 'kokoro-js', 'onnxruntime-node'],
	},
	ssr: {
		// Keep onnxruntime-node external in the SSR bundle so it is never emitted as
		// a bundled chunk. Since ssr=false on all pages, this code never executes
		// server-side; the external reference is harmless.
		external: ['onnxruntime-node', 'kokoro-js', '@huggingface/transformers'],
	},
});
