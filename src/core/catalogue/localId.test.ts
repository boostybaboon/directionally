import { describe, it, expect } from 'vitest';
import { generateLocalId, assignLocalIds } from './localId.js';
import type { PlacedProp } from '../domain/types.js';

describe('generateLocalId', () => {
  it('returns a non-empty string', () => {
    expect(generateLocalId().length).toBeGreaterThan(0);
  });

  it('returns a different id on each call', () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateLocalId()));
    expect(ids.size).toBe(50);
  });
});

describe('assignLocalIds', () => {
  it('assigns a localId to every entry that lacks one', () => {
    const compose: PlacedProp[] = [
      { geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0x888888 } },
      { ref: 'chair' },
    ];
    const out = assignLocalIds(compose);
    expect(out[0].localId).toBeDefined();
    expect(out[1].localId).toBeDefined();
    expect(out[0].localId).not.toBe(out[1].localId);
  });

  it('leaves an existing localId untouched (idempotent)', () => {
    const compose: PlacedProp[] = [{ ref: 'chair', localId: 'fixed-id' }];
    const out = assignLocalIds(compose);
    expect(out[0].localId).toBe('fixed-id');
  });

  it('does not mutate the input array entries', () => {
    const original: PlacedProp = { ref: 'chair' };
    const compose: PlacedProp[] = [original];
    assignLocalIds(compose);
    expect(original.localId).toBeUndefined();
  });
});
