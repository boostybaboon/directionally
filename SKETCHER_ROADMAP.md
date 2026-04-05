# Directionally — Cartoon Sketcher Roadmap

Captures the design thinking and phased plan for the cartoon 3D sketcher: a separable asset-authoring surface that feeds user-created meshes into the production catalogue.

---

## Background & decisions

**Goal:** A fast, fun cartoon-style 3D sketcher (think Spore creature creator, not FreeCAD) built on Three.js. User-created GLB assets flow directly into the production asset catalogue and are usable in productions.

**Key documents:**
- `docs/sketcher.md` — implementation design for the polygon sketcher + extrusion pipeline
- `docs/asset-authoring-decision.md` — geometry kernel decision (mesh-first wins; monorepo ruled out)

### Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Package location | `src/core/sketcher/` inside existing app | Extractable later if needed; zero tooling cost now |
| Navigation | Separate SvelteKit route `/sketch` | Clean URL; dev-only guard until production-ready |
| Naming | Current "Design mode" → "Edit"; sketcher surface → "Design" | Frees up the better word for the more creative surface |
| MVP geometry | Static mesh only — GLB export, no bones/skinning yet | Simpler; rigging is Phase S2 |
| Catalogue landing | `OPFSCatalogueStore` (Phase L6) built alongside | `localStorage` (~5 MB cap) unsuitable for GLB blobs; OPFS has no practical size limit |
| Geometry kernel | `THREE.Shape` + `ExtrudeGeometry`, `three-mesh-bvh` for spatial queries | Cartoon aesthetic; immediate `SkinnedMesh` compatibility; trivial GLB export |
| Monorepo | Ruled out | Premature infrastructure for a single-developer, single-app project |

---

## Current state — April 2026

The sketcher is a viable cheap-and-cheerful cartoon asset creator. The core loop works end-to-end: sketch a polygon → extrude → insert primitives → colour → glue parts into assemblies → transform the assembly. The implementation is clean, with generic geometry handling (no per-geometry-type branching), a solid glue joint model with face-normal alignment, and 378 tests passing.

**Completed phases:** S0, S1, S2, S3, SA1, SA2, SA3, SA4 (Ctrl+D; linear array deferred), SA5.

**Immediate next priorities (in order):**
1. SH1 — Poly sketcher hardening
2. SA7 — Per-side materials *(elevated)*
3. SA8 — Textures *(elevated)*
4. SA10 — Uniform object scale
5. SA11 — Snap to floor
6. SA12 — Positioning precision
7. SA13 — Undo / redo

---

## Phase S0 — Rename Design → Edit *(prerequisite)*

Rename the existing production-canvas toggle from "Design" to "Edit" throughout the UI and codebase to free up "Design" as the label for the sketcher surface.

- `designMode` boolean in `src/routes/+page.svelte` → `editMode`
- UI button and tab labels "Design" → "Edit"
- No data model change — the flag is not persisted to `StoredProduction`

**Files:** `src/routes/+page.svelte`, `src/lib/Presenter.svelte`, `src/lib/TransportBar.svelte`

---

## Phase S1 — Sketcher kernel

Pure TypeScript, no Svelte/framework dependencies. Lives in `src/core/sketcher/`.

### `types.ts`
```ts
type SketcherPart = {
  id: string;
  mesh: THREE.Mesh;
  depth: number;
  centroid: THREE.Vector3;
};
type SketcherSession = { parts: SketcherPart[] };
```

### `PolygonSketcher.ts`
- Raycasts mouse onto `THREE.Plane` → world-space points
- 0.1 grid snap for clean shapes
- Rubber-band preview line following cursor
- `onShapeClosed(shape: THREE.Shape, centroid: THREE.Vector3)` callback

### `ExtrusionHandle.ts`
- Draggable yellow sphere handle at shape centroid
- Throttled (~30fps) live `ExtrudeGeometry` rebuild during drag
- `bevelEnabled: true` for instant cartoon roundness
- `onExtrusionComplete(mesh: THREE.Mesh, depth: number)` callback

### `CartoonSketcher.ts`
- Wires `PolygonSketcher` → `ExtrusionHandle` pipeline
- Stores completed `SketcherPart[]`
- API: `startNewSketch()`, `clearSession()`, `getSession(): SketcherSession`

### `exportGLB.ts`
- Takes `SketcherSession`, uses `THREE.GLTFExporter` to produce a `Blob`
- Returns `{ blob: Blob, filename: string }` (human-readable generated name)
- Adds `extras: { source: 'directionally-sketcher', createdAt: <ISO> }` attribution metadata

### Tests: `CartoonSketcher.test.ts`
- Polygon shape closing behaviour
- Extrusion geometry output (non-zero vertex count, correct bounding box direction)
- GLB export produces a non-empty Blob

---

## Phase S2 — `/sketch` SvelteKit route

### `src/routes/sketch/+page.ts`
```ts
export const ssr = false; // Three.js / native binary deps
```

### `src/routes/sketch/+page.svelte`
- Mounts Three.js canvas and `CartoonSketcher` in `onMount`
- OrbitControls for 3D navigation when not sketching
- Toolbar: **New sketch** | **Clear** | **Export to Catalogue**
- "Export to Catalogue" → `exportGLB()` → passes blob to `OPFSCatalogueStore.add()`
- Inline status feedback: "Saved to catalogue as [name]"
- Route guard: redirect to `/` when `!import.meta.env.DEV` (invisible in production builds until promoted)

---

## Phase L6 — OPFSCatalogueStore *(built alongside S2)*

*See also the corresponding Phase L6 entry in `ROADMAP.md` for the full UI spec.*

### `src/core/storage/OPFSCatalogueStore.ts`

```ts
type UserCatalogueEntry = CatalogueEntry & { userAdded: true; addedAt: number };

interface OPFSCatalogueStore {
  list(): Promise<UserCatalogueEntry[]>;
  add(blob: Blob, meta: Omit<UserCatalogueEntry, 'id' | 'addedAt' | 'gltfPath'>): Promise<UserCatalogueEntry>;
  remove(id: string): Promise<void>;
}
```

- GLB blobs stored as real files under `assets/` in the origin OPFS root (`navigator.storage.getDirectory()`)
- Metadata (id, label, kind, addedAt) stored in a companion `assets-meta.json` file in the same OPFS directory
- `list()` reads metadata, then calls `fileHandle.getFile()` + `URL.createObjectURL()` per entry to produce live `gltfPath` values — fresh each session, no reload fragility
- Quota managed by the browser against available disk space — no practical size limit for GLB assets
- Browser support: Chrome/Edge/Firefox/Safari 17+

**Production JSON stays clean:** `StoredProduction` stores only the stable `catalogueId`. The `gltfPath` object URL is resolved at runtime by `OPFSCatalogueStore.list()` before first render. When Phase I1 server store lands, the same `catalogueId` resolves via `fetch` instead — no production JSON migration.

### Catalogue integration

- `catalogue.ts` `getCharacters()` / `getSetPieces()` — accept optional `userEntries` arg (consistent with existing testable-injection pattern)
- `src/routes/+page.svelte` — calls `OPFSCatalogueStore.list()` at startup alongside `ProductionStore.list()`, merges results into `CATALOGUE_CHARACTERS` / `CATALOGUE_SET_PIECES`:

```ts
const [productions, userAssets] = await Promise.all([
  ProductionStore.list(),
  OPFSCatalogueStore.list()
]);
```

### Tests: `OPFSCatalogueStore.test.ts`

OPFS is not available in Node/Vitest; test via a mock of `navigator.storage.getDirectory()`:
- `add()` → `list()` returns entry with non-empty `gltfPath`
- `remove()` → `list()` no longer includes the entry
- Metadata persists across re-instantiation (reads same OPFS directory)

---

## Phase S3 — Dev-only nav link

Add a **Design** link to `/sketch` in the app header, guarded by `import.meta.env.DEV`. Remove the guard when the sketcher is ready for production promotion (separate explicit decision).

---

## Phase S4 — Promote to production *(manual gate)*

- Remove `import.meta.env.DEV` guard from `/sketch` route and nav link
- Prerequisite: `OPFSCatalogueStore` (or Phase I1 server store) in place

---

## Phase SA1 — Selection + TransformControls *(complete ✓)*

Click to select a part; gizmo to translate/rotate/scale. W/E/R keyboard shortcuts. Delete removes part. Cyan edge outline auto-follows the gizmo.

---

## Phase SA2 — Primitive palette *(complete ✓)*

Insert preset shapes from the toolbar without sketching.

**Shapes:** cube, sphere, cylinder, capsule, cone  
Each inserts a new `SketcherPart` at world origin and auto-selects it (gizmo ready to reposition immediately).

Default sizes chosen to "feel right" for set-piece assembly — cylinder proportioned for a table leg, cube for a tabletop:

| Primitive | Geometry |
|---|---|
| Cube | `BoxGeometry(1, 1, 1)` |
| Sphere | `SphereGeometry(0.75, 16, 12)` |
| Cylinder | `CylinderGeometry(0.3, 0.3, 2, 16)` |
| Capsule | `CapsuleGeometry(0.3, 1, 4, 8)` |
| Cone | `ConeGeometry(0.5, 2, 16)` |

**Files:** `CartoonSketcher.ts` — `insertPrimitive(kind)` method; `+page.svelte` — new toolbar row of primitive buttons.

---

## Phase SA3 — Per-part colour *(complete ✓)*

Select a part → colour picker appears in a floating HUD → updates `mesh.material.color`.

- 8 cartoon palette presets + hex field
- Single `MeshStandardMaterial` per part (no per-face splitting yet; that's SA6)
- Colour persisted in `SketcherPart` for SA9 serialization

---

## Phase SA4 — Duplicate & array *(Ctrl+D complete ✓; linear array deferred)*

- **Ctrl+D**: duplicate selected part → clones geometry + material, offsets +1 on X, auto-selects clone
- **Linear array**: N copies along an axis with a step distance — useful for fence posts, table legs, columns
- All duplicates are independent `SketcherPart` entries (deep-cloned geometry + material)

---

## Phase SA5 — Glue / snap attachment *(complete ✓)*

Gluing two parts together records a geometric recipe for how their faces touch, forms a persistent `THREE.Group` in the scene graph containing all connected parts, and re-evaluates that recipe whenever any group member is transformed — without a live constraint solver.

### Design decisions

**Joint model is symmetric — no parent/child.** A joint is a recipe: `[(faceA, uvA), (faceB, uvB), alpha]`. Neither part is privileged. When either part is scaled or moved (in glue-edit mode), the recipe re-evaluates and repositions the other.

**Persistent explicit groups — not on-the-fly.** When a joint is created the two parts (or their existing groups) are merged under a single `THREE.Group` immediately and permanently. The group is the scene graph manifestation of the connected component. This means TC simply `attach(group)` — no temporary construction/teardown per gesture.

Scene graph example — 4 legs + tabletop, two legs glued:
```
scene
├── legC   (SketcherPart, top-level)
├── legD   (SketcherPart, top-level)
└── Group_1
    ├── tabletop (SketcherPart)
    ├── legA     (SketcherPart)
    └── legB     (SketcherPart)
```

**Recipe replay on drag-end.** Joints are re-evaluated on every `TransformControls` `dragging-changed` (release) event for any member of the group. Example: scale cuboid Z → release → all joints touching the cuboid re-evaluate → cylinder bottom repositions to match new face position. No solver; just re-run the recipe.

**Two interaction modes for a group:**
- *Normal mode* (default): clicking any mesh in a group selects the whole group; TC gizmo at group AABB centroid; all members move together.
- *Glue-edit mode* (G key or toolbar toggle): clicking a mesh selects that individual part; TC attached to it; joints re-evaluate on drag-end. Status bar shows "Glue edit" in amber.

**Explicit unglue only.** Joints are never silently broken by dragging. To detach: enter glue-edit mode, select a part, press U (or "Unglue" button in HUD). `dissolveGroup()` runs a BFS connected-components pass on remaining joints: if the group splits into two disconnected components each gets a new group (or returns to scene root if size 1).

### Data model

```ts
type GlueJoint = {
  id: string;
  partAId: string;  faceA: number;  uvA: [number, number];
  partBId: string;  faceB: number;  uvB: [number, number];
  alpha: number;   // twist around shared normal, default 0
};

type AssemblyGroup = {
  id: string;
  group: THREE.Group;
  partIds: string[];  // mirrors group.children membership
};
```

`SketcherSession` gains `joints: GlueJoint[]` and `assemblyGroups: AssemblyGroup[]`.

### Face group conventions

- `BoxGeometry` primitives: 6 constant-normal groups (±X, ±Y, ±Z faces)
- `CylinderGeometry` primitives: group 0 = barrel, group 1 = top cap, group 2 = bottom cap
- `ExtrudeGeometry` parts: group 0 = side faces, group 1 = front cap, group 2 = back cap

### Interaction flow

1. Select a part (or whole group — any member mesh)
2. Press **G** or click **"Glue…"** in toolbar → enter glue-pick mode; cursor changes
3. Hover over any other mesh → nearest face highlights yellow (raycast + face-normal group lookup)
4. **Click** → selected part snaps flush; child face centre touches hit point; joint committed; group formed/expanded; glue-pick mode exits
5. **Escape** → cancel, part returns to pre-glue world position

The grab point on the moving part defaults to the face centre of its face closest to the camera (no extra click needed). `alpha = 0` by default; rotation around the shared normal is a deferred control.

### GLB export

Joints encoded in root `extras.directionally.joints`. Group membership reconstructed from joint graph on load — no separate group data needed in the file.

### Table walkthrough with SA2–SA5

1. SA2: insert cylinder (leg), SA3: colour wood-brown
2. SA4: Ctrl+D × 3 → four legs (4 top-level parts)
3. SA2: insert cube (top), SA3: colour wood-brown (5 top-level parts)
4. SA5: glue legA top cap to cube bottom face → Group_1 forms {cube, legA}
5. SA5: glue legB top cap to cube bottom face → Group_1 grows {cube, legA, legB}
6. SA5: glue legC, legD → Group_1 = {cube, legA, legB, legC, legD}
7. L6: Export to Catalogue → usable in productions

---

## Phase SH1 — Poly sketcher hardening *(next priority)*

A batch of UX and correctness fixes to make the polygon sketcher reliable before building further on top of it.

- **Remove default edge bevelling.** `bevelEnabled: true` was an early shortcut for roundness; it distorts geometry unexpectedly. Switch `ExtrudeGeometry` to `bevelEnabled: false` by default; expose it as an optional toggle if cartoon roundness is desired.
- **Fix view rotation when sketching.** OrbitControls and the polygon-pick raycaster fight for mouse events during sketch drawing. Disable OrbitControls while a sketch is in progress; re-enable on shape close or Escape.
- **Closure click indication.** When the cursor is close enough to the first vertex to close the polygon, highlight the first vertex distinctly (e.g. filled circle, colour change) so the user knows a click will close rather than extend.
- **Better extrude / de-extrude grab handle.** The current handle is small and hard to pick. Replace with an arrow-style handle that affords clear up/down drag; show depth value live in a HUD overlay.
- **Fix duplicate solid on final commit.** The extrusion pipeline currently creates a second mesh at generation time, leaving a duplicate coincident solid in the scene. Diagnose whether this is a double-`commitPart` call or a geometry rebuild firing twice; remove the duplicate.
- **Fix solid placement (sketch ≠ solid position).** The committed solid is not placed at the same world position as the sketch preview. Ensure the extruded mesh inherits the sketch plane origin and the same world-space centroid the preview showed.
- **Fix face labels and UVs.** Extruded solids should label groups as `top`, `side-0`, `side-1`, …, `bottom` with side rectangles having UV in `[0,1]×[0,1]`. Currently all sides and the top share the same `Top` label and UV mapping.

---

## Phase SA6 — Sketch shape presets

Extend polygon sketcher with rectangle and circle input modes alongside the existing free-polygon.

- **Rectangle:** click + drag diagonal → 4-point closed shape → extrude pipeline unchanged
- **Circle:** click center + drag radius → closed N-gon approximation (default 32 segments, segment count input in toolbar)
- Toolbar mode switcher: **Polygon** | **Rectangle** | **Circle**

**Files:** `PolygonSketcher.ts` extended; `types.ts` adds `SketchMode` union.

---

## Phase SA7 — Per-side materials *(elevated priority)*

**Per-face colour:**
- `mesh.material` becomes a `THREE.Material[]` array; each face group gets its own `MeshStandardMaterial`
- Interaction: select part → click a face (raycast + group lookup) → colour picker
- Prerequisite: face group metadata from SA5 already in place

**UV wrapping mode:**
- Toggle per-part: *per-face* (each side 0..1 independently) vs *wrapped* (U proportional around perimeter)
- Default heuristic: ≤8 sides → per-face + faceted normals; >8 → wrapped + smooth normals
- User override via toggle in the part HUD

---

## Phase SA8 — Textures *(elevated priority)*

Drag-and-drop an image file onto a selected face → assigns via `THREE.TextureLoader` on that material group.

- Single texture per material group (UV wrapping mode from SA7 determines layout)
- Blob lifecycle via `URL.createObjectURL`; stored in OPFS alongside GLB on export

---

## Phase SA10 — Uniform object scale

TransformControls already exposes per-axis scale. Add a uniform-scale mode: a toolbar toggle constrains all three axes to move together. Useful once an assembly is composed and the user wants to resize the whole thing without distorting proportions.

- Toolbar toggle: **Scale XYZ** | **Scale uniform**
- Implement by locking `TransformControls` scale axis to `'XYZ'` when in uniform mode
- Report scale factor as a single number in the HUD overlay

---

## Phase SA11 — Snap to floor

After assembling a glue group (e.g. table + legs) the assembly often floats above `y = 0`. The user needs a one-click way to slide it down so it sits on the floor.

**Design options (start with bounding-box; face nomination deferred):**
- **Bounding-box floor snap.** Compute the world-space AABB of the entire group; translate the group so `aabb.min.y = 0`. Simple; always correct for symmetric flat-bottomed objects.
- **Nominated-face floor snap** *(deferred)*. Mark one face of one part in the group as the "floor contact" face; the group translates so that face's world-space centroid lies on `y = 0`. Handles angled feet, irregular bases, etc.

Toolbar button: "⬇ Floor". Works on a single part or an entire assembly group.

---

## Phase SA12 — Positioning precision

Currently all positioning is by mouse drag, making it difficult to achieve exact coordinates — e.g. placing four table legs at `(±1, 0, ±0.2)` before gluing.

**Sketch points**
- Grid-snap toggle (0.1 grid already partially in place); expose snap size as an editable field
- Numeric coordinate entry: click a vertex or handle to reveal an XYZ input panel

**Extrusion depth**
- Numeric depth field in the extrude HUD overlay (alongside the grab handle)

**Transform precision**
- When an object is selected, show its world-space position / rotation / scale as editable numeric fields in the properties panel
- Tab between X / Y / Z fields; Enter to confirm

**Glue precision**
- *Midpoint mode:* toggle that snaps the glue source pick to face-centre automatically — equivalent to `(0.5, 0.5)` in face UV space — without requiring the user to hover precisely over the centre
- Free-mouse glue stays available as the alternative
- *Glue point editor:* after a joint is committed, select it and open an inspector showing the UV position on each face plus the twist angle (`alpha`); edits reposition the joint live in the viewport

---

## Phase SA13 — Undo / redo

Add an undo/redo stack to the sketcher. The main Directionally app already has a command pattern (`src/core/document/Command.ts`, `ProductionDocument.ts`) providing a reference implementation.

**Scope for sketcher commands:**
- `InsertPartCommand` (primitive insert or extrusion commit)
- `DeletePartCommand`
- `TransformPartCommand` (position / rotation / scale change on drag-end)
- `ChangeColorCommand`
- `CommitGlueCommand`
- `UnglueCommand`

**Implementation notes:**
- Commands operate on `SketcherSession` (immutable snapshots or structural mutations + inverse)
- `SketcherDocument` analogous to `ProductionDocument`: `execute(cmd)`, `undo()`, `redo()`, `canUndo`, `canRedo`
- Wire `Ctrl+Z` / `Ctrl+Shift+Z` (and `Ctrl+Y`) in `+page.svelte`
- Three.js scene state must stay in sync: commands are responsible for both the data mutation and the corresponding scene-graph update

---

## Phase SA9 — Assembly serialization

Re-editable save/load for the full assembly.

**`AssemblySpec` JSON** — stored in OPFS alongside the GLB:
```ts
type PartSpec = {
  id: string;
  kind: 'sketch' | 'primitive';
  primitiveType?: 'box' | 'sphere' | 'cylinder' | 'capsule' | 'cone';
  shapePoints?: [number, number][];  // for sketch parts
  depth?: number;
  position: [number, number, number];
  rotation: [number, number, number, number];  // quaternion
  scale: [number, number, number];
  color: number;
  uvMode: 'per-face' | 'wrapped';
};
type AssemblySpec = { parts: PartSpec[]; joints: GlueJoint[] };
```

Load path: `AssemblySpec` → reconstruct Three.js scene using the same geometry-build functions as creation. Parts are editable immediately.

> **Note on full parametric history:** A true modify-mid-stack-with-dependency-propagation history (Fusion 360 / Blender modifier stack) is a multi-year CAD feature. `AssemblySpec` achieves the practical need — re-open, adjust, re-export — at a fraction of the complexity. If a leg needs resizing after gluing, load the assembly, scale the leg, re-export. Full history replay is deferred indefinitely.

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

---

## Track B — Character animation *(future)*

### CB0 — Base humanoid decision

Pick a base GLB source for owned humanoids. Recommendation: **VRoid Studio** (free, browser-based). It exports `VRMC_vrm 1.0`-spec models with a standard bone vocabulary that `three-vrm` understands out of the box.

Key constraints:
- Target **VRM 1.0** (`extensions.VRMC_vrm`) from day one — VRM 0.x has a different bone hierarchy and would need a migration pass later.
- Use [`three-vrm`](https://github.com/pixiv/three-vrm) (`@pixiv/three-vrm`) for loading; it wraps `GLTFLoader` and exposes `vrm.humanoid` with named bones (`leftUpperArm`, `spine`, etc.).
- `springBone` (secondary motion for hair/clothing) and blendshape groups (facial expressions) are included in the spec — no custom extension work needed.
- No constraint to Soldier.glb or any existing bundled character; the project uses its own greenfield humanoids.

### CB1 — Bone proportion editor

Mii-style sliders that call `bone.scale.set()` on VRM bones (head size, limb length, torso width, etc.). Non-destructive at runtime; bake to a new GLB on export.

### CB2 — Colour picker

Per-material colour swaps on the loaded VRM mesh (diffuse colour + optional toon texture tint).

---

## Verification checklist

- [ ] `yarn test` — all existing + new sketcher/OPFSCatalogueStore tests green
- [ ] `yarn check` — 0 errors, 0 warnings
- [ ] Manual: draw polygon → extrude → "Export to Catalogue" on `/sketch` → switch to `/` → Catalogue panel → user asset appears → add to production scene
- [ ] Manual: "Design mode" label gone from production UI; "Edit" in its place
- [ ] Manual: `yarn build` + production URL → `/sketch` redirects to `/` (not reachable)
