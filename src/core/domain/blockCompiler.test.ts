import { describe, it, expect } from 'vitest';
import { actorBlockToTracks, lightBlockToTracks, setPieceBlockToTracks, cameraBlockToTracks } from './blockCompiler';
import type { ActorBlock, ClipTrack, LightBlock, LightingTrack, CameraBlock, CameraTrackAction, SetPieceBlock, TransformTrack } from './types';

function makeBlock(overrides: Partial<ActorBlock> = {}): ActorBlock {
  return {
    type: 'actorBlock',
    actorId: 'a1',
    startTime: 0,
    endTime: 4,
    ...overrides,
  };
}

describe('actorBlockToTracks', () => {
  it('returns empty array for a block with no clip, position, or facing', () => {
    expect(actorBlockToTracks(makeBlock())).toEqual([]);
  });

  it('emits a ClipTrack when clip is set', () => {
    const result = actorBlockToTracks(makeBlock({ clip: 'Walk' }));
    expect(result).toHaveLength(1);
    const clip = result[0] as ClipTrack;
    expect(clip.type).toBe('animate');
    expect(clip.actorId).toBe('a1');
    expect(clip.startTime).toBe(0);
    expect(clip.endTime).toBe(4);
    expect(clip.animationName).toBe('Walk');
  });

  it('emits a position TransformTrack when start and end positions differ', () => {
    const result = actorBlockToTracks(makeBlock({
      startPosition: [0, 0, 0],
      endPosition:   [3, 0, 0],
    }));
    // position track + auto-derived facing track
    const pos = result.find((a) => a.type === 'move' && (a as TransformTrack).keyframes.property === '.position') as TransformTrack;
    expect(pos).toBeDefined();
    expect(pos.targetId).toBe('a1');
    expect(pos.keyframes.trackType).toBe('vector');
    expect(pos.keyframes.times).toEqual([0, 4]);
    expect(pos.keyframes.values).toEqual([0, 0, 0, 3, 0, 0]);
  });

  it('does not emit a position track when start and end positions are equal', () => {
    const result = actorBlockToTracks(makeBlock({
      startPosition: [1, 0, 1],
      endPosition:   [1, 0, 1],
    }));
    const posTrack = result.find((a) => (a as TransformTrack).keyframes?.property === '.position');
    expect(posTrack).toBeUndefined();
  });

  it('does not emit a position track when only one position is provided', () => {
    const result = actorBlockToTracks(makeBlock({ startPosition: [0, 0, 0] }));
    const posTrack = result.find((a) => (a as TransformTrack).keyframes?.property === '.position');
    expect(posTrack).toBeUndefined();
  });

  it('auto-derives a facing track from travel direction when no facing is set', () => {
    // Moving in +X direction → yaw = atan2(1, 0) = π/2
    const result = actorBlockToTracks(makeBlock({
      startPosition: [0, 0, 0],
      endPosition:   [4, 0, 0],
    }));
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    expect(facing).toBeDefined();
    expect(facing.keyframes.trackType).toBe('quaternion');
    expect(facing.keyframes.times).toEqual([0, 4]);
    // 8 values: two quaternions [x, y, z, w] × 2
    expect(facing.keyframes.values).toHaveLength(8);
    // Both ends are the same (constant direction)
    expect(facing.keyframes.values.slice(0, 4)).toEqual(facing.keyframes.values.slice(4, 8));
  });

  it('auto-derived facing quaternion is correct for +X travel direction', () => {
    // Direction [1, 0, 0] → yaw = atan2(1, 0) = π/2
    // q = [0, sin(π/4), 0, cos(π/4)]
    const result = actorBlockToTracks(makeBlock({
      startPosition: [0, 0, 0],
      endPosition:   [1, 0, 0],
    }));
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    const [qx, qy, qz, qw] = facing.keyframes.values;
    expect(qx).toBeCloseTo(0);
    expect(qy).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(qz).toBeCloseTo(0);
    expect(qw).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it('uses explicit startFacing and endFacing and interpolates', () => {
    const result = actorBlockToTracks(makeBlock({
      startFacing: [0, 0, 1],  // facing +Z (yaw = 0)
      endFacing:   [1, 0, 0],  // facing +X (yaw = π/2)
    }));
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    expect(facing).toBeDefined();
    // Start quaternion: yaw = 0 → [0, 0, 0, 1]
    expect(facing.keyframes.values[0]).toBeCloseTo(0);
    expect(facing.keyframes.values[1]).toBeCloseTo(0);
    expect(facing.keyframes.values[2]).toBeCloseTo(0);
    expect(facing.keyframes.values[3]).toBeCloseTo(1);
    // End quaternion: yaw = π/2 → [0, sin(π/4), 0, cos(π/4)]
    expect(facing.keyframes.values[4]).toBeCloseTo(0);
    expect(facing.keyframes.values[5]).toBeCloseTo(Math.sin(Math.PI / 4));
    expect(facing.keyframes.values[6]).toBeCloseTo(0);
    expect(facing.keyframes.values[7]).toBeCloseTo(Math.cos(Math.PI / 4));
  });

  it('holds facing constant when only startFacing is provided', () => {
    const result = actorBlockToTracks(makeBlock({ startFacing: [1, 0, 0] }));
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    expect(facing).toBeDefined();
    // Both endpoints must be the same quaternion
    expect(facing.keyframes.values.slice(0, 4)).toEqual(facing.keyframes.values.slice(4, 8));
  });

  it('holds facing constant when only endFacing is provided', () => {
    const result = actorBlockToTracks(makeBlock({ endFacing: [0, 0, 1] }));
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    expect(facing).toBeDefined();
    expect(facing.keyframes.values.slice(0, 4)).toEqual(facing.keyframes.values.slice(4, 8));
  });

  it('turn variant: same positions, different facing → only facing track (no position track)', () => {
    const result = actorBlockToTracks(makeBlock({
      clip: 'Idle',
      startPosition: [2, 0, 2],
      endPosition:   [2, 0, 2],  // same → no movement
      startFacing: [0, 0, 1],
      endFacing:   [1, 0, 0],
    }));
    const posTrack = result.find((a) => (a as TransformTrack).keyframes?.property === '.position');
    expect(posTrack).toBeUndefined();
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion');
    expect(facing).toBeDefined();
  });

  it('full block emits three tracks: clip + position + facing', () => {
    const result = actorBlockToTracks(makeBlock({
      clip: 'Walk',
      startPosition: [0, 0, 0],
      endPosition:   [5, 0, 0],
    }));
    const types = result.map((a) => a.type);
    expect(types).toContain('animate');
    expect(types).toContain('move');
    expect(result.filter((a) => a.type === 'move')).toHaveLength(2); // position + facing
  });

  it('does not auto-derive facing when movement is near-zero', () => {
    const result = actorBlockToTracks(makeBlock({
      startPosition: [0, 0, 0],
      endPosition:   [0.0001, 0, 0],  // negligible distance
    }));
    // position track is emitted (values differ), but facing track is not (direction undefined)
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion');
    expect(facing).toBeUndefined();
  });

  it('target actor id is propagated to all emitted tracks', () => {
    const result = actorBlockToTracks(makeBlock({
      actorId: 'robot-beta',
      clip: 'Run',
      startPosition: [0, 0, 0],
      endPosition:   [1, 0, 0],
    }));
    for (const track of result) {
      if (track.type === 'animate') expect((track as ClipTrack).actorId).toBe('robot-beta');
      if (track.type === 'move')    expect((track as TransformTrack).targetId).toBe('robot-beta');
    }
  });

  it('keyframe times are relative (0-based) even when startTime is non-zero', () => {
    const result = actorBlockToTracks(makeBlock({
      startTime: 3,
      endTime: 7,
      startPosition: [0, 0, 0],
      endPosition:   [4, 0, 0],
    }));
    const pos = result.find((a) => (a as TransformTrack).keyframes?.property === '.position') as TransformTrack;
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    expect(pos.keyframes.times).toEqual([0, 4]);
    expect(facing.keyframes.times).toEqual([0, 4]);
  });

  it('uses inferredStartPos when block has no explicit startPosition', () => {
    const inferredStart: [number, number, number] = [10, 0, 0];
    const result = actorBlockToTracks(makeBlock({
      endPosition: [14, 0, 0],
    }), inferredStart);
    const pos = result.find((a) => (a as TransformTrack).keyframes?.property === '.position') as TransformTrack;
    expect(pos).toBeDefined();
    expect(pos.keyframes.values.slice(0, 3)).toEqual([10, 0, 0]);
    expect(pos.keyframes.values.slice(3, 6)).toEqual([14, 0, 0]);
  });

  it('explicit startPosition overrides inferredStartPos', () => {
    const result = actorBlockToTracks(makeBlock({
      startPosition: [1, 0, 0],
      endPosition:   [5, 0, 0],
    }), [99, 0, 0] as [number, number, number]);
    const pos = result.find((a) => (a as TransformTrack).keyframes?.property === '.position') as TransformTrack;
    expect(pos.keyframes.values.slice(0, 3)).toEqual([1, 0, 0]);
  });

  it('no position track when inferredStartPos equals endPosition', () => {
    const result = actorBlockToTracks(makeBlock({
      endPosition: [5, 0, 0],
    }), [5, 0, 0] as [number, number, number]);
    const pos = result.find((a) => (a as TransformTrack).keyframes?.property === '.position');
    expect(pos).toBeUndefined();
  });

  it('modelDefaultRotation is post-multiplied onto facing quaternions', () => {
    // Without defaultRotation: facing +Z gives identity quaternion [0,0,0,1]
    // With defaultRotation [0,π,0] (180° Y): facing +Z → [0,1,0,0] × [0,0,0,1] ≈ [0,1,0,0]
    // i.e. the model is flipped 180° so its backward face now faces +Z
    const defaultRot: [number, number, number] = [0, Math.PI, 0];
    const result = actorBlockToTracks(
      makeBlock({ startFacing: [0, 0, 1] }),
      undefined,
      defaultRot,
    );
    const facing = result.find((a) => (a as TransformTrack).keyframes?.property === '.quaternion') as TransformTrack;
    expect(facing).toBeDefined();
    // identity yaw * Q_Y180 = [0, sin(π/2), 0, cos(π/2)] = [0, 1, 0, 0]
    const [qx, qy, qz, qw] = facing.keyframes.values;
    expect(qx).toBeCloseTo(0);
    expect(qy).toBeCloseTo(1);
    expect(qz).toBeCloseTo(0);
    expect(qw).toBeCloseTo(0);
  });
});

// ── lightBlockToTracks ────────────────────────────────────────────────────────

function makeLightBlock(overrides: Partial<LightBlock> = {}): LightBlock {
  return { type: 'lightBlock', lightId: 'sun', startTime: 1, endTime: 5, ...overrides };
}

describe('lightBlockToTracks', () => {
  it('returns a single LightingTrack for .intensity', () => {
    const result = lightBlockToTracks(makeLightBlock({ startIntensity: 2, endIntensity: 0 }));
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('lighting');
    expect(result[0].keyframes.property).toBe('.intensity');
    expect(result[0].keyframes.trackType).toBe('number');
  });

  it('keyframe times are relative (0-based)', () => {
    const result = lightBlockToTracks(makeLightBlock({ startTime: 2, endTime: 6, startIntensity: 1, endIntensity: 0 }));
    expect(result[0].keyframes.times).toEqual([0, 4]);
  });

  it('propagates lightId to the track', () => {
    const result = lightBlockToTracks(makeLightBlock({ lightId: 'hemi', startIntensity: 1, endIntensity: 0.5 }));
    expect(result[0].lightId).toBe('hemi');
  });

  it('uses inferredStartIntensity when startIntensity is absent', () => {
    const result = lightBlockToTracks(makeLightBlock({ endIntensity: 0.5 }), 3);
    expect(result[0].keyframes.values[0]).toBe(3);
    expect(result[0].keyframes.values[1]).toBe(0.5);
  });

  it('defaults start intensity to 1 when neither startIntensity nor inferred is available', () => {
    const result = lightBlockToTracks(makeLightBlock({ endIntensity: 0 }));
    expect(result[0].keyframes.values[0]).toBe(1);
  });

  it('holds start intensity constant when endIntensity is absent', () => {
    const result = lightBlockToTracks(makeLightBlock({ startIntensity: 2 }));
    expect(result[0].keyframes.values).toEqual([2, 2]);
  });

  it('startTime on the track matches block.startTime', () => {
    const result = lightBlockToTracks(makeLightBlock({ startTime: 3, endTime: 7 }));
    expect(result[0].startTime).toBe(3);
  });
});

// ── setPieceBlockToTracks ─────────────────────────────────────────────────────

function makeSetPieceBlock(overrides: Partial<SetPieceBlock> = {}): SetPieceBlock {
  return { type: 'setPieceBlock', targetId: 'door', startTime: 0, endTime: 2, ...overrides };
}

describe('setPieceBlockToTracks', () => {
  it('returns empty array when no position or rotation change', () => {
    expect(setPieceBlockToTracks(makeSetPieceBlock())).toEqual([]);
  });

  it('emits a position TransformTrack when start and end positions differ', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ endPosition: [3, 0, 0] }),
      [0, 0, 0],
    );
    const pos = result.find((t) => t.keyframes.property === '.position') as TransformTrack;
    expect(pos).toBeDefined();
    expect(pos.type).toBe('move');
    expect(pos.targetId).toBe('door');
    expect(pos.keyframes.trackType).toBe('vector');
    expect(pos.keyframes.values).toEqual([0, 0, 0, 3, 0, 0]);
    expect(pos.keyframes.times).toEqual([0, 2]);
  });

  it('does not emit a position track when start and end positions are equal', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ endPosition: [1, 0, 1] }),
      [1, 0, 1],
    );
    expect(result.find((t) => t.keyframes.property === '.position')).toBeUndefined();
  });

  it('does not emit a position track when inferredStartPos is absent', () => {
    const result = setPieceBlockToTracks(makeSetPieceBlock({ endPosition: [5, 0, 0] }));
    expect(result).toHaveLength(0);
  });

  it('emits a quaternion TransformTrack when rotation changes', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ endRotation: [0, Math.PI / 2, 0] }),
      undefined,
      [0, 0, 0],
    );
    const rot = result.find((t) => t.keyframes.property === '.quaternion') as TransformTrack;
    expect(rot).toBeDefined();
    expect(rot.keyframes.trackType).toBe('quaternion');
    expect(rot.keyframes.values).toHaveLength(8);
  });

  it('start quaternion for zero Euler rotation is [0,0,0,1]', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ endRotation: [0, Math.PI, 0] }),
      undefined,
      [0, 0, 0],
    );
    const rot = result.find((t) => t.keyframes.property === '.quaternion') as TransformTrack;
    const [qx, qy, qz, qw] = rot.keyframes.values;
    expect(qx).toBeCloseTo(0);
    expect(qy).toBeCloseTo(0);
    expect(qz).toBeCloseTo(0);
    expect(qw).toBeCloseTo(1);
  });

  it('end quaternion for 180° Y rotation is [0,1,0,0]', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ endRotation: [0, Math.PI, 0] }),
      undefined,
      [0, 0, 0],
    );
    const rot = result.find((t) => t.keyframes.property === '.quaternion') as TransformTrack;
    const [, , , , qx, qy, qz, qw] = rot.keyframes.values;
    expect(qx).toBeCloseTo(0);
    expect(qy).toBeCloseTo(1);
    expect(qz).toBeCloseTo(0);
    expect(qw).toBeCloseTo(0);
  });

  it('does not emit rotation track when inferredStartRot is absent', () => {
    const result = setPieceBlockToTracks(makeSetPieceBlock({ endRotation: [0, 1, 0] }));
    expect(result.find((t) => t.keyframes.property === '.quaternion')).toBeUndefined();
  });

  it('emits both position and rotation tracks when both change', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ endPosition: [2, 0, 0], endRotation: [0, Math.PI / 2, 0] }),
      [0, 0, 0],
      [0, 0, 0],
    );
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.keyframes.property).sort()).toEqual(['.position', '.quaternion'].sort());
  });

  it('keyframe times are relative (0=startTime) regardless of block.startTime', () => {
    const result = setPieceBlockToTracks(
      makeSetPieceBlock({ startTime: 3, endTime: 7, endPosition: [1, 0, 0] }),
      [0, 0, 0],
    );
    const pos = result.find((t) => t.keyframes.property === '.position') as TransformTrack;
    expect(pos.keyframes.times).toEqual([0, 4]);
    expect(pos.startTime).toBe(3);
  });
});

// ── cameraBlockToTracks ───────────────────────────────────────────────────────

function makeCameraBlock(overrides: Partial<CameraBlock> = {}): CameraBlock {
  return { type: 'cameraBlock', startTime: 0, endTime: 3, ...overrides };
}

describe('cameraBlockToTracks', () => {
  const startPos: [number, number, number] = [0, 5, 12];
  const startLookAt: [number, number, number] = [0, 1, 0];

  it('returns a single CameraTrackAction', () => {
    const result = cameraBlockToTracks(makeCameraBlock(), startPos, startLookAt);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('cameraTrack');
  });

  it('produces exactly two PathKeyframes', () => {
    const result = cameraBlockToTracks(makeCameraBlock(), startPos, startLookAt);
    expect(result[0].keyframes).toHaveLength(2);
  });

  it('start keyframe time matches block.startTime', () => {
    const result = cameraBlockToTracks(makeCameraBlock({ startTime: 2, endTime: 5 }), startPos, startLookAt);
    expect(result[0].keyframes[0].time).toBe(2);
    expect(result[0].keyframes[1].time).toBe(5);
  });

  it('start keyframe uses inferred position and lookAt', () => {
    const result = cameraBlockToTracks(makeCameraBlock(), startPos, startLookAt);
    expect(result[0].keyframes[0].position).toEqual([0, 5, 12]);
    expect(result[0].keyframes[0].lookAt).toEqual([0, 1, 0]);
  });

  it('end keyframe uses block.endPosition and endLookAt when provided', () => {
    const result = cameraBlockToTracks(
      makeCameraBlock({ endPosition: [4, 5, 8], endLookAt: [0, 2, 0] }),
      startPos,
      startLookAt,
    );
    expect(result[0].keyframes[1].position).toEqual([4, 5, 8]);
    expect(result[0].keyframes[1].lookAt).toEqual([0, 2, 0]);
  });

  it('end keyframe falls back to inferred start when endPosition is absent', () => {
    const result = cameraBlockToTracks(makeCameraBlock(), startPos, startLookAt);
    expect(result[0].keyframes[1].position).toEqual(startPos);
    expect(result[0].keyframes[1].lookAt).toEqual(startLookAt);
  });

  it('mixes: endPosition provided, endLookAt absent → lookAt held constant', () => {
    const result = cameraBlockToTracks(
      makeCameraBlock({ endPosition: [10, 5, 5] }),
      startPos,
      startLookAt,
    );
    expect(result[0].keyframes[1].position).toEqual([10, 5, 5]);
    expect(result[0].keyframes[1].lookAt).toEqual(startLookAt);
  });
});
