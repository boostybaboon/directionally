import { Production } from '../../core/domain/Production.js';
import { sceneToModel } from '../../core/domain/SceneBridge.js';
import { getById } from '../../core/catalogue/catalogue.js';
import { CATALOGUE_ENTRIES } from '../../core/catalogue/entries.js';
import { actorPlacement, estimateDuration } from '../../core/storage/sceneBuilder.js';
import type { ActorVoice } from '../../core/domain/types.js';
import type { StoredActor } from '../../core/storage/types.js';
import type { Model } from '../Model.js';
import type { ScriptLine } from './types.js';

// ── Default voices — index cycles for casts larger than 2 ────────────────────

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
const FALLBACK_IDLE_CLIP = 'Idle';

function defaultVoice(index: number): ActorVoice {
  return DEFAULT_VOICES[index % DEFAULT_VOICES.length];
}

/**
 * Compile a flat list of ScriptLines into a playable Model.
 *
 * When storedActors is provided, characters are resolved from the catalogue and
 * placed automatically. When absent, falls back to the legacy hardcoded alpha/beta
 * pair for backward compatibility with pre-5a productions.
 */
export function scriptToModel(lines: ScriptLine[], storedActors?: StoredActor[]): Model {
  const production = new Production('Sandbox');

  // ── Resolve cast ──────────────────────────────────────────────────────────

  type ResolvedActor = { storedId: string; domainId: string; idleClip: string };
  let resolved: ResolvedActor[];

  if (storedActors && storedActors.length > 0) {
    resolved = storedActors.map((sa, i) => {
      const entry     = getById(sa.catalogueId, CATALOGUE_ENTRIES);
      const character = entry?.kind === 'character' ? entry : undefined;
      const gltfUrl   = character?.gltfPath        ?? FALLBACK_GLTF_URL;
      const idleClip  = character?.defaultAnimation ?? FALLBACK_IDLE_CLIP;
      const actor     = production.addActor(sa.role, { type: 'gltf', url: gltfUrl }, { voice: defaultVoice(i) });
      return { storedId: sa.id, domainId: actor.id, idleClip };
    });
  } else {
    // Legacy: two RobotExpressive robots with fixed voices.
    const alpha = production.addActor('Alpha', { type: 'gltf', url: FALLBACK_GLTF_URL }, { voice: defaultVoice(0) });
    const beta  = production.addActor('Beta',  { type: 'gltf', url: FALLBACK_GLTF_URL }, { voice: defaultVoice(1) });
    resolved = [
      { storedId: 'alpha', domainId: alpha.id, idleClip: FALLBACK_IDLE_CLIP },
      { storedId: 'beta',  domainId: beta.id,  idleClip: FALLBACK_IDLE_CLIP },
    ];
  }

  const actorMap = new Map(resolved.map((a) => [a.storedId, a]));

  // ── Sequence speech lines ─────────────────────────────────────────────────

  const speakLines = lines.filter((l) => l.text.trim().length > 0 && actorMap.has(l.actorId));
  let t = 1.0;

  const speakActions = speakLines.map((line) => {
    const start = t;
    t += estimateDuration(line.text) + line.pauseAfter;
    return { domainId: actorMap.get(line.actorId)!.domainId, start, text: line.text };
  });

  const duration = Math.max(6, t + 1);

  // ── Build scene ───────────────────────────────────────────────────────────

  const act = production.addGroup('Act 1');
  const scene = act.addScene('Sandbox', { duration });

  scene
    .setCamera({ fov: 50, near: 0.1, far: 120, position: [0, 5, 12], lookAt: [0, 1, 0] })
    .addLight({ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 2, position: [0, 20, 0] })
    .addLight({ type: 'directional', id: 'sun', color: 0xffffff, intensity: 1, position: [5, 10, 5] })
    .addSetPiece({
      name: 'ground',
      geometry: { type: 'plane', width: 30, height: 20 },
      material: { color: 0x888888 },
      rotation: [-Math.PI / 2, 0, 0],
    });

  const n = resolved.length;
  for (const [i, actor] of resolved.entries()) {
    const { position, rotation } = actorPlacement(i, n);
    scene
      .stage(actor.domainId, { startPosition: position, startRotation: rotation })
      .addAction({ type: 'animate', actorId: actor.domainId, animationName: actor.idleClip, startTime: 0, endTime: duration, fadeIn: 0.3, loop: 'repeat' });
  }

  for (const { domainId, start, text } of speakActions) {
    scene.addAction({ type: 'speak', actorId: domainId, startTime: start, text });
  }

  return sceneToModel(scene, production.actors);
}
