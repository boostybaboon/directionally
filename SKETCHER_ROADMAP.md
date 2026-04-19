# Directionally — Cartoon Sketcher Roadmap

Active work only. Completed phases live in [SKETCHER_ROADMAP_ARCHIVE.md](SKETCHER_ROADMAP_ARCHIVE.md).

---

## Background & decisions

**Goal:** A fast, fun cartoon-style 3D sketcher (think Spore creature creator, not FreeCAD) built on Three.js. User-created GLB assets flow directly into the production asset catalogue and are usable in productions.

**Key documents:**
- `docs/sketcher.md` — implementation design for the polygon sketcher + extrusion pipeline
- `docs/asset-authoring-decision.md` — geometry kernel decision (mesh-first wins; monorepo ruled out)

| Decision | Choice | Rationale |
|---|---|---|
| Package location | `src/core/sketcher/` inside existing app | Extractable later if needed; zero tooling cost now |
| Navigation | Separate SvelteKit route `/sketch` | Clean URL; dev-only guard until production-ready |
| Geometry kernel | `THREE.Shape` + `ExtrudeGeometry` | Cartoon aesthetic; trivial GLB export |
| Monorepo | Ruled out | Premature for a single-developer project |

---

## Current state — April 2026

The sketcher is a viable cheap-and-cheerful cartoon asset creator. The core loop works end-to-end: sketch a polygon → extrude → insert primitives → colour individual faces → apply textures to faces → glue parts into assemblies (structural group + live joint) → transform (group-level and member-edit) → numeric transform inspector → undo/redo → autosave. Each wall face of an extruded part and each face of a primitive has its own draw group and material slot enabling per-face colouring and texturing. 473 tests passing.

**Completed phases:** S0, S1, S2, S3, S4, SA1, SA2, SA3, SA4 (Ctrl+D; linear array deferred), SA5, SA13, SH2, SH1a, SA7, SA8, SH1b, SA11, SA14a, SA14b, SA15, SA9, SA12, SA6, SA16, SA17, SA18.

No phases with open obligations remain. The items below are enhancements.

---

## Phase SA14a — Multi-select and Weld/Unweld ✅ COMPLETE

Users frequently position several parts visually then want to treat them as one rigid unit for transport, scaling, and export. Weld achieves this without face-snap math — it captures current world transforms only.

**Multi-select**
- Shift-click adds a part (or weld group) to the selection; `SelectionManager` gains `selectedIds: Set<string>` alongside the existing primary `selectedId`
- All selected parts receive a highlight outline
- Clicking empty space or a single part clears the multi-selection

**Weld**
- Available when `selectedIds.size > 1`
- Creates a new `THREE.Group` positioned at the centroid of the selection
- Calls `group.attach(mesh)` for each selected part — Three.js decomposes `parentWorldInverse × meshMatrixWorld` into the correct local transform, preserving every part's current world position/rotation/scale
- Registers the result as a `WeldGroup` in `GlueManager` (same `AssemblyGroup` type; weld groups have no `GlueJoint` records)
- TC gizmo attaches to the group; clicking any member selects the whole group, not the individual mesh
- `WeldCommand` — snapshot-based undo/redo via `SketcherDocument.execute()`

**Unweld**
- Available when the selected entity is a weld group
- Detaches all children, calls `scene.attach(mesh)` to restore each mesh's world transform at scene root, removes the `THREE.Group`
- `UnweldCommand` — snapshot-based

**Constraint:** within a weld group the TC gizmo operates on the group only. To reposition a single member, use SA14b enter-group edit mode, or Unweld → reposition → Weld.

---

## Phase SA14b — Enter-group edit mode ✅ COMPLETE

After welding, users occasionally need to tweak one member's position without dissolving the whole group (e.g. nudge a capsule eye slightly forward). Double-clicking a weld group enters edit mode for that group.

**Behaviour**
- Double-click a weld group → enters edit mode; subsequent single-click selects individual members inside the group
- TC, colour, texture, and snap-to-floor operations all target the active member in edit mode
- The active member is highlighted; other group members are dimmed
- Clicking outside the group, pressing Escape, or clicking "Exit group" in the toolbar returns to group-level selection
- Edit mode is non-destructive — the weld group is not dissolved; the member's local transform within the group is updated in place
- All transforms issued in edit mode are individually undoable

**Why before unweld-as-last-resort:** most "I need to reposition an eye" operations don't need the group dissolved permanently. Enter-group → nudge → exit is faster and keeps the assembly intact.

---

## Phase SA15 — Glue as structural group with live constraint ✅ COMPLETE

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

## Phase SA9 — Named assemblies ✅ COMPLETE

The sketcher is now a multi-document editor backed by OPFS. Each assembly has a name, persists across sessions, and can be re-opened for continued editing and re-export.

**Changes delivered:**
- `SketcherDraft` extended with `weldGroups?: WeldGroupSnapshot[]` — drafts now fully round-trip weld group topology
- `CartoonSketcher.toDraft()` serialises weld groups; `loadDraft()` reconstructs them (mirrors `restoreSnapshot` pattern)
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

### CB0 — Base humanoid decision

Recommendation: **VRoid Studio** (free, browser-based) → `VRMC_vrm 1.0` spec + [`three-vrm`](https://github.com/pixiv/three-vrm) for loading. Target VRM 1.0 from day one; 0.x has a different bone hierarchy requiring a migration pass.

### CB1 — Bone proportion editor

Mii-style sliders calling `bone.scale.set()` on VRM bones. Non-destructive at runtime; bake to GLB on export.

### CB2 — Colour picker

Per-material colour swaps on the loaded VRM mesh (diffuse colour + optional toon texture tint).

---

## Verification checklist

- [ ] `yarn test` — all tests green
- [ ] `yarn check` — 0 errors, 0 warnings
- [ ] Manual: draw polygon → extrude → Export to Catalogue → switch to `/` → asset appears in Catalogue panel → add to production scene
- [ ] Manual: `yarn build` + production URL → `/sketch` redirects to `/`
