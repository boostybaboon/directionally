# Directionally — Authoring Tool Roadmap

## Vision

Evolve Directionally from a scene player into a full production authoring tool: write scripts, build scenes from an asset catalogue, choreograph characters, control cameras and lighting, and export productions for sharing or printing.

## Architecture Decisions (locked in)

- **Storage**: Portable JSON document format from day one. No `localStorage` key names leak into business logic — a `ProductionStore` service owns all persistence so the backing store can switch to a server later without touching callers.
- **Scene graph**: Linear, depth-first playback. Acts and scenes form an organisational hierarchy (filesystem model: productions are root folders, groups are subfolders, scenes are leaf files), not an interactive branching graph. Data model supports arbitrary nesting depth; playback is always depth-first over leaf scenes.
- **Phase 1 storage format**: A production document stores `ScriptLine[]` only. The Three.js model is computed at load time by `scriptToModel`, not serialised. Full domain model serialisation (cameras, keyframes, set pieces, actor positions) is deferred to Phase 4 when the scene composer makes those things authorable.
- **Script vs model**: Domain model is the source of truth for runtime. The screenplay view (Phase 5) is a two-way editor over it — editing a character line updates the corresponding `speak` action, not the other way round.
- **Assets**: Bundled catalogue first (existing robots + basic geometries). User GLTF import deferred to a later phase.
- **Existing stubs**: `enter`/`exit` actions and `point` lights are already scaffolded in the domain type system (currently emitting warnings and being skipped). They get properly implemented in Phases 4 and 8 rather than invented from scratch.

---

## Phases

### Phase 0 — Flexible tree domain model ✅ COMPLETE
*Replace the fixed Production → Act → Scene hierarchy with an arbitrarily nestable tree.*

- `Act` replaced by `Group` (`src/core/domain/Group.ts`): holds `children: Array<Group | Scene>`, supports arbitrary nesting, `getScenes()` returns depth-first leaves.
- `Production` now exposes `addGroup()` and `addScene()` directly (delegates to an implicit root `Group`). `getScenes()` traverses the whole tree. `acts` array and `addAct()` removed.
- `Act.ts` deleted. `exampleProduction1.ts`, `twoRobotsScene.ts`, `scriptToModel.ts` updated.
- 21/21 tests green, 0 svelte-check errors.

---

### Phase 1 — Production storage & management ✅ COMPLETE
*Foundation for everything. Gives users named, persistent productions.*

**What changes visibly:** the sidebar's hardcoded example scene list is replaced with a user-managed productions list. New / Rename / Delete controls. Clicking a production loads its script into the sandbox editor. Examples demoted to a collapsible read-only section below.

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

**`+page.svelte` changes**:
- Productions list replaces hardcoded scene list. State: `productions`, `activeProductionId`.
- New production → `store.create()`, load into sandbox, set as active.
- Click production → load its script, set as active.
- Rename → inline edit the production name.
- Delete → `store.delete()`, clear active if it was the deleted one.
- Script changes auto-save: `$effect` calls `store.save()` on every script mutation (replaces the old `SANDBOX_KEY` pattern).
- Examples moved to collapsible `▶ Examples` section at the bottom of the sidebar — read-only, no management controls.

**Phase complete when:** productions survive a page reload; creating, renaming, and deleting productions works; the old `directionally_sandbox_script` key is migrated or replaced.

---

### Phase 2 — Transport bar + left panel tabs ✅ COMPLETE
*Structural groundwork with immediate visible payoff. Right panel deferred until it has content.*

**Transport bar** moves out of the viewport overlay into a dedicated bottom panel — analogous to VS Code's bottom panel (Problems / Terminal / Output). It sits below the splitpanes, can be toggled open/closed, and contains all playback controls: play/pause/rewind, seek slider, time display, voice mode selector, bubble scale. Resizing deferred until there is content that benefits from it.

**Left panel** gets a second tab: *Productions* (current sidebar content) and *Catalogue* (empty shell, filled in Phase 3). Tab bar at the top of the left pane; tab content below.

`Presenter.svelte` loses its embedded transport overlay. Everything else in the renderer is untouched.

**Phase complete when:** transport bar docks below the viewport, both left-panel tabs switch cleanly, and all existing productions and examples still play correctly.

---

### Phase 3 — Asset catalogue (bundled) ✅ COMPLETE
*Fills the Catalogue tab introduced in Phase 2.*

- `src/core/catalogue/types.ts` — `CharacterEntry`, `SetPieceEntry`, `CatalogueEntry`, `CatalogueKind`.
- `src/core/catalogue/entries.ts` — seed data: RobotExpressive (6 clips: Idle/Walking/Running/Dance/Death/Jump), Soldier (3 clips: idle/walk/run, MIT-licensed Three.js asset) + floor plane, box, sphere, cylinder set pieces.
- `src/core/catalogue/catalogue.ts` — pure injectable service: `getCharacters()`, `getSetPieces()`, `getById()`. 8 tests.
- `src/lib/CataloguePanel.svelte` — grouped list (Characters / Set Pieces) in the Catalogue tab. Click a character to expand an inline preview.
- `src/lib/PreviewRenderer.svelte` — lightweight self-contained Three.js canvas: GLTF loader, OrbitControls (left-drag to orbit, scroll to zoom), auto-fit camera to full bounding box, animation clip selector. No Tone.js or TTS — fully independent from the main presenter.
- `GeometryConfig` gained a `cylinder` variant; `CylinderGeometryAsset` added to renderer and SceneBridge.
- 29/29 tests green, 0 svelte-check errors.

#### Preview placement — captured for future phases

The preview renderer is intentionally decoupled from the main playback presenter. Future options:
- **Inline catalogue** (current): expandable panel below each character name. Good for quick inspection.
- **Dedicated main-area tab**: add a "Preview" tab alongside "Scene" in a future main-area tab bar (see Phase 4 right panel).
- **Right panel preview**: a small live canvas in the right inspector panel showing the selected asset.
- **Floating / undockable**: open preview in a separate browser window or a draggable overlay.

The `PreviewRenderer` component is placement-agnostic — it accepts `gltfPath` + `animationClips` and works wherever it is mounted.

---

### Phase 4 — Right panel (collapsible) ✅ COMPLETE
*Adds the right panel now that Phase 3 gives it content to display.*

Right panel mirrors VS Code's secondary sidebar: collapsible, tabbed.
- *Properties* tab: inspector for the selected asset (position, rotation, scale, material). Content from Phase 8.
- *Script* tab: screenplay editor for the active scene. Content from Phase 6.
Shell arrived in this phase; tabs are populated by subsequent phases. Panel open/close state persisted to localStorage. Toggle: `‹` button overlaid at top-right of main canvas when closed; `›` in the panel header when open.

---

### Phase 4.5 — ProductionDocument: command execution + undo/redo ✅ COMPLETE
*Establishes the headless editing API before any authoring UI lands.*

All production mutations now flow through a single seam — `ProductionDocument` — rather than being scattered across `+page.svelte`. The document is fully testable and scriptable without a browser.

**`src/core/document/Command.ts`**
```ts
interface Command {
  execute(doc: StoredProduction): StoredProduction;
  readonly label: string;
}
```
Pure transformations — no side effects, no inverse needed. `ProductionDocument` owns undo/redo via snapshots.

**`src/core/document/ProductionDocument.ts`**
Snapshot-backed executor. Methods: `execute(cmd)`, `undo()`, `redo()`, `current`, `canUndo`, `canRedo`, `history: string[]`. Persistence (`ProductionStore.save`) and the UI notification callback (`onChange`) are injected — the class has zero browser or Svelte dependencies.

**`src/core/document/commands.ts`**
Named command classes covering today's editing surface: `RenameProductionCommand`, `AddScriptLineCommand`, `UpdateScriptLineCommand`, `DeleteScriptLineCommand`, `SetScriptCommand`.

**`+page.svelte` changes**
- `script` is now `$derived(activeDoc?.current.script ?? [])` — no longer a raw `$state`.
- `activeDoc` constructed on `loadProduction`; its `onChange` callback drives both `productions` list refresh and scene reload.
- Auto-save `$effect` removed — `ProductionDocument` persists on every `execute/undo/redo`.
- `commitRename` routes through `RenameProductionCommand` for the active production.
- `Ctrl/Cmd+Z` → undo, `Ctrl/Cmd+Y` / `Ctrl/Cmd+Shift+Z` → redo (keyboard handler in `onMount`).
- `ScriptEditor` now receives `script` as a value prop (not `$bindable`) and emits `onchange(script)` callbacks.

**`src/lib/sandbox/ScriptEditor.svelte`**
Keeps a local copy of the script for smooth in-progress typing. On blur or structural changes  (add/delete/actor), fires `onchange(script)` which the page routes through `SetScriptCommand`.

**Future extension point**: when collaborative editing is a goal, `Command.execute()` becomes the unit of synchronisation — the history stack can be replaced with an OT/CRDT log without touching callers.

- 51/51 tests green (22 new `ProductionDocument` tests written TDD), 0 svelte-check errors.

---

### Phase 5a — Production actor roster ✅ COMPLETE
*Replaces hardcoded two-robot cast with a user-managed cast per production.*

- `StoredActor` type: `{ id: string; role: string; catalogueId: string }` added to `StoredProduction`.
- `ActorId` relaxed from `'alpha'|'beta'` to `string`.
- `scriptToModel` accepts the production's cast; maps `catalogueId` → GLTF URL + default voice.
- Cast management UI in the Productions tab: add/remove actors from catalogue, name roles.
- `AddActorCommand`, `RemoveActorCommand` added to `commands.ts`.
- Falls back to hardcoded pair for productions with no `actors` field (legacy compatibility).

**Phase complete when:** a new production can have Robot + Soldier as cast, exchange lines, and play correctly.

---

### Phase 5b — Generalised scene composer ✅ COMPLETE
*Storage format upgrade: productions are now composed scenes, not flat script arrays.*

- `StoredScene` type: camera config, lights, set pieces, staged actors, `SceneAction[]`, duration.
- `StoredProduction.scene?: StoredScene` — when present, `storedSceneToModel` is used to render; when absent, legacy path was used.
- `src/core/storage/sceneBuilder.ts` — shared utilities: `defaultSceneShell()`, `restageCast()`, `estimateDuration()`, `actorPlacement()`.
- `storedSceneToModel.ts` — general deserialiser: `StoredScene` + `StoredActor[]` → `Model`. Replaces `scriptToModel`.
- `ProductionStore.create()` now populates `scene` (default shell) and `actors: []`.
- `AddActorCommand` auto-stages actors via `restageCast()` when scene present.
- `SetSpeakLinesCommand` — converts `ScriptLine[]` into `SpeakAction[]` with computed `startTime`s; updates scene duration and idle-anim `endTime`s.
- Scene commands landed: `UpdateCameraCommand`, `AddSetPieceCommand`, `RemoveSetPieceCommand`, `StageActorCommand`, `UnstageActorCommand`.
- `migrateLegacyProduction()` in `+page.svelte` — one-shot migration of pre-5b productions on first open.
- `scriptToModel` and its tests deleted; `StoredProduction.script` made optional.
- 88/88 tests green, 0 svelte-check errors.

**Not in this phase:** scene composition panel UI — no way yet to add/reposition objects from the browser. That is Phase 5c.

---

### Phase 5c — Design/playback canvas split
*Establishes the authoring viewport architecture. Exposes the scene commands landed in 5b through actual UI.*

**Architecture decisions captured:**
- Design and playback share a single `THREE.Scene` in memory — no duplication.
- Design-only overlays (gizmos, frustum helpers, path splines) live on **Three.js layer 1**. The playback camera renders layer 0 only; the editor camera renders all layers. A single `designOverlaysGroup` node on layer 1 makes the playback-pass traversal cost a single layer-mask check.
- Both cameras render to the **same `<canvas>`** via scissored render passes (standard 3D editor technique). Future evolution: two `<canvas>` elements → then `window.open()` popup for the design view, without touching the scene graph or command layer.
- `buildSceneGraph(model)` extracted from `Presenter.svelte` into `src/lib/scene/buildSceneGraph.ts` ✅ — pure async construction, no Tone.js, no TTS, no renderer refs. Both canvases will call this.

**Remaining steps:**
1. **Design/playback mode toggle** — `designMode: boolean` in `+page.svelte`; scissored second render pass in `Presenter.svelte` using an OrbitControls editor camera. Playback camera visualised as a wireframe frustum (layer 1) in the design pass.
2. **Right panel restructured** — replace empty Properties/Script tabs with Stage tab (scene object tree, add/remove buttons wired to existing commands) and Script tab (ScriptEditor + actor management migrated from left panel).
3. **Canvas selection** — click actor/set-piece → selected object state; bounding-box highlight (layer 1). Stage tab scrolls to match.
4. **Transform gizmos** — `THREE.TransformControls` in design mode on selected object; drag-end fires `UpdateStagedActorCommand`. Keyboard: `G` grab, `R` rotate.
5. **Drag-from-catalogue** — drag character from Catalogue tab, drop onto ground plane in design canvas → `AddActorCommand` + immediate placement.

**Phase complete when:** a two-actor scene can be authored from scratch — characters placed, dialogue written, played back — without touching code.

---

### Phase 6 — Script as document ✅ COMPLETE
*Screenplay view of the domain model; two-way editor. Fills the Script tab in the right panel.*

- Screenplay format: `CHARACTER NAME` heading + indented dialogue, Courier monospace.
- Click any beat to open inline editor (actor dropdown, textarea, pause duration). Click again, click away, or press Escape to close.
- `@media print` CSS included; ⎙ Print button calls `window.print()`.
- `+ Add line` auto-opens new beat for immediate editing; alternates actors for flow.
- Props interface: `{ script, onchange, actors? }` — callers unchanged.

**Phase complete when:** screenplay view of `twoRobotsScene` matches its authored lines; print export produces readable output. ✅

---

### Phase 6.5 — Screenplay enrichment *(deferred)*
*Proper screenplay formatting is a discipline of its own — needs a dedicated session.*

- Scene headings (`INT. WAREHOUSE — DAY`).
- Action / stage direction lines (non-dialogue beats).
- Industry-standard pagination (55 lines/page, page numbers top-right).
- Title page (title, author, draft date, contact block).
- Scene index / breakdown sheet export.
- PDF export via `jsPDF` or server-side Puppeteer (browser `window.print()` is the zero-effort fallback for now).
- Research note: WGA / British standard formatting rules differ — decide which to target.

---

### Phase 7 — Camera tracks
*High visual impact; makes productions feel cinematic.*

- Timeline-style camera path editor over `addAction({ type: 'camera', ... })` (already in domain model).
- Design camera (free-orbit whilst editing) vs named playback cameras with keyframed position + lookAt.
- `cameraCut` action: switch active playback camera at a given time.
- **Path primitive designed for reuse** — the spline/keyframe data structure and the design-canvas path gizmo are extracted as a general `AnimatedPath` type so character movement (`moveTo` action, Phase 7.5+) can reuse the same editor UI and runtime interpolation without a second implementation.

---

### Phase 8 — Ground-zero animation authoring *(next — highest-risk item)*
*De-risk the animation authoring problem. No custom bone posing, no drag timeline — just enough numeric UI to recreate TwoRobots and FlyIntoRoom from the authoring tool instead of from code.*

#### Scope — what this is NOT

- Bone posing / inverse kinematics (use a DCC tool for that)
- A drag-and-drop visual timeline (deferred to Phase 8.5)
- A curve editor (deferred)

#### Runtime gap to close first

`storedSceneToModel.ts` (the stored-production → renderer path) must handle `MoveAction` and `LightingAction`. `SceneBridge.ts` (domain-object path) already does. Parity is needed before authoring can be verified end-to-end. Add tests.

#### Three authoring surfaces

**Surface A — GLTF clip sequencer** (Stage tab, per actor)

A list of `AnimateAction` rows. Each row: clip name (dropdown from the character's `animationClips` catalogue entry), start time, end time (blank = scene end), fade-in, fade-out seconds. Add / delete per row. Covers TwoRobots: `Idle → Walking → Idle → Walking` with crossfade windows.

**Surface B — Transform keyframe editor** (Stage tab, per actor or set piece)

Two collapsible tracks per object: `.position` (Vec3) and `.rotation` (Euler XYZ, converted to quaternion at build time). Each track shows a list of `{ time, value }` rows editable by typing, plus a **"Capture at ▶"** button which appends a keyframe at the current transport-head time using the object's live world-space value read from the scene graph.

Typical workflow to walk a character:
1. Scrub to t=2. Drag Alpha to (-8, 0, 0). Press "Capture position".
2. Scrub to t=4. Drag Alpha to (-2.5, 0, 0). Press "Capture position".
3. A `MoveAction` for `alpha / .position` is now stored and plays back.

Covers TwoRobots movement + rotation, and the FlyIntoRoom door-hinge case (`.rotation` Y on the `hinge` set piece). `SetPiece.parent` already exists in the data model — add a UI picker so `door.parent = 'hinge'` can be authored without code.

**Surface C — Scalar keyframe editor** (Stage tab, per light)

Same keyframe-list pattern for a single scalar property (`.intensity`). Covers FlyIntoRoom spotlight fade-in/out. `LightingAction` type + `SceneBridge` handler already exist.

#### Scrub-and-capture paradigm — known precedents and open questions

*This is the standard keyframe-insertion paradigm in every major animation tool (After Effects, Unreal Sequencer, Blender's Dope Sheet, Unity's Animator). The workflow is: move the playhead, pose the thing, press a key or button to record.* Directionally's equivalent is: scrub transport → drag/type value → press Capture.

**Open question — timeline length**: Currently the transport slider auto-sizes to current scene content (dialogue duration + 1 s padding). For authoring a 100 s walk before any dialogue exists, you would need to set the scene `duration` explicitly first. The fix is:

- Add a **manual duration override** field (editable integer or float, seconds) in the Stage tab's scene header. When set, the transport slider uses this value instead of the computed content duration. After dialogue is added and the content duration exceeds it, the override is ignored and removed.
- This mirrors the DAW pattern: in REAPER/Pro Tools you set a project length explicitly, then content drives it once it's larger. The auto-sizing remains useful for short-form productions where duration is implicit from the script.

This is a small addition to Phase 8 step 1 (opening the scene header for editing) and unblocks the longer-scene authoring workflow before surface B is built.

#### New commands (all through `ProductionDocument.execute()` → full undo/redo)

| Command | What it does |
|---|---|
| `SetSceneDurationCommand` | Sets an explicit scene duration override |
| `AddAnimateSegmentCommand` | Appends a `ClipTrack` for an actor |
| `RemoveAnimateSegmentCommand` | Removes by actor + segment index |
| `UpdateAnimateSegmentCommand` | Patches timing / fade on an existing segment |
| `SetMoveTrackCommand` | Replaces the full `TransformTrack` for a target + property (on commit) |
| `CaptureTransformKeyframeCommand` | Appends one keyframe to a target's `TransformTrack`, or creates it |
| `SetLightingTrackCommand` | Replaces the `LightingTrack` for a light, or creates it |
| `SetSetPieceParentCommand` | Sets `SetPiece.parent` for hierarchical assemblies |

#### Implementation steps (all complete ✅)

1. Closed `storedSceneToModel.ts` runtime gap + tests.
2. Added manual `duration` override field (`SetSceneDurationCommand`).
3. Commands with tests: `AddAnimateSegmentCommand`, `RemoveAnimateSegmentCommand`, `UpdateAnimateSegmentCommand`, `CapturePositionKeyframeCommand`, `RemoveTransformKeyframeCommand`, `CaptureLightIntensityKeyframeCommand`, `RemoveLightKeyframeCommand`, `SetActorIdleAnimationCommand`, `SetActorScaleCommand`.
4. Surface A — GLTF clip sequencer (per actor, dynamic clip discovery from loaded GLTF at runtime).
5. Surface B — position keyframe list + scrub-and-capture workflow (`getObjectTransform` on Presenter; drag-to-preview, ⊕ Capture to lock).
6. Surface C — light intensity keyframe list.
7. Per-actor idle clip and scale overrides (settings panel in Cast section).
8. Design-mode drag dispatch by time: t≈0 sets spawn position; t>0 is a visual preview, ⊕ Capture locks keyframe.

**Open items from Phase 8 (low priority, deferred):**
- `SetSetPieceParentCommand` + UI picker (hierarchical set pieces, e.g. door+hinge)
- Editable keyframe values by typing (currently capture-only)
- fadeIn/fadeOut fields on clip form

---

### Phase 8.5 — Block-based character animation ✅ COMPLETE

*Replace the separate clip-list + position-keyframe authoring with a unified `ActorBlock` type that expresses intent at the right level of abstraction: "walk from A to B", "idle here", "turn to face".*

#### Naming convention (locked)

- **`*Block`** — high-level authored director intent (`ActorBlock`, `LightBlock`). These are what the author writes.
- **`*Track`** — low-level compiled keyframe primitives (`ClipTrack`, `TransformTrack`, `LightingTrack`). These are what the renderer plays. Never stored; always derived.
- **`*Action`** — event triggers (`SpeakAction`, `EnterAction`, `ExitAction`). Point-in-time, not range-based.

#### Design rationale

The Phase 8 surfaces are correct but low-level: the user must independently coordinate a clip segment, a position track, and a facing rotation — three separate actions that represent one intent. An `ActorBlock` unifies these into a single authored object.

#### The `Block` type family

```typescript
// New first-class serialised types in src/core/domain/types.ts
type ActorBlock = {
  type: 'actorBlock';
  actorId: string;
  startTime: number;
  endTime: number;
  clip?: string;           // omit → idle / hold last pose
  startPosition?: Vec3;    // omit → inherit previous block's endPosition
  endPosition?: Vec3;      // omit → stay at startPosition
  startFacing?: Vec3;      // direction vector; omit → inherit
  endFacing?: Vec3;        // omit → auto: face travel direction; forward if stationary
};

type LightBlock = {        // Phase 8.7
  type: 'lightBlock';
  lightId: string;
  startTime: number;
  endTime: number;
  startIntensity?: number;
  endIntensity?: number;
};

type Block = ActorBlock | LightBlock;  // extensible; AudioBlock, CameraBlock future
```

`Block` entries are stored in `StoredScene.blocks: Block[]` (new field alongside existing `actions`). At playback, `actorBlockToTracks(block: ActorBlock) → SceneAction[]` in `blockCompiler.ts` compiles each block to a `ClipTrack` + optional `TransformTrack` (position) + optional `TransformTrack` (facing quaternion track). The compiled tracks are not stored.

Old `ClipTrack`/`TransformTrack` entries in `actions` continue to work unchanged (played back directly). No migration.

#### Turn variant

A turn is an `ActorBlock` with `startPosition === endPosition` and `startFacing !== endFacing`. The compiler detects this and emits only a facing interpolation track (2-keyframe quaternion `TransformTrack`), no position track. No separate `TurnBlock` type needed.

#### UI: per-actor block list (Phase 8.5) → visual timeline (Phase 8.6)

Phase 8.5 delivers a **list UI**: each actor has a collapsible section showing its blocks as rows (start, end, clip dropdown, position fields). Add/remove/edit via commands. The drag-to-preview + ⊕ Capture pattern from Phase 8 is retained for position fields.

Phase 8.6 upgrades this to a **visual horizontal track**: blocks are draggable coloured rectangles on a time axis, sized by duration. Gaps are shown as grey (implicit idle). Clicking a block opens a popover. This is the primary authoring surface once implemented.

#### New commands (Phase 8.5)

| Command | What it does |
|---|---|
| `AddActorBlockCommand` | Appends an `ActorBlock` to `scene.blocks` |
| `RemoveActorBlockCommand` | Removes by index |
| `UpdateActorBlockCommand(index, patch)` | Patches any field of an `ActorBlock` |

#### Implementation steps (all complete ✅)

1. `ActorBlock`, `LightBlock`, `CameraBlock`, `SetPieceBlock`, `Block` types in `src/core/domain/types.ts`; `blocks?: Block[]` on `StoredScene`.
2. `blockCompiler.ts` — compilers for all four block types; full test coverage.
3. `storedSceneToModel.ts` wired — compiled tracks merged with `scene.actions`.
4. `AddActorBlockCommand`, `RemoveActorBlockCommand`, `UpdateActorBlockCommand` (and equivalents for all block types) with tests.
5. UI: per-actor block list rows in Stage tab.

---

### Phase 8.6 — Visual timeline strip ✅ COMPLETE

- Per-actor, per-light, per-camera, per-set-piece horizontal track strips in a resizable bottom panel.
- Blocks rendered as coloured rectangles; draw new blocks by click-drag on empty track space.
- Gaps rendered in grey — implicit idle with no authored block.
- Click block → selects block, Stage tab shows editor for that block's fields.
- Playhead needle tracks transport position.
- `CameraBlock`, `SetPieceBlock` timeline rows added alongside `ActorBlock` and `LightBlock`.

---

### Phase 8.7 — LightBlock + CameraBlock + SetPieceBlock ✅ COMPLETE

- `LightBlock`: `startIntensity`, `endIntensity` — replaces Phase 8 Surface C scalar keyframe editor.
- `CameraBlock`: position + lookAt interpolation across a time range; compiled to `TransformTrack`.
- `SetPieceBlock`: position/rotation/scale over a time range for set pieces.
- `AudioBlock` *(deferred)* — design captured, implementation deferred to Phase 11.

---

### Phase 8.8 — Catalogue asset defaults *(complete)*

*The Soldier model was authored facing away from +Z (the default camera look direction), so "face direction of travel" makes him walk backward.*

- `defaultRotation?: Vec3` (Euler XYZ, radians) added to `CharacterEntry` in `src/core/catalogue/types.ts`.
- `entries.ts`: `defaultRotation: [0, Math.PI, 0]` for Soldier so it faces +Z by default.
- `storedSceneToModel.ts`: propagates `character.defaultRotation` to the domain `Actor` object.
- `SceneBridge.ts`: `staged.startRotation ?? actor.defaultRotation` so the default is overridable by any authored rotation.
- `blockCompiler.ts`: `actorBlockToTracks` accepts `modelDefaultRotation` and post-multiplies it onto facing quaternions.
- `defaultScale` already existed as a per-actor override (Phase 8); `defaultRotation` is its companion.

**Phase complete when:** Soldier faces the camera by default and "face direction of travel" produces correct forward motion. ✅

---

### Phase 8.9 — UX quick wins *(complete)*

Small focused fixes that eliminate confusion before the larger UX redesign in Phase UX1.

- **Playback/Design button label** ✅ — Relabelled to "▶ Switch to Playback view" / "✏ Switch to Design view" to name the destination, not the current state.
- **Rotation gizmo at block-end** ✅ — Added `rotationEnabled` prop to Presenter; when an actor block is selected the rotate button is hidden and the mode is forced to translate (block-end captures position only).
---

### Phase T — Tablet support *(complete)*

*The authoring tool now works on a tablet browser (iPad/Android) without a keyboard or mouse for the core authoring workflow.*

#### What was implemented

1. **Timeline pointer events** — already used `pointerdown`/`pointermove`/`pointerup` + `setPointerCapture`; added `touch-action: none` on `.tl-track` to prevent iOS Safari scroll interference during block draw/drag
2. **Three.js touch** — added `touch-action: none` on `#render-container`; Three.js OrbitControls and TransformControls handle pointer events natively (r162+)
3. **On-screen undo/redo** — floating `↩`/`↪` button pair overlaid top-left of the canvas in design mode; 44×44 px touch targets; disabled state reflects `canUndo`/`canRedo`
4. **On-screen G/R gizmo buttons** — already existed (44×44 px, `-webkit-tap-highlight-color: transparent`)
5. **On-screen snap-to-playback button** — added ⊙ button to gizmo toolbar (replaces `P` keyboard shortcut)
6. **Block delete on touch** — block remove button already exists in right panel when block selected
7. **Catalogue add on touch** — `onadd` prop / "+ Add to scene" button already existed for touch-friendly placement at origin

---

### Phase UX1 — Minimal interaction model *(high priority)*

*A design-first pass at reducing configuration clutter and surface area. Goal: a new user familiar with screenplay software can author a short play from scratch guided entirely by visual affordances — no documentation needed.*

#### The core problem

The tool currently surfaces too many ways to do the same thing, and too many places to look simultaneously. A user trying to "move this character across the stage" must know about: blocks, the timeline, the Stage tab, initial vs. end positions, clip assignment, and how they relate. The underlying data model is sound — the UX problem is exposure surface.

#### Guiding principles

1. **One canonical way**: where multiple surfaces do the same thing, remove or demote all but one.
2. **Progressive disclosure**: show only what's needed for the next step. Configuration that's rarely changed lives behind an expander or a secondary tap.
3. **Visual affordances over text**: a user should be able to see what is draggable, animatable, and selectable from visual state alone — no label-reading required.
4. **Script-first entry point**: every author already knows how to write dialogue. That is the opening surface; the 3D world builds from the script.

#### Redesign areas (for investigation — not final spec)

**A — Script-first authoring**

*"Why can't I just type a script like I normally would? Like Final Draft or StudioBinder."*

The screenplay editor exists (Phase 6) but is buried in the right panel. Proposal: on a new production the primary view is a **screenplay canvas** — free-form text with intelligent autocomplete (character names from the cast, suggested stage directions). Characters mentioned in the script automatically join the cast. A "Generate scene" action converts dialogue lines to blocks, auto-places characters, and seeds the timeline — providing an instant first playback you can refine interactively. This matches how Final Draft / StudioBinder / Highland operate, extended with the 3D dimension.

**B — Cast: production-level, not scene-level**

*"Is cast per scene or per production? Shouldn't you add cast to the production and populate scenes from the production cast list?"*

Cast is a production-level concept. Scenes draw from it. The current Stage tab conflates production-level casting with scene-level staging because both live in the same panel.

Fix: cleanly separate **Cast** (production roster — who exists, their role, their voice) from **Staging** (where they stand in this scene). Cast belongs in the Productions tab. The Stage tab becomes purely scene-level — it shows which cast members are present in this scene and their positions, but cannot add new characters to the production.

**C — Acts and scenes structure**

*"How do I make acts and scenes?"*

The data model (nestable Group/Scene tree) supports it; there is no authoring UI. Proposal: the productions list in the left panel becomes an inline expandable tree. "Add scene" adds a leaf; "Add act" adds a group node. Scenes can be dragged to reorder within acts.

**D — Voice placement**

*"Why is Voice in the Stage tab, but a voice label is in the timeline?"*

Voice assignment is an actor property, not a scene property. Move voice assignment to the actor card in the production Cast section. The timeline label reflects that configuration; no editing in the timeline.

**E — Reduce simultaneous surfaces**

The current layout has four active regions: left panel (Productions / Catalogue), right panel (Stage / Script), timeline, and canvas. Proposal: as a first simplification step, merge Stage and Script into a single **Scene panel** showing script and staging side by side. Only show controls relevant to the currently selected block; hide everything else via progressive disclosure.

**F — Camera Initial pos alignment**

The camera "Initial pos" field plus capture button sits outside the block paradigm used for set pieces and characters. Align it: camera spawn position at t=0 follows the same "design camera drag → ⊕ Capture" paradigm as set-piece and actor positioning. Remove the special-case t=0 field; the CameraBlock default handles it. Clarify the capture-button affordance label.

---

### Phase 9 — Scene dressing: set building + character identification

*Goal: a user can rough in a recognisable venue (theatre stage, TV studio, news desk) from primitive pieces, and tell characters apart at a glance without relying on model labels.*

#### The two use cases

**Build a set** — The existing primitives (box, plane, sphere, cylinder) are architecturally correct, but their catalogue sizes are fixed (1×1×1 cube, 10×10 plane). Building a theatre flat (4m wide × 3m tall × 0.15m deep) or a news desk (1.5m × 0.75m × 0.5m) requires resizing after placement. Currently no command covers non-positional edits — color, scale, and geometry dimensions are immutable once a set piece is added.

**Visual indication of different characters** — All Robot/Soldier instances look identical in the viewport. The timeline already assigns each actor a distinct color from a fixed palette (`actorColor(i)`). Projecting that same color as a ground disc beneath each staged actor creates a direct visual link between the timeline strip and the character's stage position — no GLTF traversal or shader work required.

#### Phase 9.A — Set piece property inspector

When a set piece is selected in design mode (`selectedObjectId` matches a set-piece name), the Staging tab shows an inspector section below the existing set-piece list:

- **Color** — hex `<input type="color">` wired to `material.color`
- **Scale** — three number fields (X/Y/Z); a lock-aspect toggle offers uniform scaling shorthand
- **Geometry dimensions** — shown per type:
  - `box`: Width / Height / Depth
  - `plane`: Width / Height
  - `sphere`: Radius
  - `cylinder`: Radius / Height
- All fields fire `UpdateSetPieceCommand` on `change`

**`UpdateSetPieceCommand(name: string, patch: Partial<SetPiece>)`** — patches any fields on the named `SetPiece` in `scene.set`; the model reload triggered by `ProductionDocument.onChange` reflects the change. `MoveSetPieceCommand` (drag-to-reposition) is unchanged — the inspector handles non-positional edits only.

The command uses a shallow merge for nested objects: `{ ...piece, ...patch, material: { ...piece.material, ...patch.material }, geometry: { ...piece.geometry, ...patch.geometry } }` so partial material/geometry patches don't clobber unrelated fields.

#### Phase 9.B — Set piece catalogue expansion

Add entries with set-building-appropriate default sizes so common environments need little or no resizing:

| Entry | Geometry | Material | Intended use |
|---|---|---|---|
| Wall flat | box 4 × 3 × 0.15 m | `0xddd8c4` matte off-white | Theatre flat, room wall |
| Stage deck | plane 8 × 8 m | `0x8b6914` matte wood | Stage / studio floor |
| Studio backdrop | box 6 × 4 × 0.1 m | `0x1a2a4a` matte dark blue | Cyclorama / chroma-key |
| Table | box 1.5 × 0.75 × 0.5 m | `0x4a3728` matte dark wood | Desk, news anchor table |
| Step | box 1 × 0.2 × 0.6 m | `0x555555` matte grey | Stage step / riser |

These are also the seeds for "snap a studio together in under a minute" — the canonical Phase 9 demo task.

#### Phase 9.C — Character ground markers

Each staged actor with a known `startPosition` gets a coloured disc rendered below them. The colour comes from the same `COLORS` palette as the actor's timeline track, so the disc is visually linked to the strip.

**Implementation:**
- In `storedSceneToModel.ts`, after resolving staged actors, synthesize one `SetPiece` mesh per staged actor: `{ type: 'cylinder', radiusTop, radiusBottom, height: 0.04 }` at `[x, 0.02, z]` with `material.color = ACTOR_COLORS[i % ACTOR_COLORS.length]` and a low `emissive` so it is visible in shadow.
- The `ACTOR_COLORS` palette is extracted into `src/lib/actorColors.ts` (a plain constant) so it is importable by both `TimelinePanel.svelte` and `storedSceneToModel.ts` without a circular dependency through the UI layer.
- Markers are toggled by `StoredScene.showMarkers?: boolean` (default `true`). A checkbox in the Scene section of the Staging tab drives `UpdateSceneMarkerCommand(flag)`.
- Markers are synthetic — not stored in `scene.set`, not selectable, not animatable.

#### New commands

| Command | What it does |
|---|---|
| `UpdateSetPieceCommand(name, patch)` | Patches any `SetPiece` fields by name |
| `UpdateSceneMarkerCommand(show)` | Sets `StoredScene.showMarkers` |

#### Phase complete when

- A user can place a wall flat, scale it to cover the back of the stage, and recolor it — all via UI
- A scene with two Robot actors shows distinct-coloured ground discs that match their timeline strip colors
- The "quick studio" demo (backdrop + stage deck + table + two characters) can be assembled in the browser in under 2 minutes

#### Out of scope for Phase 9

- Material texture URLs (CORS + asset management complexity; deferred to Phase 13)
- Character skin/tint via GLTF mesh traversal (shader work; separate investigation)
- `SetPiece.parent` hierarchical UI (deferred from Phase 8; still low priority)
- Editable roughness/metalness (color covers 90% of set-dressing needs; PBR sliders deferred to a "materials" phase)

---

### Phase 10 — Lighting rig

- Add lights from catalogue; fix `point` light gap (scaffolded in domain types, currently skipped).
- `LightBlock` (from Phase 8.7) is the authoring surface.

---

### Phase 11 — Sound & music *(merged into Phase 8.7 scope)*

- `AudioBlock` covers `SoundEffect` + `BackgroundMusic` use cases.
- Remaining work: timeline strip rendering for audio blocks, waveform preview (deferred).

---

### Phase 12 — Dance choreography *(deferred — needs spike)*

MIDI → keyframe synchronisation shape is unclear. Spike before committing to an approach.

---

### Phase 13 — Remote asset store *(deferred)*

`CharacterEntry.gltfPath: string` is already URL-agnostic — a relative path serves the local catalogue, an absolute URL serves a remote one. A future `AssetStore` interface encapsulates discovery and credential injection:

```ts
interface AssetStore {
  list(): Promise<CharacterEntry[]>;
  resolveUrl(entry: CharacterEntry): Promise<string>; // injects signed tokens if needed
}
```

The existing `CATALOGUE_ENTRIES` array becomes the `BundledAssetStore` implementation; callers never change.

Possible directions:
- **Self-hosted**: GLBs on S3/R2; store signs URLs per-request.
- **Sketchfab API**: `GET /v3/models/{id}/download` returns a short-lived signed URL; attribution carried in `CharacterEntry`.
- **Ready Player Me**: avatars at `https://models.readyplayer.me/{id}.glb` with optional morph-target query params.
- **Mixamo FBX→GLB pipeline**: Adobe Mixamo account, FBX downloaded, converted offline (e.g. Blender headless), served from self-hosted store.

---

## Codebase state

| Area | Status |
|---|---|
| Domain model — flexible Group/Scene tree | ✅ Complete |
| Model/renderer layer | ✅ Complete (except point lights) |
| SceneBridge domain→renderer | ✅ Complete (enter/exit/point light skipped with warnings) |
| PlaybackEngine (play/pause/seek/rewind) | ✅ Complete |
| eSpeak-NG TTS (default, cross-browser) | ✅ Complete |
| Kokoro neural TTS (optional) | ✅ Complete |
| Speech bubbles | ✅ Complete |
| Sandbox script editor | ✅ Complete |
| Production storage | ✅ Complete |
| `src/core/timeline/` | Empty scaffold — reserved for timeline editor |
| Transport bar (bottom panel) + left panel tabs | ✅ Complete |
| Asset catalogue | ✅ Complete |
| Remote asset store | Phase 13 |
| Right panel (collapsible) | ✅ Complete |
| ProductionDocument — command execution + undo/redo | ✅ Complete |
| Scene composer — storage format + migration | ✅ Complete (Phase 5b) |
| `buildSceneGraph` extracted (Tone-free scene construction) | ✅ Complete (Phase 5c step 1) |
| Design/playback canvas split + gizmos + object placement | ✅ Complete (Phase 5c) |
| Screenplay editor | ✅ Complete (Phase 6) |
| Screenplay enrichment (pagination, headings, PDF) | Phase 6.5 (deferred) |
| Camera tracks UI | ✅ Complete (Phase 7) |
| Ground-zero animation authoring (clip sequencer, keyframe capture, per-actor settings) | ✅ Complete (Phase 8) |
| `ClipTrack` / `TransformTrack` / `LightingTrack` type rename | ✅ Complete |
| `ActorBlock` — unified clip+position+facing authoring primitive | ✅ Complete (Phase 8.5) |
| Visual timeline strip (draggable block rectangles) | ✅ Complete (Phase 8.6) |
| `LightBlock` + `CameraBlock` + `SetPieceBlock` | ✅ Complete (Phase 8.7) |
| Catalogue asset defaults (`defaultRotation`, Soldier orientation fix) | ✅ Complete (Phase 8.8) |
| UX quick wins (button labels, rotation gizmo, camera paradigm) | Phase 8.9 |
| Tablet support (touch/pointer events, on-screen shortcuts) | Phase T |
| Minimal interaction model (script-first, cast/staging split, one-way-of-doing-things) | Phase UX1 |
| Asset properties editing | Phase 9 |
| Lighting rig | Phase 10 |
| Sound effects / music | Phase 11 (merged into 8.7) |

