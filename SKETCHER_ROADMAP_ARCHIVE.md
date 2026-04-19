# Directionally — Cartoon Sketcher Completed Phases

All phases below are ✅ complete. Active work lives in [SKETCHER_ROADMAP.md](SKETCHER_ROADMAP.md).

---

## Phase SA18 — Lathe / revolve geometry (floor-plane) ⚠ SUPERSEDED by SA18a

Initial implementation explored a floor-plane (XZ) profile approach. Code was merged and tests pass (490), but the UX is fundamentally broken: `PolygonSketcher._closeShape` subtracts the polygon centroid from every point, so after centering the left half of any profile ends up at `x<0` and is silently clamped. The revolution axis lands at the centroid of whatever the user drew — impossible to predict or control. Superseded by SA18a (dedicated XY-plane revolve mode with no centroid offset). Code artefacts below are partially reused by SA18a.

**Changes delivered (partially reused by SA18a):**
- `SketcherPart.lathePoints: [number, number][] | null` — reused
- `PartDraft.kind` extended to `'primitive' | 'sketch' | 'lathed'`; `PartDraft.lathePoints?` added — reused
- `buildLatheGeometry(profilePoints)` helper: clamps x≥0, deduplicates — reused
- `CartoonSketcher.confirmLathe(uprighted)` public method — reworked by SA18a to source from 'pending-revolve' phase
- `toDraft`/`loadDraft` handle `kind='lathed'` — reused unchanged
- `duplicatePart` copies `lathePoints` — reused unchanged
- `/sketch` route: `revolveUprighted` state, `revolveShape()` function, Revolve + Upright in hole HUD — reworked by SA18a

**Tests:** 490 passing (8 SA18 tests; updated by SA18a)

---

`THREE.Shape.holes` + `ExtrudeGeometry` produce a clean hollow cross-section with no custom geometry kernel work.

**Changes delivered:**
- Two-step extrusion flow: outer polygon closes → `'pending-holes'` phase (shape stored in `pendingShape`) → user optionally presses **Add hole** one or more times → closes inner polygon → `confirmShape()` → `'extruding'` phase
- `CartoonSketcher` gains new phases `'pending-holes'` and `'hole-drawing'`; reuses the existing `polygonSketcher` field for hole drawing
- New public API: `addHole()`, `confirmShape()`, `cancelHole()`, `cancelPendingShape()`; getter `pendingHoleCount`; callback `onShapeReadyForHoles`
- Hole coordinate translation: hole-centroid-relative points mapped to outer-centroid-relative space via `dx = hcx - cx, dy = cz - hcz`
- AABB pre-check silently discards holes whose bounding box extends outside the outer shape bbox
- `SketcherPart.holes: [number, number][][] | null` and `PartDraft.holes?: [number, number][][]` added; `toDraft`/`loadDraft` round-trip fully preserves holes
- `/sketch` route: `isHolePending` state, **Add hole** / **Confirm shape** HUD buttons, Escape exits hole-drawing or cancels pending shape

**Tests:** 482 passing (9 new SA17 tests)

---

## Phase SA6 — Sketch shape presets ✅ COMPLETE

Extends the polygon sketcher with **Rectangle** and **Circle** drawing modes alongside the existing free-polygon mode.

- `SketchMode = 'polygon' | 'rectangle' | 'circle'` type added to `types.ts`.
- `PolygonSketcher` gains public `mode: SketchMode` and `circleSegments: number` fields (both survive `reset()`).
- **Rectangle:** two-click flow — first click anchors one corner, mouse preview shows a closed 4-point outline, second click closes the shape and hands it to the extrusion pipeline unchanged.
- **Circle:** two-click flow — first click sets the centre, mouse preview shows a closed N-gon, second click bakes the N-gon via `_buildCirclePoints(centre, radius)` and closes the shape.
- `startNewSketch(mode, circleSegments)` on `CartoonSketcher` forwards both params to the polygon sketcher.
- Toolbar shows a `<select>` (Poly / Rect / Circle) and a segment-count `<input>` (circle mode only), both gated to disabled while a sketch or extrusion is in progress.

**Files:** `src/core/sketcher/types.ts`, `src/core/sketcher/PolygonSketcher.ts`, `src/core/sketcher/CartoonSketcher.ts`, `src/routes/sketch/+page.svelte`.

---

## Phase SA16 — Torus primitive ✅ COMPLETE

Adds a **Torus** insert button to the primitives bar. `THREE.TorusGeometry(0.5, 0.2, 12, 24)` produces a ring with a single `'Surface'` face group (the existing `withFaceGroups` helper auto-adds the draw group).  Draft serialisation and `loadDraft` round-trip correctly via the existing `PRESET_BY_NAME` lookup.

Partial-angle sweep controls and cap geometry (SA16b) remain deferred — no geometry re-parametrisation infrastructure exists yet.

**Files:** `src/core/sketcher/CartoonSketcher.ts`, `src/routes/sketch/+page.svelte`.

---

## Phase SA11 — Snap to floor ✅ COMPLETE

One-click "⬇ Floor" button in the primitives bar snaps the selected part (or its entire glue group) to `y = 0`.

- `CartoonSketcher.snapToFloor(id)`: resolves the root object (`assemblyGroup.group` if glued, else `part.mesh`), computes world AABB with `Box3.setFromObject(root)`, then applies `root.position.y -= box.min.y`.
- `SnapToFloorCommand`: snapshot-based undo/redo via `SketcherDocument.execute()`.
- Button rendered only when a part is selected; placed alongside the Unglue button.

---

## Phase S0 — Rename Design → Edit ✅ COMPLETE

Renamed the existing production-canvas toggle from "Design" to "Edit" throughout the UI and codebase to free up "Design" as the label for the sketcher surface.

- `designMode` boolean in `src/routes/+page.svelte` → `editMode`
- UI button and tab labels "Design" → "Edit"

**Files:** `src/routes/+page.svelte`, `src/lib/Presenter.svelte`, `src/lib/TransportBar.svelte`

---

## Phase S1 — Sketcher kernel ✅ COMPLETE

Pure TypeScript sketcher core in `src/core/sketcher/`.

- **`PolygonSketcher.ts`** — raycasts mouse onto `THREE.Plane`, 0.1 grid snap, rubber-band preview line, `onShapeClosed` callback
- **`ExtrusionHandle.ts`** — draggable handle at shape centroid, live `ExtrudeGeometry` rebuild during drag, `onExtrusionComplete` callback
- **`CartoonSketcher.ts`** — wires the polygon → extrusion pipeline, stores `SketcherPart[]`, API: `startNewSketch()`, `clearSession()`, `getSession()`
- **`exportGLB.ts`** — `THREE.GLTFExporter` → `Blob`, adds `extras.directionally` attribution metadata

---

## Phase S2 — `/sketch` SvelteKit route ✅ COMPLETE

- `src/routes/sketch/+page.ts` — `export const ssr = false`
- `src/routes/sketch/+page.svelte` — canvas + `CartoonSketcher` in `onMount`, OrbitControls, toolbar, status feedback
- Route guard: redirect to `/` when `!import.meta.env.DEV`

---

## Phase S3 — Dev-only nav link ✅ COMPLETE

**Design** link to `/sketch` in the app header, guarded by `import.meta.env.DEV`.

---

## Phase SA1 — Selection + TransformControls ✅ COMPLETE

Click to select a part; TransformControls gizmo to translate/rotate/scale. W/E/R keyboard shortcuts. Delete removes part. Cyan edge outline auto-follows the gizmo.

---

## Phase SA2 — Primitive palette ✅ COMPLETE

Insert preset shapes from the toolbar without sketching.

**Shapes:** Box, Sphere, Cylinder, Capsule, Cone — each inserts at world origin and auto-selects.

| Primitive | Geometry |
|---|---|
| Box | `BoxGeometry(1, 1, 1)` |
| Sphere | `SphereGeometry(0.75, 16, 12)` |
| Cylinder | `CylinderGeometry(0.3, 0.3, 2, 16)` |
| Capsule | `CapsuleGeometry(0.3, 1, 4, 8)` |
| Cone | `ConeGeometry(0.5, 2, 16)` |

All geometry type-metadata (face normals, labels) is baked into `geometry.userData.faceGroups` at construction. No runtime branching on geometry class name anywhere outside `CartoonSketcher.PRIMITIVE_PRESETS`.

---

## Phase SA3 — Per-part colour ✅ COMPLETE

Select a part → colour picker in a floating HUD → updates `mesh.material.color`. 8 cartoon palette presets + hex field. Colour persisted in `SketcherPart.color`.

---

## Phase SA4 — Duplicate ✅ COMPLETE (linear array deferred)

**Ctrl+D** duplicates selected part — clones geometry + material, offsets +1 on X, auto-selects clone. Linear array (N copies along an axis) deferred.

---

## Phase SA5 — Glue / snap attachment ✅ COMPLETE

Records face-contact joints as a geometric recipe. Committed joints form persistent `THREE.Group` scene-graph nodes containing all connected parts. Re-evaluates on drag-end without a live solver.

### Implementation as built

**`GlueJoint`** stores `localPointA/B` and `localNormalA/B` (face normals in local space). `_applyJointPosition` rotates partB so its face normal becomes anti-parallel to partA's (via `setFromUnitVectors`), then translates to snap contact points. Neither side is privileged.

**`AssemblyGroup`** — persistent `THREE.Group` owned by `GlueManager`. Created on first joint; grows as parts are added; splits or dissolves (BFS connected-components) when joints are removed via `unglue()` / `unglueAll()`.

**`evictFromGroup(partId, allParts)`** — cleans up residual group membership on part deletion without removing joints; dissolves the group if it shrinks to ≤1 member.

Scene graph when in use:
```
scene
├── partC   (SketcherPart, top-level)
└── Group_1
    ├── partA (SketcherPart)
    └── partB (SketcherPart)
```

**Multi-part deletion edge cases verified by tests:**
- 5-cube chain, remove middle → two distinct groups for the two remaining segments
- 3-cube chain, remove middle → both remaining cubes return to scene root (no single-member groups)

### Design decisions

- Joint model is symmetric — no parent/child; recipe re-evaluates whichever side moved
- Persistent explicit groups — the scene-graph group is the connected component; no temporary construction
- Recipe replay on drag-end — `TransformControls` `dragging-changed` triggers `replayJoints`; no solver
- Explicit unglue only — joints never silently broken by dragging
- Face group conventions encoded as `geometry.userData.faceGroups: FaceGroupInfo[]` — no geometry class name branching

### GLB export note

Joints encoded in root `extras.directionally.joints`. Group membership reconstructable from joint graph on load.

---

## Phase SA13 — Undo / redo ✅ COMPLETE

**Approach:** Snapshot-based. Each history entry stores `{ before: SessionSnapshot, after: SessionSnapshot, label }`. `SketcherDocument.undo()` and `redo()` call `sketcher.restoreSnapshot()` — no inverse command logic.

**Why snapshot over forward/inverse:** An initial forward/inverse implementation had two regressions: (1) `TransformPartCommand` held a stale `THREE.Group` reference after glue-undo dissolved the group — redo moved the gizmo but not the mesh. (2) `scene.attach()` during group BFS-split accumulated incorrect intermediate world transforms — part B vanished on undo of `CommitGlue(A-B)`. Snapshot restores world-space transforms directly, bypassing both failure modes.

**`SessionSnapshot`** stores:
- `parts: PartSnapshot[]` — world-space `position`, `quaternion`, `scale` per part id (world-space so group-parented meshes restore correctly)
- `joints: JointSnapshot[]` — `localPointA/B`, `localNormalA/B`, `partA/B` ids (local-space vectors, unchanged by group transforms)

**`CartoonSketcher`** additions:
- `allParts: Map<string, SketcherPart>` — mesh pool; geometry is never disposed on remove, allowing safe restore
- `takeSnapshot()` — `matrixWorld.decompose()` for each part
- `restoreSnapshot()` — sets `mesh.position/quaternion/scale` directly, rebuilds groups via `GlueManager.registerJoint()`

**`GlueManager.registerJoint()`** — records a joint and merges into a group without repositioning (used only on restore, where world transforms are already correct).

**Key files:** `SketcherCommand.ts` (forward-only interface), `SketcherDocument.ts` (`{ before, after }` stack; `captureSnapshot()`; `clearStack()`), `sketcherCommands.ts` (all `undo()` removed), `CartoonSketcher.ts`, `GlueManager.ts`, `src/routes/sketch/+page.svelte` (Ctrl+Z/Y/Shift+Z; pre-drag `tcPreDragSnapshot` pattern).

**Test coverage:** 37 integration tests in `SketcherDocument.test.ts`, including B-vanishes and redo-stops regression scenarios. 415 tests total passing.

---

## Phase SH2 — Session autosave ✅ COMPLETE

Solves the most immediate pain point: losing work on page refresh.

**`SketcherDraft`** (serialization format, version 2):
```ts
type PartDraft = {
  id, kind, name, shapePoints?, depth?, position, quaternion, scale, color, faceColors?
};
type SketcherDraft = { version: 2; parts: PartDraft[]; joints: JointSnapshot[]; assemblyGroups: AssemblyGroupSnapshot[] };
```
Fully JSON-serializable. `JointSnapshot` is plain data (already defined alongside `SessionSnapshot`).

**`CartoonSketcher` additions:**
- `toDraft()` — iterates `this.parts`, decomposes world matrix, emits `PartDraft[]`; copies joints from `glue.getJoints()`
- `loadDraft(draft)` — calls `clearSession()`, reconstructs each part (primitives via preset geometry; sketch parts via `buildExtrusionGeometry`), then re-registers joints

**`+page.svelte`:** `onChange` debounce 500 ms → `localStorage.setItem('sketcher-draft', ...)` on every mutation; `onMount` restores draft if present; "New assembly" button clears `localStorage`.

**Tests:** `toDraft` / `loadDraft` round-trips for primitive position+color, sketch parts, multiple primitives, glue joints, and id-collision prevention.

---

## Phase SH1a — Poly sketcher data-integrity fixes ✅ COMPLETE

- **Duplicate mesh during drag** — fixed: `onPointerMove` removes the previous mesh from the scene before adding the rebuilt one. Root cause: `onDrag` disposes and replaces `handle.mesh` but the old scene node was never removed.
- **Solid placement** — no bug found; `_buildMesh` bakes centroid into geometry vertices; preview and committed mesh share the same code path.
- **Face labels** — fixed: `ExtrusionHandle` now computes per-edge outward normals from `shape.getPoints()` and emits `{ label: 'side-N', normal }` for each edge plus `top`/`bottom`. Old `Side`, `Top`, `Bottom` labels removed.

---

## Phase SA7 — Per-edge draw groups ✅ COMPLETE

**Goal:** Give each wall face of an extruded sketch its own draw group so individual faces can be coloured independently.

**Key architectural decision:** Remove bevel (`bevelEnabled: false`). Without bevel, `steps=1` → each edge wall = exactly 2 triangles = 6 consecutive index-buffer entries, making per-edge group splitting trivial.

**Three.js `ExtrudeGeometry` group layout** (no bevel, steps=1):
- Group 0 — combined caps (bottom+top), count = 2*(N−2)*3
- Group 1 — all N wall faces, count = N*6

We clear these and rebuild: wall edge i → `materialIndex` i (group of 6 indices), caps → `materialIndex` N.

**`buildExtrusionGeometry(shape, depth)`** — exported from `ExtrusionHandle.ts`. Handles the rotate/translate, group splitting, `faceGroups` userData, and returns a geometry with N+1 draw groups. `ExtrusionHandle._buildMesh` uses it and creates a `MeshStandardMaterial[]` of matching length.

**Data model changes:**
- `FaceGroupInfo` — added `materialIndex: number`
- `SketcherPart` — added `faceColors: number[]`
- `PartSnapshot` — added `faceColors: number[]`
- `PartDraft` — added optional `faceColors?` (backward-compatible)

**`CartoonSketcher` changes:**
- `PRIMITIVE_PRESETS` — every `faceGroups` entry has `materialIndex` matching its Three.js draw group (Box 0–5, Cylinder barrel/top cap/bottom cap = 0/1/2, Cone barrel/bottom = 0/2, Sphere/Capsule surface = 0)
- `buildMaterials(geo, color)` helper — creates one `MeshStandardMaterial` per draw group (covering max `materialIndex` + 1)
- `setFaceColor(id, materialIndex, color)` — new method; updates `faceColors[materialIndex]` and the material array entry
- `setPartColor(id, color)` — now fills all `faceColors` entries and all material array entries uniformly
- `snapshot`/`draft` round-trips, `duplicatePart`, and `_commitPart` all carry `faceColors` through

**Cone note:** `ConeGeometry` skips the top-cap group but still assigns `materialIndex=2` to the bottom cap, so the material array must cover indices 0–2 even though index 1 is unused.

**Tests:** 426 total passing. Updated `setPartColor` test to assert all material array entries change; updated `faceGroups` label test to expect `caps` instead of `top`/`bottom`; added `faceColors` field to manually constructed `SketcherPart` fixtures in `CartoonSketcher.test.ts` and `GlueManager.test.ts`.

---

## Phase SH1b — Poly sketcher UX + polish ✅ COMPLETE

**Orbit:** `CartoonSketcher.startNewSketch()` already called `orbit.enabled = false`; the `onMouseMove` handler re-enables only when Alt is held — no new code needed.

**Closure vertex highlight:** `PolygonSketcher` gained a `closureMarker: THREE.Mesh` (small cyan sphere) placed on the first committed vertex. A `closureHot: boolean` property is set whenever the cursor is within `GRID_SNAP * 2` world units of the first vertex with ≥3 points placed. The marker turns yellow (`#ffdd00`) when `closureHot` to signal that the next click will close rather than extend. `CartoonSketcher` adds/removes the marker from the scene alongside `line` and `rubberBand`.

**Arrow extrude handle + depth HUD:** The sphere handle was replaced with a double-headed arrow: yellow `CylinderGeometry` shaft with two `ConeGeometry` heads (one flipped 180°) as child meshes. `CartoonSketcher.onPointerDown` raycasts with `recursive: true` so clicks on the cone children register correctly. `ExtrusionHandle` gained an `onDepthChanged?: (depth: number) => void` callback (fired on every throttled rebuild) and a `get currentDepth(): number` accessor. `CartoonSketcher` exposes `onExtrusionDepthChanged` and `onExtrusionStarted` public callbacks. In `+page.svelte`, `isExtruding: $state(bool)` and `extrusionDepth: $state(number)` drive a yellow `Depth: X.XX` HUD overlay in the top-right corner of the canvas during the extrusion phase.

---

## Phase SA8 — Textures ✅ COMPLETE

**Goal:** Drag-and-drop an image file onto a selected face → assigns via `THREE.TextureLoader` on that material group. Single texture per material group. Undo/redo supported. Textures round-trip through autosave (localStorage) as data URLs.

**Key design decision:** Store textures as **data URLs** (`FileReader.readAsDataURL`) rather than blob URLs (`URL.createObjectURL`). Data URLs are self-contained strings that survive localStorage serialisation automatically without requiring OPFS or URL revocation lifecycle management. OPFS texture storage (alongside GLB export) is deferred to SA9.

**GLB export:** `GLTFExporter` embeds `material.map` textures automatically — no changes needed in `exportGLB.ts`.

**Data model changes:**
- `SketcherPart` — added `faceTextures: (string | null)[]`
- `PartSnapshot` — added `faceTextures: (string | null)[]`
- `PartDraft` — added optional `faceTextures?: (string | null)[]` (backward-compatible)

**`CartoonSketcher` changes:**
- `setFaceTexture(id, materialIndex, dataUrl)` — new method; disposes old `mat.map`, assigns new `THREE.TextureLoader().load(dataUrl)` (or null to clear), sets `mat.needsUpdate = true`
- `insertPrimitive` / `_commitPart` — initialise `faceTextures` to `null` for every material slot
- `clearSession` — disposes `mat.map` before `mat.dispose()` to avoid GPU leaks
- `duplicatePart` — creates fresh `THREE.Texture` objects from stored data URLs (avoids shared texture references after `m.clone()`)
- `takeSnapshot` / `restoreSnapshot` — carry `faceTextures` through; `restoreSnapshot` disposes old `mat.map` before reinstating
- `toDraft` / `loadDraft` — carry `faceTextures` through; `loadDraft` reconstructs textures from data URLs

**`sketcherCommands.ts`:** Added `ApplyTextureCommand` — snapshot-based undo/redo, calls `sketcher.setFaceTexture()`.

**`+page.svelte` drag-and-drop:**
- `dragTargetPartId` / `dragTargetMaterialIndex` state for hover tracking
- `faceBelowPointer(ndcX, ndcY)` — raycasts against all part meshes, returns `{ partId, materialIndex }` or null
- `onDragOver` — validates image file from `dataTransfer.items`, updates drag target state, shows teal canvas outline
- `onDragLeave` — resets drag state
- `onDrop` — reads file as data URL via `FileReader`, executes `ApplyTextureCommand`
- CSS: `.sketch-canvas.drag-target { outline: 2px solid #44ccaa; outline-offset: -2px; }`
- Also fixed `unglueSelected()` null guard (`if (!selectedPartId) return`) — pre-existing type error now caught by svelte-check.

**Tests:** 438 total passing (9 new tests: 5 `CartoonSketcher` unit tests for `setFaceTexture`, 1 `toDraft/loadDraft` texture round-trip, 3 `ApplyTextureCommand` undo/redo tests in `SketcherDocument`). Added `beforeAll` mock for `THREE.TextureLoader.prototype.load` in both test files (returns bare `THREE.Texture` without DOM).

---

## Phase SA12 — Positioning precision ✅ COMPLETE

Numeric input everywhere a measurement matters. Absorbed the former SA10 uniform-scale toggle.

**SA12a — Transform inspector (position / rotation / scale fields)**
- World-space position (3 dp), rotation in degrees YXZ order (1 dp), and scale (3 dp) shown as `<input type="number">` fields in a left-side HUD panel (`transform-inspector`) whenever a part or group is selected.
- Data flow: refreshed on selection change, after every TC drag-end, and after undo/redo. Gated on `inspectorFocused` plain boolean so active typing is never interrupted by a reactive refresh.
- Write-back: blur or Enter commits via the existing `TransformPartCommand` pattern — `applyWorldTransform()` applies the desired world matrix (converted to local space for group members via `parentMatrixWorldInverse × desiredMatrix`), then `sketcherDoc.execute(new TransformPartCommand(...), beforeSnapshot)`. Fully undoable.
- Uniform scale lock button: when active, editing any scale axis mirrors the ratio to the other two axes.
- Inspector hidden during drawing and extrusion phases.

**SA12b — Grid snap size field**
- `PolygonSketcher.snapSize` promoted from a module-level `const GRID_SNAP = 0.1` to an instance property `snapSize = DEFAULT_GRID_SNAP`.
- `CartoonSketcher.gridSnapSize` setter propagates the value to the current and all future `PolygonSketcher` instances.
- Number input appears in the primitives bar while drawing; persisted in `localStorage` as `sketcher-grid-snap`.

**SA12c — Extrusion depth numeric input**
- Read-only depth HUD replaced with an editable `<input type="number">` during the extrusion phase.
- `ExtrusionHandle.setDepth(d)` added: rebuilds the mesh programmatically (like `onDrag` without the drag-active gate or throttle), fires `onDepthChanged`, returns the new mesh for scene swap.
- `CartoonSketcher.setExtrusionDepth(d)` wraps the handle call with scene `remove`/`add`.

**SA12d — Glue midpoint mode**
- "⊕ Centre" toggle button in the primitives bar shown during the glue source-pick phase.
- When active, `commitSrcFacePick()` snaps the glue anchor to the face-group centroid (`computeGroupCentreLocal()` — vertex-average over the draw group's index range) instead of the exact cursor-hit point.
- `glueMidpointMode` reset to `false` when glue pick is cancelled.

**Files changed:** `PolygonSketcher.ts`, `ExtrusionHandle.ts`, `CartoonSketcher.ts`, `src/routes/sketch/+page.svelte`

**Tests:** 473 passing (no behavioural regressions; SA12 logic is UI-layer only and untested at unit level).

---

## Phase SA15 — Glue as structural group with live constraint ✅ COMPLETE

Glue creates a `THREE.Group` (same as weld) containing all parts in the connected component, plus records a `GlueJoint` as a geometric recipe for member-edit re-snap. This is "Option A": the group gives the TC gizmo something to grab and respects floor-snap, while the joint enables joint-aware BFS re-snap during member-edit mode.

**Earlier experiment:** SA15 was first implemented as a "live constraint only" model (no group). Three bugs surfaced in testing: (1) TC had no group to attach to, so glued pairs couldn't be moved as a unit; (2) `snapToFloor` found no group root, so it only snapped the single clicked part; (3) during two-click glue pick, the source mesh occluded the second raycast. All three are fixed by restoring the explicit group.

**Changes delivered:**

*`GlueManager.ts`*
- `commitGlue(partA, lpA, lnA, partB, lpB, lnB, allParts)` — snaps partB to partA, dissolves both sides' existing groups, calls `_createGroup(mergedIds)`, records the `GlueJoint`
- `resolveConstraints(movedPartIds, allParts)` — democratic BFS: every `movedPartId` is pre-seeded into the visited set; BFS propagates outward, treating the moved part as the anchor for each directly-connected unvisited neighbour; group-level drag pre-seeds *all* group member IDs so intra-group joints are skipped
- `_applyJointPosition(edited, editedPoint, editedNormal, other, otherPoint, otherNormal)` — symmetric; target = `other.mesh` if same group, else group root; rotation via quaternion conjugation (`parentQ⁻¹ · rotQ · parentQ`); translation via `worldToLocal` for grouped targets — fixes the BUG-1 matrix-inversion failure for non-uniform-scale parents
- `unglue(jointId, allParts)` / `unglueAll(partId, allParts)` — remove joints then call `_rebuildGroupsForParts` (BFS-based group reconstruction for remaining connected components)
- `rebuildGroupsFromSnapshot(groups, allParts)` — public method for snapshot restore; `isWeld !== false` → `createWeldGroup`; else → `_createGroup` (no joint re-derivation needed on undo/redo)
- `_rebuildGroupsForParts(partIds, allParts)` — dissolves all groups containing affected parts, BFS over remaining joints, creates new groups for each component of size ≥ 2, returns singletons to scene root
- `registerJoint` unchanged (no group creation; used only by snapshot restore)

*`types.ts`* — `WeldGroupSnapshot` gains `isWeld?: boolean`; absent = weld (backward-compat)

*`CartoonSketcher.ts`*
- `snapToFloor(id, mode: 'group'|'member')` — `'group'` moves the group root; `'member'` moves the mesh and calls `resolveConstraints`
- `takeSnapshot()` / `toDraft()` — all assembly groups (weld + glue) captured with `isWeld` flag
- `restoreSnapshot()` / `loadDraft()` — calls `glue.rebuildGroupsFromSnapshot()` to recreate groups without BFS re-derivation

*`sketcherCommands.ts`*
- `CommitGlueCommand.execute()` — passes `sketcher.getSession().parts` as `allParts`
- `TransformPartCommand(sketcher, movedPartId, mode: 'group'|'member')` — `'group'` mode seeds all group member IDs into `resolveConstraints`; `'member'` seeds only the dragged part
- `SnapToFloorCommand(partId, sketcher, mode: 'group'|'member')` — mode forwarded to `snapToFloor`

*`+page.svelte`*
- `tcDragMode: 'group'|'member'` — set from `groupEditGroupId` at drag start
- `glueSrcGhostEntries` — ephemeral ghost state for the glue source mesh during two-click pick; source made semi-transparent to unblock second raycast (fixes bug 3); restored on commit or cancel
- `snapToFloor()` — passes mode from `groupEditGroupId`

**Tests:** 473 passing (GlueManager: 31 tests; SketcherDocument: updated SA15 semantics throughout)

---
