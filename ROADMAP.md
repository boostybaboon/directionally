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

### Phase 6 — Script as document
*Screenplay view of the domain model; two-way editor. Fills the Script tab in the right panel.*

- Scene's `speak` actions rendered as a screenplay: `SCENE HEADING`, `ACTION` lines, `CHARACTER NAME`, `Dialogue`.
- Editing a character line updates the corresponding `speak` action in the domain model.
- Adding a CHARACTER / DIALOGUE block creates a new `speak` action.
- Export to printable HTML or PDF — for sending to a producer or actor.

**Phase complete when:** screenplay view of `twoRobotsScene` matches its authored lines; print export produces readable output.

---

### Phase 7 — Camera tracks
*High visual impact; makes productions feel cinematic.*

- Timeline-style camera path editor over `addAction({ type: 'camera', ... })` (already in domain model).
- Design camera (free-orbit whilst editing) vs named playback cameras with keyframed position + lookAt.
- `cameraCut` action: switch active playback camera at a given time.

---

### Phase 8 — Properties panel — asset editing
*Fills the Properties tab in the right panel.*

- Editable position / rotation / scale for the selected asset.
- Material editor: colour, roughness, metalness, optional texture URL.
- Character scale/tint if supported by the GLTF.

---

### Phase 9 — Lighting rig

- Add lights from catalogue; fix `point` light gap (scaffolded in domain types, currently skipped).
- Animate intensity/colour via `lighting` actions (already in domain model + SceneBridge).

---

### Phase 10 — Sound & music

- `SoundEffect` action: file path + trigger time, wired into `PlaybackEngine`.
- `BackgroundMusic` action: loop, volume, fade in/out.

---

### Phase 11 — Dance choreography *(deferred — needs spike)*

MIDI → keyframe synchronisation shape is unclear. Spike before committing to an approach.

---

### Phase 12 — Remote asset store *(deferred)*

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
| Remote asset store | Phase 12 |
| Right panel (collapsible) | ✅ Complete |
| ProductionDocument — command execution + undo/redo | ✅ Complete |
| Scene composer — storage format + migration | ✅ Complete (Phase 5b) |
| `buildSceneGraph` extracted (Tone-free scene construction) | ✅ Complete (Phase 5c step 1) |
| Design/playback canvas split + gizmos + object placement | Phase 5c |
| Screenplay editor | Phase 6 |
| Camera tracks UI | Phase 7 |
| Asset properties editing | Phase 8 |
| Lighting rig | Phase 9 |
| Sound effects / music | Phase 10 |

