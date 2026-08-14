/**
 * Compiler: consumes a `ScriptDocument` (built programmatically, fully typed)
 * and produces `StoredActor[]` + `NamedScene[]` for the rendering pipeline.
 *
 * No regex parsing. No free-text scanning. Action beats carry their own
 * verb and arguments — the compiler reads them directly.
 */

import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { estimateDuration, starterSceneShell } from '../storage/sceneBuilder.js';
import type { StoredActor, NamedScene } from '../storage/types.js';
import type { DialogueLine } from '../../lib/script/types.js';
import type { ActorBlock, SceneAction, SetPiece, StagedActor, Vec3 } from '../domain/types.js';
import type { ScriptDocument, SceneBlock, ActionBeat, Diagnostic, StageSide, StageMark } from './fountain.js';

// ── Stage coordinate constants ──────────────────────────────────────────────

const STAGE_WORLD_MIN_X = -3;
const STAGE_WORLD_MAX_X = 3;
const STAGE_WORLD_DEPTH = 4;
const WING_WORLD_WIDTH = 2;

const MARK_X: Record<StageMark, number> = { left: 0.2, center: 0.5, right: 0.8 };
const HOME_X: Record<StageSide, number> = { left: 0.4, right: 0.6 };
const OFFSTAGE_X: Record<StageSide, number> = { left: -0.1, right: 1.1 };

function stageXToWorld(x: number): number {
  return STAGE_WORLD_MIN_X + x * (STAGE_WORLD_MAX_X - STAGE_WORLD_MIN_X);
}

function toWorldPos(stageX: number): Vec3 {
  return [stageXToWorld(stageX), 0, 0];
}

function homeSide(i: number): StageSide {
  return i % 2 === 0 ? 'left' : 'right';
}

// ── Floor ───────────────────────────────────────────────────────────────────

function buildStageFloor(): SetPiece[] {
  const stageWidth = STAGE_WORLD_MAX_X - STAGE_WORLD_MIN_X;
  const centerX = (STAGE_WORLD_MIN_X + STAGE_WORLD_MAX_X) / 2;
  return [
    {
      name: 'stage-floor',
      geometry: { type: 'plane', width: stageWidth, height: STAGE_WORLD_DEPTH },
      material: { color: 0x8b6914 },
      position: [centerX, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
    {
      name: 'stage-wing-left',
      geometry: { type: 'plane', width: WING_WORLD_WIDTH, height: STAGE_WORLD_DEPTH },
      material: { color: 0x2a2a2a },
      position: [STAGE_WORLD_MIN_X - WING_WORLD_WIDTH / 2, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
    {
      name: 'stage-wing-right',
      geometry: { type: 'plane', width: WING_WORLD_WIDTH, height: STAGE_WORLD_DEPTH },
      material: { color: 0x2a2a2a },
      position: [STAGE_WORLD_MAX_X + WING_WORLD_WIDTH / 2, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
  ];
}

// ── Compiler ────────────────────────────────────────────────────────────────

export type FountainCompileResult = {
  scenes: NamedScene[];
  actors: StoredActor[];
  diagnostics: Diagnostic[];
};

export function compileScriptDocument(doc: ScriptDocument): FountainCompileResult {
  const diagnostics: Diagnostic[] = [...doc.diagnostics];
  const fallbackId = CATALOGUE_ENTRIES.find((e) => e.kind === 'character')?.id ?? '';

  // Build actor list from the cast (already normalised)
  const actors: StoredActor[] = doc.cast.map((name) => ({
    id: crypto.randomUUID(),
    role: name,
    catalogueId: fallbackId,
  }));

  const actorIdByName = new Map(actors.map((a) => [a.role, a.id]));

  const scenes: NamedScene[] = doc.scenes.map((sceneBlock, i) =>
    compileSceneBlock(sceneBlock, actors, actorIdByName, i),
  );

  return { scenes, actors, diagnostics };
}

const WALK_CLIP = 'Walking';
const ENTER_DURATION = 0.8;
const ENTER_PREROLL = 0.25;
const MOVE_DURATION = 2.0;
const EXIT_DURATION = 0.6;

function compileSceneBlock(
  block: SceneBlock,
  actors: StoredActor[],
  actorIdByName: Map<string, string>,
  sceneIdx: number,
): NamedScene {
  // Gather actors referenced in this scene
  const inScene = new Map<string, StageSide>();
  let count = 0;
  for (const beat of block.beats) {
    if (beat.type === 'dialogue' || beat.type === 'action') {
      const role = beat.character;
      if (!inScene.has(role)) { inScene.set(role, homeSide(count)); count++; }
    }
  }

  // Initial positions: actors whose first beat is 'enter' start offstage
  const firstBeatType = new Map<string, string>();
  for (const beat of block.beats) {
    if ((beat.type === 'dialogue' || beat.type === 'action') && !firstBeatType.has(beat.character)) {
      firstBeatType.set(beat.character, beat.type === 'action' ? beat.verb : 'dialogue');
    }
  }

  const initStageX = new Map<string, number>();
  const curStageX = new Map<string, number>();
  for (const [role, side] of inScene) {
    const ft = firstBeatType.get(role);
    const sx = ft === 'enter' ? OFFSTAGE_X[side] : HOME_X[side];
    initStageX.set(role, sx);
    curStageX.set(role, sx);
  }

  let t = 0;
  const dialogueLines: DialogueLine[] = [];
  const sceneActions: SceneAction[] = [];
  const blocks: ActorBlock[] = [];

  for (const beat of block.beats) {
    if (beat.type === 'transition') { t += 0.5; continue; }

    const actorId = actorIdByName.get(beat.character);
    if (!actorId) {
      continue; // should not happen — cast is validated at ScriptDocument level
    }

    const currentSx = curStageX.get(beat.character) ?? 0.5;

    if (beat.type === 'dialogue') {
      const startTime = parseFloat(t.toFixed(2));
      dialogueLines.push({ actorId, text: beat.text, pauseAfter: 0, startTime });
      sceneActions.push({ type: 'speak', actorId, startTime, text: beat.text });
      t += estimateDuration(beat.text);
      continue;
    }

    // Action beat — read structured data directly, no regex
    const side = inScene.get(beat.character) ?? 'left';

    switch (beat.verb) {
      case 'enter': {
        const entrySide = beat.side ?? side;
        const targetX = HOME_X[entrySide];
        const startX = OFFSTAGE_X[entrySide];
        blocks.push({
          type: 'actorBlock', actorId, clip: WALK_CLIP,
          startTime: parseFloat((t + ENTER_PREROLL).toFixed(2)),
          endTime: parseFloat((t + ENTER_PREROLL + ENTER_DURATION).toFixed(2)),
          startPosition: toWorldPos(startX), endPosition: toWorldPos(targetX),
        });
        curStageX.set(beat.character, targetX);
        t += ENTER_PREROLL + ENTER_DURATION;
        break;
      }
      case 'exit': {
        const exitSide = beat.side ?? side;
        const targetX = OFFSTAGE_X[exitSide];
        const startX = curStageX.get(beat.character) ?? HOME_X[side];
        blocks.push({
          type: 'actorBlock', actorId, clip: WALK_CLIP,
          startTime: parseFloat(t.toFixed(2)),
          endTime: parseFloat((t + EXIT_DURATION).toFixed(2)),
          startPosition: toWorldPos(startX), endPosition: toWorldPos(targetX),
        });
        curStageX.set(beat.character, targetX);
        t += EXIT_DURATION;
        break;
      }
      case 'move': {
        const targetX = MARK_X[beat.target ?? 'center'];
        const startX = curStageX.get(beat.character) ?? HOME_X[side];
        blocks.push({
          type: 'actorBlock', actorId, clip: WALK_CLIP,
          startTime: parseFloat(t.toFixed(2)),
          endTime: parseFloat((t + MOVE_DURATION).toFixed(2)),
          startPosition: toWorldPos(startX), endPosition: toWorldPos(targetX),
        });
        curStageX.set(beat.character, targetX);
        t += MOVE_DURATION;
        break;
      }
      case 'hold': {
        const secs = beat.seconds ?? 1.0;
        const px = toWorldPos(curStageX.get(beat.character) ?? HOME_X[side]);
        blocks.push({
          type: 'actorBlock', actorId,
          startTime: parseFloat(t.toFixed(2)),
          endTime: parseFloat((t + secs).toFixed(2)),
          startPosition: px, endPosition: px,
        });
        t += secs;
        break;
      }
    }
  }

  // Look up per-actor default scale from catalogue entries
  const catalogueScale = new Map<string, number>();
  for (const actor of actors) {
    const entry = CATALOGUE_ENTRIES.find((e) => e.kind === 'character' && e.id === actor.catalogueId);
    catalogueScale.set(actor.id, (entry && 'defaultScale' in entry ? (entry as { defaultScale?: number }).defaultScale : undefined) ?? 1);
  }

  const stagedActors: StagedActor[] = [];
  for (const role of inScene.keys()) {
    const sx = initStageX.get(role);
    if (sx !== undefined) {
      const actorId = actorIdByName.get(role)!;
      const scale = catalogueScale.get(actorId) ?? 1;
      const sa: StagedActor = { actorId, startPosition: toWorldPos(sx) };
      if (scale !== 1) sa.startScale = [scale, scale, scale];
      stagedActors.push(sa);
    }
  }

  const sceneName = block.heading === 'UNTITLED' ? `Scene ${sceneIdx + 1}` : block.heading;
  const scene = starterSceneShell();

  return {
    id: crypto.randomUUID(),
    name: sceneName,
    scene: {
      camera: scene.camera,
      lights: scene.lights,
      set: buildStageFloor(),
      stagedActors,
      actions: sceneActions,
      blocks,
      duration: Math.max(6, parseFloat((t + 1).toFixed(2))),
    },
    script: dialogueLines,
  };
}
