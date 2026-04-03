# Directionally — Roadmap

Completed phases live in [ROADMAP_ARCHIVE.md](ROADMAP_ARCHIVE.md).

## Vision

Evolve Directionally from a scene player into a full production authoring tool: write scripts, build scenes from an asset catalogue, choreograph characters, control cameras and lighting, and export productions for sharing or printing.

---

## Phase L — Locations & Environment Generation *(L1–L4 complete; L5 next)*

*A director should be able to rough in a convincing location — a theatre stage, a TV studio, an exterior plaza — in under two minutes, without Blender expertise. This phase builds that capability in six ordered steps, each independently valuable.*

### Layered asset architecture

```
Level 5 — External assets            (user-supplied URL or file upload)
Level 4 — Paid/free third-party GLBs (Sketchfab, Ready Player Me, etc.)
Level 3 — Bundled GLTF props         (we curate ~15 CC0 items)       ← next
Level 2 — HDRI environments          ✅ complete
Level 1 — Parameterised generators   ✅ complete
Level 0 — Bare primitives            (always available)
```

Each level adds coverage without obsoleting the one below. A production can mix levels freely.

---

### Step L1 — HDRI environment maps ✅ COMPLETE

*Unlocks all exterior scenes with near-zero code; dramatically improves interior atmosphere.*

**Data model changes:**
- `environmentMap?: string` added to `StoredScene` — a URL to an `.hdr` or `.exr` file, or a catalogue reference key.
- `EnvironmentEntry` added to the catalogue type union: `{ kind: 'environment'; id: string; label: string; hdriPath: string; thumbnail?: string }`.
- Initial bundled entries: 2–3 Poly Haven CC0 HDRIs (interior neutral, exterior sky, evening) referenced by path in `entries.ts`.

**Renderer changes:**
- `RGBELoader` from `three/addons` loads the HDR; `PMREMGenerator.fromEquirectangular()` produces the environment map.
- `scene.environment` set for IBL reflections on all materials.
- `scene.background` set to the same map (or a separate low-res version) for visible sky/backdrop.
- When `environmentMap` is absent: existing solid `backgroundColor` fallback is unchanged.

**Authoring UI:**
- "Environment" section in the Staging tab (or a new "Location" tab). Shows current HDRI thumbnail. A picker lists all `EnvironmentEntry` items from the catalogue.
- `SetEnvironmentCommand(hdriUrl | null)` — full undo/redo.

**Sources:** [Poly Haven](https://polyhaven.com/hdris) — all CC0. Download `.hdr` files; bundle 2–3 in `static/models/`.

---

### Step L2 — Textured materials ✅ COMPLETE

*Unlocks painted backdrops, textured floors, brick walls.*

**Data model changes:**
- `textureUrl?: string` added to `MaterialConfig`.
- `repeatU?: number; repeatV?: number` for tiling (e.g. a brick texture tiled 4×3 across a wall flat).

**Renderer changes:**
- `TextureLoader` applied in `buildSceneGraph.ts` when `material.textureUrl` is set. `MeshStandardMaterial.map` receives the loaded texture.
- `texture.repeat.set(repeatU ?? 1, repeatV ?? 1)` + `texture.wrapS = texture.wrapT = THREE.RepeatWrapping`.

**Authoring UI:**
- "Texture" field in the set-piece inspector (Phase 9.A). URL input + optional tiling controls.
- `UpdateSetPieceCommand` already handles `material` patches; no new command needed.

**Sources:** [Poly Haven textures](https://polyhaven.com/textures) — CC0. A few key textures (concrete, wood boards, brick, painted plaster) bundled in `static/models/textures/`.

---

### Step L3 — Theatre stage generator ✅ COMPLETE

*The most theatrically specific use case; achievable entirely with existing primitives.*

**What it emits:** a call to `generateTheatreStage(config)` returns `SetPiece[]` — a set of box flats arranged as a traditional proscenium or thrust stage configuration. The result is applied via `SetSceneSetCommand` (or an `ApplySetTemplateCommand` if UX2.5 lands first).

**Generator config:**
```ts
type TheatreStageConfig = {
  type: 'proscenium' | 'thrust' | 'traverse';
  stageWidthM: number;  // default 8
  stageDepthM: number;  // default 6
  flatHeightM: number;  // default 3.5
  legs: number;         // number of wing-flat pairs per side (default 3)
  deckColor?: number;   // default 0x8b6914 (wood)
  flatColor?: number;   // default 0x1a1a1a (black masking)
};
```

**Output pieces (proscenium example):** stage deck (plane), back wall flat, N × leg flats stage-left, N × leg flats stage-right, border (top masking header), optional tormentor flats framing the proscenium opening. Each piece is a named `SetPiece` with correct position and rotation.

**UI:** "Generate stage…" button in the Staging tab's Set section. Opens a small form (type selector + key dimensions). Submitting replaces the current set with the generated pieces. Undo via the existing command stack.

**Location in codebase:** `src/core/storage/generators/theatreStage.ts` (pure function, no Three.js — same pattern as `sceneBuilder.ts`). Tests alongside it.

---

### Step L4 — Drama studio / soundstage generator ✅ COMPLETE

*A box room with configurable dimensions. "Drama studio" and "soundstage" are the same concept — a bare rectangular space with controlled lighting.*

**What it emits:** floor plane + 4 wall pieces + optional ceiling, each a `SetPiece`.

**Generator config:**
```ts
type StudioConfig = {
  widthM: number;   // default 10
  depthM: number;   // default 8
  heightM: number;  // default 3
  wallColor?: number;      // default 0xcccccc
  floorColor?: number;     // default 0x555555
  ceiling?: boolean;       // default false
  floorTextureUrl?: string;
};
```

**UI:** "Generate room…" button. Same form pattern as Step L3.

**Location:** `src/core/storage/generators/studioRoom.ts`.

**Note on multi-level sets:** simple raised platforms can be added by extending this config with a `platforms?: Array<{ x, z, widthM, depthM, riseM }>` array, emitting extra box `SetPiece`s. Full multi-level / terrain support (uneven surfaces, slope navigation, stair-climbing actors) is a later advanced feature — see "Future: Multi-level sets" below.

---

### Step L5 — GLTF set-piece infrastructure *(next)*

*Enable set pieces to reference external GLTF/GLB files, not only procedural geometry. This is the prerequisite for user-authored assets (L6) to appear as set pieces in productions.*

**Data model change:**
- `SetPieceEntry` gains an optional `gltfPath?: string` field (mirroring `CharacterEntry.gltfPath`).
- `BuildSceneGraph.ts` handles a `SetPiece` whose catalogue entry has a `gltfPath`: loads via `GLTFLoader` instead of generating geometry. Falls through to existing geometry path when `gltfPath` is absent.
- Preview in `PreviewRenderer` already handles arbitrary GLTF paths — no change needed there.

**No assets bundled in this step.** The infrastructure is validated by wiring up one of the existing bundled character GLBs as a set-piece entry in tests. Real assets come in via L6 (user-authored) or the deferred bundled curation step.

**Tests:** `storedSceneToModel` or `buildSceneGraph` test covering a set piece with `gltfPath` set (mock `GLTFLoader`).

---

### Step L6 — OPFSCatalogueStore (user-extensible catalogue)

*Let authors bring their own GLB assets without writing code. Sets up the external asset architecture for Phase 13.*

**Concept:** a user can paste a URL (or upload a file) to add a new `CatalogueEntry` stored in the browser's Origin Private File System (OPFS). The entry appears in the Catalogue tab exactly like a bundled asset — it can be previewed, dragged into scenes, and used in productions. Productions reference assets by stable `catalogueId` string; the `gltfPath` is an object URL resolved fresh from OPFS each session.

**Why OPFS, not localStorage:** GLB binaries encoded as `data:` URIs would exhaust the ~5 MB `localStorage` cap after a handful of assets. OPFS stores raw binary files with quota managed by the browser against available disk space — effectively unlimited for practical use. Supported in Chrome/Edge/Firefox/Safari 17+.

**Data model:**
```ts
type UserCatalogueEntry = CatalogueEntry & { userAdded: true; addedAt: number };
```
`OPFSCatalogueStore` in `src/core/storage/OPFSCatalogueStore.ts` — async interface; GLB files stored under an `assets/` directory in the origin OPFS root. On `list()`, each file produces a fresh `URL.createObjectURL()` — no reload fragility.

**UI:**
- "Add asset…" button at the bottom of the Catalogue tab.
- A modal with: file drag/drop or file picker, label, kind selector (Character / Set Piece). Submit → loads the GLTF to validate, writes the blob to OPFS, saves metadata.

**Future path (Phase 13):** `OPFSCatalogueStore` is the local implementation of a `CatalogueStore` interface. Phase 13 replaces it with a server-backed store — callers are unchanged. User assets can be uploaded to the server store at that point.

---

### Deferred: Bundled third-party prop curation *(was L5)*

*Curating 10–15 CC0/MIT-licensed GLB props from Kenney.nl, Quaternius, Poly Haven.*

Deferred in favour of author-created assets via the sketcher (Phase S1–S4). When this is revisited:
- Assets stored in `static/models/gltf/props/`
- One `SetPieceEntry` per prop in `entries.ts` (L5 infrastructure already supports this)
- Selection criteria: CC0 or MIT; <2 MB each; low-poly, stylistically neutral
- Likely sources: Kenney.nl, Quaternius, Poly Haven 3D (all CC0)

---

### Future: Multi-level sets & terrain *(deferred — advanced)*

*For productions requiring stage lifts, mezzanine levels, stairways, or outdoor terrain.*

- **Simple raised platforms:** covered by extending the Studio/Theatre generators (see Step L4 note). No character navigation required; actors are manually placed on the upper level.
- **Stair navigation:** actors walk a path that follows the stair geometry — requires `MovePath` (Phase 7's path primitive) to support vertical displacement and the block compiler to use total path length, not Euclidean distance, for clip duration. Not trivially backward-compatible.
- **Terrain mesh:** import or generate a height-map mesh as a `SetPiece` with a custom GLTF. Actor Y-position snapping to terrain surface needs a raycaster query extended to arbitrary mesh geometry. Significant additional complexity.
- **CSG for window/door apertures in walls:** [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg) (BVH-accelerated, preferred over `three-csg-ts` BSP approach) can punch a door or window hole in a wall flat. A future "Wall" generator entry with optional aperture config.

This cluster of features shares a prerequisite: the character positioning system must be aware of walkable surfaces. Design this as a spike before committing.

## Phase UX2.5 — Reusable set templates *(not yet started)*

*Dress a stage once and re-apply it across all scenes in the production.*

- "Save as set template" action in the Set section of the Staging tab — saves the current scene's `set: SetPiece[]` under a user-chosen name.
- Set templates appear in the Catalogue tab under a new "Set Templates" group.
- Applying a template copies all its set pieces into the active scene (non-destructive append; name collisions get a numeric suffix).
- `SetTemplateStore` in `src/core/storage/` — same shape as `ProductionStore`; backed by IndexedDB once Phase I0 lands, `localStorage` until then.
- No live link between template and scenes — a template is a saved snapshot, not a shared reference.

This lands naturally after Step L3 (theatre stage generator): generate a stage → save as template → apply to each scene.

---

## Phase UX3.1 — Main-area tab bar *(not yet started)*

*Make the three primary canvas surfaces (Playback, Edit, Script) explicit tabs rather than implicit modes.*

**Current state:** Playback and Edit modes are toggled by a ✏ / ▶ button; the Script view has its own 3D / Script toggle bar.

**Proposed tab bar** across the top of the main area:

| Tab | Content |
|---|---|
| **▶ Playback** | Three.js canvas in playback mode |
| **✏ Edit** | Same canvas in edit mode |
| **📄 Script** | `ProductionScriptView` full-width |

`mainTab: 'playback' | 'edit' | 'script'` replaces `editMode` boolean + `mainView` string. The Presenter only renders when `mainTab !== 'script'`. Transport bar hidden/collapsed in script mode.

**Migration:** remove the `✏ / ▶` toggle button; remove the 3D / Script button bar; right panel retains Stage and Scene Script tabs.

**Tear-out:** because the Script view is a pure surface over a `StoredProduction` value, it can be opened via `window.open('/script')` + `BroadcastChannel('directionally')` for two-window authoring.

---

## Phase UX3.2 — Script format compliance *(not yet started)*

*Make the Full Script view print-faithful to an industry format.*

**Format selector:** `scriptFormat: 'stage-play' | 'screenplay'` on `StoredProduction`. Toggle in the Script tab toolbar.

**Stage play (British/US):** acts in Roman numerals, character names upper-case centred, dialogue in narrow column, stage directions italicised.

**Screenplay (WGA):** `INT. LOCATION — DAY` scene headings, action lines flush left, character name at column ~42, dialogue ~35 chars wide, parentheticals.

**Implementation:** a `format-screenplay` CSS class switches margins/indents. Small data-model additions: `location?: string` and `timeOfDay?: 'day' | 'night' | 'continuous'` on `NamedScene`.

**Out of scope:** PDF export (deferred to Phase 6.5), revision marks, Fountain/FDX import/export.

---

## Phase 6.5 — Screenplay enrichment *(deferred)*

- Scene headings (`INT. WAREHOUSE — DAY`).
- Industry-standard pagination (55 lines/page, page numbers top-right).
- Title page (title, author, draft date, contact block).
- Scene index / breakdown sheet export.
- PDF export via `jsPDF` or server-side Puppeteer.

---

## Phase 10 — Lighting rig *(not yet started)*

- Add lights from catalogue.
- Fix `point` light gap: scaffolded in domain types, currently skipped with a warning.
- `LightBlock` (Phase 8.7) is the authoring surface; this phase adds the editor UI to place and configure lights.

---

## Phase 11 — Audio *(partially complete)*

- `AudioBlock` type design captured (Phase 8.7); implementation deferred.
- **Remaining:** timeline strip rendering for audio blocks, waveform preview, audio clip catalogue entries.

---

## Phase 12 — Dance choreography *(deferred — needs spike)*

MIDI → keyframe synchronisation shape is unclear. Spike before committing to an approach.

---

## Phase 13 — Remote asset store *(deferred)*

`CharacterEntry.gltfPath` is URL-agnostic — a relative path serves the local catalogue, an absolute URL serves remote.

```ts
interface AssetStore {
  list(): Promise<CharacterEntry[]>;
  resolveUrl(entry: CharacterEntry): Promise<string>; // injects signed tokens if needed
}
```

`CATALOGUE_ENTRIES` becomes the `BundledAssetStore` implementation; `OPFSCatalogueStore` (Step L6) is the user-local implementation. Callers never change.

Possible directions: self-hosted S3/R2, Sketchfab API, Ready Player Me, Mixamo FBX→GLB pipeline.

---

## Phase 14 — Video render export *(deferred — large)*

- **Export dialog** — resolution presets (1080p, 4K; custom WxH), frame rate, format, audio toggle.
- **Off-screen render pass** — second `THREE.WebGLRenderer` at export resolution; frame-by-frame transport advance.
- **Encoding pipeline:** (1) `MediaRecorder` fallback; (2) `WebCodecs VideoEncoder` + `webm-muxer` (recommended); (3) FFmpeg.wasm (max coverage).
- **Audio:** TTS pre-synthesised before the frame loop begins.
- **Known risks:** audio/video sync timing, eSpeak/Kokoro synthesis latency, memory at 4K/60fps, Safari WebCodecs gap.

---

## Phase UX3 — Drag-and-drop cast management *(deferred)*

- Catalogue → Production cast: drag a character card onto the Cast section.
- Production cast → Scene (design canvas): drag actor card onto 3D ground plane; stages at drop point with ghost preview.
- Production cast → Scene (tree): drag actor card onto a scene node or Cast-in-this-scene section.

Prerequisites: UX2.3 and UX2.4. Button-based flows remain — this is progressive enhancement.

---

## Infrastructure *(deferred)*

### Phase I0 — ProductionStore → IndexedDB *(local users)*

*Removes the ~5 MB `localStorage` ceiling before it becomes a practical constraint.*

**Motivation:** `localStorage` is capped at ~5 MB shared across all keys. A realistic production reaches 100–300 KB of JSON; with dozens of productions this becomes a genuine limit. IndexedDB provides gigabytes of quota-managed storage, survives page reloads, and has a native binary blob API.

**What changes:**
- `ProductionStore` interface methods become `async` — `list()`, `get()`, `save()`, `delete()` all return `Promise`s.
- Implementation moves from `localStorage` to IndexedDB (key `directionally_productions`).
- `SetTemplateStore` (Phase UX2.5) adopts the same async interface and IndexedDB backing when it is built.
- `ProductionDocument.execute()` returns `Promise<void>`; all call sites in `+page.svelte` `await` it.
- All `ProductionStore` and `ProductionDocument` tests updated for async.

**What does not change:** `StoredProduction` shape is identical — no data migration needed for the stored JSON.

**One-way migration:** on first load under I0, existing `localStorage` productions are read and written into IndexedDB, then the `localStorage` key is cleared. Silent, automatic.

**Phase I1 readiness:** the async interface produced here maps directly to a `fetch`-backed Cosmos DB adapter — no further interface change required.

---

### Phase I1 — Azure deployment + database serialisation
- **Frontend:** Azure Static Web App (`swa-cli.config.json` already in repo).
- **API:** SvelteKit `+server.ts` handlers; SWA managed functions proxy `/api/*`.
- **Database:** Azure Cosmos DB NoSQL. `StoredProduction` maps directly to a Cosmos DB item. Partition key = `userId`.
- **`ProductionStore` async interface from Phase I0** — swapping the IndexedDB implementation for a `fetch`-backed store touches zero callers.

### Phase I2 — User management
- **Identity:** Microsoft Entra External ID (GitHub, Google, email/password).
- **Scoping:** Cosmos DB partition key = `userId` from JWT. No cross-user leakage.
- **Session:** SvelteKit `cookies` API; HttpOnly, SameSite=Strict.
- **Guest mode preserved:** unauthenticated users continue to use localStorage.

### Phase I3 — Staged builds
- **Environments:** local (Vite + emulators), staging (SWA staging slot), production (SWA production slot).
- **Flow:** PR → CI green → merge → auto-deploy to staging → manual approval → promote to production.

### Phase I4 — GitHub project management
- Projects board per major phase group; milestones = phases; issues = tasks.
- Issue templates: `bug.yml`, `feature.yml`, `snag.yml`, `spike.yml`.

### Phase I5 — GitHub CI/CD
**PR gate:** `yarn check` (0 errors) + `yarn test` (all green). Branch protection enforces it.

**Staging deploy:** trigger `push → main` → `yarn build` → SWA CLI deploy.

**Production release:** manual approval gate → `az staticwebapp environment promote`.

---

## Codebase state

| Area | Status |
|---|---|
| Domain model — flexible Group/Scene tree | ✅ Complete |
| Model/renderer layer | ✅ Complete (except point lights) |
| PlaybackEngine (play/pause/seek/rewind) | ✅ Complete |
| eSpeak-NG + Kokoro TTS, speech bubbles | ✅ Complete |
| Production storage + ProductionDocument | ✅ Complete |
| Transport bar + left/right panels | ✅ Complete |
| Asset catalogue (bundled) | ✅ Complete |
| Design/playback canvas split + gizmos | ✅ Complete |
| Screenplay editor + direction lines + parentheticals | ✅ Complete |
| Camera tracks UI | ✅ Complete |
| Ground-zero animation authoring | ✅ Complete (Phase 8) |
| ActorBlock / LightBlock / CameraBlock / SetPieceBlock | ✅ Complete (8.5–8.7) |
| Visual timeline strip | ✅ Complete (Phase 8.6) |
| Catalogue asset defaults (defaultRotation) | ✅ Complete (Phase 8.8) |
| Tablet support | ✅ Complete (Phase T) |
| Minimal interaction model | ✅ Complete (Phase UX1) |
| Production naming, actor add UX, act/scene tree, staging UX | ✅ Complete (UX2.1–2.4) |
| Spawn indicator as pre-t=0 block | ✅ Complete (Phase UX2.7) |
| Presentation mode | ✅ Complete (Phase UX2.8) |
| Speech and Audio panel + per-production speech settings | ✅ Complete (Phase UX2.9) |
| Set piece dressing + actor tint | ✅ Complete (Phase 9) |
| Script view in main pane | ✅ Complete |
| HDRI environment maps | Phase L1 |
| Textured materials | Phase L2 |
| Theatre stage generator | Phase L3 |
| Drama studio / soundstage generator | Phase L4 |
| GLTF set-piece infrastructure (SetPieceEntry.gltfPath) | Phase L5 |
| OPFSCatalogueStore (user-extensible catalogue, OPFS-backed) | Phase L6 |
| Bundled third-party prop curation (~15 CC0 assets) | Deferred |
| Multi-level sets / terrain | Future advanced |
| Reusable set templates | Phase UX2.5 |
| Main-area tab bar | Phase UX3.1 |
| Script format compliance | Phase UX3.2 |
| Screenplay enrichment (pagination, PDF, title page) | Phase 6.5 |
| Lighting rig | Phase 10 |
| Audio block timeline + waveform | Phase 11 |
| Dance / MIDI choreography | Phase 12 (needs spike) |
| Remote asset store | Phase 13 |
| Video render export | Phase 14 (large) |
| Drag-and-drop cast management | Phase UX3 |
| ProductionStore → IndexedDB | Phase I0 |
| Azure SWA + Cosmos DB | Phase I1 |
| User management | Phase I2 |
| Staged builds | Phase I3 |
| GitHub project management | Phase I4 |
| GitHub CI/CD | Phase I5 |
