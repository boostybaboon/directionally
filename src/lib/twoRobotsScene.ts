/**
 * Two robots walk onstage one at a time, exchange lines, then stroll together.
 */
import { Production } from '../core/domain/Production.js';
import { sceneToModel } from '../core/domain/SceneBridge.js';
import type { Model } from './Model.js';

const production = new Production('Brief Encounter');

const alpha = production.addActor('Alpha', {
  type: 'gltf',
  url: '/models/gltf/RobotExpressive.glb',
});

const beta = production.addActor('Beta', {
  type: 'gltf',
  url: '/models/gltf/RobotExpressive.glb',
});

const act = production.addAct('Act 1');

// Timing map
//  0–2  : both offstage, walking-in-place
//  2–4  : Alpha walks in  (-8 → -2.5)  on +X axis
//  5    : Alpha speaks
//  7–9  : Beta walks in   ( 8 →  2.5)  on -X axis
// 10    : Beta speaks
// 14    : Alpha speaks
// 17    : Beta speaks
// 18–21 : converge side-by-side, both turn to face away from camera (-Z)
// 21–25 : walk together away from camera (Z → -7)
// 25–26 : both turn to face camera (+Z)
// 26–32 : walk together toward camera (Z → 5)

const scene = act.addScene('The Meeting', { duration: 32 });

scene
  .setCamera({ fov: 50, near: 0.1, far: 120, position: [0, 5, 16], lookAt: [0, 1, 0] })
  .addLight({
    type: 'hemisphere',
    id: 'sky',
    skyColor: 0xffffff,
    groundColor: 0x444444,
    intensity: 2,
    position: [0, 20, 0],
  })
  .addLight({
    type: 'directional',
    id: 'sun',
    color: 0xffffff,
    intensity: 1,
    position: [5, 10, 5],
  })
  .addSetPiece({
    name: 'ground',
    geometry: { type: 'plane', width: 30, height: 20 },
    material: { color: 0x888888 },
    rotation: [-Math.PI / 2, 0, 0],
  })
  // Alpha enters from the left — rotation.y = PI/2 faces +X
  .stage(alpha.id, { startPosition: [-8, 0, 0], startRotation: [0, Math.PI / 2, 0] })
  // Beta enters from the right — rotation.y = -PI/2 faces -X
  .stage(beta.id, { startPosition: [8, 0, 0], startRotation: [0, -Math.PI / 2, 0] })
  // Animate clips segmented to match movement windows, with 0.4s crossfades.
  // Overlapping start/endTimes create the blend window: e.g. Idle ends at 2.4,
  // Walking starts at 2.0 — both run at partial weight between t=2 and t=2.4.
  // Alpha: idle → walk in → idle (dialogue) → walk stroll
  .addAction({ type: 'animate', actorId: alpha.id, startTime: 0,   endTime: 2.4,  animationName: 'Idle',    fadeOut: 0.4 })
  .addAction({ type: 'animate', actorId: alpha.id, startTime: 2,   endTime: 4.4,  animationName: 'Walking', fadeIn: 0.4, fadeOut: 0.4 })
  .addAction({ type: 'animate', actorId: alpha.id, startTime: 4,   endTime: 18.4, animationName: 'Idle',    fadeIn: 0.4, fadeOut: 0.4 })
  .addAction({ type: 'animate', actorId: alpha.id, startTime: 18,                 animationName: 'Walking', fadeIn: 0.4 })
  // Beta: idle → walk in → idle (dialogue) → walk stroll
  .addAction({ type: 'animate', actorId: beta.id, startTime: 0,   endTime: 7.4,  animationName: 'Idle',    fadeOut: 0.4 })
  .addAction({ type: 'animate', actorId: beta.id, startTime: 7,   endTime: 9.4,  animationName: 'Walking', fadeIn: 0.4, fadeOut: 0.4 })
  .addAction({ type: 'animate', actorId: beta.id, startTime: 9,   endTime: 18.4, animationName: 'Idle',    fadeIn: 0.4, fadeOut: 0.4 })
  .addAction({ type: 'animate', actorId: beta.id, startTime: 18,                 animationName: 'Walking', fadeIn: 0.4 })
  // Alpha: walks in at t=2, holds for dialogue, converges and strolls at t=18
  .addAction({
    type: 'move',
    targetId: alpha.id,
    startTime: 0,
    keyframes: {
      property: '.position',
      trackType: 'vector',
      times:  [0,     2,     4,      18,     21,      25,         26,         32],
      values: [
        -8,   0, 0,
        -8,   0, 0,
        -2.5, 0, 0,
        -2.5, 0, 0,
        -0.8, 0, 0,
        -0.8, 0, -7,
        -0.8, 0, -7,
        -0.8, 0,  5,
      ],
      loop: 'once',
    },
  })
  // Alpha rotation: faces +X on entry, turns to face away from camera (-Z) then toward (+Z)
  // RobotExpressive visual front is +Z (GLTF convention), opposite Three.js default.
  // Facing direction for model-front=+Z: Ry(theta) applied to [0,0,1] = [sin(θ), 0, cos(θ)]
  //   +X (θ=π/2):   [0,  0.707, 0, 0.707]
  //   -Z (θ=π):     [0,  1,     0, 0]     ← faces away from camera (stroll out)
  //   +Z (θ=0):     [0,  0,     0, 1]     ← faces toward camera (stroll back)
  .addAction({
    type: 'move',
    targetId: alpha.id,
    startTime: 0,
    keyframes: {
      property: '.quaternion',
      trackType: 'quaternion',
      times:  [0,         20,        21,    25,    26,   32],
      values: [
        0,  0.707, 0, 0.707,
        0,  0.707, 0, 0.707,
        0,  1,     0, 0,
        0,  1,     0, 0,
        0,  0,     0, 1,
        0,  0,     0, 1,
      ],
      loop: 'once',
    },
  })
  // Beta: walks in at t=7, holds for dialogue, converges and strolls at t=18
  .addAction({
    type: 'move',
    targetId: beta.id,
    startTime: 0,
    keyframes: {
      property: '.position',
      trackType: 'vector',
      times:  [0,    7,    9,     18,    21,     25,        26,        32],
      values: [
         8,   0, 0,
         8,   0, 0,
         2.5, 0, 0,
         2.5, 0, 0,
         0.8, 0, 0,
         0.8, 0, -7,
         0.8, 0, -7,
         0.8, 0,  5,
      ],
      loop: 'once',
    },
  })
  // Beta rotation: faces -X on entry, turns to face away from camera (-Z) then toward (+Z)
  //   -X (θ=-π/2): [0, -0.707, 0, 0.707]
  .addAction({
    type: 'move',
    targetId: beta.id,
    startTime: 0,
    keyframes: {
      property: '.quaternion',
      trackType: 'quaternion',
      times:  [0,          20,         21,    25,    26,   32],
      values: [
        0, -0.707, 0, 0.707,
        0, -0.707, 0, 0.707,
        0,  1,     0, 0,
        0,  1,     0, 0,
        0,  0,     0, 1,
        0,  0,     0, 1,
      ],
      loop: 'once',
    },
  })
  // Dialogue
  .addAction({ type: 'speak', actorId: alpha.id, startTime: 5,  text: 'Hello. My name is Alpha.', voice: 'female' })
  .addAction({ type: 'speak', actorId: beta.id,  startTime: 10, text: 'And I am Beta. Nice to meet you.' })
  .addAction({ type: 'speak', actorId: alpha.id, startTime: 14, text: 'Shall we walk?', voice: 'female' })
  .addAction({ type: 'speak', actorId: beta.id,  startTime: 17, text: 'Let us walk.' });

export const twoRobotsScene: Model = sceneToModel(scene, production.actors);
