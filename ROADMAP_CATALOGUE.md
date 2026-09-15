# Directionally — Catalogue Roadmap

Two halves of one catalogue:

- **Part 1 — Identity & resolution** (below): how assets are *named and resolved* as the app
  moves toward shared, multi-user deployments. Complements Track CAT in [ROADMAP.md](ROADMAP.md).
- **Part 2 — Storage & rendering**: how a set is *stored, rendered, and edited* — one Document,
  one Realiser, one Catalogue. The active refactor target, with a step-by-step plan at the end.

Part 1 is the forward-looking resolution sighter below; Part 2 is the implementation target being
executed now.

---

## Problem statement

Track CAT resolves script names against the merged catalogue in two ways:

1. **Explicit binding** (CAT-3) — `StoredProduction.castBindings` / `settingBindings` map a role
   name / setting name to a specific `catalogueId`. Id-valued, durable, survives recompile.
2. **Label match** (CAT-1/CAT-2/CAT-4) — the typed name (`BOB`, `CLASSROOM`) is matched
   case-insensitively against catalogue entry *labels*, falling back to a placeholder on miss.
   CAT-4's auto-resolve depends on the same label match.

Label matching is the right **bootstrap** behaviour — type a name and it "just works" — but it is
not a scaling contract. This document records why, and what replaces it.

### Why name-matching won't survive multi-user

- **Collision / ambiguity.** Two assets can share a label ("Soldier" bundled, a user's "Soldier",
  a crowd-uploaded "Soldier"). `find()` returns the *first* hit, which is arbitrary and
  non-deterministic across installations. There is no way to say *which* "Soldier" is meant.
- **Renames break intent.** The sigil buffer is the source of truth, but it references a *mutable
  label*. A catalogue rename ("Robot" → "Robot Mk II") silently breaks resolution, or worse,
  silently re-resolves to a *different* asset that now owns the label.
- **Flat namespace collapse.** User-local, bundled, shared, and crowdsourced assets all live in
  one undifferentiated space. Crowdsourcing thousands of assets makes label matching unmanageable.
- **No provenance / version.** A label cannot express "this specific asset, from this author, at
  this revision."

---

## Principles

1. **Names are for humans; ids are for machines.** The production document carries *intent*
   (role names, setting names) plus optional *stable asset ids* — never a display label as the
   resolution contract.
2. **Resolution happens at compile against the live catalogue**, not at authoring time. The
   production stays portable; the target environment resolves ids through its own catalogue.
3. **Name-match is discovery; binding is commitment.** The convenient default should *lead to* a
   stable, persisted decision, not be the decision itself.

---

## Target architecture

### 1. Stable, namespaced asset ids

`CatalogueEntry.id` evolves from a bare `crypto.randomUUID()` into a namespaced URN. The seed
already exists: set pieces persist `opfs://<id>` references resolved to session blob URLs at load.
Generalise to a small scheme such as:

- `asset://character/<id>`
- `asset://setpiece/<id>`
- `asset://environment/<id>`

with reserved namespaces:

- **bundled** — shipped with the base product, versioned with the app, immutable.
- **user** — per-account local assets (today's OPFS, later synced to an account).
- **shared** — the base product's common catalogue (read-mostly).
- **crowd** — publish/import: a user uploads an asset, it receives a stable public id, others
  reference it by id.

Two different "Bob"s then have different ids and cannot collide.

### 2. Resolution as a service lookup by id

Compile resolves against the *visible* scope — bundled + the user's own assets + anything they have
subscribed/imported — with **fetch-on-miss for cloud ids** and a well-defined fallback: placeholder
+ a "resolve / bind" affordance (the CAT-4 bridge generalised). The production document remains
shareable; whoever opens it resolves the ids through their own visible catalogue.

### 3. Name-match = discovery, binding = commitment

Keep "type a name and it just works" as the bootstrap, but:

- an **ambiguous name** produces a diagnostic ("`Bob` matches N assets — pick one"), never a silent
  first-match;
- a successful name-resolve (including CAT-4's auto-resolve) **snapshots the id into a binding**, so
  the decision is stable from then on and survives later renames.

### 4. Binding upgrades

CAT-3's bindings are already id-valued; the weak points are the *key* (role/setting name) and that
ids are bare. Future work:

- **Rekey on rename** — detect a binding whose name no longer appears in the cast/settings, emit a
  "was bound to X — re-attach?" diagnostic, and never silently drop the binding.
- **Namespace the ids** so bindings are globally meaningful across users and installations.

### 5. Versioning / revisions

Id is stable; content gets a revision. A binding references the id (resolving to the latest
revision); revision pinning is a later refinement for reproducibility — do not build it until
needed.

---

## What's already in place to build on

- `crypto.randomUUID()` ids throughout — globally unique, just un-namespaced.
- `opfs://<id>` set-piece references — the first real namespaced reference pattern.
- CAT-3 `castBindings` / `settingBindings` — id-valued, the right shape; wrong key/namespace only.
- CAT-4 `BroadcastChannel('directionally-catalogue')` + recompile — the seed of "resolution reacts
  to a changing catalogue," which generalises to a remotely-updated catalogue.

---

## Near-term de-risking (no UX change required)

1. **Namespace anything that crosses a boundary** — lean on `opfs://` / a URN prefix for persisted
   state rather than bare ids.
2. **Add an "ambiguous name" diagnostic** (multiple label matches) so silent first-match never
   becomes user-visible data loss.
3. **Snapshot id bindings on auto-resolve** — when CAT-4 resolves a name, record the binding so the
   label isn't re-resolved on every compile.

---

## Explicitly out of scope

- Revision pinning / content versioning (until reproducibility is a real requirement).
- A full catalogue server, auth, or licensing model — this document only fixes the *identity and
  resolution* shape those would sit on.
- Changing the sigil grammar to embed asset ids inline (e.g. `@BOB{id}`) — keep the buffer as clean
  human text; ids live in bindings, not prose.

---

## Part 2 — Storage & rendering: one Document, one Realiser, one Catalogue

**Status:** the active refactor target. Supersedes the two-store model (`SketcherAssemblyStore` +
`OPFSCatalogueStore`) and the dual render representation (`gltfPath` vs `compose`).

### Why one

Today a set exists in two stores (an editable `SketcherAssemblyStore` draft + a published
`OPFSCatalogueStore` entry linked by `sourceAssemblyId`), in two representations (a baked GLB or a
procedural `compose`), behind two AI grammars (`SET_PIECE_JSON_SCHEMA` vs `AI_DRAFT_JSON_SCHEMA`),
and two save buttons ("Save as Item" vs "Save as Setting"). Every persistence wrinkle we've hit —
zombie assemblies, duplicate saves, the "box" note, the five-button confusion — is a symptom of
that split. The fix is one Document, one Realiser, one Catalogue.

### Target model (aligned with set-staging-architecture.md)

The catalogue stores **Definitions**; a Definition is a **Node tree**. One node type, used
fractally (item / assembly / set / venue), with `role`, `ref`, `overrides`, and `children`:

```
Node {
  id: string                          // stable path segment, unique within parent ("lamp_03")
  role: 'Prop' | 'Light' | 'Camera' | 'Structure' | 'RigAnchor'
  transform: { position: Vec3, quaternion: [x,y,z,w], scale: Vec3 }   // LOCAL, relative to parent
  children: Node[]                    // recursion
  ref?: string                        // instance of a catalogue Definition (entry id)
  overrides?: Override[]              // sparse patches on a ref
  content?: PropContent               // leaf geometry when role=Prop and ref is absent
  tags?: string[]                     // "movable", "set-dressing", "venue"
}

PropContent =
  | { type: 'primitive'; shape: 'box'|'sphere'|'cylinder'|'cone'|'torus'|'capsule'; size: number[] }
  | { type: 'sketch';    shapePoints: [number,number][]; holes?; depth: number }
  | { type: 'lathe';     lathePoints: [number,number][]; phiLength: number }
  | { type: 'gltf';      url: string }        // pre-made leaf (a degenerate ref)

Override = { path: string; op: 'remove' | 'override_transform' | 'swap_ref'; value? }
```

```
SetDocument {
  root: Node[]            // top-level children (a scene = a list of top-level nodes)
  environment?: string    // HDRI catalogue id — a scene property, not a placed node
}
```

- **Lights and cameras are nodes** (`role: Light` / `role: Camera`) with a role payload + a local
  transform — not fields, not a separate "stage settings" object (set-staging-architecture.md).
- **Environment (HDRI)** stays a document field: it's a whole-scene background, not a placed,
  transformable object, and the role enum has no Environment role.
- A `Prop` is either a **leaf** (`content`: primitive / sketch / lathe / gltf) or an **instance**
  (`ref` to another Definition + `overrides`). `gltf` is just the opaque leaf; `ref` is the
  general, editable, override-able case.
- **Reuse-with-variation** (`ref` + `overrides`) and **layering** (venue vs dressing vs shot) are
  supported by the schema now, but their *resolution* is a later increment (see step 9) — the
  single-store/Document foundation lands first.

### Realiser (one render path)

One pure function `realise(document) → THREE.Scene` switches on node kind/role: build geometry for
primitive/sketch/lathe, load the file for `gltf`, recurse into `children`, resolve `ref` to its
Definition and apply `overrides`. **Both** the sketch view and the production renderer call it.
"Flattening happens only at final render, as a throwaway artifact" — this is that function.

### Principles

1. **Local transforms, drill-in editing.** A node stores its transform relative to its immediate
   parent; the editor only ever transforms the *direct children* of the current container (root or
   an entered group). One matrix inversion per commit — no nested-transform chains.
2. **One representation per kind.** A set-piece is always a `SetDocument`. No stored GLB, no stored
   `compose`. GLB is *export-only* ("Download GLB").
3. **Document is canonical; view is derived.** The Realiser builds the scene from the Document on
   open/undo; live gizmo/sketch drags mutate the realised meshes and commit to the Document at
   interaction boundaries (the pattern the code already uses).
4. **Stable paths.** Node ids are name-derived, parent-unique segments, so the animation layer
   addresses `Schoolroom/Row2/Desk3/Lamp` — never a guid, never a flattened mesh.
5. **One persistence lifecycle.** Create/rename/duplicate/delete/open all live in the catalogue
   tree. Implicit autosave. No "publish" step, no "Untitled".

### Step-by-step implementation

Each increment is shippable and test-guarded. Protect the fragile systems (attach/joint, gimbal
transform, sketch/extrude) with their existing tests before touching them.

### Progress

- [x] **1. Extract the Realiser** — `realise.ts` / `geometry.ts` (pure draft → THREE).
- [x] **2. Tree Document + local transforms + drill-in**
  - [x] **2a** tree foundation — `documentTree.ts` (`SetNode`/`SetDocument` + `draftToDocument`/`documentToDraft`).
  - [x] **2b** local transforms — parts store local (group-relative) transforms, groups store their world transform.
  - [x] **2c** undo/redo over the tree — `SetSnapshot` tree snapshots (undo re-realises geometry, no mesh reuse).
  - [x] **2d** name-segment ids — `SetNode.id` parent-unique segments (drill-in editing already existed).
  - [x] **live-model (most of 2's "replace flat with tree")** — structural + colour/label + sketch/lathe commit mutations edit the tree via `editDocument` + an identity-preserving reconcile `syncFromDocument`.
- [x] **3. Map attach/joints onto the tree (schema)** — `role: 'prop' | 'structure'` nodes + `snap`/`rigid` joint edges.
- [ ] **4. One store**
- [ ] **5. Production renders the Document**
- [ ] **6. Collapse the AI + save surfaces**
- [ ] **7. UI: persistent catalogue column**
- [ ] **8. Bundled library → documents** (adds custom-geometry `PartDraft` support — unblocks step 9)
- [ ] **9. Finish the tree runtime** — migrate the catalogue insert + attach flow onto the tree, then the persistent-tree/transform-write-back, then delete the flat `SketcherDraft`.
- [ ] **10. (Later) `ref` + `overrides` + layering**

**Notes:** the live scene is still the transform/gizmo source of truth (the "transient tree" model —
`toDocument()` re-derives from the mesh). Promoting the tree to the *persistent* source (step 9) is
deliberately deferred until after step 8, because the catalogue commit path uses custom geometry that
`PartDraft` can't yet express.

1. **Extract the Realiser.** Factor the geometry-building out of `CartoonSketcher.loadDraft` into
   `realise(document): THREE.Group` (pure, headless). Sketch view calls it. No behaviour change.
   Guard: `toDraft`/`loadDraft` round-trip + `exportGLB` tests.

2. **Tree Document + local transforms + drill-in.** Replace flat `parts[] + groups` with the
   `Node` tree; store local transforms; ids become parent-unique name-segments. Re-home
   `sketcherCommands`/`SketcherDocument` over the tree; make member-edit/group-edit the only edit
   mode. Guard: `CartoonSketcher.test.ts`, `SketcherDocument.test.ts`, `SelectionManager.test.ts`.

3. **Map attach/joints onto the tree (schema).** Give the `Node` tree the attach/joint vocabulary:
   `role: 'structure'` group nodes (vs `'prop'` parts) and `snap`/`rigid` joint edges (the doc's
   glue/weld distinction). Pure schema + converters; the runtime still re-derives the tree from the
   mesh (see step 9). Guard: `documentTree.test.ts` + `AttachManager.test.ts`.

4. **One store.** Catalogue entry = `{ id, name, kind, isSetting, document, addedAt, modifiedAt }`.
   Migrate assemblies → entries via `sourceAssemblyId`; orphan drafts become entries (or drop).
   Delete `SketcherAssemblyStore`, `sourceAssemblyId`, `catalogueLifecycle` cascade.

5. **Production renders the Document.** Give `storedSceneToModel` / `settingSpec` a `document`
   branch that calls `realise`. `gltfPath`/`compose` stop being user-set representations; GLB is
   export-only. Guard: `storedSceneToModel` + `settingSpec` tests.

6. **Collapse the AI + save surfaces.** One create verb (AI Draft → `fromAIDraft` → document →
   store). Retire `SET_PIECE_JSON_SCHEMA`/`normalizeSetPieceInput`/`createSetPiece`/`addSetPiece`
   for sets. `isSetting` becomes a property. Remove "Save as Item"/"Save as Setting",
   "New"/"Save As…"/"Open…", "Untitled".

7. **UI: persistent catalogue column.** Left-hand tree in the sketch tool (always visible /
   collapsible): **+ New set**, **inline rename**, **duplicate**, **delete**, **click-to-open**,
   drill-in. Name-on-create. The same tree already lives in the production view.

8. **Bundled library → documents.** Convert bundled set-piece props (`CATALOGUE_ENTRIES` +
   generators) to `SetDocument`s so there is one set-piece representation. This also gives `PartDraft`
   a custom-geometry kind (so `insertCataloguePiece` can go through the tree). Lights/environments
   remain their own kinds. Delete the sidecar machinery.

9. **Finish the tree runtime (persistent tree).** With custom geometry in `PartDraft` (step 8), make
   the tree the *persistent* source of truth rather than a re-derived projection:
   1. migrate `insertCataloguePiece`/`insertCatalogueEntry` onto the tree;
   2. migrate the attach flow (`commitAttach`/`createGroup`/`detachAll`) onto the tree;
   3. add the persistent `document` + gizmo transform write-back (`toDocument()` reads the tree);
   4. delete the flat `SketcherDraft` and the flat `realise()`.
   Guard: the existing `CartoonSketcher`/`SketcherDocument`/`AttachManager` round-trip suites.

10. **(Later) `ref` + `overrides` + layering.** Implement instance resolution and venue/dressing
    layer composition — the doc's reuse-with-variation story — on top of the foundation. The schema
    already supports it; this is where it becomes behaviour.

### Migration

- Assemblies merge into catalogue entries via `sourceAssemblyId` (step 4).
- Existing GLB-backed set-pieces keep rendering (their GLB is a throwaway cache until step 5
  replaces it with direct draft rendering), then the GLB sidecar is deleted (step 8).
- Bundled `compose` props are converted to documents (step 8).

### Deletion list

`SketcherAssemblyStore`; `localStorage['sketcher-assembly-id']` restore; `sourceAssemblyId` +
`findByAssemblyId`/`sourceAssemblyIdOf` + `catalogueLifecycle` cascade; `compose`/`geometry`/
`material` as user-set representations (`addSetPiece`, `updateSetPieceMeta`, `normalizeSetPieceInput`,
`SET_PIECE_JSON_SCHEMA`); `exportDraftGLB` as a stored step (keep `exportGLB` for download);
"Save as Item"/"Save as Setting"/"New"/"Save As…"/"Open…" buttons + "Untitled"; the flat
`SketcherDraft` and flat `realise()` (step 9 — superseded by the tree document + tree realiser).

### Relationship to Part 1 (identity vs storage)

Part 1 (above) is about *which* asset a script name resolves to — machine ids, namespaces,
bindings. Part 2 is about *what a set is made of* — the Document tree and how it renders. They are
orthogonal and reconcile cleanly: **entry id is a machine URN** (Part 1), while **node id is a
stable human path-segment** for animation addressing (Part 2 / set-staging-architecture.md).
No conflict.

## Cross-references

- [ROADMAP.md](ROADMAP.md) — Track CAT (CAT-1/2/3/4/5) and the Data Contract's refinement-layer
  merge rule ("recompile preserves manual overrides").
- [ROADMAP_AI.md](ROADMAP_AI.md) — AI-generated characters land on the same CAT-4 bridge, so they
  inherit the same identity/resolution concerns.
- [ROADMAP_HUMANOID.md](ROADMAP_HUMANOID.md) — humanoid rework that changes how characters are
  produced, not how they are identified.
- [set-staging-architecture.md](set-staging-architecture.md) — the Node/Definition/Instance/override
  and layering model that Part 2 realises.
- [SKETCHER_ROADMAP.md](SKETCHER_ROADMAP.md) — the editor (Track SET) that Part 2 collapses to one
  tool; the sketcher phases this refactor touches.