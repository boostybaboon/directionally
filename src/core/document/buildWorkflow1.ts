import type { StoredProduction, StoredGroup, NamedScene } from '../storage/types.js';
import { getScenes } from '../storage/types.js';
import { ProductionStore } from '../storage/ProductionStore.js';
import {
  AddActorBlockCommand,
  AddActorCommand,
  AddGroupCommand,
  AddSceneCommand,
  RenameSceneCommand,
  StageActorCommand,
  SetSpeakLinesCommand,
  SwitchSceneCommand,
} from './commands.js';

function isGroup(node: StoredGroup | NamedScene): node is StoredGroup {
  return (node as StoredGroup).type === 'group';
}

/**
 * Applies the full Workflow 1 command sequence to `initial` and returns the
 * resulting StoredProduction. Pure — no I/O.
 *
 * `initial` must have at least one scene in its tree (the default from
 * ProductionStore.create). The first scene is renamed to "Prologue" and
 * kept at the root; two act groups with two scenes each are added beneath it.
 *
 * Shared by the integration test (workflow1.integration.test.ts) and the
 * dev seed (seedWorkflow1).
 */
export function buildWorkflow1(initial: StoredProduction): StoredProduction {
  let doc = initial;

  const prologueId = getScenes(doc.tree ?? [])[0]?.id;
  if (!prologueId) throw new Error('buildWorkflow1: initial doc must have at least one scene');

  const alphaId = crypto.randomUUID();
  const betaId = crypto.randomUUID();
  const encounterId = crypto.randomUUID();
  const chaseId = crypto.randomUUID();
  const confrontationId = crypto.randomUUID();
  const resolutionId = crypto.randomUUID();

  const exec = (cmd: { execute(d: StoredProduction): StoredProduction }): void => {
    doc = cmd.execute(doc);
  };

  // Part B — Cast
  exec(new AddActorCommand({ id: alphaId, role: 'Alpha', catalogueId: 'robot-expressive' }));
  exec(new AddActorCommand({ id: betaId, role: 'Beta', catalogueId: 'robot-expressive' }));

  // Part C — Structure
  exec(new RenameSceneCommand(prologueId, 'Prologue'));
  exec(new AddGroupCommand('Act 1'));
  const act1Id = ((doc.tree ?? []).find(n => isGroup(n) && (n as StoredGroup).name === 'Act 1') as StoredGroup | undefined)?.id ?? '';
  exec(new AddGroupCommand('Act 2'));
  const act2Id = ((doc.tree ?? []).find(n => isGroup(n) && (n as StoredGroup).name === 'Act 2') as StoredGroup | undefined)?.id ?? '';
  exec(new AddSceneCommand('The Encounter', act1Id, encounterId));
  exec(new AddSceneCommand('The Chase', act1Id, chaseId));
  exec(new AddSceneCommand('The Confrontation', act2Id, confrontationId));
  exec(new AddSceneCommand('Resolution', act2Id, resolutionId));

  // Part D — Prologue
  exec(new SwitchSceneCommand(prologueId));
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-3, 0, 0] }));
  exec(new StageActorCommand({ actorId: betaId, startPosition: [3, 0, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'Beta, we meet at last.', pauseAfter: 0.5 },
    { actorId: betaId, text: 'Indeed, Alpha. I have been waiting.', pauseAfter: 0 },
  ]));

  // Part E — The Encounter
  exec(new SwitchSceneCommand(encounterId));
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-2, 0, 2] }));
  exec(new StageActorCommand({ actorId: betaId, startPosition: [2, 0, 2] }));
  // Step 36: Alpha walks across stage during t=0–2
  exec(new AddActorBlockCommand({
    type: 'actorBlock',
    actorId: alphaId,
    startTime: 0,
    endTime: 2,
    clip: 'Walking',
    startPosition: [-2, 0, 2],
    endPosition: [0, 0, 2],
  }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'We have come far.', pauseAfter: 0.5, startTime: 2.5 },
    { actorId: betaId, text: 'The journey is not over.', pauseAfter: 0 },
  ]));

  // Part F — The Chase
  exec(new SwitchSceneCommand(chaseId));
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-1, 0, 0] }));
  exec(new StageActorCommand({ actorId: betaId, startPosition: [1, 0, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'You cannot outrun me!', pauseAfter: 0.3 },
    { actorId: betaId, text: 'Watch me try!', pauseAfter: 0 },
  ]));

  // Part F — The Confrontation
  exec(new SwitchSceneCommand(confrontationId));
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-2, 0, 0] }));
  exec(new StageActorCommand({ actorId: betaId, startPosition: [2, 0, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'This ends now, Beta.', pauseAfter: 0.5 },
    { actorId: betaId, text: 'I agree. One of us walks away.', pauseAfter: 0.5 },
    { actorId: alphaId, text: 'Then let it be me.', pauseAfter: 0 },
  ]));

  // Part F — Resolution
  exec(new SwitchSceneCommand(resolutionId));
  exec(new StageActorCommand({ actorId: alphaId, startPosition: [-1, 0, 0] }));
  exec(new StageActorCommand({ actorId: betaId, startPosition: [1, 0, 0] }));
  exec(new SetSpeakLinesCommand([
    { actorId: alphaId, text: 'It is over.', pauseAfter: 1.0 },
    { actorId: betaId, text: 'Not quite over. Never quite over.', pauseAfter: 0 },
  ]));

  return doc;
}

/**
 * Creates "The Robot Play" in localStorage and returns the saved production.
 * For browser dev use: `window.__seedWorkflow1()`.
 */
export function seedWorkflow1(): StoredProduction {
  const initial = ProductionStore.create('The Robot Play');
  const final = buildWorkflow1(initial);
  ProductionStore.save(final);
  return final;
}
