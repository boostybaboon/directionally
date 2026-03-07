import type { Command } from './Command.js';
import type { StoredProduction, StoredActor, StoredScene } from '../storage/types.js';
import type { ScriptLine } from '../../lib/sandbox/types.js';
import type { CameraConfig, Vec3, SetPiece, StagedActor, SpeakAction, CameraTrackAction, PathKeyframe } from '../domain/types.js';
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
      const start = t;
      // Clamp so the next line always starts at least 0.1 s after this one,
      // even when a large negative pauseAfter is used on a short line.
      t = Math.max(start + 0.1, t + estimateDuration(line.text) + line.pauseAfter);
      return {
        type:       'speak',
        actorId:    line.actorId,
        startTime:  start,
        text:       line.text,
        pauseAfter: line.pauseAfter,
      };
    });

    const duration = Math.max(6, t + 1);

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
