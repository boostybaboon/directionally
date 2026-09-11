# Directionally — Cartoon Sketcher Roadmap

Active work only. Completed phases live in [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md).

---

## Background & decisions

**Goal:** A single Set Design tool (think Spore creature creator crossed with a lightweight Unity/USD-style prefab system, not FreeCAD) built on Three.js. User-created assets — from raw primitives up through whole dressed settings — flow directly into the production asset catalogue and are reusable across scenes.

**Key documents:**
- `docs/sketcher.md` — implementation design for the polygon sketcher + extrusion pipeline
- `docs/asset-authoring-decision.md` — geometry kernel decision (mesh-first wins; monorepo ruled out)
- `set-staging-architecture.md` / `set-staging-architecture-plus-implementation-notes.md` — the Definition/Instance/override model this roadmap's **Track SET** implements, and the USD/Unity/Blender prior art it's adapted from

| Decision | Choice | Rationale |
|---|---|---|
| Package location | `src/core/sketcher/` inside existing app | Extractable later if needed; zero tooling cost now |
| Navigation | Single SvelteKit route `/sketch` | One editor for modelling and assembly (Track SET); `/studio` (Set Studio) retired in N10 |
| Geometry kernel | `THREE.Shape` + `ExtrudeGeometry` | Cartoon aesthetic; trivial GLB export |
| Monorepo | Ruled out | Premature for a single-developer project |

**Why one tool, not three:** modelling (Sketcher), assembly (attach/group), and set dressing (Set Studio's catalogue + lights + environment) were built as separate surfaces because they grew at different times. They are the same operation at different scales — insert a node, position it, optionally save the selection as a reusable catalogue Definition. Track SET below merges them: the Sketcher's viewport gains a catalogue panel and lights/environment (so it can build whole dressed settings, not just individual props), and a placed catalogue item becomes a single reference (`ref`) node rather than an eagerly-flattened pile of parts. See the design docs above for the full reasoning, including what a hierarchical (parent/child) node model keeps and loses versus the original flat/symmetric attach-joint model (short answer: nothing practical is lost — glue/weld scale semantics survive as a `rigid`/`snap` edge distinction on a tree; only true multi-parent cycles, which set dressing never needs, are given up).

---

## Current state — April 2026

The sketcher is a viable cheap-and-cheerful cartoon asset creator, and Track SET (below) is under way to fold set assembly and dressing into it. The core sketch loop works end-to-end: sketch a polygon → extrude → insert primitives → colour individual faces → apply textures to faces → attach parts into assemblies (structural group + live joint) → transform (group-level and member-edit) → numeric transform inspector → undo/redo → autosave. Each wall face of an extruded part and each face of a primitive has its own draw group and material slot enabling per-face colouring and texturing.

**Completed phases:** S0, S1, S2, S3, S4, SA1, SA2, SA3, SA4 (Ctrl+D; linear array deferred), SA5, SA13, SH2, SH1a, SA7, SA8, SH1b, SA11, SA14a, SA14b, SA15, SA9, SA12, SA6, SA16, SA17, SA18.

No phases with open obligations remain in the original sketch-only scope. Track SET (below) is the active work; the SA-phase items below it are enhancements to the sketch loop itself.

---

## Track SET — Set Design Tool unification (level 0)

Implements the Definition/Instance model from `set-staging-architecture*.md`: a catalogue **Definition** is a `SetPieceEntry` (already supports nested `compose`); an **Instance** is a placed `SetPiece` carrying a `ref` to a Definition. Flattening a `ref` into its rendered children happens only at render time (`resolveInstance`/`resolveInstances`) — the authored scene keeps the reference, never the expansion. Level 0 deliberately excludes per-instance **overrides**, an isolated **Edit Source** mode, and the venue/dressing **layering** split described in the design docs — those are real, understood, and named below as deferred, not forgotten.

### N1 — Stable `localId` foundation ✅ COMPLETE

Every child of a catalogue Definition's `compose` list needs an identity that survives reordering/insertion — a prerequisite for any future override mechanism (N5+) to keep addressing "the same child" across edits to the Definition.

- `PlacedProp.localId?: string` added (`domain/types.ts`).
- `generateLocalId()` / `assignLocalIds()` (`core/catalogue/localId.ts`) — idempotent: entries that already carry a `localId` are left untouched, so calling this on load is a safe migration step.
- **Tests:** `core/catalogue/localId.test.ts` — uniqueness, idempotency, non-mutation of the input.

### N2 — Instance (`ref`) resolution ✅ COMPLETE

A placed `SetPiece` can now be an **Instance** of a catalogue Definition instead of raw geometry.

- `SetPiece.ref?: string` added (`domain/types.ts`) — when set, `geometry`/`material` on the piece are a placeholder only, never rendered directly.
- `resolveInstance(piece, entries, unresolved)` / `resolveInstances(pieces, entries, unresolved)` (`core/setting/settingSpec.ts`) — expands a `ref` piece into its rendered children via the existing `expandEntry`/`resolveProp` (so nested `compose`-of-`compose` Definitions, the "systems of systems" case, already work with zero extra code — `expandEntry`'s `MAX_COMPOSITE_DEPTH` guard applies unchanged). Expanded child names are prefixed with the instance's own name (`chair-1/seat`) so multiple instances of the same Definition never collide. Unresolved refs fall back to rendering the piece's own placeholder and are reported, not silently dropped.
- Wired into `storedSceneToModel()` — every stored scene's `set` list is resolved through `resolveInstances` immediately before scene assembly, so `ref` pieces work in every existing scene without any caller changes.
- **Tests:** `core/setting/settingSpec.test.ts` (`resolveInstance`/`resolveInstances` — leaf, composite, multi-instance naming, unresolved fallback), `core/storage/storedSceneToModel.test.ts` (`ref` expansion reaches the render pipeline; plain pieces unaffected).

### N3 — Sketcher gains lights, environment, and catalogue placement ✅ COMPLETE

Folds Set Studio's dressing capability into the Sketcher so one tool builds both individual items and whole settings.

**Session model (core layer):**
- `SketcherSession.lights: LightConfig[]` / `SketcherSession.environmentMap?: string` (`core/sketcher/types.ts`).
- `SketcherDraft.lights?` / `SketcherDraft.environmentMap?` — optional so legacy drafts (no lights/environment) load unchanged.
- `CartoonSketcher.addLight()` / `.removeLight()` / `.getLights()` / `.setEnvironmentMap()` / `.environmentMap` — builds/removes the raw `THREE.Light` directly (mirrors `SceneBridge.buildLight`'s config→light mapping so the Sketcher stays independent of the domain `SceneBridge` module) and tracks placed lights alongside parts/joints/groups.
- `getSession()`, `toDraft()`/`loadDraft()`, and `clearSession()` all carry lights/environmentMap through save, reload, and reset.
- **Tests:** `core/sketcher/CartoonSketcher.test.ts` — add/remove light, hemisphere light without position, environment map get/set, session/draft round-trip, legacy-draft compatibility, `clearSession()` cleanup.

**Catalogue placement (core layer):**
- `CartoonSketcher.insertCataloguePiece(name, geometry, material, position?, rotation?, scale?)` — builds a single `SketcherPart` from a `GeometryConfig`/`MaterialConfig`; a single material slot + single face group keep it editable through the existing colour/texture/transform paths.
- `CartoonSketcher.insertCatalogueEntry(entry, entries)` — expands a `SetPieceEntry` via `expandEntry` (so leaf and composite — including nested `compose`-of-`compose` — both work), then groups multi-part results into one movable `AssemblyGroup`. GLB-backed pieces are skipped (no editable procedural geometry).
- **Tests:** `core/sketcher/CartoonSketcher.test.ts` — leaf → single ungrouped part; composite → grouped assembly; GLB-backed skipped; `insertCataloguePiece` position/rotation/scale + single face group.

**Page/UI layer:**
- `/sketch` now imports `CataloguePanel.svelte` with a toolbar **Catalogue** toggle and a left drawer.
- `handleCatalogueAdd(kind, id)` — set-piece → `insertCatalogueEntry` + select (whole group or single part); light → `addLight` with a fresh per-instance id; character → staged-in-script-view status.
- `handleApplyEnvironment(id)` — `RGBELoader` + `PMREMGenerator` against the Sketcher's own renderer (same pattern as `Presenter.svelte`), sets `scene.environment`/`scene.background`, and records the choice via `setEnvironmentMap`; clearing restores the flat background.
- User catalogue entries load on mount and re-sync on the `catalogue-updated` broadcast; the HDRI environment is re-applied on draft restore.

### AI-API — Scenery authoring surface for AI ✅ COMPLETE

Added so an LLM/agent can drive asset creation without the Three.js runtime — it emits JSON against a contract and gets a validated, persisted catalogue entry back. The provider/LLM side stays in `ROADMAP_AI.md` (`/agent/generate/*`); this is the *data* contract + apply path those routes will hand JSON to.

- `SET_PIECE_JSON_SCHEMA` (`core/setting/authoringApi.ts`) — a JSON Schema (draft 2020-12) for `NewProceduralSetPiece`: a leaf primitive, an assembly (`compose` of `ref`s and inline primitives), or a whole setting (`compose` + `lights` + `environmentId`). Embeddable directly in a system prompt or a `response_format`/`tool_choice` `input_schema`. Mirrors `NewProceduralSetPiece`/`PlacedProp` — keep in sync.
- `normalizeSetPieceInput(input)` — strict validation + clamping of untrusted JSON into a `NewProceduralSetPiece`; assigns stable `localId`s to `compose` children via `assignLocalIds`. Throws a descriptive error on the first invalid field (unknown geometry/light type, bad label, leaf-vs-composite violation, non-finite vec3, …).
- `createSetPiece(input)` — the single apply call: `normalizeSetPieceInput` → `OPFSCatalogueStore.addSetPiece` → returns the created entry. Caller posts `{ type: 'catalogue-updated' }` on `BroadcastChannel('directionally-catalogue')` so open script views re-resolve via the existing CAT-4 loop.
- **Tests:** `core/setting/authoringApi.test.ts` — schema is JSON-serialisable; leaf/composite/ref/setting normalisation; `localId` assignment; rejection of bad label/geometry/light/leaf-compose violations/non-object input; `createSetPiece` persists and returns the entry.

Together with the pre-existing `resolveSettingSpec`/`validateSettingSpec` + `/agent/setting` (resolve-only, over HTTP) and `addSetPiece`, this is the complete "something the AI talks to" for scenery: **schema → validated create → broadcast → script auto-resolves**. No `N4`/`N10` UI work is a prerequisite for it.

### N4 — Save as Item / Save as Setting ✅ COMPLETE (whole-scene)

Generalises the old `exportToCatalogue` (GLB-only) and Set Studio's `saveAsSetting` (whole-scene-only) into two whole-scene saves in the Set tool:

- **Save as Item** (was "Export to Catalogue") — GLB-bakes the whole session as a reusable geometry item, keeping the `sourceAssemblyId` round-trip (re-export updates in place; "Edit in Sketcher" links back).
- **Save as Setting** — same GLB bake **plus** the session's `lights` + `environmentMap`, so the entry resolves in a script as a fully-lit setting (`INT <label>` applies geometry + environment + lights).
- `OPFSCatalogueStore.add()` now persists `environmentId`/`lights` on GLB-backed set-piece entries (previously dropped — only the procedural `addSetPiece` path kept them); `toUserEntry` emits them too.
- **Tests:** `core/storage/OPFSCatalogueStore.test.ts` — a GLB set-piece saved as a setting round-trips `environmentId` + `lights`.

**Still deferred (the "promote a selection" half):** selecting a *subtree* and promoting it to a procedural `compose` Definition (with fresh `localId`s) that replaces the selection in-scene with a `ref` instance. That needs a "selection → `compose`" flattener plus `ref`-provenance tracking; it folds into N5/N6 (Edit Source / Overrides), which introduce instance-provenance anyway. Whole-scene saves are the level-0 loop; selection-promote isn't required to "put premade items into a room".

### Deferred beyond level 0

These are real, named requirements from the design docs — not gaps discovered later — deliberately excluded from level 0 because "put premade items into a room" doesn't need them yet.

| Phase | Content |
|---|---|
| N5 | **Edit Source** — an isolated editing context for a Definition (double-click an instance to open its source; edits there write to the Definition and ripple to every instance), mirroring Unity's Prefab Mode / Blender's linked-collection edit. |
| N6 | **Overrides + Apply/Revert** — per-instance sparse diffs (`{ path, op: 'remove' \| 'swap_ref' \| 'set', value }`) resolved by replaying the override list over a deep copy of the Definition at load time; an Outliner highlight for overridden nodes; one-click Apply (push to Definition) / Revert (discard), mirroring Unity's bold-blue-bar property affordance. |
| N7 | **Per-scene setting overrides ("dressing" layer)** — extends `settingBindings` with an overrides list per scene, giving "same classroom, minus one chair, for this scene only" without forking the Definition. Layers 1 (Venue/Definition) and 3 (Shot — `Block[]` camera/light timeline) already exist; this is the only new layer. |
| N8 | **Stable animation addressing** — formalise `SetPieceBlock.targetId` as keying off a stable `SetPiece` id rather than the mutable `name`, closing the fragile name-key gap once instances are common. |
| N9 | **Outliner panel** — a simple indented tree view of the scene's nodes/groups/instances, reusing `SelectionManager`. |
| N10 | **Route consolidation** — ✅ DONE: `/studio` route deleted (superseded by N3's catalogue-in-Sketcher); nav shows a single "Set" link at `/sketch`; `Create →` for an unresolved setting already points at `/sketch?prefillName=…`. Orphaned `PropertiesPanel.svelte` + `SelectedEntity` (the old `/studio` inspector) removed. |
| — | Nested groups-of-groups in the *session* model (a group containing another group, not just parts) — the catalogue already supports Definition-of-Definitions via nested `compose`/`ref`; a session-level group-of-groups is a separate, lower-priority ask. |
| — | Full USD-style LIVRPS composition-arc generality, payload lazy-loading — level 0's fixed 2–3 layer resolution (N7) captures the practical benefit without the generality. |

---

## N11 — Catalogue hygiene / duplicate-setting UI snags

Surfaced from a real authoring session: typing `#EXT GARDEN DAY`, using "Create →" to jump to the Sketcher, building a tree, exporting, and finding (a) the production still showed an older placeholder tree, (b) four duplicate GARDEN entries had accumulated in the catalogue with no way to remove them, and (c) a GARDEN catalogue item couldn't be inserted into a new GARDEN2 session. Root causes traced to specific code, not flakiness — see below.

**Root causes:**
- Label-match resolution (`resolveSetting` in `fountainCompiler.ts`) does `.find()` over `[...CATALOGUE_ENTRIES, ...userEntries]`, so with duplicate labels it silently binds to the **oldest** matching entry, not the most recent export. `settingBindings` can override this but nothing surfaces that duplicates exist or which entry won.
- `CataloguePanel.svelte` set-piece/character rows have no delete affordance — `OPFSCatalogueStore.remove()` exists but nothing in the UI calls it, so duplicates can never be cleaned up.
- `handleCreateAsset` (`+page.svelte`) always does `window.open('/sketch?prefillName=…')` with no `assemblyId` — not idempotent. Every "Create →" click (or retry) mints a brand-new blank assembly, which becomes a brand-new catalogue entry on export — the actual source of the duplicate GARDENs.
- The N4 `saveAsSetting()` always calls `OPFSCatalogueStore.add()` unconditionally, unlike `exportToCatalogue()`, which checks `findByAssemblyId` first and updates in place on re-save — a fresh duplicate-source introduced by N4 itself.
- `CartoonSketcher.insertCatalogueEntry()` skips GLB-backed pieces (`if (piece.gltfPath) continue`), so a GLB-baked GARDEN can't be inserted into a GARDEN2 session. **Decided out of scope for N11**: this is legitimately N4 (promote-selection)/N5 (Edit Source)/N7 (per-scene dressing overrides)'s job, not a bug to patch around — introducing a schema workaround now (e.g. a `custom` GeometryConfig kind to shoehorn arbitrary Sketcher meshes into `compose`) would fork the design ahead of that already-planned work. The interim workaround is manual: "Save As" a copy and customize independently (see below), or wait for N4/N5/N7.

**Planned fix:**
1. Fix `saveAsSetting()` to update-in-place via `findByAssemblyId`, matching `exportToCatalogue()` — stop the newest duplicate-source.
2. Change label-match resolution (`fountainCompiler.ts` `resolveSetting`, and the analogous cast-name path) to prefer the most-recently-added matching entry (sort by `addedAt` descending) instead of the first/oldest.
3. Add a delete ("✕") action to `CataloguePanel.svelte`'s set-piece and character rows, wired to `OPFSCatalogueStore.remove()` + the `catalogue-updated` broadcast.
4. Make "Create →" (`handleCreateAsset`) idempotent: check `SketcherAssemblyStore.list()` for an existing name match before opening a blank `/sketch?prefillName=`; deep-link to the existing one via `?assemblyId=` instead.
5. Add a "resolved via" indicator near the diagnostics/scene heading showing which catalogue entry id a scene's setting resolved to (and how many other same-label entries exist), making duplicates visible and `settingBindings` discoverable instead of invisible.
6. Add a Sketcher **"Save As…"** toolbar action: duplicate the current draft (parts/joints/groups/lights/environment) into a *new* `SketcherAssemblyStore` entry under a new name, switching `currentAssemblyId` to the copy. This is the sanctioned "base scene → customized copy" workaround until N4/N5/N7 land — not a substitute for them.
7. Tests: `OPFSCatalogueStore` (remove + any extracted resolution-order helper), `fountainCompiler`/`settingSpec` last-export-wins resolution, `SketcherAssemblyStore`/`+page.svelte` Save As behavior, `CataloguePanel` delete action.

Explicitly **not** in scope for N11: `GeometryConfig` schema changes, GLB-into-Sketcher reuse, or anything that pre-empts N4 (promote selection)/N5 (Edit Source)/N6 (overrides)/N7 (per-scene dressing) — those remain the correct home for "reuse a set inside another set".

---

## Phase SA14a — Multi-select and Group/Ungroup ✅ COMPLETE

Users frequently position several parts visually then want to treat them as one rigid unit for transport, scaling, and export. Group achieves this without face-snap math — it captures current world transforms only.

**Multi-select**
- Shift-click adds a part (or group) to the selection; `SelectionManager` gains `selectedIds: Set<string>` alongside the existing primary `selectedId`
- All selected parts receive a highlight outline
- Clicking empty space or a single part clears the multi-selection

**Group**
- Available when `selectedIds.size > 1`
- Creates a new `THREE.Group` positioned at the centroid of the selection
- Calls `group.attach(mesh)` for each selected part — Three.js decomposes `parentWorldInverse × meshMatrixWorld` into the correct local transform, preserving every part's current world position/rotation/scale
- Registers the result as a group in `AttachManager` (same `AssemblyGroup` type; pure groups have no `AttachJoint` records)
- TC gizmo attaches to the group; clicking any member selects the whole group, not the individual mesh
- `GroupCommand` — snapshot-based undo/redo via `SketcherDocument.execute()`

**Ungroup**
- Available when the selected entity is a group
- Detaches all children, calls `scene.attach(mesh)` to restore each mesh's world transform at scene root, removes the `THREE.Group`
- `UngroupCommand` — snapshot-based

**Constraint:** within a group the TC gizmo operates on the group only. To reposition a single member, use SA14b enter-group edit mode, or Ungroup → reposition → Group.

---

## Phase SA14b — Enter-group edit mode ✅ COMPLETE

After grouping, users occasionally need to tweak one member's position without dissolving the whole group (e.g. nudge a capsule eye slightly forward). Double-clicking a group enters edit mode for that group.

**Behaviour**
- Double-click a group → enters edit mode; subsequent single-click selects individual members inside the group
- TC, colour, texture, and snap-to-floor operations all target the active member in edit mode
- The active member is highlighted; other group members are dimmed
- Clicking outside the group, pressing Escape, or clicking "Exit group" in the toolbar returns to group-level selection
- Edit mode is non-destructive — the group is not dissolved; the member's local transform within the group is updated in place
- All transforms issued in edit mode are individually undoable

**Why before ungroup-as-last-resort:** most "I need to reposition an eye" operations don't need the group dissolved permanently. Enter-group → nudge → exit is faster and keeps the assembly intact.

---

## Phase SA15 — Attach as structural group with live constraint ✅ COMPLETE

See [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md) for full details.

---

## Phase SA12 — Positioning precision ✅ COMPLETE

See [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md) for full details.

---

## Phase SA6 — Sketch shape presets ✅ COMPLETE

See [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md) for full details.

---

## Phase SA16 — Torus primitive ✅ COMPLETE

See [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md) for full details.

---

## Phase SA17 — Shape holes (extrude with holes) ✅ COMPLETE

See [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md) for full details.

---

## Phase SA18 — Lathe / revolve geometry ⚠ REVISED

The floor-plane (XZ) sketch approach implemented in SA18 (see archive) does not compose with `LatheGeometry` because `PolygonSketcher._closeShape` subtracts the polygon centroid from every point. `LatheGeometry` must receive **raw radial distances from the axis** (`shape.x ≥ 0`, `shape.y = height`); after centering, exactly half the profile ends up at `x < 0` and is silently clamped. Users cannot predict or compensate for this. The floor-plane lathe is superseded by SA18a below.

---

## Phase SA18a — Dedicated revolve sketch mode

A first-class revolve mode with its own camera view and coordinate system. Replaces the SA18 floor-plane approach entirely.

**User mental model:** draw the right-half silhouette of the final shape against the Y revolution axis, then press Revolve. What you see is exactly what gets swept.

```
  Y ↑  revolution axis
    │  ╭──────╮
    │  │      │   ← sketch this half-profile
    │  │      │     in positive X
    │  ╰──────╯
────┼──────────────── X (radial distance from axis)
```

**Shape and result table:**

| Profile (XY world clicks) | Result |
|---|---|
| `(0,0)(1,0)(1,2)(0,2)` close | Solid cylinder, radius 1, height 2 |
| `(1,0)(2,0)(2,1)(1,1)` close | Square cross-section ring |
| `(0,0)(1,0)(0.5,2)` close | Cone |
| `(0,0)(0.5,0)(1,0.5)(0.8,1.5)(0,2)` close | Vase / bottle |

Notes:
- Minimum 3 clicks then click near the first to close (same mechanic as extrude).
- Profile points at `x=0` produce closed flat cap faces automatically — the swept radius-0 segments fill in top/bottom. A rectangle from `(0,0)` to `(1,2)` gives a solid cylinder with no further effort.
- A ring profile that never touches `x=0` gives a hollow torus-like shape (annular cross-section). Caps are only needed for partial-angle sweeps (SA18b).
- Points drawn at `x<0` show a visual warning and are clamped to `x=0` on commit.

**Changes required:**

1. **`PolygonSketcher.drawPlane = 'xy'` mode**
   - Raycasts against the `z=0` plane (`THREE.Plane(normal=(0,0,1), constant=0)`) instead of the XZ floor.
   - Line/rubberBand/closureMarker vertex Y component used instead of Z; vertices sit at `(x, y, 0.01)`.
   - `_closeShape` for 'xy' mode: `shape.x = world.x`, `shape.y = world.y` — **no centroid offset**. Centroid passed to caller is `(0, 0, 0)` so mesh is placed at world origin.
   - Status hint when any profile point had `x < 0` and was clamped.

2. **New phases: `'revolve-drawing'` and `'pending-revolve'`**
   - `CartoonSketcher.startRevolveSketch()`: sets `polygonSketcher.drawPlane = 'xy'`, phase = `'revolve-drawing'`.
   - On close: fires `onRevolveReady?.()`, phase = `'pending-revolve'`.
   - `cancelPendingRevolve()`: phase → `'idle'`.
   - `confirmLathe(uprighted)` now works from `'pending-revolve'` (same commit logic as SA18, no changes needed there).
   - Escape from `'revolve-drawing'` → cancel sketch + restore environment. Escape from `'pending-revolve'` → cancel + restore.

3. **Environment switch (page.svelte)**
   - On `startRevolveSketch()`: save camera position + orbit target; move camera to `(0, 2, 15)` looking at `(0, 2, 0)` (XY plane face-on); `orbit.enableRotate = false` (pan/zoom only while sketching).
   - Ghost existing parts: set all part materials `transparent=true, opacity=0.15`.
   - Add Y-axis revolution indicator: a `THREE.Line` at `x=0, z=0` spanning `y=-20..20`, `LineBasicMaterial({ color: 0xff4400, depthTest: false })`.
   - Add a secondary `GridHelper` in the XY plane (or swap the floor grid).
   - On exit: restore camera pose, `orbit.enableRotate = true`, un-ghost parts, remove indicator and grid.

4. **HUD changes**
   - New `isRevolvePending` state (separate from `isHolePending`).
   - "Revolve" button added to the sketch actions toolbar, or "Revolve mode" option in the sketch mode dropdown.
   - When `isRevolvePending`: show "Revolve" button + "Upright ☑" checkbox + "Cancel" — no Extrude, no Add Hole offered.
   - Entering revolve draw mode sets a status message: *"Draw the half-profile against the Y axis. Click near the first vertex to close."*

5. **No serialisation changes** — `PartDraft.kind = 'lathed'` and `lathePoints` already exist from SA18; round-trip is unchanged.

**Tests to add:** profile close → `'pending-revolve'`; confirm → part committed with correct `lathePoints`; xy draw-plane raycasts against z=0; negative-x clamp; toDraft round-trip via 'xy' profile.

---

## Phase SA18b — Partial angle revolve + end caps

**Depends on SA18a.** Full 360° is the only supported sweep angle until this phase.

**Design:**

- Angle input (0°–360°, default 360°, step 5°) in the revolve HUD.
- `confirmLathe(uprighted, phiLengthDeg = 360)` passes `phiLength = phiLengthDeg * Math.PI / 180` to `THREE.LatheGeometry`.
- For `phiLength < 2π`: generate two flat end caps.

**Cap generation:**
- At angle 0: profile points sit at `(r, h, 0)` in world space. The cap is the profile polygon triangulated in the XY plane (it's exactly the shape you drew). Use `THREE.ShapeUtils.triangulateShape(outerPts, [])`. Normal = `(0, 0, -1)`.
- At angle φ = phiLength: rotate each cap vertex by φ around Y axis — `(r, h, 0) → (r·cos φ, h, r·sin φ)`. Normal = outward perpendicular to the cut plane.
- Merge lathe geometry + two caps via `BufferGeometryUtils.mergeGeometries()`; each cap is a separate draw group so face-paint works on each cut face independently.
- If the profile never touches `x=0` (ring profile), each cap is an annular face (outer hull minus inner hull) — `THREE.ShapeUtils.triangulateShape(outerPts, [innerPts])`.

**Serialisation:** `PartDraft.lathePoints` gains an optional `phiLength?: number` sibling field (radians; absent = 2π). `loadDraft` reconstructs correctly.

---

## Known issues — Lathe / revolve geometry

### UV fan-slice on axis-touching faces

**Symptom:** On a revolve shape where the profile touches the Y axis (r = 0) — e.g. a solid cylinder's top cap face, or a nearly-flat top face like `(0,10)→(10,9.5)` — a texture applied to that face appears to radiate outward in 32 wedges instead of projecting flatly. The seam repeats every ≈0.03 U units.

**Root cause:** `THREE.LatheGeometry` assigns `U = columnIndex / segments` — a cylindrical UV projection based purely on sweep angle. For a disc-like face the inner ring of vertices all sit at the same world position `(0, y, 0)` but carry different U values (`0/32, 1/32, 2/32, ...`). Each triangle on that face has a wildly different U at its centre vertex, producing 32 radial texture wedges.

**Fix required:** A separate draw group for each axis-touching profile segment, with a planar (XZ) UV projection applied post-geometry instead of the cylindrical default. This needs per-face UV remapping after `LatheGeometry` construction, which is non-trivial. Deferred.

---

## Phase SA9 — Named assemblies ✅ COMPLETE

The sketcher is now a multi-document editor backed by OPFS. Each assembly has a name, persists across sessions, and can be re-opened for continued editing and re-export.

**Changes delivered:**
- `SketcherDraft` extended with `groups?: GroupSnapshot[]` — drafts now fully round-trip group topology
- `CartoonSketcher.toDraft()` serialises groups; `loadDraft()` reconstructs them (mirrors `restoreSnapshot` pattern)
- New `SketcherAssemblyStore` (`src/core/storage/`) — OPFS-backed store: `list()`, `get()`, `create()`, `save()`, `remove()`; injectable directory provider for testability; metadata in `assemblies-meta.json`, each draft as `{id}.json`
- `/sketch` route: `localStorage` autosave replaced by OPFS save via `SketcherAssemblyStore`; legacy `sketcher-draft` key migrated to a named OPFS entry on first run
- Toolbar: assembly name text field (editable, blur/Enter renames) + **New** button + **Open…** toggle panel listing all saved assemblies with delete per-entry
- **Export to Catalogue** now uses the assembly name as the catalogue label
- `clearSession()` no longer touches `localStorage`; state management handled by `newAssembly()` / `openAssembly()`

**Tests:** 474 passing (14 new `SketcherAssemblyStore` tests)

---

## Phase S4 — Promote to production ✅ COMPLETE

- Removed `import.meta.env.DEV` guard from `/sketch` route (and the `goto` import that served only the guard)
- Added **Sketcher ✏** link in the main app left-panel tab bar, right-justified via `margin-left: auto`

---

## Phase L6 — OPFSCatalogueStore

```ts
type UserCatalogueEntry = CatalogueEntry & { userAdded: true; addedAt: number };

interface OPFSCatalogueStore {
  list(): Promise<UserCatalogueEntry[]>;
  add(blob: Blob, meta: Omit<UserCatalogueEntry, 'id' | 'addedAt' | 'gltfPath'>): Promise<UserCatalogueEntry>;
  remove(id: string): Promise<void>;
}
```

- GLB blobs stored as real files under `assets/` in the origin OPFS root
- Metadata in a companion `assets-meta.json` in the same OPFS directory
- `list()` calls `fileHandle.getFile()` + `URL.createObjectURL()` per entry — fresh object URLs each session
- `StoredProduction` stores only `catalogueId`; `gltfPath` resolved at runtime

**Catalogue integration:** `catalogue.ts` `getCharacters()` / `getSetPieces()` accept an optional `userEntries` arg for testable injection. `/` route merges OPFS entries at startup.

**Tests via mocked `navigator.storage.getDirectory()`:** add → list, remove → absent, metadata persists across re-instantiation.

---

---

## Phase SA19 — Precise attach point placement

The current attach system has two positioning modes: **free** (blob placed at exact click point) and **centre** (blob snapped to the face-group centroid). Neither is sufficient for precise assembly work, e.g. attaching four table legs at symmetric positions on the underside of a tabletop.

### Core concept: face tangent frame

Every flat face (and, by extension, every face-group centroid on a curved surface) defines a local 2D coordinate system:

- `n` — face normal, in mesh-local space (already stored as `AttachJoint.localNormalA`)
- `t` — tangent: a stable vector perpendicular to `n` (e.g. derived via `Quaternion.setFromUnitVectors(worldY, n)`)
- `b` — bitangent: `cross(n, t)`, completing the orthonormal frame

An attach point is then expressed as:

```
localPoint = faceCentroid_local + dx·t + dy·b + dz·n
```

`dx`, `dy` are the in-plane offset from the face centroid; `dz` is the normal-direction offset (see below). All three are in mesh-local units. `localPoint` is what gets stored in `AttachJoint.localPointA/B` — this is **already** how the data model works, so this phase is entirely additive UI.

Because `localPoint` is in mesh-local space, it survives arbitrary world-space rotation, translation, and uniform scaling of the part with no changes. To re-edit, the `dx`/`dy`/`dz` values are recovered by projecting `localPoint - faceCentroid_local` onto `t`, `b`, `n`.

### Normal-direction offset (`dz`)

Without a non-zero `dz`, two curved surfaces that meet at a point (e.g. a cylinder attached into a sphere's side) produce a visual z-fighting artefact — the cylinder end cap and sphere surface overlap at the contact circle. A small inward `dz` offset (negative along the anchor's normal) sinks the appendage slightly into the anchor surface, producing a natural "embedded" look.

This is a per-joint property. A default of `dz = 0` preserves current behaviour. For the cylinder-into-sphere case a user would set e.g. `dz = -0.1` (push the cylinder 0.1 units into the sphere), which `resolveConstraints` honours by translating the result of `_applyJointPosition` an additional `dz` along the anchor normal.

### Proposed UX — "precise" placement mode

A third toggle alongside the existing free / centre modes. When active, the attach pick becomes a three-sub-step flow:

1. **Face pick** — click selects the face as now; blob appears at face centroid (`centre` mode baseline).
2. **Offset input** — a compact inline HUD appears with three fields: `dx`, `dy`, `dz` (all defaulting to 0). The blob marker updates live as the user types. Enter (or a Confirm button) locks the position and advances to the target phase.
3. **Target pick** — identical to existing flow; can also use precise mode for the target face.

For the table-leg workflow: anchor on tabletop underside → enter `(-0.7, -0.7, 0)` → pick leg top face in centre mode → leg snaps to position. Repeat four times.

### Editing existing joints

The dream is a fully positionable attach system: select an existing assembled joint, open a properties panel that shows the anchor face, current `dx`/`dy`/`dz` values, and allows live editing. On change, `resolveConstraints` reruns and the assembly reflows immediately.

The UX challenge is joint selection — an assembled part may be involved in multiple joints (e.g. a central hub with four spokes). The face-highlight hover logic already identifies which face-group was clicked, and each joint stores which face-group it uses (via the `localNormal` direction). These two can be correlated to identify the specific joint the user intends to edit.

### Implementation notes

- `AttachJoint` type needs no schema change: `localPointA` already encodes any `dx`/`dy`/`dz` offset implicitly.
- `_applyJointPosition` in `AttachManager` needs a small extension to apply the `dz` normal offset on top of the face-flush snap. Currently it snaps the target face flush with the anchor — a `dz` offset shifts the target an additional `dz · anchorWorldNormal` after snapping.
- The tangent-frame derivation is a pure utility function (no Three.js state): `(normal: THREE.Vector3) → { t, b }`. Deterministic so the same frame is reconstructed for round-trip editing.
- Non-uniform scaling of a part after gluing will shift the stored `localPoint` proportionally in the scaled axis — the same limitation as every node-based CAD tool. Discourage non-uniform scaling of assembled parts.

---

## Deferred *(low priority, not blocking)*

| Phase | Content |
|---|---|
| SD1 | Auto-bone per extruded part → `SkinnedMesh` (prerequisite for character rigging) |
| SD2 | Sketch-on-face: click a face to set the drawing plane |
| SD3 | Toon shader / backface-inflation outline pass |
| SD4 | Convex hull collider export for Rapier.js |
| SD5 | Boolean cuts via `three-bvh-csg` |
| SD6 | "Add asset…" UI in the Catalogue tab |
| SA4b | Linear array: N copies along an axis with step distance |
| SA11b | Nominated-face floor snap: mark one face as the floor contact face; group translates so that face's world-space centroid lies on `y = 0`. Useful for angled feet and irregular bases. |

---

## Track B — Character animation *(future)*

### Architecture

The character creator is a **sibling route** to the sketcher, not a sub-facility of it. Both are asset creation tools that write to the OPFS catalogue; the production window's catalogue panel consumes their output without caring which tool produced it.

```
Tab bar:  [Production]  [Sketcher ✏]  [Characters 👤]
                           ↓                  ↓
                     OPFSCatalogueStore  OPFSCatalogueStore
                     (kind: set-piece)   (kind: character)
                                   ↓
                           Catalogue panel — cast & set pieces
```

The sketcher is **constructive**: draw, extrude, attach, iterate from nothing. The character creator is **configurational**: a humanoid is always on screen; the user tunes sliders and pickers. These are different enough mental models that sharing a UI would be confusing.

**Future cross-tool interaction (far downstream):** a character might carry a sketcher-made prop (a sword attached to `mixamorigRightHand`, a hat on `mixamorigHead`) or even have sketcher-made body parts composited onto it. An interaction model for this — likely an asset-picker that selects from the sketch catalogue and a socket/attachment system on named bones — is deferred until both tools are mature independently.

### Design principle

Humanoid rigging, blend-shape authoring, and motion capture are expert-level work well beyond the sketcher's scope. Animations are a set of bone rotations over time — they are independent of mesh geometry. This separation means a procedurally-constructed skeleton with Mixamo bone names can play the entire free Mixamo animation library directly, with no asset mesh dependency.

### CB0 — Base humanoid: procedural skeleton + Mixamo animations

**Approach: build a `THREE.Skeleton` in code using Mixamo bone names; attach simple capsule/sphere geometry; drive it with downloaded Mixamo animation clips.**

A `THREE.AnimationClip` is a collection of `KeyframeTrack` objects — each track is bone rotations (quaternions) and optionally root translation, keyed over time. Three.js's `AnimationMixer` resolves tracks to bones by name. If the procedural skeleton uses the Mixamo bone naming scheme, any Mixamo clip plays on it without modification.

**Why procedural beats using a Mixamo mesh:**
- No UV maps or texture files — flat-coloured `MeshToonMaterial` segments consistent with the existing catalogue aesthetic
- Proportions are fully parametric at runtime: scale a bone, the capsule geometry scales with it
- Clothing is colour regions, not mesh swaps — no art pipeline dependency
- No third-party base asset required to ship

**Skeleton structure (Mixamo naming):**

```
mixamorigHips
├── mixamorigSpine → Spine1 → Spine2 → Neck → Head
│                                       └── [hair/hat mesh, swappable]
├── mixamorigLeftShoulder → LeftArm → LeftForeArm → LeftHand
├── mixamorigRightShoulder → RightArm → RightForeArm → RightHand
├── mixamorigLeftUpLeg → LeftLeg → LeftFoot → LeftToeBase
└── mixamorigRightUpLeg → RightLeg → RightFoot → RightToeBase
```

Each segment rendered as a `CapsuleGeometry` or `SphereGeometry` sized to the bone's rest length. Colour per segment = skin/clothing region.

**Root translation scaling:** walk/run clips include absolute hip translation. Scale the translation track by the character's height ratio so taller characters take proportionally longer strides.

**Animation library target (~15 clips from [Mixamo](https://www.mixamo.com), free commercial use):**

`idle`, `walk`, `run`, `sit-down`, `sitting-idle`, `stand-up`, `talk`, `wave`, `point`, `look-left`, `look-right`, `crouch`, `pick-up`, `react-hit`, `cheer`

**Alternatives considered:**

- *Mixamo mesh characters* — cleaner appearance but creates a third-party asset dependency for the base character and loses the parametric proportions benefit. Could be added later as an optional "realistic" mode.
- *VRoid / VRM* — own skeleton spec; free Mixamo animation library unavailable without retargeting. Deferred.
- *Ready Player Me* — Mixamo-compatible skeleton, embeddable web creator. More realistic appearance vs. toon aesthetic. Keep in view for a "realistic character" mode.
- *Quaternius / Kenney* — CC0 toon characters but non-Mixamo skeleton; animation library is per-pack only.

### CB1 — Bone proportion editor

Sliders scale named bones at runtime. Non-destructive — the rest-pose bone lengths are stored separately; sliders apply a multiplier. No baking needed unless exporting to catalogue.

| Slider | Bones | Notes |
|---|---|---|
| Height | `mixamorigHips` root Y + all bones uniform | Floor-correct so feet stay on y=0 |
| Weight / bulk | `Spine`, `Spine1`, `Spine2`, `Hips` | Non-uniform XZ scale |
| Arm length | `LeftArm`, `LeftForeArm`, mirrored | |
| Leg length | `LeftUpLeg`, `LeftLeg`, mirrored | |
| Head size | `Head` | |
| Shoulder width | `LeftShoulder`, `RightShoulder` | |

Constrain to ±40% — beyond that, capsule geometry overlaps at joints. For toon characters this range produces stocky, tall, and child-proportioned variants convincingly.

### CB2 — Colour customisation

`MeshToonMaterial` colour per body region — no material slot naming convention needed since the geometry is authored:

| Region | Segments | Control |
|---|---|---|
| Skin | Head, hands, any exposed limbs | Tone picker |
| Top | Torso segments | Colour picker |
| Bottom | Leg segments | Colour picker |
| Shoes | Foot segments | Colour picker |

### CB3 — Hair / accessory swap

A small set of preset meshes (hair styles, hats) attached to `mixamorigHead` as a child `Object3D`. Swapping replaces the child; no bone binding needed since accessories move rigidly with the head.

### CB4 — Output to catalogue

The character creator serialises the current parameter set (proportion values + colours + hair preset index) as a `CharacterEntry` in `OPFSCatalogueStore`. At load time the procedural skeleton is reconstructed from the parameter set — no GLB baking required. The production system sees it as a standard `CharacterEntry`.

### Out of scope (v1)

- Facial expressions / lip sync (morph targets need authored blend shapes)
- Cloth simulation
- User-uploaded clothing meshes

---

## Verification checklist

- [ ] `yarn test` — all tests green
- [ ] `yarn check` — 0 errors, 0 warnings
- [ ] Manual: draw polygon → extrude → Export to Catalogue → switch to `/` → asset appears in Catalogue panel → add to production scene
- [ ] Manual: `yarn build` + production URL → `/sketch` redirects to `/`
