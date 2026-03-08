import { Scene } from '../domain/Scene.js';
import { sceneToModel } from '../domain/SceneBridge.js';
import { getById } from '../catalogue/catalogue.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { actorBlockToTracks } from '../domain/blockCompiler.js';
import type { Actor } from '../domain/Production.js';
import type { ActorVoice } from '../domain/types.js';
import type { Model } from '../../lib/Model.js';
import type { StoredScene, StoredActor } from './types.js';

// ── Default voice cycle ───────────────────────────────────────────────────────

const DEFAULT_VOICES: ActorVoice[] = [
  {
    persona: { gender: 'female', accent: 'british', pitch: 0.3, rate: 0 },
    espeak:  { voice: 'en-gb-x-rp+f1', pitch: 60, pitchRange: 63, rate: 160 },
    kokoro:  'af_heart',
  },
  {
    persona: { gender: 'male', accent: 'british', pitch: -0.5, rate: -0.27 },
    espeak:  { voice: 'en-gb-x-rp+m3', pitch: 40, pitchRange: 58, rate: 150 },
    kokoro:  'am_echo',
  },
];

const FALLBACK_GLTF_URL = '/models/gltf/RobotExpressive.glb';

function defaultVoice(index: number): ActorVoice {
  return DEFAULT_VOICES[index % DEFAULT_VOICES.length];
}

/**
 * Deserialise a `StoredScene` + cast into a renderable `Model`.
 *
 * Resolves each `StoredActor` against the bundled catalogue to obtain its
 * GLTF URL and voice, then delegates to `sceneToModel` for the full
 * scene-to-Model conversion (camera, lights, set pieces, actions).
 *
 * Actor IDs in `StoredScene.stagedActors` and `StoredScene.actions` must
 * match `StoredActor.id` — the IDs are not remapped.
 */
export function storedSceneToModel(storedScene: StoredScene, storedActors: StoredActor[]): Model {
  // Resolve stored actors into domain Actor objects.
  // The domain Actor's id must equal StoredActor.id so that all scene
  // references (stagedActors, actions) continue to resolve correctly.
  const actors: Actor[] = storedActors.map((sa, i) => {
    const entry     = getById(sa.catalogueId, CATALOGUE_ENTRIES);
    const character = entry?.kind === 'character' ? entry : undefined;
    return {
      id:    sa.id,
      name:  sa.role,
      asset: { type: 'gltf', url: character?.gltfPath ?? FALLBACK_GLTF_URL },
      voice: defaultVoice(i),
    };
  });

  // Re-hydrate StoreScene into a domain Scene so we can reuse the existing
  // SceneBridge pipeline without duplicating its logic.
  const scene = new Scene('production', {
    duration:        storedScene.duration ?? 10,
    backgroundColor: storedScene.backgroundColor,
  });

  scene.setCamera(storedScene.camera);

  for (const light of storedScene.lights) {
    scene.addLight(light);
  }
  for (const piece of storedScene.set) {
    scene.addSetPiece(piece);
  }
  for (const staged of storedScene.stagedActors) {
    const { actorId, ...opts } = staged;
    scene.stage(actorId, opts);
  }

  // Compile ActorBlocks to tracks and merge with authored actions
  const compiledBlockTracks = (storedScene.blocks ?? [])
    .flatMap((block) => block.type === 'actorBlock' ? actorBlockToTracks(block) : []);

  for (const action of [...storedScene.actions, ...compiledBlockTracks]) {
    scene.addAction(action);
  }

  return sceneToModel(scene, actors);
}
