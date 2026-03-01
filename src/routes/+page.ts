// This page is a 3D canvas renderer with no server-side utility.
// Disabling SSR prevents SvelteKit from importing Three.js / Tone.js / kokoro-js
// in the Node.js process, which would crash on native binaries like onnxruntime-node.
export const ssr = false;
