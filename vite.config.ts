import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
	plugins: [
		sveltekit(),
		// Enables top-level await and proper WASM loading for the eSpeak-NG module.
		wasm(),
		// Copies espeak-ng.data (eSpeak voice/phoneme data) from node_modules to the
		// static root of the build output. Emscripten's locateFile callback fetches
		// it from /espeak-ng.data at runtime — it cannot be bundled as a JS chunk.
		viteStaticCopy({
			targets: [{
				src: 'node_modules/@echogarden/espeak-ng-emscripten/espeak-ng.data',
				dest: '',
			}],
		}),
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
		// kokoro-js / onnxruntime-node are excluded to avoid the native .node addon SIGILL.
		// espeak-ng-emscripten is excluded because its WASM + .data file must be loaded
		// at runtime via Emscripten's locateFile, not pre-bundled.
		exclude: [
			'@huggingface/transformers',
			'kokoro-js',
			'onnxruntime-node',
			'@echogarden/espeak-ng-emscripten',
		],
	},
	ssr: {
		// Keep these external in the SSR bundle — ssr=false on all pages so none
		// of this code ever executes server-side; the external references are harmless.
		external: [
			'onnxruntime-node',
			'kokoro-js',
			'@huggingface/transformers',
			'@echogarden/espeak-ng-emscripten',
		],
	},
});
