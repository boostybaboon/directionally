import type { SetPiece } from '../../domain/types.js';

export type StudioRoomConfig = {
  /** Width of the room (X axis) in metres. Default 10. */
  widthM: number;
  /** Depth of the room (Z axis) in metres. Default 8. */
  depthM: number;
  /** Height of the room in metres. Default 3. */
  heightM: number;
  /** Wall colour. Default 0xcccccc. */
  wallColor: number;
  /** Floor colour. Default 0x555555. */
  floorColor: number;
  /** Add a ceiling piece. Default false. */
  ceiling: boolean;
  /** Optional texture URL for the floor piece (e.g. '/textures/concrete.jpg'). */
  floorTextureUrl?: string;
  /** Texture repeat for the floor. Defaults to floor area / 4 for reasonable tiling. */
  floorRepeat?: number;
};

const DEFAULTS: StudioRoomConfig = {
  widthM: 10,
  depthM: 8,
  heightM: 4,  // typical drama studio / black-box height
  wallColor: 0xddd4c5, // warm off-white/bone (typical studio paint)
  floorColor: 0x4a4742, // warm dark grey (polished concrete / sprung floor)
  ceiling: false,
};

const WALL_THICKNESS = 0.2;

/**
 * Generate a bare rectangular drama studio / soundstage as a list of `SetPiece`s.
 *
 * Emits: floor + back wall + left wall + right wall + optional ceiling.
 * No front wall so the camera has an unobstructed view into the space.
 *
 * Coordinate convention: room centre = [0, 0, 0]. Audience / camera is in the +Z direction.
 */
export function generateStudioRoom(config?: Partial<StudioRoomConfig>): SetPiece[] {
  const c: StudioRoomConfig = { ...DEFAULTS, ...config };
  const { widthM: w, depthM: d, heightM: h, wallColor, floorColor, ceiling, floorTextureUrl } = c;

  const pieces: SetPiece[] = [];
  const wallMat = { color: wallColor, roughness: 0.9, metalness: 0.0 };
  const wallY = h / 2;

  // ── Floor ─────────────────────────────────────────────────────────────────
  const floorRepeat = c.floorRepeat ?? Math.round(Math.max(w, d) / 4);
  pieces.push({
    name: 'floor',
    geometry: { type: 'plane', width: w, height: d },
    material: {
      color: floorTextureUrl ? 0xffffff : floorColor,
      roughness: 0.9,
      metalness: 0.0,
      ...(floorTextureUrl ? { textureUrl: floorTextureUrl, repeatU: floorRepeat, repeatV: floorRepeat } : {}),
    },
    position: [0, 0, 0],
    rotation: [-Math.PI / 2, 0, 0],
  });

  // ── Back wall ─────────────────────────────────────────────────────────────
  pieces.push({
    name: 'back-wall',
    geometry: { type: 'box', width: w, height: h, depth: WALL_THICKNESS },
    material: wallMat,
    position: [0, wallY, -d / 2],
  });

  // ── Left wall ─────────────────────────────────────────────────────────────
  pieces.push({
    name: 'left-wall',
    geometry: { type: 'box', width: WALL_THICKNESS, height: h, depth: d },
    material: wallMat,
    position: [-w / 2, wallY, 0],
  });

  // ── Right wall ────────────────────────────────────────────────────────────
  pieces.push({
    name: 'right-wall',
    geometry: { type: 'box', width: WALL_THICKNESS, height: h, depth: d },
    material: wallMat,
    position: [w / 2, wallY, 0],
  });

  // ── Ceiling (optional) ────────────────────────────────────────────────────
  if (ceiling) {
    pieces.push({
      name: 'ceiling',
      geometry: { type: 'plane', width: w, height: d },
      material: wallMat,
      position: [0, h, 0],
      rotation: [Math.PI / 2, 0, 0],
    });
  }

  return pieces;
}
