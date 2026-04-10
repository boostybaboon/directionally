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

The sketcher is a viable cheap-and-cheerful cartoon asset creator. The core loop works end-to-end: sketch a polygon → extrude → insert primitives → colour individual faces → glue parts into assemblies → transform → undo/redo → autosave. Each wall face of an extruded part and each face of a primitive has its own draw group and material slot enabling per-face colouring. 426 tests passing.

**Completed phases:** S0, S1, S2, S3, SA1, SA2, SA3, SA4 (Ctrl+D; linear array deferred), SA5, SA13, SH2, SH1a, SA7.

**Priority order:**
1. SA8 — Textures
2. SH1b — Poly sketcher UX + polish
3. SA11 — Snap to floor
4. SA12 — Positioning precision *(absorbs SA10; biggest feature; needs stable foundation)*
5. SA9 — Named assemblies *(full Word-style open/save/autosave model)*

---

## Phase SA8 — Textures

Drag-and-drop an image file onto a selected face → assigns via `THREE.TextureLoader` on that material group.

- Single texture per material group (UV wrapping mode from SA7 determines layout)
- Blob lifecycle via `URL.createObjectURL`; stored in OPFS alongside GLB on export

---

## Phase SH1b — Poly sketcher UX + polish

Non-blocking UX improvements that don't gate anything; do whenever convenient after SA7/SA8.

- **Fix view rotation when sketching.** OrbitControls and the polygon-pick raycaster fight for mouse events. Disable OrbitControls while a sketch is in progress; re-enable on shape close or Escape.
- **Closure click indication.** When the cursor is close enough to the first vertex to close the polygon, highlight that vertex distinctly (filled circle, colour change) so the user knows the next click closes rather than extends.
- **Better extrude / de-extrude grab handle.** Replace the current small sphere with an arrow-style handle that affords clear up/down drag; show depth value live in a HUD overlay.

---

## Phase SA11 — Snap to floor

After assembling a glue group the assembly often floats above `y = 0`. One-click "⬇ Floor" button on the toolbar.

**Start with bounding-box snap:** compute world-space AABB of the selection (part or whole group); translate so `aabb.min.y = 0`. Trivial — a `Box3` + `SnapToFloorCommand`.

**Nominated-face snap** *(deferred)*: mark one face of one part as the floor contact face; group translates so that face's world-space centroid lies on `y = 0`. Needed for angled feet, irregular bases.

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

**Why after SA12:** SA9's `AssemblySpec` schema needs `uvMode` (SA7) and benefits from the stable `SketcherSession` shape that SA12's numeric-field commands will finalise. Building the serialized schema before those fields exist means a migration pass.

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
