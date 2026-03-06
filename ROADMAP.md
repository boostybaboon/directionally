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

### Phase 2 — App layout redesign
*Enables all subsequent authoring features. Do this before building new tools.*

- **Left panel**, two tabs:
  - *Productions*: list of saved productions + collapsible tree (production → groups → scenes). Clicking a scene loads it.
  - *Catalogue*: asset browser (characters, set pieces, lights).
- **Right panel** (collapsible, like VS Code's secondary sidebar):
  - *Properties*: inspector for the selected asset.
  - *Script*: screenplay editor for the active scene (see Phase 5).
- **Transport bar**: moves to a dedicated bottom strip, always visible.
- Restructure of `+page.svelte` and `Presenter.svelte`, not a rewrite of renderer logic.

**Phase complete when:** existing scenes (robots, examples) play correctly in the new layout, and left/right panel tabs are navigable.

---

### Phase 3 — Asset catalogue (bundled)
*Makes scenes composable without touching code.*

- `src/core/catalogue/` — typed catalogue entries: `CharacterEntry`, `SetPieceEntry`, `LightEntry`.
- Seed with: RobotExpressive (already in use), a second character, box/plane/sphere/cylinder geometries.
- Catalogue UI in the left panel: click or drag to add to the active scene.

**Phase complete when:** a character and a set piece can be added to a scene from the catalogue without editing code.

---

### Phase 4 — Generalised scene composer
*Extends the sandbox into proper scene creation; introduces full domain model serialisation.*

- Actors drawn from the production's roster (from the catalogue) rather than hardcoded.
- Scene composition panel: staged actors + set pieces, selectable, editable via Properties panel.
- `enter`/`exit` renderer support implemented in `Presenter.svelte`.
- **Storage format upgrade**: `StoredProduction` gains a `scenes` field containing serialised `SceneAction[]`, camera configs, set pieces, and actor placements. `scriptToModel` is replaced by a general deserialiser.

**Phase complete when:** a two-actor scene can be authored from scratch without touching code.

---

### Phase 5 — Script as document
*Screenplay view of the domain model; two-way editor.*

- Scene's `speak` actions rendered as a screenplay in the right-panel Script tab: `SCENE HEADING`, `ACTION` lines, `CHARACTER NAME`, `Dialogue`.
- Editing a character line updates the corresponding `speak` action.
- Export to printable HTML or PDF.

**Phase complete when:** screenplay view of `twoRobotsScene` matches its authored lines; print export produces readable output.

---

### Phase 6 — Camera tracks
*High visual impact; makes productions feel cinematic.*

- Timeline-style camera path editor over `addAction({ type: 'camera', ... })` (already in domain model).
- Design camera (free-orbit whilst editing) vs named playback cameras with keyframed position + lookAt.
- `cameraCut` action type for switching cameras mid-scene.

---

### Phase 7 — Properties panel — asset editing

- Editable position / rotation / scale for selected asset.
- Material editor: colour, roughness, metalness, optional texture URL.

---

### Phase 8 — Lighting rig

- Add lights from catalogue; fix `point` light gap (scaffolded but skipped).
- Animate intensity/colour via `lighting` actions (already in domain model + SceneBridge).

---

### Phase 9 — Sound & music

- `SoundEffect` action: file path + trigger time.
- `BackgroundMusic` action: loop, volume, fade in/out.

---

### Phase 10 — Dance choreography *(deferred — needs spike)*

MIDI → keyframe synchronisation shape is unclear. Spike before committing to an approach.

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
| Sandbox script editor | ✅ Complete (two hardcoded actors) |
| `src/core/timeline/` | Empty scaffold — reserved for timeline editor |
| Production storage | ✅ Complete |
| App layout redesign | Phase 2 |
| Asset catalogue | Phase 3 |
| Scene composer (general) + full serialisation | Phase 4 |
| Screenplay editor | Phase 5 |
| Camera tracks UI | Phase 6 |
| Sound effects / music | Phase 9 |

