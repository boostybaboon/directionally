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

The sketcher is a viable cheap-and-cheerful cartoon asset creator. The core loop works end-to-end: sketch a polygon → extrude → insert primitives → colour individual faces → apply textures to faces → glue parts into assemblies → transform → undo/redo → autosave. Each wall face of an extruded part and each face of a primitive has its own draw group and material slot enabling per-face colouring and texturing. 452 tests passing.

**Completed phases:** S0, S1, S2, S3, SA1, SA2, SA3, SA4 (Ctrl+D; linear array deferred), SA5, SA13, SH2, SH1a, SA7, SA8, SH1b, SA11, SA14a.

**Priority order:**
1. SA14b — Enter-group edit mode *(double-click to reposition a single member without unwelding)*
2. SA15 — Glue as live constraint *(neck-resizes-moves-head; architectural upgrade to GlueManager)*
3. SA12 — Positioning precision *(absorbs SA10; benefits from stable group model)*
4. SA9 — Named assemblies *(schema is stable only after SA14/SA15 settle what "assembly" means)*

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

## Phase SA14b — Enter-group edit mode

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

## Phase SA15 — Glue as live constraint

Currently glue merges both parts into one `THREE.Group`. SA15 upgrades glue to a *live positional constraint* between two independent root-level entities (weld groups or standalone parts). This enables the neck-resizes-moves-head workflow:

```
head-weld-group  ←→ [GlueConstraint, embedded offset]  ←→  neck-cylinder
```

After a TC commit on the neck, `ConstraintSolver` walks the constraint tree and repositions every connected entity to satisfy the joint.

**Architecture**
- `GlueConstraint` record: `{ id, anchorEntityId, anchorFaceUV, moverEntityId, moverFaceUV, alpha }`
- `GlueManager` stores `GlueConstraint` records separately from `WeldGroup` records — the two are now distinct concepts
- After every TC commit, `ConstraintSolver.resolve(constraints, entities)` does a single-pass tree traversal (the constraint graph is acyclic by construction — gluing A→B and B→A is rejected)
- Glue UX is unchanged: pick face on anchor, pick face on mover, optionally set offset depth

**Migration from current merge-based glue**
- `AssemblyGroup` splits into `WeldGroup` (rigid, children merged) and `GlueConstraint` (live, entities remain separate)
- `_mergeIntoGroup` is replaced by constraint registration; `attach()` is no longer called during a glue operation
- Snapshot/restore continues to work — snapshots capture all entity transforms + all constraint records
- BUG-1 (scale bleed on glue-into-scaled-group) is resolved as a side-effect

---

## Phase SA12 — Positioning precision

*(Absorbs the former SA10 uniform-scale toggle, which is a sub-item here.)*

Currently all positioning is by mouse drag — hard to place table legs at exact coordinates before gluing. This is the largest feature in the active queue; it benefits from SA13 being in place so that all numeric edits are undoable.

**Transform precision**
- When an object is selected, show world-space position / rotation / scale as editable numeric fields in the properties panel. Tab between X/Y/Z; Enter to confirm. Each confirmed edit issues a `TransformPartCommand`.
- Uniform scale toggle: **Scale XYZ** | **Scale uniform** (locks TransformControls scale axis to `'XYZ'`). Sufficiently small that it belongs here rather than as a standalone phase.

**Sketch points**
- Expose grid snap size as an editable field (currently hardcoded at 0.1)
- Numeric coordinate entry: click a vertex or handle → XYZ input panel

**Extrusion depth**
- Numeric depth field in the extrude HUD overlay alongside the grab handle

**Glue precision**
- *Midpoint mode:* toggle that snaps the glue source pick to face-centre automatically, without requiring precise hover — equivalent to `(0.5, 0.5)` in face UV space
- Free-mouse glue stays available as the alternative
- *Glue point editor:* select a joint → inspector showing UV position on each face + twist angle (`alpha`); edits reposition the joint live.

---

## Phase SA6 — Sketch shape presets

Extend the polygon sketcher with rectangle and circle input modes alongside the existing free-polygon.

- **Rectangle:** click + drag diagonal → 4-point closed shape → extrude pipeline unchanged
- **Circle:** click centre + drag radius → closed N-gon approximation (default 32 segments; segment count editable in toolbar)
- Toolbar mode switcher: **Polygon** | **Rectangle** | **Circle**

**Files:** `PolygonSketcher.ts` extended; `types.ts` adds `SketchMode` union.

---

## Phase SA9 — Named assemblies

The Word-style open/save document model for the sketcher. SH2 already keeps a single autosaved draft alive across refreshes; SA9 adds named saves, a list of assemblies, and the ability to open any of them for continued editing.

**Why after SA15 and SA12:** SA9's `AssemblySpec` schema must represent both `WeldGroup` membership and `GlueConstraint` records — the split introduced by SA15. SA12's numeric-field commands also finalise the `SketcherSession` shape. Building the schema before both are settled means a migration pass.

**`AssemblySpec` JSON** — stored in OPFS:
```ts
type PartSpec = {
  id: string;
  kind: 'sketch' | 'primitive';
  name: string;                          // 'Box', 'Cylinder', 'Shape', etc.
  shapePoints?: [number, number][];      // for sketch parts
  depth?: number;
  position: [number, number, number];
  rotation: [number, number, number, number];  // quaternion
  scale: [number, number, number];
  color: number;
  uvMode: 'per-face' | 'wrapped';
};
type AssemblySpec = { parts: PartSpec[]; joints: GlueJoint[] };
```

**Store:** `SketcherAssemblyStore` in `src/core/storage/` — mirrors `ProductionStore` in shape (`list`, `get`, `save`, `create`, `delete`), but backed by OPFS (no size limit for future texture data) instead of `localStorage`.

**UI:**
- Toolbar: assembly name (editable inline) + **Save** button + **Open…** dropdown listing saved assemblies
- Autosave on every mutation (upgrades SH2's `localStorage` draft to the named OPFS document once open)
- **Export to Catalogue** remains a separate explicit action (produces the GLB for use in productions)

**Load path:** `AssemblySpec` → reconstruct Three.js scene using the same geometry-build functions as creation → immediately editable.

> **Note on full parametric history:** `AssemblySpec` achieves the practical need — re-open, adjust, re-export — without a modifier stack. Full history replay deferred indefinitely.

---

## Phase S4 — Promote to production *(manual gate)*

- Remove `import.meta.env.DEV` guard from `/sketch` route and nav link
- Prerequisite: `OPFSCatalogueStore` (Phase L6) or the Phase I1 server store in place

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

## Known bugs

### BUG-1 — Glue into scaled group produces misaligned contact points and scale bleed

**Reproduction:** (1) insert two parts and glue them; (2) scale the resulting assembly group using the TC gizmo; (3) insert a third standalone (unscaled) part; (4) start a glue operation — place the anchor blob on a face of a part *inside the scaled group*, then click a face of the unscaled standalone part as the mover.

**Observed:** The two picked surface points are not coincident after the snap, and the mover appears to inherit the group's scale (i.e. it shrinks or grows to match the scaled group's coordinate space rather than preserving its original world size).

**Root cause:** `_applyJointPosition` applies the rotation and translation to `target` (= the mover mesh, still at scene root) in world space, then `_mergeIntoGroup` calls `group.attach(moverMesh)` to re-parent it. `THREE.Object3D.attach` is supposed to preserve world transform by decomposing `parentWorldInverse * moverMatrixWorld` into the new local matrix. When the parent group carries a non-identity scale (from the TC gizmo), this decomposition must invert a matrix that has rotation **and** scale simultaneously — `Matrix4.decompose` is only exact for orthogonal matrices; combined rotation + non-uniform scale produces incorrect quaternion/scale extraction, meaning the attach lands the mover at the wrong world position and with a spurious scale component.

**Fix approach:** Before calling `group.attach(moverMesh)`, strip the group's scale out of the decomposition path, or pre-apply the group's world-space inverse transform manually (multiply mover's world matrix by `group.matrixWorld.clone().invert()`, then decompose). Alternatively, factor the group's scale into `_applyJointPosition` so the mover is placed in the group's local coordinate frame (not world space) before `attach` is called.

**Niche-ness:** Requires a deliberate group-scale step between gluing the first pair and gluing the third part. Most "primitives at default scale + glue" workflows are unaffected. Low priority; record here until a regression test can be written.

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
