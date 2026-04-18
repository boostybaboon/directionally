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

The sketcher is a viable cheap-and-cheerful cartoon asset creator. The core loop works end-to-end: sketch a polygon → extrude → insert primitives → colour individual faces → apply textures to faces → glue parts into assemblies (structural group + live joint) → transform (group-level and member-edit) → undo/redo → autosave. Each wall face of an extruded part and each face of a primitive has its own draw group and material slot enabling per-face colouring and texturing. 473 tests passing.

**Completed phases:** S0, S1, S2, S3, S4, SA1, SA2, SA3, SA4 (Ctrl+D; linear array deferred), SA5, SA13, SH2, SH1a, SA7, SA8, SH1b, SA11, SA14a, SA14b, SA15, SA9.

**Priority order:**
1. SA12 — Positioning precision *(absorbs SA10; benefits from stable group model)*

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

## Phase SA12 — Positioning precision

*(Absorbs the former SA10 uniform-scale toggle, which is a sub-item here.)*

Currently all positioning is by mouse drag — hard to place table legs at exact coordinates before gluing. This phase adds numeric input everywhere a measurement matters. It benefits from SA13 (all edits undoable) and from SA15's stable group model.

### Sub-items and implementation plan

**SA12a — Transform inspector (position / rotation / scale fields)**

The existing `PropertiesPanel.svelte` shows colour and material info. Extend it with a numeric transform section, shown whenever a part or group is selected.

- **Data flow:** on every `selection-changed` and after every TC drag-end, read the selected object's world matrix and display `position.x/y/z` (3 dp), `rotation` in degrees (1 dp), and `scale.x/y/z` (3 dp) as `<input type="number">` fields
- **Write-back:** blur or Enter on any field constructs a `TransformPartCommand` with mode `'group'` or `'member'` as appropriate, and calls `doc.execute(cmd)`. No TC drag emitted — transform applied directly to `position`/`quaternion`/`scale` then world matrix forced via `updateMatrixWorld(false, true)`
- **Euler order:** YXZ (Three.js default). Display in degrees; store via `THREE.MathUtils.degToRad`
- **Uniform scale toggle:** lock icon beside the scale row. When locked, editing any axis scales all three. `TransformPartCommand` gains an optional `uniform?: boolean` flag; applies `object.scale.setScalar(v)` when true
- **Files:** `PropertiesPanel.svelte` (new transform section), `sketcherCommands.ts` (`TransformPartCommand` extended), `+page.svelte` (selection → panel refresh, TC drag-end → panel refresh)

**SA12b — Grid snap size field**

- `<input type="number" min="0.01" step="0.01">` in the sketch toolbar, default `0.1`
- `PolygonSketcher.snapSize` is already a settable property; this only exposes it in the UI
- Persisted in `localStorage` as a workspace preference (not per draft)

**SA12c — Extrusion depth field**

- Live `<input type="number">` in the toolbar during the extrusion phase (alongside / replacing the depth HUD overlay)
- `isExtruding` and `extrusionDepth` state already exist in `+page.svelte`; bind the field to `extrusionDepth` and add `ExtrusionHandle.setDepth(d)` to apply programmatically

**SA12d — Glue midpoint mode**

- **⊕ Centre snap** toggle button in the toolbar, shown during glue source-pick phase
- When active, the glue source point is forced to the face-centre regardless of where the user clicks (equivalent to UV `(0.5, 0.5)` in each face group's local frame)
- Face centre computable from `faceGroups` normals: mesh centroid + `normal × halfExtent`
- Free-mouse glue remains the default; midpoint mode is opt-in

### Sequencing

SA12a is highest-value — enables "place a table leg at `x = 1.5`". SA12b and SA12c are small and can go in the same PR. SA12d follows SA12a.

*Glue point editor (UV position + twist angle `alpha` on a selected joint) deferred as SA12e — low priority until users hit the need.*

---

## Phase SA6 — Sketch shape presets

Extend the polygon sketcher with rectangle and circle input modes alongside the existing free-polygon.

- **Rectangle:** click + drag diagonal → 4-point closed shape → extrude pipeline unchanged
- **Circle:** click centre + drag radius → closed N-gon approximation (default 32 segments; segment count editable in toolbar)
- Toolbar mode switcher: **Polygon** | **Rectangle** | **Circle**

**Files:** `PolygonSketcher.ts` extended; `types.ts` adds `SketchMode` union.

---

## Phase SA16 — Torus primitive and partial angle sweeps

**Torus** is `THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments, arc)` — a single-line addition to the insert bar. **Partial angle sweeps** expose the existing `arc` (torus), `thetaLength` (sphere), and `phiLength`/`thetaLength` (cylinder, cone) constructor parameters that Three.js already accepts; no geometry work is required to produce the shape.

**Open-shell trade-off:** Partial geometry leaves cut edges open — Three.js does not auto-cap partial sweeps. For cartoon work viewed at a distance the gap is usually invisible, but close inspection shows the hollow interior. These are deferred as **SA16b** so the torus and visible angle control ship first without holding the phase.

*SA16b cap geometry notes:*
- **Hemisphere (partial theta):** open edge is the equator ring at `y = 0`; cap is a flat disc — fan from `(0, 0, 0)` to consecutive equator ring vertices. Straightforward.
- **Sphere phi wedge (partial phi, e.g. 90° pie slice):** each open edge runs pole-to-pole along the sphere surface — a curved arc in 3D. Each cap is a half-disk. The straight edge of that half-disk is the Y-axis chord from north to south pole; the curved edge is the sphere-surface arc. Triangulated as a fan from the sphere origin `(0, 0, 0)`, which is the midpoint of the straight edge. One extra vertex (the origin) is all that is needed.
- **Torus partial arc:** each open face is a tube cross-section ring; each cap is a flat disc fanned from that ring's centre point. Equivalent to the hemisphere disc case.
- **Cylinder/cone partial phi:** open edges are straight lines (height of the cylinder); cap is a planar, straight-sided sector — two triangles.

**UI dependency:** A torus insert button and its `arc` field can ship immediately. Angle parameters for *existing* primitives need an inspector field, which is only ergonomic after SA12's properties panel lands. Angle editing on sphere/cylinder/cone should therefore be gated behind SA12 rather than added as raw toolbar controls now.

**Scope:**
- Torus insert button; `arc` editable via properties panel (SA12 dependency)
- `GeometryConfig` union extended with `{ kind: 'Torus', radius, tube, arc, radialSegments, tubularSegments }`
- Existing primitive configs extended with their angle fields (`phiLength`, `thetaLength`) as optional; defaults preserve current behaviour
- SA16b (cap generation) deferred

---

## Phase SA17 — Shape holes (extrude with holes)

Three.js `THREE.Shape` natively supports holes via `shape.holes: THREE.Path[]`. `ExtrudeGeometry` respects them using the standard SVG fill winding rule — you push a counter-clockwise inner path onto `shape.holes` and the extrusion produces a clean hollow cross-section (D-shapes, rings, frames, letter outlines). **No custom geometry kernel work is required.**

**UI work is the substance of this phase:**
- After the outer polygon is closed, an **Add hole** button appears in the sketch HUD; activating it restarts the vertex-click flow for an inner path
- The inner path flows through the same close-near-first-point mechanic as the outer shape
- Closing the inner path adds it to `shape.holes`; the extrude preview updates immediately
- A bounding-box pre-check guards against holes that obviously extend outside the outer shape (full topological validation is out of scope)
- Multiple holes are supported by the API but limited to one per shape initially; multiple holes can extend the phase

**Serialisation:** `PolygonPartDraft` gains `holes?: { x: number; y: number }[][]` — array of hole paths, each an array of 2D points. Drafts without the field are valid (no holes).

---

## Phase SA18 — Lathe / revolve geometry

`THREE.LatheGeometry(points, segments, phiStart, phiLength)` creates a surface of revolution by spinning a 2D profile curve around the Y axis. The `phiStart`/`phiLength` parameters support partial sweeps. The cartoon use cases are obvious: vases, bottles, goblets, chess pieces, barrels, cartoon wheels — shapes that are hard to approximate convincingly from extruded polygons.

**Proposed integration:** reuse the polygon vertex-click flow but offer **Revolve** as a second operation alongside **Extrude** once the profile is closed. The profile is drawn in a *front* (XY plane) view rather than the current floor (XZ plane) view, which requires a drawing-plane toggle for the sketch session (top → front). The camera would reposition to an orthographic-style front view while drawing.

**Partial-angle caps:** a `phiLength < 2π` leaves two flat radial faces open. Each cap is a fan of triangles from the axis through the profile points at `phiStart` and `phiStart + phiLength` — straightforward to generate as a `BufferGeometry` merged with the lathe mesh before the result is treated as a single part. This is simpler than sphere/torus caps (SA16b) because the cross-section is always a planar polygon matching the profile silhouette.

**Risks and constraints:**
- The front-view drawing mode is the largest UX change here — camera positioning, grid orientation, and the raycasting draw plane all need to switch. This is significantly more complex than SA17.
- Profile points should have `x >= 0` for a full revolution (negative x produces inside-out geometry); a visual indicator or clamp is needed.
- Simpler alternative if the view-flip proves painful: keep the floor drawing plane and revolve around the Z axis instead of Y. Breaks the intuitive "profile = vertical cross-section" mental model but avoids the camera work entirely. Decide at implementation time.

**Serialisation:** new `LathedPartDraft` type: `{ kind: 'Lathed', points: { x: number; y: number }[], phiStart: number, phiLength: number, segments: number }`.

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
