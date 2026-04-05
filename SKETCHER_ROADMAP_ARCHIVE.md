# Directionally — Cartoon Sketcher Completed Phases

All phases below are ✅ complete. Active work lives in [SKETCHER_ROADMAP.md](SKETCHER_ROADMAP.md).

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
