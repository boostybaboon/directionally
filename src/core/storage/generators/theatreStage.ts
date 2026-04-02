import type { SetPiece } from '../../domain/types.js';

export type TheatreStageType = 'proscenium' | 'thrust';

export type TheatreStageConfig = {
  type: TheatreStageType;
  /** Width of the proscenium opening / deck in metres. Default 14 (~Prince of Wales). */
  stageWidthM: number;
  /** Depth of the stage deck in metres. Default 9 (~typical West End). */
  stageDepthM: number;
  /** Height of the proscenium / masking flats in metres. Default 7 (~average West End). */
  flatHeightM: number;
  /** Number of leg-flat pairs per side (wings). Default 4. */
  legs: number;
  /** Deck colour. Default 0x1a1816 (near-black painted stage boards). */
  deckColor: number;
  /** Leg / tormentor colour — the side curtains. Default 0x6b1a22 (deep crimson velvet). */
  legColor: number;
  /** Back wall and border colour. Default 0x0d0c0b (near-black masking). */
  maskingColor: number;
  /**
   * Degrees each leg flat is rotated from perfectly perpendicular toward centre stage,
   * creating a forced-perspective converging wing look. Default 12.
   */
  legAngleDeg: number;
};

const DEFAULTS: TheatreStageConfig = {
  type: 'proscenium',
  stageWidthM: 14,       // ~Prince of Wales proscenium width
  stageDepthM: 9,        // ~typical West End depth
  flatHeightM: 7,        // ~average West End proscenium height
  legs: 4,
  deckColor: 0x1a1816,   // near-black painted stage boards
  legColor: 0x6b1a22,    // deep crimson velvet (legs + tormentors)
  maskingColor: 0x0d0c0b, // near-black (back wall, borders)
  legAngleDeg: 12,       // converging wing perspective
};

const FLAT_THICKNESS = 0.15;

/**
 * Generate a theatre stage set as a list of `SetPiece`s.
 *
 * Proscenium: stage deck + back wall + N leg-flat pairs + top border + two tormentors.
 * Thrust: stage deck (extended toward audience) + N leg-flat pairs around three sides, no back wall.
 *
 * Coordinate convention: stage centre = [0, 0, 0]. Audience is in the +Z direction.
 * Stage deck sits at y = 0. Flats stand upright along the edges.
 */
export function generateTheatreStage(config?: Partial<TheatreStageConfig>): SetPiece[] {
  const c: TheatreStageConfig = { ...DEFAULTS, ...config };
  const {
    type,
    stageWidthM: w,
    stageDepthM: d,
    flatHeightM: fh,
    legs,
    deckColor,
    legColor,
    maskingColor,
    legAngleDeg,
  } = c;

  const legAngle = legAngleDeg * (Math.PI / 180);

  const pieces: SetPiece[] = [];
  const legMat     = { color: legColor,     roughness: 0.95, metalness: 0.0 };
  const maskingMat = { color: maskingColor, roughness: 0.95, metalness: 0.0 };
  const deckMat    = { color: deckColor,    roughness: 0.85, metalness: 0.05 };
  const flatY = fh / 2; // flat centre Y (half height above floor)

  // ── Stage deck ────────────────────────────────────────────────────────────
  // For thrust, deck extends 2m further toward audience (+Z).
  const deckDepth = type === 'thrust' ? d + 2 : d;
  const deckZOffset = type === 'thrust' ? -1 : 0; // shift centre to keep upstage edge fixed
  pieces.push({
    name: 'deck',
    geometry: { type: 'plane', width: w, height: deckDepth },
    material: deckMat,
    position: [0, 0, deckZOffset],
    rotation: [-Math.PI / 2, 0, 0],
  });

  // ── Back wall ─────────────────────────────────────────────────────────────
  // Proscenium only: upstage wall flush with the back of the deck.
  if (type === 'proscenium') {
    const backZ = -d / 2;
    pieces.push({
      name: 'back-wall',
      geometry: { type: 'box', width: w, height: fh, depth: FLAT_THICKNESS },
      material: maskingMat,
      position: [0, flatY, backZ],
    });
  }

  // ── Leg flats ─────────────────────────────────────────────────────────────
  // Spaced evenly along the depth of the stage, perpendicular to the audience sightline.
  // For proscenium, legs span from downstage to one leg-spacing short of the back wall.
  // For thrust, legs wrap around stage-left, stage-right, and upstage.
  const legSpacing = d / (legs + 1);
  const legWidth = 1.5; // flat width (depth into wing)

  for (let i = 1; i <= legs; i++) {
    const zPos = d / 2 - i * legSpacing;
    const xEdge = w / 2 + legWidth / 2;

    // Angle legs inward so their upstage edge converges toward centre stage.
    // Left legs: reduce Y rotation from 90° → upstage end shifts toward +X (centre).
    // Right legs: increase Y rotation from 90° → upstage end shifts toward -X (centre).
    pieces.push({
      name: `leg-left-${i}`,
      geometry: { type: 'box', width: legWidth, height: fh, depth: FLAT_THICKNESS },
      material: legMat,
      position: [-xEdge, flatY, zPos],
      rotation: [0, Math.PI / 2 - legAngle, 0],
    });
    pieces.push({
      name: `leg-right-${i}`,
      geometry: { type: 'box', width: legWidth, height: fh, depth: FLAT_THICKNESS },
      material: legMat,
      position: [xEdge, flatY, zPos],
      rotation: [0, Math.PI / 2 + legAngle, 0],
    });
  }

  // ── Top border ────────────────────────────────────────────────────────────
  // Horizontal masking header across the top of the proscenium opening.
  const borderHeight = 0.6;
  const borderY = fh - borderHeight / 2;
  pieces.push({
    name: 'border',
    geometry: { type: 'box', width: w + legWidth * 2, height: borderHeight, depth: FLAT_THICKNESS },
    material: maskingMat,
    position: [0, borderY, d / 2 + 0.01],
  });

  // ── Tormentors ────────────────────────────────────────────────────────────
  // Narrow downstage flats framing the proscenium opening (proscenium only).
  if (type === 'proscenium') {
    const tormWidth = 1.5;
    const tormX = w / 2 + tormWidth / 2;
    const tormZ = d / 2;
    pieces.push({
      name: 'tormentor-left',
      geometry: { type: 'box', width: tormWidth, height: fh, depth: FLAT_THICKNESS },
      material: legMat,
      position: [-tormX, flatY, tormZ],
    });
    pieces.push({
      name: 'tormentor-right',
      geometry: { type: 'box', width: tormWidth, height: fh, depth: FLAT_THICKNESS },
      material: legMat,
      position: [tormX, flatY, tormZ],
    });
  }

  return pieces;
}
