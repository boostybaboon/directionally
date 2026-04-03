# Directionally — Completed Phases Archive

All phases below are ✅ complete. Future work lives in [ROADMAP.md](ROADMAP.md).

---

## Phase 0 — Flexible tree domain model ✅ COMPLETE
*Replace the fixed Production → Act → Scene hierarchy with an arbitrarily nestable tree.*

- `Act` replaced by `Group` (`src/core/domain/Group.ts`): holds `children: Array<Group | Scene>`, supports arbitrary nesting, `getScenes()` returns depth-first leaves.
- `Production` now exposes `addGroup()` and `addScene()` directly (delegates to an implicit root `Group`). `getScenes()` traverses the whole tree. `acts` array and `addAct()` removed.
- `Act.ts` deleted. `exampleProduction1.ts`, `twoRobotsScene.ts`, `scriptToModel.ts` updated.
- 21/21 tests green, 0 svelte-check errors.

---

## Phase 1 — Production storage & management ✅ COMPLETE
*Foundation for everything. Gives users named, persistent productions.*

**Storage format** (`src/core/storage/types.ts`):
```ts
type StoredProduction = {
  id: string;        // uuid
  name: string;
  createdAt: number; // unix ms
  modifiedAt: number;
  script: ScriptLine[];
};
```

**`ProductionStore`** (`src/core/storage/ProductionStore.ts`): stateless service, all methods pure. `localStorage` is the backing store but no key names appear outside this file.
```ts
list(): StoredProduction[]
get(id: string): StoredProduction | undefined
save(production: StoredProduction): void
delete(id: string): void
create(name: string): StoredProduction   // generates id + timestamps, empty script
```

---

## Phase 2 — Transport bar + left panel tabs ✅ COMPLETE
*Structural groundwork with immediate visible payoff.*

**Transport bar** moved into a dedicated bottom panel (analogous to VS Code's bottom panel). All playback controls: play/pause/rewind, seek slider, time display, voice mode selector, bubble scale.

**Left panel** got a second tab: *Productions* and *Catalogue* (filled in Phase 3).

`Presenter.svelte` lost its embedded transport overlay.

---

## Phase 3 — Asset catalogue (bundled) ✅ COMPLETE
*Fills the Catalogue tab introduced in Phase 2.*

- `src/core/catalogue/types.ts` — `CharacterEntry`, `SetPieceEntry`, `CatalogueEntry`, `CatalogueKind`.
- `src/core/catalogue/entries.ts` — seed data: RobotExpressive (6 clips), Soldier (3 clips, MIT-licensed) + floor plane, box, sphere, cylinder set pieces.
- `src/core/catalogue/catalogue.ts` — pure injectable service: `getCharacters()`, `getSetPieces()`, `getById()`. 8 tests.
- `src/lib/CataloguePanel.svelte` — grouped list in the Catalogue tab.
- `src/lib/PreviewRenderer.svelte` — lightweight self-contained Three.js canvas with OrbitControls and animation clip selector.
- `GeometryConfig` gained a `cylinder` variant.
- 29/29 tests green, 0 svelte-check errors.

---

## Phase 4 — Right panel (collapsible) ✅ COMPLETE
*Adds the right panel.*

Right panel mirrors VS Code's secondary sidebar: collapsible, tabbed. *Properties* tab and *Script* tab. Panel open/close state persisted to localStorage. Toggle: `‹` button overlaid at top-right when closed.

---

## Phase 4.5 — ProductionDocument: command execution + undo/redo ✅ COMPLETE
*Establishes the headless editing API before any authoring UI lands.*

**`src/core/document/Command.ts`**:
```ts
interface Command {
  execute(doc: StoredProduction): StoredProduction;
  readonly label: string;
}
```

**`src/core/document/ProductionDocument.ts`**: snapshot-backed executor. Methods: `execute(cmd)`, `undo()`, `redo()`, `current`, `canUndo`, `canRedo`, `history: string[]`.

**`src/core/document/commands.ts`**: `RenameProductionCommand`, `AddScriptLineCommand`, `UpdateScriptLineCommand`, `DeleteScriptLineCommand`, `SetScriptCommand`.

- `Ctrl/Cmd+Z` → undo, `Ctrl/Cmd+Y` / `Ctrl/Cmd+Shift+Z` → redo.
- 51/51 tests green (22 new `ProductionDocument` tests), 0 svelte-check errors.

---

## Phase 5a — Production actor roster ✅ COMPLETE
*Replaces hardcoded two-robot cast with a user-managed cast per production.*

- `StoredActor` type: `{ id: string; role: string; catalogueId: string }` added to `StoredProduction`.
- `ActorId` relaxed from `'alpha'|'beta'` to `string`.
- `AddActorCommand`, `RemoveActorCommand` added to `commands.ts`.

---

## Phase 5b — Generalised scene composer ✅ COMPLETE
*Storage format upgrade: productions are now composed scenes, not flat script arrays.*

- `StoredScene` type: camera config, lights, set pieces, staged actors, `SceneAction[]`, duration.
- `src/core/storage/sceneBuilder.ts` — shared utilities: `defaultSceneShell()`, `restageCast()`, `estimateDuration()`, `actorPlacement()`.
- `storedSceneToModel.ts` — general deserialiser: `StoredScene` + `StoredActor[]` → `Model`.
- `SetSpeakLinesCommand`, `UpdateCameraCommand`, `AddSetPieceCommand`, `RemoveSetPieceCommand`, `StageActorCommand`, `UnstageActorCommand` commands landed.
- `migrateLegacyProduction()` — one-shot migration of pre-5b productions.
- 88/88 tests green, 0 svelte-check errors.

---

## Phase 5c — Design/playback canvas split ✅ COMPLETE
*Establishes the authoring viewport architecture. Exposes the scene commands through actual UI.*

- Design and playback share a single `THREE.Scene` in memory — no duplication.
- Design-only overlays on Three.js layer 1; playback camera renders layer 0 only.
- `buildSceneGraph(model)` extracted from `Presenter.svelte` into `src/lib/scene/buildSceneGraph.ts` — pure async construction, no Tone.js, no TTS.
- Design/playback mode toggle, right panel Stage + Script tabs, canvas object selection, TransformControls gizmos, drag-from-catalogue.

---

## Phase 6 — Script as document ✅ COMPLETE
*Screenplay view of the domain model; two-way editor.*

- Screenplay format: `CHARACTER NAME` heading + indented dialogue, Courier monospace.
- Click any beat to open inline editor. `+ Add line` auto-opens new beat.
- `@media print` CSS included; ⎙ Print button calls `window.print()`.

---

## Phase 7 — Camera tracks ✅ COMPLETE
*High visual impact; makes productions feel cinematic.*

- Timeline-style camera path editor over `addAction({ type: 'camera', ... })`.
- Design camera (free-orbit) vs named playback cameras with keyframed position + lookAt.
- `cameraCut` action: switch active playback camera at a given time.
- Path primitive designed for reuse: shared `AnimatedPath` type reused by character movement.

---

## Phase 8 — Ground-zero animation authoring ✅ COMPLETE
*De-risk the animation authoring problem.*

1. Closed `storedSceneToModel.ts` runtime gap for `MoveAction` and `LightingAction` + tests.
2. Manual `duration` override field (`SetSceneDurationCommand`).
3. Commands with tests: `AddAnimateSegmentCommand`, `RemoveAnimateSegmentCommand`, `UpdateAnimateSegmentCommand`, `CapturePositionKeyframeCommand`, `RemoveTransformKeyframeCommand`, `CaptureLightIntensityKeyframeCommand`, `RemoveLightKeyframeCommand`, `SetActorIdleAnimationCommand`, `SetActorScaleCommand`.
4. Surface A — GLTF clip sequencer (per actor, dynamic clip discovery from loaded GLTF at runtime).
5. Surface B — position keyframe list + scrub-and-capture workflow.
6. Surface C — light intensity keyframe list.
7. Per-actor idle clip and scale overrides.
8. Design-mode drag dispatch by time.

**Deferred from Phase 8 (low priority):** `SetSetPieceParentCommand` + UI picker, editable keyframe values by typing, fadeIn/fadeOut fields on clip form.

---

## Phase 8.5 — Block-based character animation ✅ COMPLETE
*Replace the separate clip-list + position-keyframe authoring with a unified `ActorBlock`.*

**Naming convention (locked):**
- `*Block` — high-level authored director intent. These are what the author writes.
- `*Track` — low-level compiled keyframe primitives. Never stored; always derived.
- `*Action` — event triggers. Point-in-time, not range-based.

**The `Block` type family:**
```typescript
type ActorBlock = {
  type: 'actorBlock';
  actorId: string;
  startTime: number;
  endTime: number;
  clip?: string;
  startPosition?: Vec3;
  endPosition?: Vec3;
  startFacing?: Vec3;
  endFacing?: Vec3;
};
```

`Block` entries stored in `StoredScene.blocks: Block[]`. At playback, `actorBlockToTracks()` compiles each block to `ClipTrack` + optional `TransformTrack`s. Old `ClipTrack`/`TransformTrack` entries in `actions` continue to work unchanged.

Commands: `AddActorBlockCommand`, `RemoveActorBlockCommand`, `UpdateActorBlockCommand`.

---

## Phase 8.6 — Visual timeline strip ✅ COMPLETE
*Per-actor, per-light, per-camera, per-set-piece horizontal track strips in a resizable bottom panel.*

- Blocks rendered as coloured rectangles; draw new blocks by click-drag on empty track space.
- Gaps rendered in grey — implicit idle.
- Click block → selects block, Stage tab shows editor for that block's fields.
- Playhead needle tracks transport position.

---

## Phase 8.7 — LightBlock + CameraBlock + SetPieceBlock ✅ COMPLETE
- `LightBlock`: `startIntensity` / `endIntensity`.
- `CameraBlock`: position + lookAt interpolation across a time range.
- `SetPieceBlock`: position/rotation/scale over a time range for set pieces.
- `AudioBlock` *(deferred)* — design captured, implementation deferred.

---

## Phase 8.8 — Catalogue asset defaults ✅ COMPLETE
- `defaultRotation?: Vec3` (Euler XYZ, radians) added to `CharacterEntry`.
- `entries.ts`: `defaultRotation: [0, Math.PI, 0]` for Soldier.
- `storedSceneToModel.ts`, `SceneBridge.ts`, `blockCompiler.ts` wired to propagate and post-multiply default rotation.

---

## Phase 8.9 — UX quick wins ✅ COMPLETE
- Playback/Design button labels name the destination, not the current state.
- Rotation gizmo hidden when an actor block is selected (translate-only for block-end capture).

---

## Phase T — Tablet support ✅ COMPLETE
1. Timeline `touch-action: none` on `.tl-track`.
2. Three.js `touch-action: none` on `#render-container`.
3. On-screen undo/redo floating button pair (44×44 px touch targets).
4. On-screen G/R gizmo buttons (pre-existing 44×44 px).
5. On-screen ⊙ snap-to-playback button.
6. Block delete via right panel button (touch-friendly).
7. Catalogue `+ Add to scene` button (touch-friendly placement).

---

## Phase 9 — Scene dressing: set building + character identification ✅ COMPLETE

### Phase 9.A — Set piece property inspector
When a set piece is selected: Color input, Scale (X/Y/Z + lock-aspect), Geometry dimensions (per type). `UpdateSetPieceCommand(name, patch)` — shallow merge for nested objects.

### Phase 9.B — Set piece catalogue expansion
Full-size stage-building entries:

| Entry | Geometry | Material |
|---|---|---|
| Wall flat | box 4 × 3 × 0.15 m | `0xddd8c4` matte off-white |
| Stage deck | plane 8 × 8 m | `0x8b6914` matte wood |
| Studio backdrop | box 6 × 4 × 0.1 m | `0x1a2a4a` matte dark blue |
| Table | box 1.5 × 0.75 × 0.5 m | `0x4a3728` matte dark wood |
| Step | box 1 × 0.2 × 0.6 m | `0x555555` matte grey |

### Phase 9.C — Actor tint
Each staged actor assigned a distinct emissive tint from the `COLORS` palette, matching its timeline strip colour. `StoredActor.tint?: number`. `GLTFAsset` clones all `MeshStandardMaterial` instances and applies `emissive` + `emissiveIntensity = 0.25`. `SetActorTintCommand(actorId, tint)`.

**Deferred from Phase 9:** material texture URLs, per-mesh costume colours, `SetPiece.parent` hierarchical UI, roughness/metalness sliders.

---

## Phase UX1 — Minimal interaction model ✅ COMPLETE
*A design-first pass at reducing configuration clutter.*

Guiding principles:
1. **One canonical way** — remove duplicate surfaces.
2. **Progressive disclosure** — show only what's needed for the next step.
3. **Visual affordances over text** — draggable/animatable state visible without reading labels.
4. **Script-first entry point** — dialogue is the opening surface; the 3D world builds from it.

Redesign areas delivered:
- A — Script-first authoring: screenplay canvas as primary entry point for new productions.
- B — Cast (production-level) cleanly separated from Staging (scene-level).
- C — Acts and scenes as an inline expandable tree in the left panel.
- D — Voice assignment moved to the actor card in the Cast section.
- E — Stage and Script merged into a single Scene panel.
- F — Camera spawn position follows the scrub-and-capture paradigm.

---

## Phase UX2 — Authoring workflow (9 snags) — completed items

### UX2.1 — Production creation naming ✅ COMPLETE
- `ProductionStore.create()` generates unique names ("Untitled Production", "Untitled Production 2", …).
- After creation, the production name field immediately enters inline edit mode with text selected.

### UX2.2 — Actor add UX overhaul + legacy single-scene expunge ✅ COMPLETE
- Legacy `StoredProduction.scene` (singular) removed; all productions use `StoredProduction.scenes: NamedScene[]`.
- `+ Actor` immediately appends a new actor with generated role name + first catalogue character, entering inline rename mode.
- No auto-staging — staging is an explicit per-scene step (UX2.4).

### UX2.3 — Scene and act tree ✅ COMPLETE
- `StoredProduction.tree: Array<StoredGroup | NamedScene>` — acts are named containers, scenes are leaves.
- `StoredGroup = { type: 'group'; id: string; name: string; children: Array<StoredGroup | NamedScene> }`.
- Migration: flat `scenes` arrays wrapped into `tree` at load time.
- Commands: `AddGroupCommand`, `RenameGroupCommand`, `RemoveGroupCommand`. `AddSceneCommand` gains optional `parentGroupId`.

### UX2.4 — Staging actors in a scene ✅ COMPLETE
- Cast section: unstaged actors show `⊕ Stage` button; staged actors show a filled badge.
- Drag from cast actor row onto 3D canvas → stages at ground intersection point.

### UX2.6 — Script editor (pull forward from Phase 6.5) ✅ COMPLETE
- Full-production screenplay view: all scenes in order with `SCENE N:` headings, collapsible Act group headings.
- `DirectionLine` type alongside `DialogueLine`; `ScriptLine = DialogueLine | DirectionLine`.
- `DialogueLine.parenthetical?: string` — inline speech direction rendered between character name and text.
- `NamedScene.script?: ScriptLine[]` — per-scene ordered sequence; falls back to deriving from `scene.actions`.
- `AddDirectionLineCommand`, `RemoveDirectionLineCommand`, `UpdateDirectionLineCommand`.
- `ProductionScriptView.svelte` — full DFS view; `@media print` styles; ⎙ Print button.

### UX2.7 — Spawn indicator as pre-t=0 block ✅ COMPLETE
- Spawn pin replaced by a synthetic coloured pre-block ending at t=0 in the actor's timeline track.
- Clicking the pre-block updates the Staging tab to show spawn position fields.

### UX2.8 — Production playback / presentation mode ✅ COMPLETE
- Dedicated **Present** button plays all scenes in depth-first order.
- Each scene plays to its duration, then hard-cuts to the next.
- Presentation mode collapses all panels; canvas fills the window. Esc exits.

### UX2.9 — Speech and Audio panel ✅ COMPLETE
- "SPEECH AND AUDIO" label + panel restructure.
- `StoredProduction.speechSettings?: { engine: VoiceBackend; bubbleScale: number }` — per-production override.
- `SetProductionSpeechSettingsCommand` patches settings; absence = use global default.

---

## Phase L1 — HDRI environment maps ✅ COMPLETE

- `EnvironmentEntry { kind: 'environment'; id; label; hdriPath; thumbnail? }` added to catalogue type union.
- `environmentMap?: string` threaded through `StoredScene` → `Scene` → `Model`.
- `SetSceneEnvironmentCommand(sceneId, environmentId?)` — full undo/redo; `null` clears the map.
- `RGBELoader` + `PMREMGenerator` in `Presenter.svelte` `loadModel()` (not `buildSceneGraph` — needs a renderer instance). Sets `scene.environment` for IBL and `scene.background` for visible sky.
- 3 bundled seed entries in `entries.ts`: `studio-neutral`, `exterior-sky`, `evening-warm`; HDR files in `static/environments/`.
- Catalogue tab gains an "Environments" section with thumbnail cards and an "Apply" button.
- `CataloguePanel` gains `onapplyenvironment` event prop + `activeEnvironmentId` for active-state highlight.

---

## Phase L2 — Textured materials ✅ COMPLETE

- `textureUrl?: string`, `repeatU?: number`, `repeatV?: number` added to `MaterialConfig`.
- `buildSceneGraph.ts` runs an async `TextureLoader` pass after the synchronous mesh loop; sets `MeshStandardMaterial.map`, `texture.repeat`, and `RepeatWrapping`.
- 4 textured set-piece catalogue entries: `brick-wall`, `concrete-floor`, `wood-floor`, `plaster-wall`; texture files in `static/textures/`.
- PropertiesPanel gains a "Texture" text input and repeat U/V number fields.
- No new command needed — `UpdateSetPieceCommand` already accepts material patches.

---

## Phase L3 — Theatre stage generator ✅ COMPLETE

- `src/core/storage/generators/theatreStage.ts` — `generateTheatreStage(config?): SetPiece[]`.
- **Config** (`TheatreStageConfig`): `type: 'proscenium' | 'thrust'`, `stageWidthM` (default 14), `stageDepthM` (default 9), `flatHeightM` (default 7), `legs` (default 4), `legAngleDeg` (default 12), `deckColor` (default `0x1a1816`), `legColor` (default `0x6b1a22`), `maskingColor` (default `0x0d0c0b`).
- Defaults at West End scale (Prince of Wales / Victoria Palace proportions).
- Legs angled inward by `legAngleDeg` (converging wing perspective). Tormentors and legs use `legColor` (crimson velvet); back wall and border use `maskingColor` (near-black). Deck near-black painted boards.
- Proscenium output: deck + back-wall + N×2 leg flats + border + 2 tormentors.
- Thrust output: extended deck + N×2 leg flats (no back wall).
- 19 tests in `theatreStage.test.ts`.

---

## Phase L4 — Drama studio / soundstage generator ✅ COMPLETE

- `src/core/storage/generators/studioRoom.ts` — `generateStudioRoom(config?): SetPiece[]`.
- **Config** (`StudioRoomConfig`): `widthM` (default 10), `depthM` (default 8), `heightM` (default 4), `wallColor` (default `0xddd4c5` warm off-white), `floorColor` (default `0x4a4742` warm dark grey), `ceiling` (default `false`), `floorTextureUrl?`, `floorRepeat?`.
- Output: floor plane + back-wall + left-wall + right-wall + optional ceiling — all named `SetPiece`s.
- 19 tests in `studioRoom.test.ts`.

**Shared infrastructure (L3 + L4):**
- `ApplySetCommand(sceneId, pieces)` in `commands.ts` — replaces the entire scene set via `patchNamedSceneInTree`; full undo/redo. 4 tests in `commands.test.ts`.
- "Generate set…" collapsible panel in the Staging tab (`+page.svelte`) — type selector (Theatre / Studio), all config fields with labelled inputs, Apply button.

---

## Architecture Decisions (locked in)

- **Storage**: Portable JSON document format from day one. No `localStorage` key names leak into business logic — `ProductionStore` owns all persistence so the backing store can switch to a server later without touching callers.
- **Scene graph**: Linear, depth-first playback. Acts and scenes form an organisational hierarchy; playback is always depth-first over leaf scenes.
- **Phase 1 storage format**: A production document stores `ScriptLine[]` only. Full domain model serialisation deferred to Phase 5b.
- **Script vs model**: Domain model is the source of truth for runtime. The screenplay view is a two-way editor over it.
- **Assets**: Bundled catalogue first. User GLTF import deferred.
- **Existing stubs**: `enter`/`exit` actions and `point` lights were already scaffolded; implemented in Phase 5c and Phase 10 respectively.
