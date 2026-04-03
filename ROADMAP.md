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

### Step L5 — Bundled CC0 asset curation *(next — top priority)*

*10–15 carefully selected, appropriately licensed GLTF props covering the most common staging needs.*

**Selection criteria:** CC0 or MIT licence; small file size (<2 MB each); stylistically neutral (low-poly realistic or semi-stylised); covers four primary venue types.

**Target list — indicative, to be confirmed against final licensing:**

| Asset | Venue use | Source candidate |
|---|---|---|
| Wooden chair | Theatre, drawing room, office | Kenney / Quaternius |
| Sofa / settee | Drawing room, interior | Quaternius |
| Dining table | Drawing room, kitchen | Kenney |
| Office desk | Office, studio | Kenney |
| Wooden bookcase | Library, drawing room, office | Quaternius |
| Steel filing cabinet | Office | Kenney |
| Park bench | Exterior | Kenney |
| Streetlamp post | Exterior marker | Kenney |
| Traffic cone / barrier | Exterior marker | Kenney |
| Studio camera on dolly | TV studio, behind-the-scenes | — |
| Studio spotlight rig | Theatre, TV studio | — |
| Microphone on stand | Music studio, interview | Quaternius |
| Café table + chair set | Exterior / café | Quaternius |
| Hospital bed | Medical drama | Kenney |

**Integration:**
- Each asset stored in `static/models/gltf/props/`.
- `SetPieceEntry` gains an optional `gltfPath?: string` field (mirrors `CharacterEntry.gltfPath`).
- `entries.ts` gains one entry per bundled prop.
- `buildSceneGraph.ts` handles `SetPieceEntry` with a `gltfPath` — loads via `GLTFLoader` instead of generating geometry.
- Preview in `PreviewRenderer` works immediately (it already handles arbitrary GLTF paths).

**Sources:** [Kenney.nl](https://kenney.nl/assets) — CC0; [Quaternius](https://quaternius.com) — CC0; individual picks from [Poly Haven 3D](https://polyhaven.com/models) — CC0.

---

### Step L6 — LocalCatalogueStore (user-extensible catalogue)

*Let authors bring their own GLB assets without writing code. Sets up the external asset architecture for Phase 13.*

**Concept:** a user can paste a URL (or upload a file) to add a new `CatalogueEntry` backed by localStorage. From that point the entry appears in the Catalogue tab exactly like a bundled asset — it can be previewed, dragged into scenes, and used in productions.

**Data model:**
```ts
type UserCatalogueEntry = CatalogueEntry & { userAdded: true; addedAt: number };
```
`LocalCatalogueStore` in `src/core/storage/LocalCatalogueStore.ts` — same service interface as `ProductionStore`; backed by `localStorage`.

**UI:**
- "Add asset…" button at the bottom of the Catalogue tab.
- A modal with: URL input (or file drag), label, kind selector (Character / Set Piece). Submit → loads the GLTF to validate, then saves the entry.
- File upload: `URL.createObjectURL(file)` creates a local blob URL used as the `gltfPath`. Note: blob URLs do not survive a page reload; Phase 13's server-backed store lifts this limitation.

**Future path (Phase 13):** `LocalCatalogueStore` is the local-storage implementation of a `CatalogueStore` interface. Phase 13 replaces it with a server-backed store — callers are unchanged.

---

### Future: Multi-level sets & terrain *(deferred — advanced)*

*For productions requiring stage lifts, mezzanine levels, stairways, or outdoor terrain.*

- **Simple raised platforms:** covered by extending the Studio/Theatre generators (see Step L4 note). No character navigation required; actors are manually placed on the upper level.
- **Stair navigation:** actors walk a path that follows the stair geometry — requires `MovePath` (Phase 7's path primitive) to support vertical displacement and the block compiler to use total path length, not Euclidean distance, for clip duration. Not trivially backward-compatible.
- **Terrain mesh:** import or generate a height-map mesh as a `SetPiece` with a custom GLTF. Actor Y-position snapping to terrain surface needs a raycaster query extended to arbitrary mesh geometry. Significant additional complexity.
- **CSG for window/door apertures in walls:** [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg) (BVH-accelerated, preferred over `three-csg-ts` BSP approach) can punch a door or window hole in a wall flat. A future "Wall" generator entry with optional aperture config.

This cluster of features shares a prerequisite: the character positioning system must be aware of walkable surfaces. Design this as a spike before committing.

---

## Phase UX2.5 — Reusable set templates *(not yet started)*

*Dress a stage once and re-apply it across all scenes in the production.*

- "Save as set template" action in the Set section of the Staging tab — saves the current scene's `set: SetPiece[]` under a user-chosen name.
- Set templates appear in the Catalogue tab under a new "Set Templates" group.
- Applying a template copies all its set pieces into the active scene (non-destructive append; name collisions get a numeric suffix).
- `SetTemplateStore` in `src/core/storage/` — same shape as `ProductionStore`, backed by `localStorage`.
- No live link between template and scenes — a template is a saved snapshot, not a shared reference.

This lands naturally after Step L3 (theatre stage generator): generate a stage → save as template → apply to each scene.

---

## Phase UX3.1 — Main-area tab bar *(not yet started)*

*Make the three primary canvas surfaces (Playback, Design, Script) explicit tabs rather than implicit modes.*

**Current state:** Playback and Design modes are toggled by a ✏ / ▶ button; the Script view has its own 3D / Script toggle bar.

**Proposed tab bar** across the top of the main area:

| Tab | Content |
|---|---|
| **▶ Playback** | Three.js canvas in playback mode |
| **✏ Design** | Same canvas in design mode |
| **📄 Script** | `ProductionScriptView` full-width |

`mainTab: 'playback' | 'design' | 'script'` replaces `designMode` boolean + `mainView` string. The Presenter only renders when `mainTab !== 'script'`. Transport bar hidden/collapsed in script mode.

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

`CATALOGUE_ENTRIES` becomes the `BundledAssetStore` implementation; `LocalCatalogueStore` (Step L6) is the user-local implementation. Callers never change.

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

### Phase I1 — Azure deployment + database serialisation
- **Frontend:** Azure Static Web App (`swa-cli.config.json` already in repo).
- **API:** SvelteKit `+server.ts` handlers; SWA managed functions proxy `/api/*`.
- **Database:** Azure Cosmos DB NoSQL. `StoredProduction` maps directly to a Cosmos DB item. Partition key = `userId`.
- **`ProductionStore` interface unchanged** — swapping `localStorage` for a `fetch`-backed store touches zero callers.

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
| Bundled CC0 prop assets (~15 items) | Phase L5 |
| LocalCatalogueStore (user-extensible catalogue) | Phase L6 |
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
| Azure SWA + Cosmos DB | Phase I1 |
| User management | Phase I2 |
| Staged builds | Phase I3 |
| GitHub project management | Phase I4 |
| GitHub CI/CD | Phase I5 |
