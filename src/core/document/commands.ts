import type { Command } from './Command.js';
import type { StoredProduction, StoredActor, StoredScene } from '../storage/types.js';
import type { ScriptLine } from '../../lib/sandbox/types.js';
import type { CameraConfig, Vec3, SetPiece, StagedActor, SpeakAction, CameraTrackAction, PathKeyframe, ClipTrack, TransformTrack, LightingTrack, LoopStyle, ActorBlock } from '../domain/types.js';
import { restageCast, estimateDuration } from '../storage/sceneBuilder.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function touch(doc: StoredProduction): StoredProduction {
  return { ...doc, modifiedAt: Date.now() };
}

// ── Production-level commands ─────────────────────────────────────────────────

export class RenameProductionCommand implements Command {
  readonly label: string;
  constructor(private readonly name: string) {
    this.label = `Rename to "${name}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    return touch({ ...doc, name: this.name });
  }
}

// ── Actor (cast) commands ─────────────────────────────────────────────────────

export class AddActorCommand implements Command {
  readonly label: string;
  constructor(private readonly actor: StoredActor) {
    this.label = `Add actor "${actor.role}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    const newActors = [...(doc.actors ?? []), this.actor];
    if (!doc.scene) {
      return touch({ ...doc, actors: newActors });
    }
    const { stagedActors, actions } = restageCast(newActors, doc.scene);
    return touch({ ...doc, actors: newActors, scene: { ...doc.scene, stagedActors, actions } });
  }
}

export class RenameActorCommand implements Command {
  readonly label: string;
  constructor(private readonly actorId: string, private readonly name: string) {
    this.label = `Rename actor to "${name}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    return touch({
      ...doc,
      actors: (doc.actors ?? []).map((a) =>
        a.id === this.actorId ? { ...a, role: this.name } : a
      ),
    });
  }
}

export class RemoveActorCommand implements Command {
  readonly label: string;
  constructor(private readonly actorId: string) {
    this.label = 'Remove actor';
  }
  execute(doc: StoredProduction): StoredProduction {
    return touch({
      ...doc,
      actors: (doc.actors ?? []).filter((a) => a.id !== this.actorId),
      // Remove script lines that reference the deleted actor.
      script: (doc.script ?? []).filter((l) => l.actorId !== this.actorId),
      // Remove the actor from the staged cast if a scene is present.
      scene: doc.scene ? {
        ...doc.scene,
        stagedActors: doc.scene.stagedActors.filter((s) => s.actorId !== this.actorId),
        actions:      doc.scene.actions.filter((a) =>
          !('actorId' in a) || (a as { actorId: string }).actorId !== this.actorId
        ),
      } : doc.scene,
    });
  }
}

// ── Script commands ───────────────────────────────────────────────────────────

export class AddScriptLineCommand implements Command {
  readonly label = 'Add line';
  constructor(private readonly line: ScriptLine) {}
  execute(doc: StoredProduction): StoredProduction {
    return touch({ ...doc, script: [...(doc.script ?? []), this.line] });
  }
}

export class UpdateScriptLineCommand implements Command {
  readonly label: string;
  constructor(private readonly index: number, private readonly patch: Partial<ScriptLine>) {
    this.label = `Update line ${index + 1}`;
  }
  execute(doc: StoredProduction): StoredProduction {
    const script = (doc.script ?? []).map((line, i) =>
      i === this.index ? { ...line, ...this.patch } : line
    );
    return touch({ ...doc, script });
  }
}

export class DeleteScriptLineCommand implements Command {
  readonly label: string;
  constructor(private readonly index: number) {
    this.label = `Delete line ${index + 1}`;
  }
  execute(doc: StoredProduction): StoredProduction {
    return touch({ ...doc, script: (doc.script ?? []).filter((_, i) => i !== this.index) });
  }
}

export class SetScriptCommand implements Command {
  readonly label = 'Set script';
  constructor(private readonly script: ScriptLine[]) {}
  execute(doc: StoredProduction): StoredProduction {
    return touch({ ...doc, script: [...this.script] });
  }
}

/**
 * Update the scene's dialogue from the script-editor line list.
 *
 * When the production has a `scene`, speak actions are recomputed with fresh
 * startTimes (accumulated estimate + pauseAfter) and replace all existing
 * speak actions. Looping idle animations are stretched to the new duration.
 * The legacy `script` field is also kept in sync for the fallback path.
 */
export class SetSpeakLinesCommand implements Command {
  readonly label = 'Set dialogue';
  constructor(private readonly lines: ScriptLine[]) {}
  execute(doc: StoredProduction): StoredProduction {
    const newScript = [...this.lines];

    if (!doc.scene) {
      return touch({ ...doc, script: newScript });
    }

    const active = this.lines.filter((l) => l.text.trim().length > 0);
    let t = 1.0;
    const speakActions: SpeakAction[] = active.map((line) => {
      const start = line.startTime ?? t;
      // Clamp so the next line always starts at least 0.1 s after this one,
      // even when a large negative pauseAfter is used on a short line.
      t = Math.max(start + 0.1, start + estimateDuration(line.text) + line.pauseAfter);
      return {
        type:       'speak',
        actorId:    line.actorId,
        startTime:  start,
        text:       line.text,
        pauseAfter: line.pauseAfter,
      };
    });

    const duration = Math.max(doc.scene.duration ?? 6, t + 1);

    // Preserve non-speak actions. Looping idle animate actions intentionally have
    // no endTime (→ Infinity in GLTFAction) so no Tone hard-stop schedule fires and
    // the actor holds its idle pose through scene end instead of snapping to T-pose.
    const nonSpeak = doc.scene.actions.filter((a) => a.type !== 'speak');

    return touch({
      ...doc,
      script: newScript,
      scene: { ...doc.scene, duration, actions: [...nonSpeak, ...speakActions] },
    });
  }
}

// ── Scene-level commands ──────────────────────────────────────────────────────

/**
 * Replace the scene camera configuration.
 * No-op when no scene is present on the document.
 */
export class UpdateCameraCommand implements Command {
  readonly label = 'Update camera';
  constructor(private readonly camera: CameraConfig) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    return touch({ ...doc, scene: { ...doc.scene, camera: this.camera } });
  }
}

/**
 * Add a set piece to the scene.
 * No-op when no scene is present.
 */
export class AddSetPieceCommand implements Command {
  readonly label: string;
  constructor(private readonly piece: SetPiece) {
    this.label = `Add set piece "${piece.name}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    return touch({ ...doc, scene: { ...doc.scene, set: [...doc.scene.set, this.piece] } });
  }
}

/**
 * Remove a set piece from the scene by name.
 * No-op when no scene is present.
 */
export class RemoveSetPieceCommand implements Command {
  readonly label: string;
  constructor(private readonly name: string) {
    this.label = `Remove set piece "${name}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    return touch({ ...doc, scene: { ...doc.scene, set: doc.scene.set.filter((p) => p.name !== this.name) } });
  }
}

/**
 * Add or update a staged actor entry in the scene.
 * When the actorId is already staged, replaces the existing entry.
 * No-op when no scene is present.
 */
export class StageActorCommand implements Command {
  readonly label: string;
  constructor(private readonly staged: StagedActor) {
    this.label = `Stage actor "${staged.actorId}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const others = doc.scene.stagedActors.filter((s) => s.actorId !== this.staged.actorId);
    return touch({ ...doc, scene: { ...doc.scene, stagedActors: [...others, this.staged] } });
  }
}

/**
 * Remove a staged actor entry from the scene.
 * No-op when no scene is present.
 */
export class UnstageActorCommand implements Command {
  readonly label: string;
  constructor(private readonly actorId: string) {
    this.label = `Unstage actor "${actorId}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    return touch({ ...doc, scene: {
      ...doc.scene,
      stagedActors: doc.scene.stagedActors.filter((s) => s.actorId !== this.actorId),
    } });
  }
}

/**
 * Update a staged actor's startPosition and optionally startRotation.
 * No-op when the actor is not staged or no scene is present.
 */
export class MoveStagedActorCommand implements Command {
  readonly label: string;
  constructor(
    private readonly actorId: string,
    private readonly position: Vec3,
    private readonly rotation?: Vec3,
  ) {
    this.label = `Move actor "${actorId}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const stagedActors = doc.scene.stagedActors.map((s) =>
      s.actorId === this.actorId
        ? { ...s, startPosition: this.position, ...(this.rotation !== undefined ? { startRotation: this.rotation } : {}) }
        : s
    );
    return touch({ ...doc, scene: { ...doc.scene, stagedActors } });
  }
}

/**
 * Update a set piece's position and optionally rotation.
 * No-op when the piece is not found or no scene is present.
 */
export class MoveSetPieceCommand implements Command {
  readonly label: string;
  constructor(
    private readonly name: string,
    private readonly position: Vec3,
    private readonly rotation?: Vec3,
  ) {
    this.label = `Move set piece "${name}"`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const set = doc.scene.set.map((p) =>
      p.name === this.name
        ? { ...p, position: this.position, ...(this.rotation !== undefined ? { rotation: this.rotation } : {}) }
        : p
    );
    return touch({ ...doc, scene: { ...doc.scene, set } });
  }
}

// ── Camera track commands ─────────────────────────────────────────────────────

/**
 * Upsert a keyframe in the scene's CameraTrackAction at the given time.
 * If a keyframe within 50ms already exists at that time it is replaced;
 * otherwise the new keyframe is inserted in time-sorted order.
 * Creates the CameraTrackAction in `scene.actions` if none exists yet.
 */
export class AddCameraKeyframeCommand implements Command {
  readonly label: string;
  constructor(
    private readonly time: number,
    private readonly position: Vec3,
    private readonly lookAt: Vec3,
  ) {
    this.label = `Add camera keyframe at ${time.toFixed(1)}s`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const newKf: PathKeyframe = { time: this.time, position: this.position, lookAt: this.lookAt };
    const trackIdx = doc.scene.actions.findIndex((a) => a.type === 'cameraTrack');
    let newActions: typeof doc.scene.actions;
    if (trackIdx >= 0) {
      const existing = doc.scene.actions[trackIdx] as CameraTrackAction;
      const filtered = existing.keyframes.filter((k) => Math.abs(k.time - this.time) > 0.05);
      const sorted = [...filtered, newKf].sort((a, b) => a.time - b.time);
      const updated: CameraTrackAction = { type: 'cameraTrack', keyframes: sorted };
      newActions = [
        ...doc.scene.actions.slice(0, trackIdx),
        updated,
        ...doc.scene.actions.slice(trackIdx + 1),
      ];
    } else {
      const track: CameraTrackAction = { type: 'cameraTrack', keyframes: [newKf] };
      newActions = [...doc.scene.actions, track];
    }
    return touch({ ...doc, scene: { ...doc.scene, actions: newActions } });
  }
}

/**
 * Remove the keyframe at `index` (0-based) from the CameraTrackAction.
 * Removes the entire CameraTrackAction when no keyframes remain.
 */
export class RemoveCameraKeyframeCommand implements Command {
  readonly label = 'Remove camera keyframe';
  constructor(private readonly index: number) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const trackIdx = doc.scene.actions.findIndex((a) => a.type === 'cameraTrack');
    if (trackIdx < 0) return doc;
    const track = doc.scene.actions[trackIdx] as CameraTrackAction;
    const newKeyframes = track.keyframes.filter((_, i) => i !== this.index);
    const newActions: typeof doc.scene.actions = newKeyframes.length === 0
      ? doc.scene.actions.filter((_, i) => i !== trackIdx)
      : [
          ...doc.scene.actions.slice(0, trackIdx),
          { type: 'cameraTrack' as const, keyframes: newKeyframes },
          ...doc.scene.actions.slice(trackIdx + 1),
        ];
    return touch({ ...doc, scene: { ...doc.scene, actions: newActions } });
  }
}

// ── Scene duration command ─────────────────────────────────────────────────────

/**
 * Set (or clear) an explicit scene duration override for the transport timeline.
 * Pass `undefined` to revert to auto-computed duration.
 */
export class SetSceneDurationCommand implements Command {
  readonly label: string;
  constructor(private readonly duration: number | undefined) {
    this.label = duration === undefined ? 'Clear scene duration' : `Set scene duration to ${duration.toFixed(1)}s`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const { duration: _removed, ...rest } = doc.scene;
    const newScene = this.duration !== undefined ? { ...rest, duration: this.duration } : rest;
    return touch({ ...doc, scene: newScene as StoredScene });
  }
}

// ── Animate-segment commands (Surface A — GLTF clip sequencer) ────────────────

/**
 * Append a new ClipTrack (GLTF clip segment) to the scene action list.
 */
export class AddAnimateSegmentCommand implements Command {
  readonly label: string;
  constructor(private readonly segment: ClipTrack) {
    this.label = `Add clip "${segment.animationName}" for ${segment.actorId}`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    return touch({ ...doc, scene: { ...doc.scene, actions: [...doc.scene.actions, this.segment] } });
  }
}

/**
 * Remove the ClipTrack at `index` (position in `scene.actions`).
 */
export class RemoveAnimateSegmentCommand implements Command {
  readonly label = 'Remove clip segment';
  constructor(private readonly index: number) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    return touch({ ...doc, scene: { ...doc.scene, actions: doc.scene.actions.filter((_, i) => i !== this.index) } });
  }
}

/**
 * Patch fields on the ClipTrack at `index` (position in `scene.actions`).
 * Only the provided fields in `patch` are changed; others are preserved.
 */
export class UpdateAnimateSegmentCommand implements Command {
  readonly label = 'Update clip segment';
  constructor(
    private readonly index: number,
    private readonly patch: Partial<Pick<ClipTrack, 'animationName' | 'startTime' | 'endTime' | 'fadeIn' | 'fadeOut' | 'loop'>>,
  ) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const action = doc.scene.actions[this.index];
    if (!action || action.type !== 'animate') return doc;
    const updated: ClipTrack = { ...action, ...this.patch };
    const newActions = [
      ...doc.scene.actions.slice(0, this.index),
      updated,
      ...doc.scene.actions.slice(this.index + 1),
    ];
    return touch({ ...doc, scene: { ...doc.scene, actions: newActions } });
  }
}

// ── Transform-keyframe commands (Surface B — scrub-and-capture) ───────────────

/** Number of value components per keyframe for each Three.js track type. */
function trackStride(trackType: 'number' | 'vector' | 'quaternion'): number {
  if (trackType === 'vector') return 3;
  if (trackType === 'quaternion') return 4;
  return 1;
}

/**
 * Upsert a position keyframe (`.position` vector track) for `targetId` at `time`.
 * Replaces any existing keyframe within 50 ms of `time`.
 * Creates the TransformTrack if it does not yet exist.
 */
export class CapturePositionKeyframeCommand implements Command {
  readonly label: string;
  constructor(
    private readonly targetId: string,
    private readonly time: number,
    private readonly position: [number, number, number],
  ) {
    this.label = `Capture position keyframe for ${targetId} at ${time.toFixed(1)}s`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const SNAP = 0.05;
    const property = '.position';
    const moveIdx = doc.scene.actions.findIndex(
      (a) => a.type === 'move' && (a as TransformTrack).targetId === this.targetId && (a as TransformTrack).keyframes.property === property,
    );
    if (moveIdx >= 0) {
      const existing = doc.scene.actions[moveIdx] as TransformTrack;
      const pairs: { time: number; vals: number[] }[] = [];
      for (let i = 0; i < existing.keyframes.times.length; i++) {
        if (Math.abs(existing.keyframes.times[i] - this.time) > SNAP) {
          pairs.push({ time: existing.keyframes.times[i], vals: existing.keyframes.values.slice(i * 3, i * 3 + 3) });
        }
      }
      pairs.push({ time: this.time, vals: [...this.position] });
      pairs.sort((a, b) => a.time - b.time);
      const updated: TransformTrack = {
        ...existing,
        keyframes: { ...existing.keyframes, times: pairs.map((p) => p.time), values: pairs.flatMap((p) => p.vals) },
      };
      return touch({ ...doc, scene: { ...doc.scene, actions: [...doc.scene.actions.slice(0, moveIdx), updated, ...doc.scene.actions.slice(moveIdx + 1)] } });
    }
    const newAction: TransformTrack = {
      type: 'move', targetId: this.targetId, startTime: 0,
      keyframes: { property, times: [this.time], values: [...this.position], trackType: 'vector' },
    };
    return touch({ ...doc, scene: { ...doc.scene, actions: [...doc.scene.actions, newAction] } });
  }
}

/**
 * Remove a single keyframe at `kfIndex` from the TransformTrack for `targetId` / `property`.
 * Removes the entire TransformTrack when no keyframes remain.
 */
export class RemoveTransformKeyframeCommand implements Command {
  readonly label = 'Remove transform keyframe';
  constructor(
    private readonly targetId: string,
    private readonly property: string,
    private readonly kfIndex: number,
  ) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const moveIdx = doc.scene.actions.findIndex(
      (a) => a.type === 'move' && (a as TransformTrack).targetId === this.targetId && (a as TransformTrack).keyframes.property === this.property,
    );
    if (moveIdx < 0) return doc;
    const existing = doc.scene.actions[moveIdx] as TransformTrack;
    const stride = trackStride(existing.keyframes.trackType);
    const newTimes = existing.keyframes.times.filter((_, i) => i !== this.kfIndex);
    const newValues = existing.keyframes.values.filter((_, i) => Math.floor(i / stride) !== this.kfIndex);
    const newActions = newTimes.length === 0
      ? doc.scene.actions.filter((_, i) => i !== moveIdx)
      : [
          ...doc.scene.actions.slice(0, moveIdx),
          { ...existing, keyframes: { ...existing.keyframes, times: newTimes, values: newValues } } as TransformTrack,
          ...doc.scene.actions.slice(moveIdx + 1),
        ];
    return touch({ ...doc, scene: { ...doc.scene, actions: newActions } });
  }
}

// ── Light-keyframe commands (Surface C — scalar keyframe editor) ──────────────

/**
 * Upsert a light intensity keyframe (`.intensity` scalar track) for `lightId` at `time`.
 * Replaces any existing keyframe within 50 ms of `time`.
 * Creates the LightingTrack if it does not yet exist.
 */
export class CaptureLightIntensityKeyframeCommand implements Command {
  readonly label: string;
  constructor(
    private readonly lightId: string,
    private readonly time: number,
    private readonly intensity: number,
  ) {
    this.label = `Capture light intensity keyframe for ${lightId} at ${time.toFixed(1)}s`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const SNAP = 0.05;
    const property = '.intensity';
    const lightIdx = doc.scene.actions.findIndex(
      (a) => a.type === 'lighting' && (a as LightingTrack).lightId === this.lightId && (a as LightingTrack).keyframes.property === property,
    );
    if (lightIdx >= 0) {
      const existing = doc.scene.actions[lightIdx] as LightingTrack;
      const pairs: { time: number; val: number }[] = [];
      for (let i = 0; i < existing.keyframes.times.length; i++) {
        if (Math.abs(existing.keyframes.times[i] - this.time) > SNAP) {
          pairs.push({ time: existing.keyframes.times[i], val: existing.keyframes.values[i] });
        }
      }
      pairs.push({ time: this.time, val: this.intensity });
      pairs.sort((a, b) => a.time - b.time);
      const updated: LightingTrack = {
        ...existing,
        keyframes: { ...existing.keyframes, times: pairs.map((p) => p.time), values: pairs.map((p) => p.val) },
      };
      return touch({ ...doc, scene: { ...doc.scene, actions: [...doc.scene.actions.slice(0, lightIdx), updated, ...doc.scene.actions.slice(lightIdx + 1)] } });
    }
    const newAction: LightingTrack = {
      type: 'lighting', lightId: this.lightId, startTime: 0,
      keyframes: { property, times: [this.time], values: [this.intensity], trackType: 'number' },
    };
    return touch({ ...doc, scene: { ...doc.scene, actions: [...doc.scene.actions, newAction] } });
  }
}

/**
 * Remove a single keyframe at `kfIndex` from the LightingTrack for `lightId` / `property`.
 * Removes the entire LightingTrack when no keyframes remain.
 */
export class RemoveLightKeyframeCommand implements Command {
  readonly label = 'Remove light keyframe';
  constructor(
    private readonly lightId: string,
    private readonly property: string,
    private readonly kfIndex: number,
  ) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const lightIdx = doc.scene.actions.findIndex(
      (a) => a.type === 'lighting' && (a as LightingTrack).lightId === this.lightId && (a as LightingTrack).keyframes.property === this.property,
    );
    if (lightIdx < 0) return doc;
    const existing = doc.scene.actions[lightIdx] as LightingTrack;
    const newTimes = existing.keyframes.times.filter((_, i) => i !== this.kfIndex);
    const newValues = existing.keyframes.values.filter((_, i) => i !== this.kfIndex);
    const newActions = newTimes.length === 0
      ? doc.scene.actions.filter((_, i) => i !== lightIdx)
      : [
          ...doc.scene.actions.slice(0, lightIdx),
          { ...existing, keyframes: { ...existing.keyframes, times: newTimes, values: newValues } } as LightingTrack,
          ...doc.scene.actions.slice(lightIdx + 1),
        ];
    return touch({ ...doc, scene: { ...doc.scene, actions: newActions } });
  }
}

// ── Per-actor configuration commands ─────────────────────────────────────────

/**
 * Set (or clear) the idle animation clip for an actor.
 * Rebuilds idle actions in the scene so the change takes effect immediately.
 * Pass `undefined` to revert to the catalogue default.
 */
export class SetActorIdleAnimationCommand implements Command {
  readonly label: string;
  constructor(private readonly actorId: string, private readonly idleAnimation: string | undefined) {
    this.label = idleAnimation
      ? `Set idle clip for actor to "${idleAnimation}"`
      : `Reset idle clip for actor`;
  }
  execute(doc: StoredProduction): StoredProduction {
    const actors = doc.actors?.map((a) =>
      a.id === this.actorId ? { ...a, idleAnimation: this.idleAnimation } : a,
    );
    if (!actors) return doc;
    if (!doc.scene) return touch({ ...doc, actors });
    const { stagedActors, actions } = restageCast(actors, doc.scene);
    return touch({ ...doc, actors, scene: { ...doc.scene, stagedActors, actions } });
  }
}

/**
 * Set (or clear) the uniform scale override for an actor.
 * Directly patches the staged actor's startScale so it applies on the next load.
 * Pass `undefined` to revert to the catalogue default scale.
 */
export class SetActorScaleCommand implements Command {
  readonly label: string;
  constructor(private readonly actorId: string, private readonly scale: number | undefined) {
    this.label = scale !== undefined
      ? `Set scale for actor to ${scale.toFixed(2)}`
      : `Reset scale for actor`;
  }
  execute(doc: StoredProduction): StoredProduction {
    const actors = doc.actors?.map((a) =>
      a.id === this.actorId ? { ...a, scale: this.scale } : a,
    );
    if (!actors) return doc;
    if (!doc.scene) return touch({ ...doc, actors });
    const scaleVec: Vec3 | undefined =
      this.scale !== undefined ? [this.scale, this.scale, this.scale] : undefined;
    const stagedActors = doc.scene.stagedActors.map((sa) => {
      if (sa.actorId !== this.actorId) return sa;
      if (scaleVec) return { ...sa, startScale: scaleVec };
      const { startScale: _removed, ...rest } = sa;
      return rest;
    });
    return touch({ ...doc, actors, scene: { ...doc.scene, stagedActors } });
  }
}

// ── ActorBlock commands (Phase 8.5 — high-level authored blocks) ──────────────────

/**
 * Append a new `ActorBlock` to `scene.blocks`.
 * Blocks are compiled to Tracks at load time by `storedSceneToModel`.
 */
export class AddActorBlockCommand implements Command {
  readonly label: string;
  constructor(private readonly block: ActorBlock) {
    this.label = `Add block for ${block.actorId} at ${block.startTime.toFixed(1)}s`;
  }
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const blocks = [...(doc.scene.blocks ?? []), this.block];
    return touch({ ...doc, scene: { ...doc.scene, blocks } });
  }
}

/**
 * Remove the `ActorBlock` at `index` from `scene.blocks`.
 */
export class RemoveActorBlockCommand implements Command {
  readonly label = 'Remove actor block';
  constructor(private readonly index: number) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const blocks = (doc.scene.blocks ?? []).filter((_, i) => i !== this.index);
    return touch({ ...doc, scene: { ...doc.scene, blocks } });
  }
}

/**
 * Patch fields on the `ActorBlock` at `index`.
 * Only the provided keys in `patch` are changed; others are preserved.
 */
export class UpdateActorBlockCommand implements Command {
  readonly label = 'Update actor block';
  constructor(
    private readonly index: number,
    private readonly patch: Partial<Omit<ActorBlock, 'type'>>,
  ) {}
  execute(doc: StoredProduction): StoredProduction {
    if (!doc.scene) return doc;
    const blocks = doc.scene.blocks ?? [];
    const block = blocks[this.index];
    if (!block || block.type !== 'actorBlock') return doc;
    const updated: ActorBlock = { ...block, ...this.patch };
    const newBlocks = [
      ...blocks.slice(0, this.index),
      updated,
      ...blocks.slice(this.index + 1),
    ];
    return touch({ ...doc, scene: { ...doc.scene, blocks: newBlocks } });
  }
}
