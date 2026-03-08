import { describe, it, expect } from 'vitest';
import { actorBlockToTracks } from './blockCompiler';
import type { ActorBlock, ClipTrack, TransformTrack } from './types';

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
});
