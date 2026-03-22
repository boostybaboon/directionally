import type { StoredProduction, StoredGroup, NamedScene } from '../storage/types.js';
import { getScenes } from '../storage/types.js';
import { ProductionStore } from '../storage/ProductionStore.js';
import {
  AddActorBlockCommand,
  AddActorCommand,
  AddGroupCommand,
  AddSceneCommand,
  AddSetPieceCommand,
  RemoveSetPieceCommand,
  RenameSceneCommand,
  SetSceneDurationCommand,
  StageActorCommand,
  SetSpeakLinesCommand,
  SwitchSceneCommand,
  UpdateCameraCommand,
} from './commands.js';

function isGroup(node: StoredGroup | NamedScene): node is StoredGroup {
  return (node as StoredGroup).type === 'group';
}

/**
 * Builds a richer version of "The Robot Play" with location-specific scenery,
 * character movement in every scene, and a LoopOnce death animation for Beta
 * in the final scene. Pure — no I/O.
 *
 * Scene progression:
 *   Prologue          — The Meeting Ground: characters face each other across open grass
 *   The Encounter     — The Forest Clearing: both walk into the scene from backstage
 *   The Chase         — The Corridor: Beta flees, Alpha gives chase
 *   The Confrontation — The Arena: confrontation, Alpha walks away
 *   Resolution        — Bare Stage: Beta alone, death animation, freeze
 */
export function buildWorkflow2(initial: StoredProduction): StoredProduction {
  let doc = initial;

  const prologueId = getScenes(doc.tree ?? [])[0]?.id;
  if (!prologueId) throw new Error('buildWorkflow2: initial doc must have at least one scene');

  const alphaId = crypto.randomUUID();
  const betaId = crypto.randomUUID();
  const encounterId = crypto.randomUUID();
  const chaseId = crypto.randomUUID();
  const confrontationId = crypto.randomUUID();
  const resolutionId = crypto.randomUUID();

  const exec = (cmd: { execute(d: StoredProduction): StoredProduction }): void => {
    doc = cmd.execute(doc);
  };

  // ── Cast ──────────────────────────────────────────────────────────────────
  exec(new AddActorCommand({ id: alphaId, role: 'Alpha', catalogueId: 'robot-expressive' }));
  exec(new AddActorCommand({ id: betaId,  role: 'Beta',  catalogueId: 'robot-expressive' }));

  // ── Structure ─────────────────────────────────────────────────────────────
  exec(new RenameSceneCommand(prologueId, 'Prologue'));
  exec(new AddGroupCommand('Act 1'));
  const act1Id = ((doc.tree ?? []).find(n => isGroup(n) && (n as StoredGroup).name === 'Act 1') as StoredGroup | undefined)?.id ?? '';
  exec(new AddGroupCommand('Act 2'));
  const act2Id = ((doc.tree ?? []).find(n => isGroup(n) && (n as StoredGroup).name === 'Act 2') as StoredGroup | undefined)?.id ?? '';
  exec(new AddSceneCommand('The Encounter',     act1Id, encounterId));
  exec(new AddSceneCommand('The Chase',         act1Id, chaseId));
  exec(new AddSceneCommand('The Confrontation', act2Id, confrontationId));
  exec(new AddSceneCommand('Resolution',        act2Id, resolutionId));

  // ── Prologue — "The Meeting Ground" ──────────────────────────────────────
  // Open meadow. Characters are already on stage, angled 30° toward each other.
  exec(new SwitchSceneCommand(prologueId));
  exec(new RemoveSetPieceCommand('ground'));
  exec(new AddSetPieceCommand({
    name: 'ground',
    geometry: { type: 'plane', width: 30, height: 20 },
    material: { color: 0x556644, roughness: 0.9, metalness: 0.0 },
    rotation: [-Math.PI / 2, 0, 0],
  }));
  exec(new AddSetPieceCommand({
    name: 'boulder',
    geometry: { type: 'sphere', radius: 0.7 },
    material: { color: 0x887766, roughness: 1.0, metalness: 0.0 },
    position: [0, 0.7, -3],
  }));
  // 30° inward rotation so each character is angled toward the other
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-3, 0, 0], startRotation: [0,  Math.PI / 6, 0] }));
  exec(new StageActorCommand({ actorId: betaId,  startPosition: [3,  0, 0], startRotation: [0, -Math.PI / 6, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'Beta, we meet at last.',             pauseAfter: 0.5 },
    { actorId: betaId,  text: 'Indeed, Alpha. I have been waiting.', pauseAfter: 0   },
  ]));

  // ── The Encounter — "The Forest Clearing" ────────────────────────────────
  // Both characters enter from backstage (deep z), walking toward the audience.
  exec(new SwitchSceneCommand(encounterId));
  exec(new RemoveSetPieceCommand('ground'));
  exec(new AddSetPieceCommand({
    name: 'ground',
    geometry: { type: 'plane', width: 30, height: 20 },
    material: { color: 0x446633, roughness: 0.9, metalness: 0.0 },
    rotation: [-Math.PI / 2, 0, 0],
  }));
  exec(new AddSetPieceCommand({
    name: 'tree_left',
    geometry: { type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.28, height: 3, radialSegments: 8 },
    material: { color: 0x664422, roughness: 0.9, metalness: 0.0 },
    position: [-4, 1.5, -2],
  }));
  exec(new AddSetPieceCommand({
    name: 'tree_right',
    geometry: { type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.28, height: 3, radialSegments: 8 },
    material: { color: 0x664422, roughness: 0.9, metalness: 0.0 },
    position: [4, 1.5, -2],
  }));
  // Stage at backstage positions so the characters are out of frame at scene start
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-2, 0, -6] }));
  exec(new StageActorCommand({ actorId: betaId,  startPosition: [2,  0, -6] }));
  // Both walk forward toward the audience — auto-facing follows direction of travel (+Z)
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: alphaId,
    startTime: 0, endTime: 3,
    clip: 'Walking',
    startPosition: [-2, 0, -6],
    endPosition:   [-2, 0,  2],
  }));
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: betaId,
    startTime: 0, endTime: 3,
    clip: 'Walking',
    startPosition: [2, 0, -6],
    endPosition:   [2, 0,  2],
  }));
  // Dialogue begins once both have arrived
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'We have come far.',         pauseAfter: 0.5, startTime: 3.5 },
    { actorId: betaId,  text: 'The journey is not over.',  pauseAfter: 0                   },
  ]));

  // ── The Chase — "The Corridor" ────────────────────────────────────────────
  // Side walls form a narrow corridor. Beta bolts; Alpha pursues but can't close the gap.
  exec(new SwitchSceneCommand(chaseId));
  exec(new RemoveSetPieceCommand('ground'));
  exec(new AddSetPieceCommand({
    name: 'ground',
    geometry: { type: 'plane', width: 30, height: 20 },
    material: { color: 0x555555, roughness: 0.8, metalness: 0.2 },
    rotation: [-Math.PI / 2, 0, 0],
  }));
  exec(new AddSetPieceCommand({
    name: 'wall_left',
    geometry: { type: 'box', width: 0.5, height: 3, depth: 14 },
    material: { color: 0x333333, roughness: 0.8, metalness: 0.3 },
    position: [-5.5, 1.5, 0],
  }));
  exec(new AddSetPieceCommand({
    name: 'wall_right',
    geometry: { type: 'box', width: 0.5, height: 3, depth: 14 },
    material: { color: 0x333333, roughness: 0.8, metalness: 0.3 },
    position: [5.5, 1.5, 0],
  }));
  exec(new UpdateCameraCommand({ fov: 60, near: 0.1, far: 120, position: [0, 4, 10], lookAt: [0, 1, 0] }));
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-1, 0, 0] }));
  exec(new StageActorCommand({ actorId: betaId,  startPosition: [3,  0, 0] }));
  // Dialogue fires immediately — shouting while starting to run
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'You cannot outrun me!', pauseAfter: 0.3, startTime: 0 },
    { actorId: betaId,  text: 'Watch me try!',         pauseAfter: 0                 },
  ]));
  // Beta sprints left; Alpha starts one second later and doesn't close the gap
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: betaId,
    startTime: 0, endTime: 4,
    clip: 'Running',
    startPosition: [3,  0, 0],
    endPosition:   [-9, 0, 0],
  }));
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: alphaId,
    startTime: 1, endTime: 5,
    clip: 'Running',
    startPosition: [-1, 0, 0],
    endPosition:   [-7, 0, 0],
  }));
  exec(new SetSceneDurationCommand(7));

  // ── The Confrontation — "The Arena" ──────────────────────────────────────
  // Dark arena with two columns. Dialogue, then Alpha walks away for good.
  exec(new SwitchSceneCommand(confrontationId));
  exec(new RemoveSetPieceCommand('ground'));
  exec(new AddSetPieceCommand({
    name: 'ground',
    geometry: { type: 'plane', width: 30, height: 20 },
    material: { color: 0x332222, roughness: 0.9, metalness: 0.0 },
    rotation: [-Math.PI / 2, 0, 0],
  }));
  exec(new AddSetPieceCommand({
    name: 'pillar_left',
    geometry: { type: 'cylinder', radiusTop: 0.4, radiusBottom: 0.4, height: 4, radialSegments: 8 },
    material: { color: 0x444444, roughness: 0.5, metalness: 0.3 },
    position: [-5, 2, -3],
  }));
  exec(new AddSetPieceCommand({
    name: 'pillar_right',
    geometry: { type: 'cylinder', radiusTop: 0.4, radiusBottom: 0.4, height: 4, radialSegments: 8 },
    material: { color: 0x444444, roughness: 0.5, metalness: 0.3 },
    position: [5, 2, -3],
  }));
  exec(new UpdateCameraCommand({ fov: 50, near: 0.1, far: 120, position: [0, 5, 12], lookAt: [0, 1, 0] }));
  // Face each other at 45°
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-2, 0, 0], startRotation: [0,  Math.PI / 4, 0] }));
  exec(new StageActorCommand({ actorId: betaId,  startPosition: [2,  0, 0], startRotation: [0, -Math.PI / 4, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'This ends now, Beta.',              pauseAfter: 0.5 },
    { actorId: betaId,  text: 'I agree. One of us walks away.',    pauseAfter: 0.5 },
    { actorId: alphaId, text: 'Then let it be me.',                pauseAfter: 1.0 },
  ]));
  // Dialogue ends ≈ t=10.7; Alpha exits stage left
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: alphaId,
    startTime: 11, endTime: 15,
    clip: 'Walking',
    startPosition: [-2,  0, 0],
    endPosition:   [-13, 0, 0],
  }));
  exec(new SetSceneDurationCommand(16));

  // ── Resolution — "The Stage" ──────────────────────────────────────────────
  // Bare, dark stage. Alpha is absent. Beta speaks a final line, then falls.
  // The death animation plays once and clamps on the last frame — the play ends
  // with Beta alone and prostrate. Presentation mode freezes here.
  exec(new SwitchSceneCommand(resolutionId));
  exec(new RemoveSetPieceCommand('ground'));
  exec(new AddSetPieceCommand({
    name: 'ground',
    geometry: { type: 'plane', width: 30, height: 20 },
    material: { color: 0x1a1a2e, roughness: 1.0, metalness: 0.0 },
    rotation: [-Math.PI / 2, 0, 0],
  }));
  exec(new UpdateCameraCommand({ fov: 45, near: 0.1, far: 120, position: [0, 3, 8], lookAt: [0, 1, 0] }));
  // Alpha is in the cast but not on stage
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-20, 0, 0], offstage: true }));
  exec(new StageActorCommand({ actorId: betaId,  startPosition: [0, 0, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: betaId, text: 'Not quite over. Never quite over.', pauseAfter: 2.0 },
  ]));
  // Death animation plays once and holds the final frame — Beta is prostrate at scene end
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: betaId,
    startTime: 6, endTime: 12,
    clip: 'Death',
    clipLoop: 'once',
    startPosition: [0, 0, 0],
  }));
  exec(new SetSceneDurationCommand(14));

  return doc;
}

/**
 * Creates "The Robot Play" (enhanced) in localStorage and returns the saved production.
 * For browser dev use: `window.__seedWorkflow2()`.
 */
export function seedWorkflow2(): StoredProduction {
  const initial = ProductionStore.create('The Robot Play');
  const final = buildWorkflow2(initial);
  ProductionStore.save(final);
  return final;
}
