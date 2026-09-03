import { describe, it, expect } from 'vitest';
import { resolveOutfitColor, OUTFIT_PRESETS, SKIN_TONES, type Outfit } from './clothing.js';

const SKIN = 0xf5cba7;

describe('resolveOutfitColor', () => {
  it('returns skin for an empty outfit', () => {
    expect(resolveOutfitColor({ garments: [] }, 'torso', SKIN)).toBe(SKIN);
  });

  it('covers a region with a garment colour and leaves others as skin', () => {
    const outfit: Outfit = { garments: [{ id: 'top', covers: ['torso', 'arm', 'forearm'], color: 0x4466aa }] };
    expect(resolveOutfitColor(outfit, 'torso', SKIN)).toBe(0x4466aa);
    expect(resolveOutfitColor(outfit, 'arm', SKIN)).toBe(0x4466aa);
    expect(resolveOutfitColor(outfit, 'hand', SKIN)).toBe(SKIN);
    expect(resolveOutfitColor(outfit, 'neck', SKIN)).toBe(SKIN);
  });

  it('layers topmost-wins (cascading)', () => {
    const outfit: Outfit = {
      garments: [
        { id: 'shirt', covers: ['torso', 'arm', 'forearm'], color: 0x88aadd },
        { id: 'vest', covers: ['torso'], color: 0x1a2a4a },
      ],
    };
    expect(resolveOutfitColor(outfit, 'torso', SKIN)).toBe(0x1a2a4a); // vest wins
    expect(resolveOutfitColor(outfit, 'arm', SKIN)).toBe(0x88aadd);   // shirt shows
  });
});

describe('OUTFIT_PRESETS', () => {
  it('has the expected presets', () => {
    expect(Object.keys(OUTFIT_PRESETS)).toEqual(['casual', 'teeShorts', 'layered', 'bare']);
  });

  it('leaves the neck and head as skin in every preset', () => {
    for (const outfit of Object.values(OUTFIT_PRESETS)) {
      expect(resolveOutfitColor(outfit, 'neck', SKIN)).toBe(SKIN);
      expect(resolveOutfitColor(outfit, 'head', SKIN)).toBe(SKIN);
    }
  });
});

describe('SKIN_TONES', () => {
  it('spans a broad light→deep range of distinct, tone-labelled swatches', () => {
    expect(SKIN_TONES.length).toBeGreaterThanOrEqual(5);
    const colors = SKIN_TONES.map((t) => t.color);
    expect(new Set(colors).size).toBe(colors.length); // distinct

    // Perceived luminance decreases from Fair to Deep (broad, monotonic range).
    const lum = (c: number) => {
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    for (let i = 1; i < SKIN_TONES.length; i++) {
      expect(lum(SKIN_TONES[i - 1].color)).toBeGreaterThan(lum(SKIN_TONES[i].color));
    }
  });
});
