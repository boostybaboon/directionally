import { describe, it, expect } from 'vitest';
import { generateTheatreStage } from './theatreStage.js';
import type { SetPiece } from '../../domain/types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function names(pieces: SetPiece[]): string[] {
  return pieces.map((p) => p.name);
}

// ── Default proscenium generation ──────────────────────────────────────────────

describe('generateTheatreStage – proscenium (default)', () => {
  const pieces = generateTheatreStage();

  it('includes the stage deck', () => {
    expect(names(pieces)).toContain('deck');
  });

  it('includes a back wall', () => {
    expect(names(pieces)).toContain('back-wall');
  });

  it('includes a top border', () => {
    expect(names(pieces)).toContain('border');
  });

  it('includes tormentor flats', () => {
    expect(names(pieces)).toContain('tormentor-left');
    expect(names(pieces)).toContain('tormentor-right');
  });

  it('produces 4 leg pairs (8 leg pieces) for default legs=4', () => {
    const legs = pieces.filter((p) => p.name.startsWith('leg-'));
    expect(legs).toHaveLength(8);
  });

  it('all piece names are unique', () => {
    const ns = names(pieces);
    expect(ns.length).toBe(new Set(ns).size);
  });

  it('deck sits at y=0', () => {
    const deck = pieces.find((p) => p.name === 'deck')!;
    expect(deck.position![1]).toBe(0);
  });

  it('deck is a plane geometry', () => {
    const deck = pieces.find((p) => p.name === 'deck')!;
    expect(deck.geometry.type).toBe('plane');
  });

  it('back wall is positioned at upstage edge (negative Z)', () => {
    const wall = pieces.find((p) => p.name === 'back-wall')!;
    expect(wall.position![2]).toBeLessThan(0);
  });
});

// ── Config: custom leg count ──────────────────────────────────────────────────

describe('generateTheatreStage – custom leg count', () => {
  it('produces the correct number of leg pieces for legs=2', () => {
    const pieces = generateTheatreStage({ legs: 2 });
    const legs = pieces.filter((p) => p.name.startsWith('leg-'));
    expect(legs).toHaveLength(4);
  });

  it('produces the correct number of leg pieces for legs=5', () => {
    const pieces = generateTheatreStage({ legs: 5 });
    const legs = pieces.filter((p) => p.name.startsWith('leg-'));
    expect(legs).toHaveLength(10);
  });
});

// ── Thrust stage ──────────────────────────────────────────────────────────────

describe('generateTheatreStage – thrust', () => {
  const pieces = generateTheatreStage({ type: 'thrust' });

  it('includes the deck', () => {
    expect(names(pieces)).toContain('deck');
  });

  it('has leg flats', () => {
    const legs = pieces.filter((p) => p.name.startsWith('leg-'));
    expect(legs.length).toBeGreaterThan(0);
  });

  it('has no tormentors (open downstage)', () => {
    expect(names(pieces)).not.toContain('tormentor-left');
    expect(names(pieces)).not.toContain('tormentor-right');
  });

  it('all piece names are unique', () => {
    const ns = names(pieces);
    expect(ns.length).toBe(new Set(ns).size);
  });
});

// ── Material colours ──────────────────────────────────────────────────────────

describe('generateTheatreStage – legAngleDeg', () => {
  it('left leg rotation is Math.PI/2 - angle when legAngleDeg is set', () => {
    const pieces = generateTheatreStage({ legAngleDeg: 0 });
    const leg = pieces.find((p) => p.name === 'leg-left-1')!;
    expect(leg.rotation![1]).toBeCloseTo(Math.PI / 2);
  });

  it('right leg rotation is Math.PI/2 + angle when legAngleDeg is set', () => {
    const pieces = generateTheatreStage({ legAngleDeg: 0 });
    const leg = pieces.find((p) => p.name === 'leg-right-1')!;
    expect(leg.rotation![1]).toBeCloseTo(Math.PI / 2);
  });

  it('non-zero legAngleDeg makes left and right leg rotations differ from 90°', () => {
    const pieces = generateTheatreStage({ legAngleDeg: 15 });
    const leftLeg = pieces.find((p) => p.name === 'leg-left-1')!;
    const rightLeg = pieces.find((p) => p.name === 'leg-right-1')!;
    expect(leftLeg.rotation![1]).toBeLessThan(Math.PI / 2);
    expect(rightLeg.rotation![1]).toBeGreaterThan(Math.PI / 2);
  });
});

describe('generateTheatreStage – custom colours', () => {
  it('applies custom deckColor to the deck', () => {
    const pieces = generateTheatreStage({ deckColor: 0xaabbcc });
    const deck = pieces.find((p) => p.name === 'deck')!;
    expect(deck.material.color).toBe(0xaabbcc);
  });

  it('applies custom maskingColor to the back wall', () => {
    const pieces = generateTheatreStage({ maskingColor: 0x112233 });
    const wall = pieces.find((p) => p.name === 'back-wall')!;
    expect(wall.material.color).toBe(0x112233);
  });

  it('applies custom legColor to leg flats', () => {
    const pieces = generateTheatreStage({ legColor: 0x8b0000 });
    const leg = pieces.find((p) => p.name === 'leg-left-1')!;
    expect(leg.material.color).toBe(0x8b0000);
  });

  it('leg flats and back wall use different default colours', () => {
    const pieces = generateTheatreStage();
    const leg = pieces.find((p) => p.name === 'leg-left-1')!;
    const wall = pieces.find((p) => p.name === 'back-wall')!;
    expect(leg.material.color).not.toBe(wall.material.color);
  });
});
