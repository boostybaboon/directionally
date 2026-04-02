import { describe, it, expect } from 'vitest';
import { generateStudioRoom } from './studioRoom.js';
import type { SetPiece } from '../../domain/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function names(pieces: SetPiece[]): string[] {
  return pieces.map((p) => p.name);
}

// ── Default room ──────────────────────────────────────────────────────────────

describe('generateStudioRoom – defaults (no ceiling)', () => {
  const pieces = generateStudioRoom();

  it('contains floor, back-wall, left-wall, right-wall', () => {
    expect(names(pieces)).toContain('floor');
    expect(names(pieces)).toContain('back-wall');
    expect(names(pieces)).toContain('left-wall');
    expect(names(pieces)).toContain('right-wall');
  });

  it('does not include a ceiling by default', () => {
    expect(names(pieces)).not.toContain('ceiling');
  });

  it('produces exactly 4 pieces', () => {
    expect(pieces).toHaveLength(4);
  });

  it('all piece names are unique', () => {
    const ns = names(pieces);
    expect(ns.length).toBe(new Set(ns).size);
  });

  it('floor sits at y=0', () => {
    const floor = pieces.find((p) => p.name === 'floor')!;
    expect(floor.position![1]).toBe(0);
  });

  it('floor is a plane geometry', () => {
    const floor = pieces.find((p) => p.name === 'floor')!;
    expect(floor.geometry.type).toBe('plane');
  });

  it('back wall is positioned at negative Z', () => {
    const wall = pieces.find((p) => p.name === 'back-wall')!;
    expect(wall.position![2]).toBeLessThan(0);
  });

  it('left wall is at negative X', () => {
    const wall = pieces.find((p) => p.name === 'left-wall')!;
    expect(wall.position![0]).toBeLessThan(0);
  });

  it('right wall is at positive X', () => {
    const wall = pieces.find((p) => p.name === 'right-wall')!;
    expect(wall.position![0]).toBeGreaterThan(0);
  });
});

// ── Ceiling option ────────────────────────────────────────────────────────────

describe('generateStudioRoom – with ceiling', () => {
  const pieces = generateStudioRoom({ ceiling: true });

  it('produces 5 pieces', () => {
    expect(pieces).toHaveLength(5);
  });

  it('includes a ceiling piece', () => {
    expect(names(pieces)).toContain('ceiling');
  });

  it('ceiling is positioned at room height', () => {
    const floor = pieces.find((p) => p.name === 'ceiling')!;
    expect(floor.position![1]).toBeCloseTo(4); // default heightM = 4
  });
});

// ── Custom dimensions ─────────────────────────────────────────────────────────

describe('generateStudioRoom – custom dimensions', () => {
  it('back wall Z half-depth matches widthM / depthM', () => {
    const pieces = generateStudioRoom({ widthM: 12, depthM: 10 });
    const wall = pieces.find((p) => p.name === 'back-wall')!;
    expect(wall.position![2]).toBeCloseTo(-5); // -depthM / 2
  });

  it('left wall X half-width matches widthM', () => {
    const pieces = generateStudioRoom({ widthM: 12, depthM: 10 });
    const wall = pieces.find((p) => p.name === 'left-wall')!;
    expect(wall.position![0]).toBeCloseTo(-6); // -widthM / 2
  });
});

// ── Floor texture ─────────────────────────────────────────────────────────────

describe('generateStudioRoom – floor texture', () => {
  it('sets textureUrl on the floor material', () => {
    const pieces = generateStudioRoom({ floorTextureUrl: '/textures/concrete.jpg' });
    const floor = pieces.find((p) => p.name === 'floor')!;
    expect(floor.material.textureUrl).toBe('/textures/concrete.jpg');
  });

  it('sets white floor colour when a texture is provided', () => {
    const pieces = generateStudioRoom({ floorTextureUrl: '/textures/concrete.jpg' });
    const floor = pieces.find((p) => p.name === 'floor')!;
    expect(floor.material.color).toBe(0xffffff);
  });

  it('does not set textureUrl when no texture is provided', () => {
    const pieces = generateStudioRoom();
    const floor = pieces.find((p) => p.name === 'floor')!;
    expect(floor.material.textureUrl).toBeUndefined();
  });
});

// ── Custom colours ────────────────────────────────────────────────────────────

describe('generateStudioRoom – custom colours', () => {
  it('applies wallColor to the back wall', () => {
    const pieces = generateStudioRoom({ wallColor: 0xabcdef });
    const wall = pieces.find((p) => p.name === 'back-wall')!;
    expect(wall.material.color).toBe(0xabcdef);
  });

  it('applies floorColor to the floor when no texture', () => {
    const pieces = generateStudioRoom({ floorColor: 0x334455 });
    const floor = pieces.find((p) => p.name === 'floor')!;
    expect(floor.material.color).toBe(0x334455);
  });
});
