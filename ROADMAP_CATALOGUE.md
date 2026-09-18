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
  Lights land with the node unification (10.1); `camera`/`rig` are additive role members that need
  no document migration, so they land when layering (10.5) has something to place.
- **Environment (HDRI)** stays a document field: it's a whole-scene background, not a placed,
  transformable object, and the role enum has no Environment role.
- A `Prop` is either a **leaf** (`content`: primitive / sketch / lathe / gltf) or an **instance**
  (`ref` to another Definition + `overrides`). `gltf` is just the opaque leaf; `ref` is the
  general, editable, override-able case.
- **Reuse-with-variation** (`ref` + `overrides`) and **layering** (venue vs dressing vs shot) are
  supported by the schema now, but their *resolution* is a later increment (see steps 10.3–10.5) — the
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
   tree. Implicit autosave. No "publish" step, no "Untitled". (Step 7 delivers the tree and the
   autosave; "Publish" is the last of the publish step, and it goes when step 8 makes the document
   itself the catalogue artefact.)

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
- [x] **4. One store** — a set *is* its catalogue entry: the entry carries the tree document (sibling file), the autosave/open/new flow edits it directly, and the assembly store + delete cascade are gone.
  - [x] **4a** store: a set-piece entry can carry a `SetDocument` document (stored in a sibling file)
  - [x] **4b** page: the sketch tool edits a catalogue entry's document directly (autosave/open/new)
  - [x] **4c** delete `SketcherAssemblyStore` + `catalogueLifecycle` + `sourceAssemblyId` + the `sketcher-assembly-id` pointer
- [x] **5. Production renders the Document** — `expandEntry` emits a `catalogueId` piece for a document-backed entry; the storage layer materialises its document, `realiseDocument` builds the tree, and the Model carries it as a pre-built group (`Model.groups`).
- [x] **6. Collapse the AI + save surfaces** — one scenery create verb (AI Draft → `fromAIDraft` → tree document → entry); the compose/geometry authoring API and grammar are gone.
  - [x] **6a** core: `createSetPiece(aiDraft)` is the only scenery verb; the settings LLM step uses the AI Draft grammar; `SET_PIECE_JSON_SCHEMA` / `normalizeSetPieceInput` / `addSetPiece` / `NewProceduralSetPiece` deleted; one client `generateAsset(kind, …)`.
  - [x] **6b** UI: the sketch toolbar's save surfaces ("Save as Item"/"Save as Setting", "New"/"Save As…"/"Open…", "Untitled") are gone — step 7's catalogue column replaced them, so the tool never lost its set management. One **Publish** is left, and the row's scenery/prop tag replaced the two save modes.
- [x] **7. UI: persistent catalogue column** — `SetsColumn.svelte`, the sketch tool's left column
  (collapsible from the toolbar): **+ New set**, **inline rename**, **duplicate**, **delete**,
  **click-to-open**. Name-on-create (a new or duplicated set opens its name field), and every rename
  goes to the entry via `updateSetPieceMeta`, so the column and the store never disagree.
- [x] **8. Bundled library → documents** — every set piece is a tree document, custom geometry is a
  `PartDraft` kind, and the GLB sidecar is gone. Unblocks step 9.
- [x] **9. Finish the tree runtime** — the tree document is the set's persistent state: the attach flow
  (`commitAttach`/`group`/`ungroup`/`detachAll`/`removePart`/`setGroupName`) edits the tree, live mesh
  transforms are written back into it, undo/redo snapshots *are* documents, and the flat
  `SketcherDraft` + flat `realise()` are gone.
- [ ] **10. (Later) `ref` + `overrides` + layering**

**Notes:** the tree is the persistent source now; the scene is a realisation of it. A gizmo drag is
written back into the document on the next sync (`writeBack()`), so the one place a transform lives
outside the tree is a drag in flight. The AI-facing projection (`toAIDraft` / `fromAIDraft`) and the
AI id-diff (`applyDraft.ts`) read and produce documents.

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

4. **One store.** Catalogue entry = `{ id, label, kind, isSetting, document, addedAt, modifiedAt }`.
   A set-piece entry keeps its tree document in a sibling `<id>.document.json` and only `hasDocument`
   in the metadata index. The document and the GLB bake live on the *same* entry, so publishing writes
   in place instead of duplicating; `list()` returns published entries only, while `listDocuments()`
   feeds the Sketcher's Open list (drafts included). The "assembly" concept is gone — deleted
   `SketcherAssemblyStore`, `catalogueLifecycle`, and the assemblies' `sourceAssemblyId` link. The
   surviving `sourceDesignId` field links character assets to their `CharacterDesignStore` design;
   unifying *that* store is out of scope here (step 10).

5. **Production renders the Document.** `expandEntry` emits one piece carrying the entry's
   `catalogueId` (never its GLB) when the entry has a document; `storedSceneToModelAsync` loads that
   document from OPFS, `realiseDocument` builds the tree, and the result reaches the renderer as a
   pre-built object tree (`Model.groups` → `buildSceneGraph`, selectable by piece name). A piece whose
   document is missing falls back to its placeholder geometry — never to a stale bake. The
   `gltfPath`/`compose` representations were the AI (`make`) + bundled authoring surfaces, retired in
   steps 6 and 8; the baked GLB stood in as the publish signal until step 8 deleted it.

6. **Collapse the AI + save surfaces.** One create verb: an AI Draft goes in, a document-backed
   entry comes out (`createSetPiece`, `setting/authoringApi.ts`), and the settings LLM step
   (`describeToDocument`) fills the AI Draft grammar. `SET_PIECE_JSON_SCHEMA`, `normalizeSetPieceInput`,
   `createSetPiece`'s compose/geometry input, `addSetPiece` and `NewProceduralSetPiece` are deleted, so
   `make` → `create_setting` is the only scenery creation path for both humans and agents, and the
   client exposes one `generateAsset(kind, …)`. `isSetting` is now a property of the entry
   (`createSetPieceDocument`), not a save mode. The toolbar's save surfaces went with step 7.

7. **UI: persistent catalogue column.** `SetsColumn.svelte` is the sketch tool's left column,
   collapsible from the toolbar. It lists every document-backed entry (`listDocuments`), so
   unpublished drafts and published sets are one list, and it owns the whole lifecycle: **+ New set**,
   **inline rename**, **duplicate** (the copy opens if you duplicated the set you were editing),
   **delete** (which closes the session when it was that set's, so a later edit cannot resurrect the
   entry), and **click-to-open**, which drills in — `openSet` persists first, swaps the document and
   clears the undo stack. **Name-on-create**: a new or duplicated set opens its name field
   preselected. Every rename and reclassification writes the entry
   (`OPFSCatalogueStore.updateSetPieceMeta`), never the page, which keeps no name of its own.
   The row's *scenery / prop* tag is where a human sets `isSetting` (a new set starts as scenery — a
   venue, matching `createSetPiece`'s default). **Publish** was the one remaining save surface at
   that point — it baked the GLB and captured the session's baseline lighting/environment and part
   count; step 8 deleted it, because an autosave now writes that metadata with the document. The column re-measures the viewport when it is collapsed or expanded.

8. **Bundled library → documents.** `bundledSets.ts` defines every bundled set piece as a
   `SetDocument` of catalogue parts (`kind: 'catalogue'`, realised through `buildCatalogueGeometry` +
   `buildCatalogueMaterial`), so a bundled prop and a sketcher-authored set have one representation and
   one render path: `expandEntry` emits a `catalogueId` piece and `storedSceneToModel` realises the
   entry's document — inline for bundled definitions, from OPFS for saved sets. `SetPieceEntry` lost
   `geometry`/`material`/`compose`/`gltfPath` and its `defaultRotation` (a plane's orientation is a
   part-local rotation inside its document), the catalogue builders moved from `CartoonSketcher` into
   `geometry.ts`, and `insertCatalogueEntry` now copies a document's parts into the session's tree —
   fresh runtime ids, one assembly group when the prop is multi-part — so an inserted prop survives
   every later edit (previously a tree re-derive dropped it, since its name was not a primitive
   preset). Lights/environments remain their own kinds. The sidecar went with it: no per-set GLB bake,
   no `opfs://` gltfPath, no `exportDraftGLB`, no **Publish** — the document *is* the published
   artefact (`isPublishedEntry` reads `hasDocument`), and `update()` is the character bake only. An
   autosave writes the document and its metadata (name, classification, environment, lights, part
   count) in one pass via `saveDocument`, and **Export GLB** is a download. The dead scene generators
   (`storage/generators/`) were deleted rather than converted: nothing but their own tests used them.

9. **Finish the tree runtime (persistent tree).** With custom geometry in `PartDraft` and the
   catalogue insert already on the tree (step 8), the tree became the *persistent* source of truth
   rather than a re-derived projection:
   1. the attach flow is tree edits — `CartoonSketcher.commitAttach()` records the joint in the
      document and merges the connected component into one group node; `detachAll()` drops the part's
      joints and re-partitions the component from the remaining joints and durable bonds;
      `group`/`ungroup`/`removePart`/`setGroupName` likewise. `documentTree` gained the vocabulary
      (`addJoint`, `mergeIntoGroup`, `rebuildGroups`, the bond helpers), and `AttachManager` shrank
      to the joint solver over live meshes plus a mirror of the document's topology.
   2. the document persists on the Sketcher, and `writeBack()` adopts live mesh/group transforms into
      it before every edit and snapshot, so a gizmo drag lands in the tree. Undo/redo snapshots are
      documents (`SetSnapshot` is gone), which makes undo of an attach restore its joints, groups and
      bonds in one step; `groupComponents` now travels in the document, so a bond survives both a
      later edit and a save/reload.
   3. the flat `SketcherDraft` and the flat `realise()` are gone. The AI-facing pair
      (`toAIDraft`/`fromAIDraft`) and the AI id-diff (`applyDraft.ts`) work on documents — the
      document stays the single source of truth.
   Guard: the existing `CartoonSketcher`/`SketcherDocument`/`AttachManager` round-trip suites.

10. **(Later) The Node model: one node type, then `ref` + `overrides` + layering.** Implement instance
    resolution and venue/dressing layer composition — the doc's reuse-with-variation story — on top of
    the foundation. Together the sub-steps cover the four problems `set-staging-architecture.md` names,
    as one recursive primitive at four scales: part-of hierarchy (10.1–10.2), catalogue-vs-placement
    (10.3), reuse-with-variation (10.4), layering (10.5). Split into sub-steps because everything after
    10.1 depends on one unified node type; the concrete type, its decisions and the per-file migration
    checklist are drafted in
    [set-staging-architecture-plus-implementation-notes.md](set-staging-architecture-plus-implementation-notes.md)
    **Part 3**.
    - **10.1 — One node type (the data-model rework).** `SetNode` becomes *the* node — `id`, `role`,
      `transform`, `children`, plus optional `ref`/`overrides`/`tags` and a role payload — and the two
      neighbouring shapes converge on it: `SetPiece`'s flat list (with its dead name-string `parent`)
      and `SetPieceEntry`'s entry-shaped duplicate. Two decisions are taken here. **The transform
      moves out of `PartDraft` onto the node**: parts and groups are then read, realised and written
      back identically, which is what lets one walker/realiser/write-back serve both (today `writeBack`
      and `syncFromDocument` branch on `kind` purely to move transforms). **Lights become nodes**
      (`role: 'light'`) rather than the `document.lights` side list — the cheaper order, because their
      shape has to change in the same pass over `documentTree`/`realise`/`syncFromDocument`/
      `writeBack`, whereas a role added later (`camera`, `rig`) is an additive enum member needing no
      migration. `document.lights` goes, and `SetPieceEntry.lights`/`environmentId` with it: a setting's
      lighting is content of its document and travels with it exactly as its geometry already does,
      which ends the copies the compiler needed only because lights were not nodes. `scene.lights`
      shrinks to the lights the scene itself authors (the shot layer of 10.5), and classification is the
      explicit `isSetting` flag rather than a lighting heuristic. The vestigial `SetDocument.version` is
      already deleted (written by three builders, read by nothing) — `normalizeDocument()` is the
      load-time guard.
      Guard: the `documentTree`/`realise`/`CartoonSketcher` leaf-and-group round-trip suites.
      ✅ Landed: the node type with the transform on it, `normalizeDocument()` at the load boundary,
      lights as nodes, and the entry cache gone — with `ref`/`overrides`/`tags` deliberately left to
      10.3, where their producers live. Two things worth carrying forward: "not a part" was silently
      read as "a group" in two walkers (a light node became a stray empty `THREE.Group` and a phantom
      AI group), so those branches are role-based now; and a setting's lighting is resolved by the
      *model boundary* rather than the realiser, because a model's lights are `LightAsset[]` and a
      light buried in a realised group would be invisible to light animation.
    - **10.2 — Nested groups in the session (group-of-groups).** The schema recurses already; the
      *session* is what is flat. `group()`/`ungroup()` become depth-aware, and `syncFromDocument`
      recurses instead of walking `doc.root` only — today a nested group node gets no live
      `THREE.Group` (so no transform write-back, nothing to select or gizmo) while its children are
      swallowed into the outer group. Depth is a prerequisite for 10.3, not an optional extra:
      instances are addressed by path. The Outliner (N9) earns its place here.
    - **10.3 — `ref` + tree-preserving resolution.** "Promote to Definition" (solidify) writes a
      subtree to the catalogue and replaces it with a `ref` node; inserting an entry produces a `ref`
      instead of copying leaves. `resolveInstances` stops flattening at resolve time and realises the
      referenced tree (`realiseDocument` already recurses), so path and identity survive to the
      renderer. Includes the isolated Edit Source context (N5). The AI draft gains `ref` parts in the
      same increment — a part body of `{ ref, overrides? }` that `fromAIDraft` maps to a `ref` node and
      `toAIDraft` projects back — so the AI composes a setting from catalogue items it already sees via
      `describe_catalogue` instead of reinventing them; the round trip ends in a reference, never a
      copy.
      Path addressing arrives here too: two instances of one Definition collide on part id, which is
      what the id-diff, joints and animation addressing all key off, so N8 moves up or folds in here.
    - **10.4 — `overrides` + Apply/Revert.** Instances carry the flat, path-addressed override list
      (Unity's model — the simplest that works); resolution is `deep-copy(Definition)`, then replay
      the overrides in list order. Apply (push to Definition) / Revert affordances, and orphaned
      `path`s are reported on resync rather than silently dropped (Blender's lesson). The same override
      type and resolution serve 10.5's per-scene setting overrides (N7) — one primitive at two scopes,
      not two mechanisms.
    - **10.5 — Layering (venue / dressing / shot).** Two or three fixed, ordered override-sets
      composed per scene, last-write-wins — USD's LIVRPS *benefit* without its generality. This is
      where per-shot light tweaks and `role: 'camera' | 'rig'` nodes (additive, no migration) earn
      their place, and where `StoredScene.lights`/`camera` stay the renderer contract while the
      document holds nodes. The one value both tiers legitimately declare — the environment — gets its
      precedence rule here too: the setting's document supplies the default, an explicit scene value
      wins.

11. **(Later) One store for characters.** `CharacterDesignStore` is still a second editable-source
    store behind `sourceDesignId`, exactly as `SketcherAssemblyStore` was for sets. Step 4 only
    unified the *set* side.

### Migration

- Assemblies are gone: a saved set *is* its catalogue entry, and its draft lives in the entry's
  `<id>.document.json` sibling (step 4). No data migration was written — there are no users, so
  stale assembly/draft files are simply abandoned.
- GLB-backed set-pieces rendered from their bake while step 5 was in flight; step 8 deleted the
  sidecar, so a set piece is only ever its document.
- Bundled `compose` props are documents now (`bundledSets.ts`) — the compose representation is gone.
- Step 10.1 has no migration story to write, and does not invent one: `SetDocument.version` was deleted
  rather than bumped (it was written by three builders and read by nothing — no check, no upgrader, no
  compatibility branch), and a document that predates the model is simply abandoned, as the
  assembly/draft files were. `normalizeDocument()` is the load-time guard: it reads what it recognises
  and reports what it does not.

### Deletion list

Done in step 4: `SketcherAssemblyStore`; `localStorage['sketcher-assembly-id']` restore; the
assemblies' `sourceAssemblyId` (renamed `sourceDesignId` for character designs) plus
`sourceAssemblyIdOf` and the `catalogueLifecycle` cascade.

Done in step 6: `SET_PIECE_JSON_SCHEMA`; `normalizeSetPieceInput` and its geometry/material/light
normalisers; `addSetPiece`; `NewProceduralSetPiece`/`NewSetPieceMeta` (`add` is character-only now);
`describeSettingDraft`; `generateEditableSetting`.

Done in step 7: the sketch toolbar's "Save as Item"/"Save as Setting"/"New"/"Save As…"/"Open…"
buttons and the "Untitled" name field; the `Open…` panel; the page's `setName` state and
`saveSetAs`/`renameCurrentSet` (the entry carries the name now, via `updateSetPieceMeta`).

Done in step 8 (it owned everything compose-shaped): `assignLocalIds`/`localId` and
`PlacedProp.localId`; `SetPieceEntry`'s `geometry`/`material`/`compose`/`gltfPath`/`defaultRotation`
and the `compose` branch of `expandEntry` (with `offsetPiece` and `MAX_COMPOSITE_DEPTH`);
`SetPiece.gltfPath` and the scene-level `opfs://` resolution (`resolveOpfsGltfPath`); the per-set GLB
bake (the set-piece path of `OPFSCatalogueStore.update`, and the store's placeholder
geometry/material), `exportDraftGLB`, the **Publish** button, and the dead `storage/generators/`
scene generators.

Done in step 9: the flat `SketcherDraft` and `GroupSnapshot`; `SetSnapshot` (a document *is* the
snapshot); `CartoonSketcher.toDraft()`/`loadDraft()` and the `draftToDocument`/`documentToDraft`
bridges; the flat `realise()`; and `AttachManager`'s store-and-topology API — `commitAttach`,
`createGroup`, `detach`, `detachAll`, `getConnectedIds`, `registerJoint`, `rebuildGroupsFromSnapshot`,
`dissolveGroupComponent`, `evictFromGroup`, `getGroupComponents`, `_createGroup`, `_dissolveGroup`
(they were public but only their own tests used them) — together with the `fromAIDraft`-to-flat-draft
path, which now produces a document directly.

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
- [set-staging-architecture-plus-implementation-notes.md](set-staging-architecture-plus-implementation-notes.md)
  — Part 2 (how USD/Unity/Blender do it) and Part 3 (the concrete node type, decisions and migration
  checklist for step 10).
- [SKETCHER_ROADMAP.md](SKETCHER_ROADMAP.md) — the editor (Track SET) that Part 2 collapses to one
  tool; the sketcher phases this refactor touches.