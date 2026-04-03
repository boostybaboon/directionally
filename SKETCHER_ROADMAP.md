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

## Later sketcher phases *(deferred)*

| Phase | Content |
|---|---|
| S5 | Auto-bone per extruded part (along extrusion axis) → `SkinnedMesh` conversion |
| S6 | Proximity-based skin weight computation |
| S7 | Primitive stacking UI (capsules, rounded boxes, spheres) with snap attachment |
| S8 | Sketch-on-face: click a face to set the sketch plane |
| S9 | Toon shader / backface-inflation outline pass |
| S10 | Convex hull collider export for Rapier.js (physics) |
| S11 | Boolean cuts via `three-bvh-csg` (optional holes / cutouts) |
| S12 | "Add asset…" UI in the Catalogue tab (complement to the `/sketch` route) |

---

## Verification checklist

- [ ] `yarn test` — all existing + new sketcher/OPFSCatalogueStore tests green
- [ ] `yarn check` — 0 errors, 0 warnings
- [ ] Manual: draw polygon → extrude → "Export to Catalogue" on `/sketch` → switch to `/` → Catalogue panel → user asset appears → add to production scene
- [ ] Manual: "Design mode" label gone from production UI; "Edit" in its place
- [ ] Manual: `yarn build` + production URL → `/sketch` redirects to `/` (not reachable)
