/**
 * Bouncing ball demo expressed using the Production domain API.
 * Equivalent in behaviour to exampleModel2.ts, demonstrating the SceneBridge.
 */
import { Production } from '../core/domain/Production.js';
import { sceneToModel } from '../core/domain/SceneBridge.js';
import type { Model } from './Model.js';

const production = new Production('Bouncing Ball');

// No named actors — the ball is a set piece with animated keyframes

const act = production.addAct('Act 1');

const scene = act.addScene('Bouncing Ball Scene', { duration: 4, backgroundColor: undefined });

scene
  .setCamera({ fov: 75, near: 0.1, far: 1000, position: [2, 5, 5], lookAt: [0, 0, 0] })
  .addLight({
    type: 'hemisphere',
    id: 'light1',
    skyColor: 0xffffbb,
    groundColor: 0x080820,
    intensity: 1,
    position: [0, 10, 0],
  })
  .addSetPiece({
    name: 'plane1',
    geometry: { type: 'plane', width: 10, height: 10 },
    material: { color: 0x808080 },
    rotation: [-Math.PI / 2, 0, 0],
  })
  .addSetPiece({
    name: 'sphere1',
    geometry: { type: 'sphere', radius: 1 },
    material: { color: 0x0000ff },
    position: [0, 2, 0],
  })
  .addAction({
    type: 'move',
    targetId: 'sphere1',
    startTime: 0,
    keyframes: {
      property: '.position[y]',
      times: [0, 1, 2],
      values: [0, 2, 0],
      trackType: 'number',
      loop: 'repeat',
    },
  });

export const exampleProduction1Scene: Model = sceneToModel(scene, production.actors);
