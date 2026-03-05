# Directionally — Authoring Tool Roadmap

## Vision

Evolve Directionally from a scene player into a full production authoring tool: write scripts, build scenes from an asset catalogue, choreograph characters, control cameras and lighting, and export productions for sharing or printing.

## Architecture Decisions (locked in)

- **Storage**: Portable JSON document format from day one. No `localStorage` key names leak into business logic — a `ProductionStore` service owns all persistence so the backing store can switch to a server later without touching callers.
- **Scene graph**: Linear, depth-first playback. Acts and scenes form an organisational hierarchy, not an interactive branching graph. Data model designed to support branching later if needed, but not built for it now.
- **Script vs model**: Domain model is the source of truth. The screenplay view is a two-way editor over it — editing a character line updates the corresponding `speak` action in the model, not the other way round.
- **Assets**: Bundled catalogue first (existing robots + basic geometries). User GLTF import deferred to a later phase.
- **Existing stubs**: `enter`/`exit` actions and `point` lights are already scaffolded in the domain type system (currently emitting warnings and being skipped). They get properly implemented in Phases 4 and 8 rather than invented from scratch.

---

## Phases

### Phase 1 — Production storage & management
*Foundation for everything. Nothing else is stable until productions can be saved and loaded.*

- Define `StoredProduction` document type in `src/core/storage/types.ts`:
  `{ id, name, createdAt, modifiedAt, production: SerializedProduction }`.
  Serialise/deserialise the full `Production`/`Act`/`Scene`/actions graph to plain JSON.
- `ProductionStore` service (`src/core/storage/ProductionStore.ts`): CRUD over `localStorage` keyed by id.
  Interface designed so the same API can be backed by a server later — no `localStorage`-isms leak into callers.
- Replace the hardcoded scenes list in `+page.svelte` with a real production list: names, New / Rename / Delete controls.
- Auto-save on any change. Explicit "duplicate" action for making variations.

**Phase complete when:** productions survive a page reload and the JSON format round-trips cleanly through serialise → deserialise → render.

---

### Phase 2 — App layout redesign
*Enables all subsequent authoring features. Do this before building new tools.*

- **Left panel**, two tabs:
  - *Productions*: list of saved productions + collapsible tree (production → acts → scenes). Clicking a scene loads it to its start frame. Drag to reorder scenes within an act.
  - *Catalogue*: asset browser (characters, set pieces, lights).
- **Right panel** (collapsible, like VS Code's secondary sidebar):
  - *Properties*: inspector for the selected asset.
  - *Script*: screenplay editor for the active scene (see Phase 5).
- **Transport bar**: moves to a dedicated bottom strip, always visible.
- This is a restructure of `+page.svelte` and `Presenter.svelte`, not a rewrite of renderer logic. Existing scenes must continue to play correctly.

**Phase complete when:** existing scenes (robots, examples) all play correctly in the new layout, and the left/right panel tabs are navigable.

---

### Phase 3 — Asset catalogue (bundled)
*Makes scenes composable without touching code.*

- `src/core/catalogue/` — typed catalogue entries:
  - `CharacterEntry`: GLTF path + thumbnail + available animation clip names.
  - `SetPieceEntry`: geometry type + default size.
  - `LightEntry`: light type + default config.
- Seed with: RobotExpressive (already in use), a second character, box/plane/sphere/cylinder geometries.
- Catalogue UI in the left panel: grouped list, click or drag to add to the active scene.
- Dropping a character calls `scene.stage()` with a default position. Dropping a geometry calls `scene.addSetPiece()`.

**Phase complete when:** a character and a set piece can be added to a scene from the catalogue without editing code.

---

### Phase 4 — Generalised scene composer
*Extends the sandbox into proper scene creation with a production's own actor roster.*

- Replace sandbox's two hardcoded actors with actors from the production's roster (defined via `Production.addActor()` from the catalogue).
- Scene composition panel: list of staged actors + set pieces. Select one to edit in the Properties panel (position, rotation inputs).
- Implement `enter`/`exit` renderer support in `Presenter.svelte` (already scaffolded in domain types, currently warned-and-skipped) so actors can appear/disappear mid-scene.

**Phase complete when:** a two-actor scene can be authored from scratch — actors chosen, positioned, dialogue added — without touching code.

---

### Phase 5 — Script as document
*Screenplay view of the domain model; two-way editor.*

- Scene's `speak` actions rendered as a screenplay in the right-panel Script tab: `SCENE HEADING`, `ACTION` (scene directions in italics), `CHARACTER NAME`, `Dialogue`.
- Editing a character line updates the corresponding `speak` action in the model.
- Adding a new CHARACTER / DIALOGUE block creates a new `speak` action.
- `move`/`animate` actions rendered as action lines (scene directions).
- Export to printable HTML or PDF — for sending to a producer or actor.

**Phase complete when:** the screenplay view of `twoRobotsScene` matches its authored lines, edits round-trip correctly, and the print export produces readable output.

---

### Phase 6 — Camera tracks
*High visual impact; makes productions feel cinematic.*

- `addAction({ type: 'camera', ... })` is already in the domain model — extend the composer with a timeline-style camera path editor.
- Design camera (free-orbit whilst editing) vs one or more named playback cameras with keyframed position and lookAt tracks.
- `cameraCut` action type: switch active playback camera at a given time.

---

### Phase 7 — Properties panel — asset editing
*Polish and control over scene composition.*

- Selected asset (character, set piece, light) shows editable position / rotation / scale in the Properties tab.
- Material editor for set pieces: colour, roughness, metalness, optional texture URL.
- Character scale/tint if supported by the GLTF.

---

### Phase 8 — Lighting rig
*Complete the lighting story started in the domain model.*

- Add lights from the catalogue. Fix the `point` light gap: implement `PointLightAsset` in the model layer and `Presenter.svelte` (currently scaffolded but skipped with a warning).
- Animate light intensity/colour via `lighting` actions (already in domain model and SceneBridge).
- Lighting rig represented in the scene composer alongside actors and set pieces.

---

### Phase 9 — Sound & music
*Ambient atmosphere and sound effects.*

- New `SoundEffect` action type: file path + trigger time. Wired into `PlaybackEngine` alongside speech scheduling.
- `BackgroundMusic` action: file path, loop, volume, fade in/out times.

---

### Phase 10 — Dance choreography *(deferred — needs spike)*

The shape of MIDI → keyframe synchronisation is unclear. Track as a TODO; begin with a focused spike to understand the motion-capture or MIDI-driven keyframe options before committing to an approach.

---

## Current codebase state (as of March 2026)

| Area | Status |
|---|---|
| Domain model (Production/Act/Scene/actions) | Complete |
| Model/renderer layer | Complete (except point lights) |
| SceneBridge domain→renderer | Complete (enter/exit/point light skipped with warnings) |
| PlaybackEngine (play/pause/seek/rewind) | Complete |
| eSpeak-NG TTS (default, cross-browser) | Complete |
| Kokoro neural TTS (optional) | Complete |
| Speech bubbles | Complete |
| Sandbox script editor | Complete (two hardcoded actors) |
| `src/core/timeline/` | Empty scaffold — reserved for future timeline editor |
| Production storage | Not started |
| App layout redesign | Not started |
| Asset catalogue | Not started |
| Scene composer (general) | Not started |
| Screenplay editor | Not started |
| Camera tracks UI | Not started |
| Sound effects / music | Not started |
