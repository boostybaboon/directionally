/**
 * Compiler: consumes a `ScriptDocument` (built programmatically, fully typed)
 * and produces `StoredActor[]` + `NamedScene[]` for the rendering pipeline.
 *
 * No regex parsing. No free-text scanning. Action beats carry their own
 * verb and arguments — the compiler reads them directly.
 */

import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { getCharacters, getEnvironments, getSetPieces } from '../catalogue/catalogue.js';
import { expandEntry, matchesByLabel } from '../setting/settingSpec.js';
import { estimateDuration, starterSceneShell } from '../storage/sceneBuilder.js';
import type { StoredActor, NamedScene } from '../storage/types.js';
import type { CatalogueEntry, EnvironmentEntry, SetPieceEntry } from '../catalogue/types.js';
import type { DialogueLine } from '../../lib/script/types.js';
import type { ActorBlock, SceneAction, SetPiece, StagedActor, Vec3 } from '../domain/types.js';
import type { ScriptDocument, SceneBlock, ActionBeat, Diagnostic, StageSide, StageMark } from './fountain.js';

// Fallback catalogue id used when a cast name has no catalogue match (Track CAT, CAT-1).
// A real bundled asset (not a blanket copy of some other character) so the placeholder
// body is visually distinct and legible — see entries.ts for provenance.
const PLACEHOLDER_CATALOGUE_ID = 'generic-human';

// Default locomotion clip for characters that don't declare one. Matches the
// ProceduralHumanoid export convention ("walk"); bundled entries override it
// (the Robot declares "Walking").
const DEFAULT_WALK_CLIP = 'walk';

// Track CAT, CAT-2: placeholder room constants. The floor mesh name is shared
// with the renderer, which draws the typed setting name onto the floor plane.
export const PLACEHOLDER_ROOM_MESH_NAME = 'placeholder-room';
const PLACEHOLDER_ROOM_FOOTPRINT = 6;
const PLACEHOLDER_ROOM_COLOR = 0x4a5560;


// ── Stage coordinate constants ──────────────────────────────────────────────

const STAGE_WORLD_MIN_X = -3;
const STAGE_WORLD_MAX_X = 3;

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

// ── Setting resolution ───────────────────────────────────────────────────────

export type SettingResolution =
  | { kind: 'set-piece'; entry: SetPieceEntry; bound?: boolean; sameLabel?: number }
  | { kind: 'environment'; entry: EnvironmentEntry; bound?: boolean; sameLabel?: number }
  | { kind: 'placeholder'; label?: string; sameLabel?: number };

/**
 * Resolves a scene heading's `setting` against the merged catalogue (bundled +
 * user-authored OPFS entries). Case-insensitive label match, mirroring
 * resolveCastName. A unique match resolves to that set-piece or environment; an
 * ambiguous name (≥2 matches) or no match falls back to a labelled placeholder
 * room and reports the match count via `sameLabel`. Never throws, never blocks.
 */
export function resolveSetting(
  setting: string | undefined,
  userEntries: CatalogueEntry[],
  settingBindings?: Record<string, string>,
): SettingResolution {
  const label = (setting ?? '').trim();
  if (!label) return { kind: 'placeholder' };

  const merged = [...CATALOGUE_ENTRIES, ...userEntries];
  const bound = settingBindings?.[label.toUpperCase()];
  if (bound) {
    const entry = merged.find((e) => e.id === bound);
    if (entry?.kind === 'set-piece') return { kind: 'set-piece', entry, bound: true };
    if (entry?.kind === 'environment') return { kind: 'environment', entry, bound: true };
  }

  const candidates = matchesByLabel([...getSetPieces(merged), ...getEnvironments(merged)], label);
  if (candidates.length === 1) {
    const entry = candidates[0];
    return entry.kind === 'set-piece'
      ? { kind: 'set-piece', entry, sameLabel: 1 }
      : { kind: 'environment', entry, sameLabel: 1 };
  }
  return { kind: 'placeholder', label, sameLabel: candidates.length };
}

/**
 * Placeholder room for an unresolved setting: a single floor plane sized to a
 * default footprint, visually distinct from the old hardcoded stage-and-wings.
 */
function buildPlaceholderRoom(): SetPiece[] {
  return [
    {
      name: PLACEHOLDER_ROOM_MESH_NAME,
      geometry: { type: 'plane', width: PLACEHOLDER_ROOM_FOOTPRINT, height: PLACEHOLDER_ROOM_FOOTPRINT },
      material: { color: PLACEHOLDER_ROOM_COLOR, roughness: 0.95, metalness: 0 },
      position: [0, 0, 0],
      rotation: [-Math.PI / 2, 0, 0],
    },
  ];
}

// ── Compiler ────────────────────────────────────────────────────────────────

export type FountainCompileResult = {
  scenes: NamedScene[];
  actors: StoredActor[];
  diagnostics: Diagnostic[];
  /**
   * Bindings to snapshot so a unique name→asset auto-match becomes durable.
   * Ambiguous names are deliberately absent — they must be chosen in the Roster.
   */
  resolvedBindings: {
    cast: Record<string, string>;
    setting: Record<string, string>;
  };
};

/**
 * Explicit asset bindings (Track CAT, CAT-3) keyed by role name (`cast`) and
 * setting name (`setting`), both uppercase. Applied ahead of label-match
 * resolution so a deliberate catalogue choice outranks a name that happens to
 * match a bundled label.
 */
export type ResolveBindings = {
  cast?: Record<string, string>;
  setting?: Record<string, string>;
};

export type CastResolution = {
  catalogueId: string;
  placeholder?: boolean;
  /** True when resolved via an explicit cast binding (not label match). */
  bound?: boolean;
  /** Number of catalogue characters whose label matches (0 when no match). */
  sameLabel?: number;
};

/**
 * Resolves a typed cast name against the merged catalogue (bundled + user-authored
 * OPFS entries). An explicit catalogueId binding (Track CAT, CAT-3) takes priority
 * ahead of case-insensitive label match. A unique label match resolves to that
 * character; an ambiguous name (≥2 matches) or no match falls back to the
 * placeholder id and reports the match count via `sameLabel`. Never throws, never
 * blocks — this is what keeps sigil typing (Track SCR) safe to accept any name.
 */
export function resolveCastName(
  name: string,
  userEntries: CatalogueEntry[],
  castBindings?: Record<string, string>,
): CastResolution {
  const bound = castBindings?.[name.toUpperCase()];
  if (bound) {
    const allCharacters = getCharacters([...CATALOGUE_ENTRIES, ...userEntries]);
    if (allCharacters.some((c) => c.id === bound)) {
      return { catalogueId: bound, bound: true };
    }
  }
  const allCharacters = getCharacters([...CATALOGUE_ENTRIES, ...userEntries]);
  const candidates = matchesByLabel(allCharacters, name);
  if (candidates.length === 1) return { catalogueId: candidates[0].id, sameLabel: 1 };
  return { catalogueId: PLACEHOLDER_CATALOGUE_ID, placeholder: true, sameLabel: candidates.length };
}

/**
 * Resolves the locomotion clip for a cast member from its catalogue entry.
 * Characters don't share a clip-name convention (Robot = "Walking", procedural
 * humanoids = "walk"), so the entry declares it; falls back to the humanoid
 * convention for user-authored entries that predate `walkAnimation`.
 */
function resolveWalkClip(actor: StoredActor, userEntries: CatalogueEntry[]): string {
  const allCharacters = getCharacters([...CATALOGUE_ENTRIES, ...userEntries]);
  const entry = allCharacters.find((c) => c.id === actor.catalogueId);
  return entry?.walkAnimation ?? DEFAULT_WALK_CLIP;
}


export function compileScriptDocument(
  doc: ScriptDocument,
  userEntries: CatalogueEntry[] = [],
  bindings: ResolveBindings = {},
): FountainCompileResult {
  const diagnostics: Diagnostic[] = [...doc.diagnostics];
  const resolvedCast: Record<string, string> = {};
  const resolvedSetting: Record<string, string> = {};

  // Build actor list from the cast (already normalised), resolving each name
  // against the merged catalogue. Unresolved/ambiguous names fall back to the
  // generic-human placeholder body with a diagnostic — never a silent wrong-asset
  // swap, and never a silent first-match on an ambiguous name.
  const actors: StoredActor[] = doc.cast.map((name) => {
    const resolution = resolveCastName(name, userEntries, bindings.cast);
    if (resolution.placeholder) {
      if (resolution.sameLabel && resolution.sameLabel > 1) {
        diagnostics.push({
          line: 0,
          level: 'warning',
          message: `${name} matches ${resolution.sameLabel} catalogue characters — pick one in the Roster.`,
          kind: 'ambiguous-cast',
          name,
        });
      } else {
        diagnostics.push({
          line: 0,
          level: 'info',
          message: `${name} has no catalogue match — using the generic placeholder.`,
          kind: 'unresolved-cast',
          name,
        });
      }
    } else if (!resolution.bound && resolution.sameLabel === 1) {
      resolvedCast[name.toUpperCase()] = resolution.catalogueId;
    }
    return {
      id: crypto.randomUUID(),
      role: name,
      catalogueId: resolution.catalogueId,
      placeholder: resolution.placeholder,
    };
  });

  const actorIdByName = new Map(actors.map((a) => [a.role, a.id]));

  const scenes: NamedScene[] = doc.scenes.map((sceneBlock, i) =>
    compileSceneBlock(sceneBlock, actors, actorIdByName, i, userEntries, bindings),
  );

  // Track CAT, CAT-2: report each unresolved/ambiguous setting once per unique
  // name, and snapshot any unique auto-match into a durable binding.
  const seenSettings = new Set<string>();
  for (const block of doc.scenes) {
    const name = (block.setting ?? '').trim();
    if (!name) continue;
    const key = name.toUpperCase();
    if (seenSettings.has(key)) continue;
    seenSettings.add(key);

    const resolution = resolveSetting(name, userEntries, bindings.setting);
    if (resolution.kind === 'placeholder') {
      if (resolution.sameLabel && resolution.sameLabel > 1) {
        diagnostics.push({
          line: 0,
          level: 'warning',
          message: `${name} matches ${resolution.sameLabel} catalogue entries — pick one in the Roster.`,
          kind: 'ambiguous-setting',
          name,
        });
      } else {
        diagnostics.push({
          line: 0,
          level: 'info',
          message: `${name} has no catalogue match — using a placeholder room.`,
          kind: 'unresolved-setting',
          name,
        });
      }
    } else if (!resolution.bound && resolution.sameLabel === 1) {
      resolvedSetting[key] = resolution.entry.id;
    }
  }

  return {
    scenes,
    actors,
    diagnostics,
    resolvedBindings: { cast: resolvedCast, setting: resolvedSetting },
  };
}


const ENTER_DURATION = 0.8;
const ENTER_PREROLL = 0.25;
const MOVE_DURATION = 2.0;
const EXIT_DURATION = 0.6;

function compileSceneBlock(
  block: SceneBlock,
  actors: StoredActor[],
  actorIdByName: Map<string, string>,
  sceneIdx: number,
  userEntries: CatalogueEntry[],
  bindings: ResolveBindings,
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

  // Per-actor locomotion clip, resolved from the merged catalogue — the Robot's
  // walk clip is "Walking" while procedural humanoids use "walk".
  const walkClipByActorId = new Map<string, string>();
  for (const actor of actors) {
    walkClipByActorId.set(actor.id, resolveWalkClip(actor, userEntries));
  }

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
          type: 'actorBlock', actorId, clip: walkClipByActorId.get(actorId) ?? DEFAULT_WALK_CLIP,
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
          type: 'actorBlock', actorId, clip: walkClipByActorId.get(actorId) ?? DEFAULT_WALK_CLIP,
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
          type: 'actorBlock', actorId, clip: walkClipByActorId.get(actorId) ?? DEFAULT_WALK_CLIP,
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

  // Track CAT, CAT-2: resolve the heading's setting against the merged catalogue.
  const setting = resolveSetting(block.setting, userEntries, bindings.setting);
  if (setting.kind === 'set-piece') {
    scene.set = expandEntry(setting.entry, undefined, [...CATALOGUE_ENTRIES, ...userEntries]);
    if (setting.entry.environmentId) scene.environmentMap = setting.entry.environmentId;
    if (setting.entry.lights) scene.lights = setting.entry.lights;
  } else if (setting.kind === 'environment') {
    scene.environmentMap = setting.entry.id;
    // Keep the starter ground plane so actors stand on something under the HDRI.
  } else {
    scene.set = buildPlaceholderRoom();
    if (setting.label) scene.placeholderSetting = setting.label;
  }

  return {
    id: crypto.randomUUID(),
    name: sceneName,
    scene: {
      camera: scene.camera,
      lights: scene.lights,
      set: scene.set,
      stagedActors,
      actions: sceneActions,
      blocks,
      duration: Math.max(6, parseFloat((t + 1).toFixed(2))),
      environmentMap: scene.environmentMap,
      placeholderSetting: scene.placeholderSetting,
    },
    script: dialogueLines,
  };
}
