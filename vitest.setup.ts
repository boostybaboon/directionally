import { webcrypto } from 'node:crypto';

// Polyfill Web Crypto as a bare `crypto` global for Node environments that
// don't expose it by default (Node < 19).
if (!globalThis.crypto) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto });
}
