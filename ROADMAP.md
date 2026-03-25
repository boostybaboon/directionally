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

### Phase UX1 — Minimal interaction model ✅ COMPLETE

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

### Phase UX2 — Authoring workflow (9 snags)

*Targeted fixes to the core authoring loop identified through first-use testing. Each sub-item is self-contained and can be shipped independently.*

#### UX2.1 — Production creation naming *(complete)*

- `ProductionStore.create()` generates names as "Untitled Production", "Untitled Production 2", "Untitled Production 3" — the first gets no suffix; subsequent ones find the next unused integer by scanning existing production names.
- After creation, the production name field enters inline edit mode immediately (equivalent to clicking the ✎ rename button right away). The name is selected so the author can type over it without backspacing.
- No command needed — this is purely a post-`create()` UI state change in the page.

#### UX2.2 — Actor add UX overhaul + legacy single-scene expunge *(complete)*

**Legacy expunge (prerequisite):** Remove all code paths that read or write `StoredProduction.scene` (the singular legacy field). Every production now uses `StoredProduction.scenes: NamedScene[]`. No migration needed — no real users yet. Simplifies `commands.ts`, `sceneBuilder.ts`, `storedSceneToModel.ts`, and the page considerably. Adding an actor will no longer need the `if (!doc.scene)` guard branches.

**Actor add UX:** Drop the two-stage form (click `+ Actor` → fill form → click `Add`). Replace with:
- Clicking `+ Actor` immediately appends a new actor with a generated role name ("Character 1", "Character 2", …) and the first catalogue character as default (Robot Expressive).
- The new row immediately enters inline rename mode, focused on the role name field. Type and press Enter to confirm.
- A compact inline `<select>` sits right of the role name for changing the model — no separate character-picker step.
- No confirmation button; the actor is live as soon as it is created.

**No auto-staging:** adding to the production cast does not stage the actor in any scene. Staging is a separate explicit step (UX2.4). This is intentional — scenes can have different subsets of the cast.

#### UX2.3 — Scene and act tree *(complete)*

**Bug fix:** "+ Scene" button fires `AddSceneCommand` correctly but the scenes list does not visually update. Root cause: the `onChange` callback refreshes `productions` from the store, causing the `{#each productions as prod}` block to remount, which re-evaluates `{@const prodScenes = docSnapshot.scenes ?? []}` before `docSnapshot` has been updated for the current render cycle. Fix: update `docSnapshot` before triggering `productions` list refresh in `onChange`, or key the production list on id so Svelte does not destroy/recreate the active item.

**Act support:** Add a `+ Act` button alongside `+ Scene`. An act is a named container for scenes.

Storage change — `StoredProduction.scenes: NamedScene[]` → `StoredProduction.tree: Array<StoredGroup | NamedScene>` where:

```ts
type StoredGroup = {
  type: 'group';
  id: string;
  name: string;
  children: Array<StoredGroup | NamedScene>;
};
```

Helper `getScenes(tree): NamedScene[]` (depth-first) replaces all `doc.scenes ?? []` call-sites. Migration: at load time, a production that still has a flat `scenes` array is wrapped into `tree` once.

Left panel tree rendering: acts are expandable group headers; scenes are indented beneath their act. Scene rows show a filled dot (●) if active. Drag to reorder deferred.

New commands: `AddGroupCommand`, `RenameGroupCommand`, `RemoveGroupCommand`. `AddSceneCommand` gains an optional `parentGroupId` argument.

#### UX2.4 — Staging actors in a scene *(complete)*

Currently there is no visible path from "I added this character to the cast" to "they appear in a specific scene". Address this:

- Cast section (left panel, active production): each actor who is **not yet staged** in the active scene shows an `⊕ Stage` button. Clicking it stages them at a default offstage position (behind the camera, so they are present but invisible until moved).
- Drag from a cast actor row onto the 3D canvas in design mode → stages them at the ground intersection point under the cursor.
- Staged actors show a filled badge; unstaged actors show an open ring — a glanceable per-scene presence indicator.
- "Add to scene" remains scene-specific: switching to a different scene shows different staging state for the same cast.

Deferred: scene-level cast group presets ("all Act 1 characters") — noted for a future phase.

#### UX2.5 — Reusable set templates

A recurring need: dress a stage once (theatre flat + floor + backdrop) and re-apply it across all scenes in the production without recreating it.

- "Save as set template" action in the Set section of the Staging tab — saves the current scene's `set: SetPiece[]` under a user-chosen name.
- Set templates appear in the Catalogue tab under a new "Set Templates" group.
- Applying a template copies all its set pieces into the active scene (non-destructive append; name collisions get a numeric suffix so existing pieces are not overwritten).
- `SetTemplateStore` service in `src/core/storage/` — same shape as `ProductionStore`, backed by `localStorage`.
- No live link between template and scenes — a template is a saved snapshot, not a shared reference.

#### UX2.6 — Script editor (pull forward from Phase 6.5)

Pulled forward because it directly enables the multi-scene authoring workflow from UX2.3:

- Full-production screenplay view: a single scrollable document showing all scenes in order, with scene headings (`INT. LOCATION — TIME`) between them.
- Action / stage direction lines: a dedicated line type with indent, visually distinguished from dialogue.
- Per-scene script tab retains its current per-scene scope for authoring; the full-production view is primarily for reading and printing.
- `@media print` styles produce correctly paginated output; ⎙ Print button calls `window.print()`.
- Depends on UX2.3 stable scene tree (scenes must have a stable depth-first order before spanning them).

Full Phase 6.5 spec (pagination, PDF export, title page) remains deferred; this sub-item delivers the 80% case.

#### UX2.7 — Spawn indicator as pre-t=0 block *(complete)*

The ⊕ spawn pin in the timeline is replaced by a **pre-timeline block** — a coloured rectangle that ends exactly at t=0, rendered to the left of the zero-line in the actor's track.

- Same colour as the actor's track, with a darker fill or subtle crosshatch pattern to signal "before the scene begins". The ⊕ crosshair graphic is retained inside it.
- **Interaction model:** clicking the pre-block selects it. The Staging tab then shows the spawn position fields — consistent with the existing paradigm "selecting a block = editing position at block-end". The pre-block ends at t=0, so its block-end position is the spawn position.
- The pre-block is fixed in time (cannot be dragged left/right). Its position in the scene is set by dragging in the 3D canvas, identical to block-end positioning.
- The pre-block does not correspond to a stored `ActorBlock`. `TimelinePanel.svelte` renders it as a synthetic element and emits `onspawnselect(actorId)` when clicked (the prop already exists; the visual is the change).
- Width of the pre-block: a fixed visual width (e.g., 32px or 1 second equivalent) — it is not time-proportional since it has no real duration.

#### UX2.8 — Production playback / presentation mode *(complete)*

A dedicated **Present** button plays all scenes in the production in depth-first order:

- Visually distinct from the per-scene ▶ — different icon (e.g. ⏵⏵ or a film-strip icon), different colour.
- Each scene plays to its duration, then hard-cuts to the next. Scene transition fade deferred.
- Presentation mode collapses the left panel, right panel, and timeline so the canvas fills the window. A minimal HUD shows current scene name and position.
- Esc exits presentation mode; the tool returns to the last manually selected scene.
- Transport bar in presentation mode shows scene name and a global progress indicator.

`PlaybackEngine` needs a `playlist` mode: when `stopped` after the last frame of a scene, it calls `onSceneEnd()` which the page handles by loading the next scene's model and calling `play()`.

#### UX2.9 — Speech and Audio panel *(complete)*

- Rename the "AUDIO" collapsible section in the left panel to **"SPEECH AND AUDIO"**.
- Move TTS engine selection (eSpeak / Kokoro) from global to per-production: `StoredProduction.speechSettings?: { engine: VoiceBackend; bubbleScale: number }`.
- The productions sidebar shows a compact speech settings section for the active production (engine toggle + bubble scale slider), below the Cast section.
- The global "SPEECH AND AUDIO" panel in the left panel retains its role as the **default** — applied when a production has no `speechSettings` override.
- `SetProductionSpeechSettingsCommand` — patches `speechSettings`; backwards compatible (absence = use global default).

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

### Phase UX3 — Drag-and-drop cast management *(deferred)*

*Replace multi-step cast-add flows with direct drag interactions across the three surfaces: Catalogue, Production cast, and Scene staging.*

**Catalogue → Production cast:** Drag a character card from the Catalogue tab and drop it onto the active production's Cast section. Equivalent to clicking `+ Actor` with that `catalogueId` pre-selected. Role name defaults to the character label and immediately enters inline rename.

**Production cast → Scene (design canvas):** Drag an actor card from the Cast section in the left panel and drop it onto the ground plane in the 3D design canvas. Stages the actor at the drop point — equivalent to `⊕ Stage` followed by spawn-pin placement in one gesture. A "ghost" model follows the cursor during the drag to confirm the drop target.

**Production cast → Scene (tree / staging tab):** Drag an actor card and drop it onto a scene node in the left-panel act/scene tree, or onto the "Cast in this scene" section of the Staging tab. Stages the actor at a default position (centre stage, [0,0,0]), which can then be refined with the spawn pin.

**Prerequisites:** UX2.4 (staging UX) and UX2.3 (act/scene tree) must be complete. All drag interactions are progressive enhancement — the existing button-based flows remain fully functional.

**Technical notes:**
- Browser drag-and-drop API (`draggable`, `dragstart`, `dragover`, `drop`) for panel-to-panel transfers.
- Three.js canvas drop requires a raycaster ground-plane intersection on `dragover` to compute the 3D position; `event.preventDefault()` on `dragover` is needed to allow the drop.
- Touch equivalent (long-press → drag → release) deferred; pointer-based flows (UX2.4) cover tablet use.

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

### Phase 14 — Video render export *(deferred — large)*

*Export a production as a video file at a chosen resolution, with audio.*

Playback in the browser is real-time and resolution-bound by the display. Render export breaks both constraints: the engine advances frame-by-frame at a fixed timestep (decoupled from wall clock), an off-screen canvas renders at the target resolution, and the resulting frames are encoded into a video file with a mixed audio track.

#### Scope

- **Export dialog** — resolution presets (1080p, 4K; custom width×height), frame rate (24 / 30 / 60 fps), format (MP4 / WebM), audio toggle.
- **Off-screen render pass** — a second `THREE.WebGLRenderer` targeting a hidden canvas at the export resolution. Playback camera renders to it using the same scene graph as the display; no geometry duplication.
- **Frame-by-frame transport** — during export, the Tone.js transport is driven programmatically: `transport.seconds` is advanced by `1/fps` per frame and `PlaybackEngine.update()` is called at each step. The display render loop is suspended; only the off-screen pass runs.
- **Video encoding pipeline** — three candidate approaches in ascending implementation cost:
  1. **`MediaRecorder` + `canvas.captureStream(fps)`** — browser-native, zero dependencies, output WebM/VP9. Lowest quality control; encoding runs at real-time speed, not frame-rate speed.
  2. **WebCodecs `VideoEncoder`** — hardware-accelerated, frame-accurate, supports MP4/H.264. Requires browser support check (Chrome 94+, no Safari as of 2026). Each `ImageBitmap` frame passed to the encoder; `MP4Muxer` or `webm-muxer` assembles the container.
  3. **FFmpeg.wasm** — maximum codec coverage; ~30 MB WASM download. Frames exported as PNG data URLs, piped to `ffmpeg -i frame%04d.png`. Memory pressure at 4K.
  Recommended starting point: WebCodecs + `webm-muxer` with a `MediaRecorder` fallback for unsupported browsers.
- **Audio capture** — TTS audio (Web Speech API or Kokoro/eSpeak) must either be pre-synthesised and exported as a WAV buffer, or the WebAudio graph must be routed through a `MediaStreamDestination` node and recorded alongside the video. Pre-synthesis is more reliable for sync; requires all TTS calls to complete before the frame loop begins.
- **Progress UI** — a modal overlay (or transport-bar status) shows "Frame N of M — EEss remaining"; a cancel button stops and discards. On completion, `URL.createObjectURL(blob)` triggers a browser download.

#### Known risks

- **WebCodecs + audio sync**: the video encoder and the audio recorder are separate streams; they must share a common start timestamp. Off-by-one-frame desync between them is a known footgun — needs an explicit test with lip-sync dialogue.
- **TTS timing during headless render**: eSpeak/Kokoro synthesis happens asynchronously; the frame loop must block until all speech audio for the scene is pre-rendered before starting the encode pass.
- **Memory at 4K / 60 fps**: a 60-second 4K sequence at 60 fps = 3 600 `ImageBitmap` objects. Frames must be released as soon as the encoder consumes them.
- **Safari**: WebCodecs `VideoEncoder` has no Safari support. `MediaRecorder` covers Safari but produces WebM, which QuickTime does not open. A server-side Puppeteer fallback is the long-stop option.

#### Implementation stages (not yet scheduled)

1. Off-screen renderer + frame-by-frame transport loop (no encoding yet — just prove 1 080p frame capture at 60fps without dropped frames).
2. WebCodecs encoding pipeline + `webm-muxer` container.
3. Audio pre-synthesis + mux into output.
4. Export dialog UI + progress + download.
5. `MediaRecorder` fallback for unsupported browsers.

---

## What's Next — Priority queue

**Baseline:** 225 tests green, 0 svelte-check warnings.  
**Complete through:** Phases 0–8.9, T, UX1, UX2.1–2.4, UX2.7, UX2.9.

### Tier 1 — Scene-building visibility

1. **Phase 9.A — Set piece property inspector** *(spec above)*  
   All placed primitives are currently 1×1×1 and white. `UpdateSetPieceCommand(name, patch)` + inspector UI for color, scale, geometry dimensions.

2. **Phase 9.B — Set piece catalogue expansion** *(spec above)*  
   Wall flat 4×3×0.15 m, stage deck 8×8 m, backdrop, table, step with set-ready default sizes.

3. **Phase 9.C — Character ground disc markers** *(spec above)*  
   Coloured cylinder disc under each staged actor, matching the timeline palette colour.

### Tier 2 — Workflow completeness

4. **UX2.6 — Full-production screenplay view** *(spec above)*  
   All scenes in one scrollable document with `INT.` headings and stage-direction lines.

5. **UX2.5 — Reusable set templates** *(spec above)*  
   `SetTemplateStore`; save current set as named template → apply from Catalogue tab.

6. **Phase 10 — Lighting rig** *(spec above)*  
   Add lights from catalogue; fix skipped `point` light type.

### Deferred

- **UX3** — Drag-and-drop cast management (button flows functional; progressive enhancement)
- **Phase 6.5** — Screenplay enrichment (PDF, pagination, title page)
- **Phase 11** — Audio block timeline strip + waveform preview
- **Phase 12** — Dance/MIDI choreography (needs spike)
- **Phase 13** — Remote asset store
- **Phase 14** — Video render export (large; WebCodecs pipeline + audio pre-synthesis)
- **I1–I5** — Infrastructure (Azure deploy, user management, staged builds, GitHub project management, CI/CD workflows)

---

## Open Snags

*Post-completion observations from first-use testing. Each snag is filed against a completed phase whose implementation still needs refinement.*

### S1 — Add actor to scene: visual paradigm *(UX2.4 post-completion)*

UX2.4 delivered the ⊕ Stage button in the cast section and drag-from-cast-to-canvas. The snag: the first-use discovery path — "I added a character, now how do I get them into this scene?" — is not obvious. The ⊕ Stage button is easy to miss, and dragging from a panel to a canvas is a non-obvious gesture on both touch and pointer devices.

- **Direction:** a more explicit visual affordance that communicates per-scene presence directly on the actor card — e.g. a toggle / per-scene indicator that is impossible to overlook. Input scope for UX3. The ⊕ Stage button remains as-is until the replacement is designed.
- **Blocking:** nothing currently blocked; existing flows work correctly.

### S2 — Scene tree: button clutter and no reorder *(UX2.3 post-completion)*

UX2.3 delivered + Scene / + Act / ✎ rename / 🗑 delete buttons per tree row, with drag-to-reorder explicitly deferred. The snag: at typical cast and scene counts, every row carries four visible action buttons simultaneously, which creates significant visual noise and crowds the production name. The inability to reorder scenes — now that users are building multi-scene productions — is a confirmed gap.

**Proposed tree redesign:**

Keep a single `+ Act` and `+ Scene` button pair (toolbar or footer of the tree panel). Insertion is contextual to the current selection:

- **Nothing selected** → appended at top level (end of root list).
- **Act selected** → added as a child of that act.
- **Scene selected** → inserted immediately after that scene, at the same nesting level.

Acts can contain acts and scenes; scenes cannot contain acts. Playback is depth-first traversal of the tree (leaf scenes in order). This matches the existing `Group`/`Scene` domain model and `getScenes()` DFS traversal — no data model changes required.

Reordering is handled entirely by drag-and-drop within the tree. Drop zones between rows allow repositioning at any level; dropping onto an act node appends as a child. Drag constraints enforce the rule that scenes cannot become parents of acts.

This removes the per-row `+ Scene` / `+ Act` clutter while making insertion intent explicit through selection, and collapses rename/delete behind a `⋯` context menu (or long-press on touch, satisfying S4 requirements simultaneously).

- **Direction:** implement contextual single-button insertion + tree drag-and-drop as described above. Pre-UX3 scope — addressable independently of the full drag-and-drop cast work.
- **Blocking:** nothing currently blocked.

### S3 — Speech bubbles: viewport clipping on mobile *(UX3 candidate)*

Speech bubbles for character dialogue are projected from 3D world positions to screen coordinates. On mobile viewports, the bubble origin often falls near an edge, causing the bubble to overflow outside the visible area entirely — on small screens this is the common case rather than the exception.

- **Direction:** clamp the computed bubble position to a safe inset rect (matching the viewport minus padding). When the anchor approaches an edge, flip or offset the bubble so it stays fully visible. On very narrow viewports, consider a fixed-position dialogue bar at the bottom of the canvas rather than a floating callout per character.
- **Scope:** primarily a CSS/layout problem; the 3D→2D projection coordinate is already available (see `Presenter.svelte` speech bubble transform). UX3 is the natural phase to address this alongside the broader mobile UX pass.
- **Blocking:** nothing currently blocked; bubbles degrade but do not prevent playback.

### S4 — Hover-dependent affordances inaccessible on touch *(high priority — UX3)*

Several key interactions are exposed only through CSS `:hover` states, making them unreachable — or unreliable — on touch devices:

- **Present button:** appears on hover over a production row in the production list. Touch users cannot reliably trigger hover; the button is effectively hidden on phones.
- **Scene / act add buttons (tree):** popup add actions are revealed on row hover; same problem applies.

These are the two highest-friction mobile gaps after the presentation exit button fix.

- **Direction:** replace hover-only reveals with persistently visible controls or a `⋯` menu that responds to tap. A long-press / contextmenu event as a secondary discovery path is acceptable, but the primary path must not require hover. The S2 tree overhaul (⋯ context menu per row) partially addresses the scene/act add buttons — ensure the resulting implementation is explicitly tested on touch. The Present button needs an independent fix regardless of UX3 scope.
- **Note:** any new UI added from this point forward must have a touch-accessible primary path; hover is enhancement only.
- **Blocking:** Present button is effectively broken for mobile users right now.

### S5 — t=0 animations missed by sequencer during Presentation under high machine load *(PlaybackEngine)*

Animations scheduled to start at `t=0` are occasionally skipped in some scenes during Presentation mode — observed on lower-powered hardware under high load. The first frame of the Tone.js transport may fire slightly late, causing the `t=0` window to be missed before the engine has set up animation state. Only happens on Presentation, never observed on scene preview via transport play button

- **Direction:** investigate whether `PlaybackEngine.play()` should trigger an immediate `seek(0)` / enable pass before handing off to the transport tick, so that `t=0` animations are guaranteed to be enabled before the first `update()` call. Also check whether `Transport.start()` fires a synchronous or asynchronous first event — if async, an explicit initialisation frame is needed. Add a targeted test that simulates a slow first tick.
- **Blocking:** nothing currently blocked; workaround is to schedule the first animation at `t=0.01` or later.

---

### Phase I1 — Azure deployment + database serialisation *(not yet started)*

*Deploy the app publicly and migrate production storage from browser localStorage to a server-side database.*

- **Frontend host:** Azure Static Web App. `swa-cli.config.json` already exists in the repo — the deployment target is scaffolded.
- **API layer:** SvelteKit `+server.ts` route handlers provide the persistence API. The SWA managed functions runtime proxies `/api/*` routes from the static front end to the SvelteKit server bundle automatically.
- **Database:** Azure Cosmos DB NoSQL API. `StoredProduction` is already a self-contained JSON document; it maps directly to a Cosmos DB item with no schema translation. Partition key = `userId` (prerequisite: Phase I2 supplies the identity; for Phase I1 alone a hardcoded single-tenant key is acceptable as a stepping stone).
- **`ProductionStore` interface unchanged:** the existing service interface (`list`, `get`, `save`, `delete`, `create`) is already injected — swapping the implementation from `localStorage` to a `fetch`-backed server store touches zero callers.
- **Secrets:** Cosmos DB connection string injected via Azure Static Web App application settings (never committed to source). Key Vault reference optional for production hardening.
- **Migration:** existing localStorage productions are exported as JSON and re-imported via the server store on first sign-in. No automatic migration — the user initiates it.

---

### Phase I2 — User management *(not yet started)*

*Individual users sign in and see only their own productions.*

- **Identity provider:** Microsoft Entra External ID (consumer-facing, supports GitHub, Google, and email/password as bring-your-own-identity providers). Entra External ID issues a standard JWT — SvelteKit middleware validates it per request.
- **Per-user data scoping:** Cosmos DB partition key = `userId` extracted from the token. The server-side `ProductionStore` implementation appends a `WHERE userId = :uid` equivalent to every query. No cross-user data leakage is possible at the database layer.
- **Session management:** SvelteKit `cookies` API. The JWT is stored in an HttpOnly, SameSite=Strict cookie; never exposed to client JavaScript.
- **Guest mode preserved:** unauthenticated users continue to use localStorage (Phase I1 fallback path). The app never forces sign-in — a persistent "Sign in to save to the cloud" prompt replaces the localStorage production list when no session exists.
- **`StoredProduction` schema addition:** `userId: string` field added. The server-side store filters by it; the client never sets it (set server-side from the token).

---

### Phase I3 — Staged builds *(not yet started)*

*Three promotion environments: local development → staging → production.*

- **Environments:** `local` (Vite dev server + local emulators), `staging` (Azure SWA staging slot), `production` (Azure SWA production slot). Each has its own Cosmos DB database instance (or separate containers within one account).
- **Promotion flow:** feature branches → PR → CI green → merge to `main` → auto-deploy to staging → manual approval gate in GitHub Actions → promote to production.
- **Secrets:** each environment's connection strings and Entra app registration credentials are stored as GitHub Actions secrets, never in source. SWA application settings are set via `az staticwebapp appsettings set --environment staging` (no values in `swa-cli.config.json`).
- **SWA deployment slots:** staging slot is a free feature of the Standard plan. The production slot is promoted from staging without a rebuild (`az staticwebapp environment promote`).
- **Local emulators:** Cosmos DB emulator (Docker) + Azurite for storage. `local.settings.json` (already in `build/server/`) holds local-only values; `.gitignore` covers it.

---

### Phase I4 — GitHub project management *(not yet started)*

*Structured issue tracking that mirrors the ROADMAP so work is visible and discoverable.*

- **GitHub Projects board:** one board per major phase group (e.g. "Phase 9", "Phase UX2", "Infrastructure I1–I5"). Roadmap phases are milestones; individual tasks are issues linked to a milestone.
- **Issue templates** (`.github/ISSUE_TEMPLATE/`):
  - `bug.yml` — steps to reproduce, expected vs. actual behaviour, environment.
  - `feature.yml` — user story, acceptance criteria, ROADMAP phase reference.
  - `snag.yml` — lightweight: one-liner description, which phase's UX it affects.
  - `spike.yml` — question to answer, timebox, deliverable (decision or prototype).
- **Roadmap linkage:** ROADMAP items marked *(not yet started)* or *(deferred)* get companion GitHub issues at the start of each phase's work. The ROADMAP remains the canonical planning document; issues are the executable work items.
- **Auto-close:** `Closes #N` in commit messages; `fix:` conventional commits trigger the label bot.
- **Labels:** `phase:N`, `type:bug`, `type:snag`, `type:feature`, `type:spike`, `status:blocked`, `status:in-progress`.

---

### Phase I5 — GitHub build and test workflows *(not yet started)*

*Automated quality gates on every PR and deployment pipeline from merge to production.*

#### PR gate (`.github/workflows/ci.yml`)

```
trigger: pull_request → main, staging
jobs:
  ci:
    - yarn install --frozen-lockfile
    - yarn check          # svelte-check: 0 errors required
    - yarn test           # all 225+ tests must pass
    fail-fast: true
```

PR cannot be merged until the gate is green. Branch protection rules enforce this.

#### Staging deploy (`.github/workflows/deploy-staging.yml`)

```
trigger: push → main
jobs:
  build-and-deploy:
    - yarn install --frozen-lockfile
    - yarn build
    - SWA CLI deploy to staging slot
```

#### Production release (`.github/workflows/deploy-production.yml`)

```
trigger: workflow_dispatch (manual) OR push → tags/v*.*.*
jobs:
  promote:
    - Manual approval gate (GitHub environment protection rule)
    - az staticwebapp environment promote → production slot
```

#### Dependency management

- Dependabot configured for `npm` in `package.json` and `build/server/package.json`.
- Dependabot PRs for patch versions are auto-merged if CI is green; minor/major require manual review.

#### README badge

```md
![CI](https://github.com/ORG/directionally/actions/workflows/ci.yml/badge.svg)
```

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
| UX quick wins (button labels, rotation gizmo, camera paradigm) | ✅ Complete (Phase 8.9) |
| Tablet support (touch/pointer events, on-screen shortcuts) | ✅ Complete (Phase T) |
| Minimal interaction model (script-first, cast/staging split, one-way-of-doing-things) | ✅ Complete (Phase UX1) |
| Production naming on creation (auto-focus, no duplicates) | ✅ Complete (Phase UX2.1) |
| Actor add UX overhaul + legacy single-scene expunge | ✅ Complete (Phase UX2.2) |
| Scene and act tree (bug fix + group/act storage) | ✅ Complete (Phase UX2.3) |
| Staging actors in a scene (drag from cast, ⊕ Stage button) | ✅ Complete (Phase UX2.4) |
| Reusable set templates | Phase UX2.5 |
| Script editor — full-production view + stage directions (pull forward from 6.5) | Phase UX2.6 |
| Spawn indicator as pre-t=0 block | ✅ Complete (Phase UX2.7) |
| Production playback / presentation mode | ✅ Complete (Phase UX2.8) |
| Speech and Audio panel + per-production speech settings | ✅ Complete (Phase UX2.9) |
| Drag-and-drop cast management (catalogue→production, production→scene) | Phase UX3 |
| Asset properties editing | Phase 9 |
| Lighting rig | Phase 10 |
| Sound effects / music | Phase 11 (merged into 8.7) |
| Video render export (off-screen canvas, WebCodecs, audio mux) | Phase 14 (deferred — large) |
| Azure SWA deployment + Cosmos DB production store | Phase I1 |
| User management (Entra sign-in, per-user data scoping) | Phase I2 |
| Staged builds (dev / staging / production environments) | Phase I3 |
| GitHub project management (Projects board, issue templates, milestones) | Phase I4 |
| GitHub CI/CD (PR gate, staging deploy, production release) | Phase I5 |

