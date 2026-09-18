import { Scene } from '../domain/Scene.js';
import { sceneToModel } from '../domain/SceneBridge.js';
import { getById } from '../catalogue/catalogue.js';
import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { resolveInstances } from '../setting/settingSpec.js';
import type { CatalogueEntry } from '../catalogue/types.js';
import type { CharacterSpec } from '../character/characterSpec.js';
import { specCharacterToGlbUrl } from '../character/specCharacter.js';
import { realiseDocument } from '../sketcher/realise.js';
import { collectLights } from '../sketcher/documentTree.js';
import type { SetDocument } from '../sketcher/documentTree.js';
import * as OPFSCatalogueStore from './OPFSCatalogueStore.js';
import { actorBlockToTracks, lightBlockToTracks, setPieceBlockToTracks, cameraBlockToTracks } from '../domain/blockCompiler.js';
import type { Actor } from '../domain/Production.js';
import type { ActorVoice, ActorBlock, LightBlock, SetPieceBlock, CameraBlock, Vec3, SceneAction, SetPiece, LightConfig } from '../domain/types.js';
import type { Model } from '../../lib/Model.js';
import type * as THREE from 'three';
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
 *
 * Pass `userEntries` to look up user-added characters by catalogueId and to supply
 * the tree documents (`document`) that saved sets are realised from. Bundled set
 * pieces carry their document on the entry itself.
 */
/** Loose user-entry shape sufficient for actor/character resolution. */
type UserEntryLike = {
  id: string;
  gltfPath?: string;
  kind?: string;
  defaultAnimation?: string;
  defaultRotation?: [number, number, number];
  spec?: CharacterSpec;
  /** Set on a sketcher-authored set — its `document` is what the renderer needs. */
  hasDocument?: boolean;
  /** The entry's tree document, attached by whoever materialised the entry. */
  document?: SetDocument;
};

/**
 * Realise every set-piece into a pre-built object tree, keyed by piece name. A
 * piece is realised from the tree document of the entry it names
 * (`piece.catalogueId`) — bundled definitions carry it inline, a saved set has it
 * attached by whoever materialised the entry list. A piece whose entry (or
 * document) is missing yields nothing, so it falls back to the placeholder
 * geometry the resolver gave it.
 */
function realiseDocumentSets(
  pieces: SetPiece[],
  entries: CatalogueEntry[],
): Map<string, THREE.Object3D> {
  const groups = new Map<string, THREE.Object3D>();
  for (const piece of pieces) {
    if (!piece.catalogueId) continue;
    const entry = getById(piece.catalogueId, entries);
    const document = entry?.kind === 'set-piece' ? entry.document : undefined;
    if (!document) {
      console.warn(`storedSceneToModel: no document for catalogue piece "${piece.catalogueId}" — rendering placeholder geometry`);
      continue;
    }
    groups.set(piece.name, realiseDocument(document));
  }
  return groups;
}

export function storedSceneToModel(
  storedScene: StoredScene,
  storedActors: StoredActor[],
  userEntries: UserEntryLike[] = [],
): Model {
  // Resolve stored actors into domain Actor objects.
  // The domain Actor's id must equal StoredActor.id so that all scene
  // references (stagedActors, actions) continue to resolve correctly.
  const characterEntries = new Map<string, { defaultAnimation?: string }>();
  const actors: Actor[] = storedActors.map((sa, i) => {
    const bundledEntry = getById(sa.catalogueId, CATALOGUE_ENTRIES);
    const userEntry    = userEntries.find((e) => e.id === sa.catalogueId && e.kind === 'character');
    const character    = bundledEntry?.kind === 'character' ? bundledEntry : undefined;
    const resolvedUrl  = character?.gltfPath ?? userEntry?.gltfPath ?? FALLBACK_GLTF_URL;
    const resolvedDefaultAnimation = character?.defaultAnimation ?? userEntry?.defaultAnimation;
    const resolvedDefaultRotation  = character?.defaultRotation  ?? userEntry?.defaultRotation;
    if (resolvedDefaultAnimation) characterEntries.set(sa.id, { defaultAnimation: resolvedDefaultAnimation });
    return {
      id:             sa.id,
      name:           sa.role,
      asset:          { type: 'gltf', url: resolvedUrl },
      voice:          sa.voice ?? defaultVoice(i),
      defaultRotation: resolvedDefaultRotation,
      tint:           sa.tint,
      placeholder:    sa.placeholder,
    };

  });

  // Expand any `ref` (Instance) pieces into their rendered children before the scene
  // assembly below — flattening happens here, at render time, never persisted back
  // onto the stored scene.
  const mergedCatalogueEntries = [...CATALOGUE_ENTRIES, ...(userEntries as unknown as CatalogueEntry[])];
  const resolvedSet = resolveInstances(storedScene.set, mergedCatalogueEntries);

  // A setting's lighting and environment belong to its document, so they arrive with
  // the same documents the geometry is realised from. The scene keeps its own: an
  // explicit `environmentMap` wins over the setting's, and both light lists are added.
  const settingLights: LightConfig[] = [];
  let settingEnvironment: string | undefined;
  for (const piece of resolvedSet) {
    if (!piece.catalogueId) continue;
    const entry = getById(piece.catalogueId, mergedCatalogueEntries);
    const document = entry?.kind === 'set-piece' ? entry.document : undefined;
    if (!document) continue;
    settingLights.push(...collectLights(document));
    settingEnvironment ??= document.environmentMap;
  }

  // Re-hydrate StoreScene into a domain Scene so we can reuse the existing
  // SceneBridge pipeline without duplicating its logic.
  const scene = new Scene('production', {
    duration:           storedScene.duration ?? 10,
    backgroundColor:    storedScene.backgroundColor,
    environmentMap:     storedScene.environmentMap ?? settingEnvironment,
    placeholderSetting: storedScene.placeholderSetting,
  });

  scene.setCamera(storedScene.camera);

  for (const light of [...storedScene.lights, ...settingLights]) {
    scene.addLight(light);
  }
  for (const piece of resolvedSet) {
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
    // A light is either the scene's own or a setting's (resolved above), and both are in
    // the domain Scene by now, so the config lookup runs against that one list.
    const lightCfg = scene.lights.find((l) => l.id === lightId);
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

  // Default idle animations: fill gaps between authored blocks for each actor.
  // A single full-scene idle track would blend with and visually override any authored
  // clip (e.g. Walking) because the mixer sums weights — idle must not cover block windows.
  const defaultIdleTracks: SceneAction[] = [];
  const sceneDuration = storedScene.duration ?? 10;
  for (const staged of storedScene.stagedActors) {
    const idleClip = characterEntries.get(staged.actorId)?.defaultAnimation;
    if (!idleClip) continue;

    // Collect all clip-bearing block windows for this actor (blocks that set a clip).
    const clipWindows = (storedScene.blocks ?? [])
      .filter((b): b is ActorBlock =>
        b.type === 'actorBlock' && b.actorId === staged.actorId && !!b.clip
      )
      .sort((a, b) => a.startTime - b.startTime);

    if (clipWindows.length === 0) {
      // No authored clips — single full-scene idle is safe.
      defaultIdleTracks.push({
        type: 'animate',
        actorId: staged.actorId,
        animationName: idleClip,
        startTime: 0,
        endTime: sceneDuration,
        loop: 'repeat',
      });
      continue;
    }

    // Emit idle segments only in the gaps: before the first block, between blocks,
    // and after the last block.
    const gapStarts = [0, ...clipWindows.map((b) => b.endTime)];
    const gapEnds   = [...clipWindows.map((b) => b.startTime), sceneDuration];
    for (let i = 0; i < gapStarts.length; i++) {
      const gapStart = gapStarts[i];
      const gapEnd   = gapEnds[i];
      if (gapEnd - gapStart > 0.05) {
        defaultIdleTracks.push({
          type: 'animate',
          actorId: staged.actorId,
          animationName: idleClip,
          startTime: gapStart,
          endTime: gapEnd,
          loop: 'repeat',
        });
      }
    }
  }

  for (const action of [...storedScene.actions, ...defaultIdleTracks, ...compiledBlockTracks]) {
    scene.addAction(action);
  }

  return sceneToModel(scene, actors, realiseDocumentSets(resolvedSet, mergedCatalogueEntries));
}

/**
 * Async variant of `storedSceneToModel` that first materialises anything the
 * renderer can't read straight from the metadata index, then delegates to the
 * synchronous deserialiser unchanged:
 *
 *   - spec-backed characters (ROADMAP_API.md API-2) become a GLB blob URL;
 *   - document-backed sets gain their tree document, loaded from OPFS, which
 *     `storedSceneToModel` realises into a pre-built object tree (step 5).
 */
export async function storedSceneToModelAsync(
  storedScene: StoredScene,
  storedActors: StoredActor[],
  userEntries: UserEntryLike[] = [],
): Promise<Model> {
  const materialised = await Promise.all(
    userEntries.map(async (e) => {
      if (e.kind === 'character' && e.spec && !e.gltfPath) {
        try {
          return { ...e, gltfPath: await specCharacterToGlbUrl(e.spec), spec: undefined };
        } catch (err) {
          console.error('Failed to build spec-backed character', e.id, err);
          return e; // fall through to the placeholder GLB
        }
      }
      if (e.hasDocument) {
        const document = await OPFSCatalogueStore.getDocument(e.id);
        if (document) return { ...e, document };
      }
      return e;
    }),
  );
  return storedSceneToModel(storedScene, storedActors, materialised);
}
