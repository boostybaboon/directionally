import { Production } from '../../core/domain/Production.js';
import { sceneToModel } from '../../core/domain/SceneBridge.js';
import type { ActorVoice } from '../../core/domain/types.js';
import type { Model } from '../Model.js';
import type { ScriptLine } from './types.js';

const GLTF_URL = '/models/gltf/RobotExpressive.glb';

const alphaVoice: ActorVoice = {
  persona: { gender: 'female', accent: 'british', pitch: 0.3, rate: 0 },
  espeak:  { voice: 'en-gb-x-rp+f1', pitch: 60, pitchRange: 63, rate: 160 },
  kokoro:  'af_heart',
};

const betaVoice: ActorVoice = {
  persona: { gender: 'male', accent: 'british', pitch: -0.5, rate: -0.27 },
  espeak:  { voice: 'en-gb-x-rp+m3', pitch: 40, pitchRange: 58, rate: 150 },
  kokoro:  'am_echo',
};

/**
 * Conservative spoken-word duration estimate in seconds.
 * eSpeak synthesises faster than neural — this generous estimate prevents
 * lines overlapping in the rare case synthesis runs slower than expected.
 */
function estimateDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return words / 2.5 + 0.6;
}

/**
 * Compile a flat list of ScriptLines into a playable Model.
 * Characters stand facing each other, playing Idle animations throughout.
 * Speech lines are sequenced by accumulating estimated duration + pauseAfter.
 */
export function scriptToModel(lines: ScriptLine[]): Model {
  const production = new Production('Sandbox');

  const alpha = production.addActor('Alpha', { type: 'gltf', url: GLTF_URL }, { voice: alphaVoice });
  const beta  = production.addActor('Beta',  { type: 'gltf', url: GLTF_URL }, { voice: betaVoice  });

  const actorIds = { alpha: alpha.id, beta: beta.id };

  const act = production.addGroup('Act 1');

  // Sequence speech lines: each starts after the estimated duration of the previous + pause.
  const speakLines = lines.filter(l => l.text.trim().length > 0);
  let t = 1.0;

  const speakActions = speakLines.map(line => {
    const start = t;
    t += estimateDuration(line.text) + line.pauseAfter;
    return { actorId: actorIds[line.actorId], start, text: line.text };
  });

  const duration = Math.max(6, t + 1);

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
    })
    // Alpha faces +X (toward Beta on the right)
    .stage(alpha.id, { startPosition: [-2.5, 0, 0], startRotation: [0,  Math.PI / 2, 0] })
    // Beta faces -X (toward Alpha on the left)
    .stage(beta.id,  { startPosition: [ 2.5, 0, 0], startRotation: [0, -Math.PI / 2, 0] })
    // Both idle for the full scene duration
    .addAction({ type: 'animate', actorId: alpha.id, animationName: 'Idle', startTime: 0, endTime: duration, fadeIn: 0.3, loop: 'repeat' })
    .addAction({ type: 'animate', actorId: beta.id,  animationName: 'Idle', startTime: 0, endTime: duration, fadeIn: 0.3, loop: 'repeat' });

  // Add speech actions
  for (const { actorId, start, text } of speakActions) {
    scene.addAction({ type: 'speak', actorId, startTime: start, text });
  }

  return sceneToModel(scene, production.actors);
}
