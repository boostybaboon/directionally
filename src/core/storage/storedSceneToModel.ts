import { Scene } from '../domain/Scene.js';
import { sceneToModel } from '../domain/SceneBridge.js';
import { getById } from '../catalogue/catalogue.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { actorBlockToTracks, lightBlockToTracks, setPieceBlockToTracks, cameraBlockToTracks } from '../domain/blockCompiler.js';
import type { Actor } from '../domain/Production.js';
import type { ActorVoice, ActorBlock, LightBlock, SetPieceBlock, CameraBlock, Vec3 } from '../domain/types.js';
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
      id:             sa.id,
      name:           sa.role,
      asset:          { type: 'gltf', url: character?.gltfPath ?? FALLBACK_GLTF_URL },
      voice:          defaultVoice(i),
      defaultRotation: character?.defaultRotation,
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

  // Compile ActorBlocks to tracks with per-actor inferred-start chains.
  // Sort each actor's blocks by startTime, then thread each block's endPosition
  // forward as the inferred start of the next block for that actor.
  const blocksByActor = new Map<string, ActorBlock[]>();
  for (const block of (storedScene.blocks ?? [])) {
    if (block.type === 'actorBlock') {
      if (!blocksByActor.has(block.actorId)) blocksByActor.set(block.actorId, []);
      blocksByActor.get(block.actorId)!.push(block);
    }
  }

  const compiledBlockTracks: ReturnType<typeof actorBlockToTracks> = [];
  for (const [, blocks] of blocksByActor) {
    blocks.sort((a, b) => a.startTime - b.startTime);
    const staged = storedScene.stagedActors.find((s) => s.actorId === blocks[0].actorId);
    const actor  = actors.find((a) => a.id === blocks[0].actorId);
    let inferredStart: Vec3 | undefined = staged?.startPosition;
    for (const block of blocks) {
      compiledBlockTracks.push(...actorBlockToTracks(block, inferredStart, actor?.defaultRotation));
      inferredStart = block.endPosition ?? inferredStart;
    }
  }

  // Compile LightBlocks to LightingTracks — inferred start from the light's config intensity.
  const lightBlocksByLight = new Map<string, LightBlock[]>();
  for (const block of (storedScene.blocks ?? [])) {
    if (block.type === 'lightBlock') {
      if (!lightBlocksByLight.has(block.lightId)) lightBlocksByLight.set(block.lightId, []);
      lightBlocksByLight.get(block.lightId)!.push(block);
    }
  }
  for (const [lightId, blocks] of lightBlocksByLight) {
    blocks.sort((a, b) => a.startTime - b.startTime);
    const lightCfg = storedScene.lights.find((l) => l.id === lightId);
    let inferredIntensity: number | undefined = lightCfg?.intensity;
    for (const block of blocks) {
      compiledBlockTracks.push(...lightBlockToTracks(block, inferredIntensity));
      inferredIntensity = block.endIntensity ?? inferredIntensity;
    }
  }

  // Compile SetPieceBlocks to TransformTracks — inferred start from the set piece's config.
  const setPieceBlocksByTarget = new Map<string, SetPieceBlock[]>();
  for (const block of (storedScene.blocks ?? [])) {
    if (block.type === 'setPieceBlock') {
      if (!setPieceBlocksByTarget.has(block.targetId)) setPieceBlocksByTarget.set(block.targetId, []);
      setPieceBlocksByTarget.get(block.targetId)!.push(block);
    }
  }
  for (const [targetId, blocks] of setPieceBlocksByTarget) {
    blocks.sort((a, b) => a.startTime - b.startTime);
    const pieceCfg = storedScene.set.find((p) => p.name === targetId);
    let inferredPos: Vec3 = pieceCfg?.position ?? [0, 0, 0];
    let inferredRot: Vec3 = pieceCfg?.rotation ?? [0, 0, 0];
    for (const block of blocks) {
      compiledBlockTracks.push(...setPieceBlockToTracks(block, inferredPos, inferredRot));
      inferredPos = block.endPosition ?? inferredPos;
      inferredRot = block.endRotation ?? inferredRot;
    }
  }

  // Compile CameraBlocks to CameraTrackActions — inferred start from the scene's CameraConfig.
  const cameraBlocks = (storedScene.blocks ?? []).filter((b): b is CameraBlock => b.type === 'cameraBlock');
  if (cameraBlocks.length > 0) {
    cameraBlocks.sort((a, b) => a.startTime - b.startTime);
    let inferredPos: Vec3 = storedScene.camera.position;
    let inferredLookAt: Vec3 = storedScene.camera.lookAt;
    for (const block of cameraBlocks) {
      compiledBlockTracks.push(...cameraBlockToTracks(block, inferredPos, inferredLookAt));
      inferredPos   = block.endPosition ?? inferredPos;
      inferredLookAt = block.endLookAt  ?? inferredLookAt;
    }
  }

  for (const action of [...storedScene.actions, ...compiledBlockTracks]) {
    scene.addAction(action);
  }

  return sceneToModel(scene, actors);
}
