import type { ActorBlock, ClipTrack, SceneAction, TransformTrack, Vec3 } from './types.js';

/**
 * Convert a facing direction vector to a pure Y-axis rotation quaternion [x, y, z, w].
 *
 * Assumes characters' neutral forward is +Z (standard Three.js GLTF import convention).
 * Only the XZ components of `dir` are used; Y is ignored (no tilt).
 */
function directionToYawQuat(dir: Vec3): [number, number, number, number] {
  const yaw = Math.atan2(dir[0], dir[2]);
  return [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
}

function vec3Equal(a: Vec3, b: Vec3): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/**
 * Compile an `ActorBlock` to low-level `SceneAction` tracks.
 *
 * Produces up to three tracks:
 * - `ClipTrack` when `block.clip` is set
 * - `TransformTrack` (`.position`, vector) when start and end positions differ
 * - `TransformTrack` (`.quaternion`, quaternion) when an explicit or auto-derived
 *   facing change exists
 *
 * Facing rules:
 * - If both `startFacing` and `endFacing` are provided: interpolate between them.
 * - If only one is provided: hold that angle constant (no interpolation).
 * - If neither is provided and the block has movement: auto-derive facing from the
 *   direction of travel (same value at both ends — the character stays pointed along
 *   the path).
 * - If neither is provided and there is no movement: no facing track is emitted.
 *
 * The compiled tracks are not stored — they are merged with `scene.actions` at
 * load time by `storedSceneToModel`.
 */
export function actorBlockToTracks(block: ActorBlock, inferredStartPos?: Vec3): SceneAction[] {
  const result: SceneAction[] = [];
  const duration = block.endTime - block.startTime;

  // Clip track
  if (block.clip) {
    const clipTrack: ClipTrack = {
      type: 'animate',
      actorId: block.actorId,
      startTime: block.startTime,
      endTime: block.endTime,
      animationName: block.clip,
    };
    result.push(clipTrack);
  }

  // Explicit startPosition overrides the inferred chain; fall back to inferredStartPos
  const effectiveStart = block.startPosition ?? inferredStartPos;

  // Position track — only when both endpoints are defined and differ
  const hasMovement =
    effectiveStart !== undefined &&
    block.endPosition !== undefined &&
    !vec3Equal(effectiveStart, block.endPosition);

  if (hasMovement) {
    const posTrack: TransformTrack = {
      type: 'move',
      targetId: block.actorId,
      startTime: block.startTime,
      keyframes: {
        property: '.position',
        // Keyframe times are relative to startTime — PlaybackEngine sets
        // anim.time = sceneTime - anim.start, so 0 == block start.
        times: [0, duration],
        values: [...effectiveStart!, ...block.endPosition!],
        trackType: 'vector',
      },
    };
    result.push(posTrack);
  }

  // Facing track — explicit or auto-derived
  let startFacing = block.startFacing;
  let endFacing   = block.endFacing;

  if (!startFacing && !endFacing && hasMovement) {
    const dx = block.endPosition![0] - effectiveStart![0];
    const dz = block.endPosition![2] - effectiveStart![2];
    const len = Math.sqrt(dx * dx + dz * dz);
    if (len > 0.001) {
      const dir: Vec3 = [dx / len, 0, dz / len];
      startFacing = dir;
      endFacing   = dir;
    }
  }

  if (startFacing || endFacing) {
    // If only one endpoint is specified, hold constant
    const sf = startFacing ?? endFacing!;
    const ef = endFacing   ?? startFacing!;
    const sq = directionToYawQuat(sf);
    const eq = directionToYawQuat(ef);
    const facingTrack: TransformTrack = {
      type: 'move',
      targetId: block.actorId,
      startTime: block.startTime,
      keyframes: {
        property: '.quaternion',
        times: [0, duration],
        values: [...sq, ...eq],
        trackType: 'quaternion',
      },
    };
    result.push(facingTrack);
  }

  return result;
}
