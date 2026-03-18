import { getById } from '../catalogue/catalogue.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import type { StoredActor, StoredScene, StoredProduction } from './types.js';
import type { StagedActor, ClipTrack, Vec3 } from '../domain/types.js';

const FALLBACK_IDLE_CLIP = 'Idle';

/**
 * Spoken-word duration estimate in seconds.
 * eSpeak synthesises faster than neural — the small constant prevents
 * lines overlapping in the rare case synthesis runs slower than expected.
 */
export function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / 2.5 + 0.3;
}

/** Spread N actors evenly across the X axis; first half face +X, second half -X. */
export function actorPlacement(i: number, total: number): { position: Vec3; rotation: Vec3 } {
  if (total === 1) return { position: [0, 0, 0], rotation: [0, 0, 0] };
  const spread = Math.min(2.5 * (total - 1), 8);
  const x = -(spread / 2) + (spread / (total - 1)) * i;
  const rotation: Vec3 = i < total / 2 ? [0, Math.PI / 2, 0] : [0, -Math.PI / 2, 0];
  return { position: [x, 0, 0], rotation };
}

function idleClipFor(sa: StoredActor): string {
  if (sa.idleAnimation) return sa.idleAnimation;
  const entry     = getById(sa.catalogueId, CATALOGUE_ENTRIES);
  const character = entry?.kind === 'character' ? entry : undefined;
  return character?.defaultAnimation ?? FALLBACK_IDLE_CLIP;
}

function defaultScaleFor(sa: StoredActor): number {
  if (sa.scale !== undefined) return sa.scale;
  const entry     = getById(sa.catalogueId, CATALOGUE_ENTRIES);
  const character = entry?.kind === 'character' ? entry : undefined;
  return character?.defaultScale ?? 1;
}

/**
 * Returns the currently active `StoredScene` from a production.
 * Prefers `scenes[activeSceneId]` when multiple named scenes exist;
 * falls back to the legacy singular `scene` field for older documents.
 */
export function getActiveScene(doc: StoredProduction): StoredScene | undefined {
  if (doc.scenes && doc.scenes.length > 0) {
    const id = doc.activeSceneId ?? doc.scenes[0].id;
    return doc.scenes.find((ns) => ns.id === id)?.scene ?? doc.scenes[0].scene;
  }
  return doc.scene;
}

/**
 * Default scene shell: camera, lights, and a ground plane.
 * Cast and actions are empty — call `restageCast` to populate actors.
 */
export function defaultSceneShell(): StoredScene {
  return {
    camera: { fov: 50, near: 0.1, far: 120, position: [0, 5, 12], lookAt: [0, 1, 0] },
    lights: [
      { type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2, position: [0, 20, 0] },
      { type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [5, 10, 5] },
    ],
    set: [
      {
        name: 'ground',
        geometry: { type: 'plane', width: 30, height: 20 },
        material: { color: 0x888888 },
        rotation: [-Math.PI / 2, 0, 0],
      },
    ],
    stagedActors: [],
    actions: [],
    duration: 6,
  };
}

/**
 * Recompute actor placements and idle animation actions for the whole cast.
 *
 * Replaces ALL looping animate actions (idle loops) and ALL staged-actor entries.
 * Non-looping animate actions (user-authored moves), speak actions, and other
 * action types are preserved unchanged.
 */
export function restageCast(
  actors: StoredActor[],
  scene: StoredScene,
): Pick<StoredScene, 'stagedActors' | 'actions'> {
  const total    = actors.length;
  const duration = scene.duration ?? 6;

  const existingById = new Map(scene.stagedActors.map((s) => [s.actorId, s]));
  const stagedActors: StagedActor[] = actors.map((sa, i) => {
    const existing = existingById.get(sa.id);
    if (existing) return existing;
    const { position, rotation } = actorPlacement(i, total);
    const scale = defaultScaleFor(sa);
    const staged: StagedActor = { actorId: sa.id, startPosition: position, startRotation: rotation };
    if (scale !== 1) staged.startScale = [scale, scale, scale];
    return staged;
  });

  const idleActions: ClipTrack[] = actors.map((sa) => ({
    type:          'animate',
    actorId:       sa.id,
    animationName: idleClipFor(sa),
    startTime:     0,
    // No endTime → end = Infinity → no hard-stop Tone schedule → idle keeps playing
    // through scene end instead of snapping to bind/T-pose when the scheduler fires.
    fadeIn:        0,
    loop:          'repeat',
  }));

  // Preserve speak actions and user-authored (non-looping) animate actions.
  const preserved = scene.actions.filter(
    (a) => a.type === 'speak' || (a.type === 'animate' && a.loop !== 'repeat'),
  );

  return { stagedActors, actions: [...idleActions, ...preserved] };
}
