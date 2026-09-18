# Set / Staging Architecture — Design Notes

**Context:** Rapid visualisation app for animations. Fountain-derived script compiles to an
animation. Characters resolve via a catalogue + simple avatar-configurator editor when
unresolved. This document addresses the harder, still-unsolved problem: the **Set / Staging**
sub-app — the geometry/asset design system for scenes.

## The problem

A "resolve-or-create" pattern works cleanly for characters because a character is naturally
*flat*: one entity, one avatar, done. Sets resist this because they are actually **four
different problems wearing one trenchcoat**:

1. A **part-of** hierarchy
 (lamp is part of a desk-setup is part of a schoolroom)
2. A **catalogue-vs-placement** distinction (a "chair" definition vs *this specific chair,
   rotated 12°, missing its cushion*)
3. A **reuse-with-variation** problem (same set, minus one chair, for this scene only)
4. A **layering** problem (venue stays put across scenes; dressing changes scene-by-scene)

Trying to solve each of these with a bespoke structure produces a combinatorial, non-general
mess — exactly the "complexity happens early and the walking skeleton gets hamstrung" failure
mode to avoid.

**Reassurance:** all four collapse onto **one recursive primitive** if split correctly. This
mirrors well-proven prior art: Pixar's USD (composition arcs / layers), Unity's nested-prefab
system, Blender's library overrides, and real theatrical stagecraft (venue rig vs. per-show
scenery). This is a rediscovered pattern, not a novel gamble.

## The walking skeleton: one Node type, used fractally

Everything — an item, an assembly, a whole set, a whole theatre venue — is the **same kind of
object**:

```
Node {
  id: stable path segment            // "lamp_03"
  role: Prop | Light | Camera | RigAnchor | Structure
  ref: Definition (optional)         // "what catalogue thing is this an instance of?"
  transform: position/rotation/scale
  children: [Node]                   // recursion happens here
  overrides: [sparse patches]        // see below
  tags: freeform                     // "movable", "set-dressing", "venue"
}
```

- A **Definition** is a Node tree stored in the catalogue with no scene-specific placement.
- An **Instance** is a reference to a Definition plus a transform plus (crucially) a small list
  of *overrides* — not a copy.

Because a Definition's children can themselves be Instances of other Definitions,
"item / assembly / set / venue" are not four types to special-case — they are the **same tree
at different scales**:

```mermaid
flowchart TD
    D1[Item Def: Chair] --> D2[Assembly Def: Table+Chairs Set]
    D3[Item Def: Table] --> D2
    D2 --> D4[Set Def: Schoolroom]
    D5[Item Def: Desk] --> D4
    D6[Item Def: Lamp] --> D4
    D4 --> D7[Venue/Scene composition]
```

**Consequence for the editor:** no need for three editors (item designer, assembly designer,
set designer). Build **one**: "arrange child nodes in space, optionally name the group and
publish it as a reusable Definition." Whether the children are primitives or entire schoolrooms
is irrelevant to the UI. Recursion collapses the tool count to one — this is the simplifying
paradigm.

## Reuse-with-variation: overrides, not copies

Solves "same set, minus one chair, for this scene." An Instance never duplicates its
Definition's contents; it carries a *sparse diff*:

```
SchoolroomInstance (ref: Schoolroom, in Scene 14) {
  overrides: [
    { path: "row2/chair3", op: "remove" },
    { path: "row1/desk1/lamp", op: "override_transform", value: {...} },
    { path: "blackboard", op: "swap_ref", value: "Blackboard_Cracked_v2" }
  ]
}
```

Editing the master Schoolroom Definition propagates to every scene using it, except wherever a
scene explicitly overrode something. This is the git-commit / CSS-cascade / Unity-prefab-override
mental model — it's what stops full re-authoring of set detail per scene.

## The venue-vs-dressing problem (theatre example)

This is a **layering** concern, orthogonal to the part-of hierarchy above. Don't model "theatre
base" as a parent of "this week's scenery" in the same tree — model a scene's final set as the
**composite of stacked layers**, each an independent Node tree:

```mermaid
flowchart LR
    subgraph Layer1["Layer 1: Venue (rarely changes)"]
    A[Proscenium arch]
    B[Stage floor / thrust]
    C[Lighting rig]
    D[Side flats]
    end
    subgraph Layer2["Layer 2: Scene Dressing (changes per scene)"]
    E[Backdrop: Forest]
    F[Table + Chairs]
    end
    subgraph Layer3["Layer 3: Shot Overrides (changes per shot)"]
    G[Camera]
    H[Key light tweak]
    end
    A --> Z[Composed Stage for Scene N]
    B --> Z
    C --> Z
    D --> Z
    E --> Z
    F --> Z
    G --> Z
    H --> Z
```

The same trick applies to schoolroom / park / aircraft-cabin scenarios — most sets just have one
populated layer (venue == dressing), but the model doesn't care. An "aircraft cabin" reused
across three scenes is Layer 1 (cabin shell + seat rig) with Layer 2 overrides per scene
(different passengers' luggage, a spilled drink). The theatre case comes "for free" — it's the
same mechanism with more layers populated.

## Lights and cameras aren't architecturally special

Resist a separate "stage settings" object. They're just Nodes with `role: Light` or
`role: Camera`. The only genuinely special thing about them is *where in the layering they
conventionally get added* — typically the outermost (per-shot) layer rather than baked into a
reusable Item Definition. Nothing stops a "reading lamp" Item Definition from owning a child
Light node — that's a legitimate, general case, not an exception to code around.

## Why this keeps items identifiable for animation

Every node has a **stable path** (`Schoolroom/Row2/Desk3/Lamp`) that survives composition and
overrides, so the animation layer never needs a flattened mesh soup — it addresses nodes by
path, the same way you'd address a DOM element or a USD prim. Flattening only happens at final
render time, as a derived, throwaway artifact — never as the thing that's edited or animated.

## Suggested next step for the POC

Don't build the whole catalogue system first. Build the **skeleton** and prove it on
paper/mock-data against exactly three scenarios:

1. Schoolroom — plain single-layer set, deep nesting: item → assembly → set.
2. One scene removing a chair from a reused set — override mechanism.
3. Theatre base + per-scene scenery — layering mechanism.

If those three fall out of the same four-field Node schema (`role`, `ref`, `transform`,
`children` + `overrides`) without special-casing, that's a walking skeleton that won't need to
be ripped up. Everything after that — thumbnails, drag-and-drop UI, physics constraints,
snapping — is decoration on a stable foundation.

---

# Part 2 — Implementation Notes: How USD, Unity, and Blender Actually Do This

## The shared authoring UX pattern

All three reference systems avoid a "component mode" vs "scene mode" split. Instead:

- There is **one canvas** (viewport + hierarchy/outliner). You can sketch a primitive from
  scratch, drag in a catalogue item, or both, in the same session, side by side.
- "Is this a scene or a reusable component?" is not a mode chosen up front — it's a **status a
  node acquires** when deliberately extracted/published. Freshly-sketched geometry starts life
  as a plain, scene-local node. Select it → "Save as Asset / Make Prefab / Make Library" → it is
  written out to its own file/datablock, and the original node in the scene is swapped for a
  *reference* to that file. Nothing about the modelling UI changes; only where the data ends up.
- Editing an *instance* vs editing the *source* is governed by one concept: **where do my edits
  currently go?** Each system exposes this explicitly:

| System | "Where do edits go" mechanism |
|---|---|
| USD | **Edit Target** — explicitly pick which layer in the stack is "live"; every edit becomes an opinion written into that layer |
| Unity | **Prefab Mode** — double-click a prefab to enter an isolated editing context; anything done there writes into the prefab asset itself, not a scene |
| Blender | Entering a **linked** collection is read-only; entering via **Edit Library Override** allows touching specific properties, recorded as override operations, not baked into the source |

That single rule — "there's always a target for my current edit, and the tool tells me which one
it is" — is the crux of the UX. Everything else follows from it.

## USD — composition arcs

- A **Stage** is built by stacking **Layers** (ordered text/binary files of "opinions"). Layers
  combine via **composition arcs**: `sublayer`, `reference`, `payload`, `inherit`, `variant`,
  `specialize`.
- Each named node in the tree (a "prim", e.g. `/World/Set/Chair_03`) can be *defined* (`def`) in
  one layer and *overridden* (`over`) in another. An `over` only carries the deltas — it never
  needs to restate geometry.
- Building a "Schoolroom in Scene 14" in USD terms: `shot14.usda` references `schoolroom.usda`,
  then adds a handful of `over` prims for the removed chair and the swapped blackboard. The rest
  of the schoolroom is never re-serialized.
- **Payloads vs references**: payloads are the same idea as references but *lazily loaded* —
  USD's answer to scale (don't pull a million-polygon environment into memory until a shot
  actually needs it). Worth stealing conceptually even at small scale — it maps cleanly to "don't
  load an aircraft cabin's full detail until a scene actually stages it."
- Composition strength order is remembered as **LIVRPS** (Local > Inherits > Variants >
  References > Payloads > Specializes) — a fixed, predictable precedence for "who wins when two
  layers disagree about the same property." Nothing this elaborate is needed at small scale; the
  point worth keeping is *there is always a deterministic, documented resolution order*.
- Tooling reality: `usdview`, and USD panels in Houdini/Maya, expose a **layer stack inspector**
  — for any composed value you can ask "which layer actually authored this?" That debuggability
  is not optional polish; without it, an artist who edited a chair three layers deep has no way
  to find where their edit actually lives.

## Unity — nested prefabs & variants

- A **Prefab** = a serialized GameObject hierarchy saved as an asset (the Definition).
- A **Prefab Instance** in a scene (or nested inside another prefab) stores almost nothing
  itself: a link to the source prefab + a **flat list of property-path modifications** —
  literally `{ target object path, component type, property path, value }` tuples. Not a tree
  diff, a *property-path* diff. This is the single most reusable idea here and far simpler to
  implement than it sounds.
- **Nesting** is native: a prefab's children can themselves be prefab instances, arbitrarily
  deep — the "group of groups" requirement, exactly.
- **Prefab Variants** are the missing piece for a catalogue-of-catalogues: a Variant is itself a
  savable asset whose entire content is "base prefab + a stored override list," but promoted to
  first-class catalogue status, so it can then be instanced elsewhere (e.g. `RedStackingChair`
  variant of `StackingChair`, itself reused across ten sets).
- UX affordances that matter: an overridden property is shown **bold with a blue bar** in the
  Inspector so the artist always sees at a glance what's been touched. Right-click gives
  **Apply to Prefab** (push this instance's change back up into the shared source — mutates
  every other instance too) and **Revert** (discard the local override, snap back). This
  Apply/Revert pair is the practical, teachable version of "promote vs discard."
- Structural changes (added/removed child objects, not just property tweaks) are tracked in
  separate "added GameObjects" / "removed components" lists on the instance, distinct from the
  property-modification list.

## Blender — library overrides

- Historically, linking a collection from another `.blend` gave a **read-only** instance — fine
  for pure reuse, useless for "same set, minus one chair."
- **Library Overrides** (the newer mechanism) allow "make override" on a linked object/
  collection. Blender creates a local shadow ID mirroring the linked one, and any property then
  touched is recorded as an override *operation* (an RNA data-path + the new value) attached to
  that shadow ID — not baked into new geometry.
- On evaluation, Blender takes the linked source, then **replays the stored override
  operations** on top — a runtime patch-apply, conceptually identical to Unity's modification
  list or a USD `over`.
- The gnarly bit, worth knowing about before hitting it directly: **resync**. If the source
  library changes shape (an object is added/removed/renamed inside the linked collection),
  Blender has to recompute correspondence between the linked structure and the local override
  shadows, using stable internal identifiers — and it will warn about or drop overrides that no
  longer have a target. This is the real-world cost of "edit the master, propagate everywhere":
  someone has to reconcile old overrides against a changed Definition, and it isn't always
  silent.
- UX: the Outliner marks overridden data with a small icon overlay, and individual properties
  can be overridden one at a time (turn on override just for "visibility" on one modifier)
  rather than all-or-nothing — the same granularity idea as Unity's per-property modification
  list.

## Synthesis — what to actually build

USD's full generality or Blender's resync machinery aren't needed on day one. A pragmatic
minimum, borrowing the best bit from each:

**1. Definitions are files/records with stable child IDs, not array positions.**

```json
// Definition: Schoolroom.def.json
{
  "id": "def:schoolroom.v1",
  "children": [
    { "localId": "row2_chair3", "ref": "def:chair.v1", "transform": {} },
    { "localId": "blackboard",  "ref": "def:blackboard.v1", "transform": {} }
  ]
}
```

Give every child a **persistent localId** generated once at creation (a short UUID or slug),
never an index. This is the detail all three systems get right and every home-grown attempt
gets wrong — without it, overrides silently detach the moment someone reorders or inserts a
sibling.

**2. Instances carry a flat, path-addressed override list (Unity's model — simplest to
implement).**

```json
// Instance in Scene 14
{
  "ref": "def:schoolroom.v1",
  "transform": {},
  "overrides": [
    { "path": "row2_chair3", "op": "remove" },
    { "path": "blackboard",  "op": "swap_ref", "value": "def:blackboard_cracked.v2" },
    { "path": "row1_desk1/lamp", "op": "set", "field": "transform.rotationZ", "value": 12 }
  ]
}
```

Resolution rule at load time: `resolved = deep_copy(Definition)`, then apply overrides in list
order (`remove` deletes a subtree, `swap_ref` replaces the pointed-to Definition, `set` patches a
single field). That is the entire composition engine for v1 — no strength-ordering rules needed
until competing layers actually exist.

**3. One editing rule, driven by an explicit "edit target":**

- Double-click an instance in a scene → normal select/transform → any change is
  appended/updated in that instance's `overrides` list.
- Right-click "Edit Source" on an instance → opens the underlying Definition in the same
  viewport/editor UI, in an isolated context; edits there mutate the Definition file directly
  and ripple to every instance.
- Provide **Apply** (take a selected override, write its value into the Definition, remove it
  from the local override list) and **Revert** (discard the override) as one-click commands on
  any overridden property, exactly like Unity's bold-blue-bar affordance. This single UI
  convention is what makes the dual authoring mode (from-scratch vs from-catalogue) feel like
  one tool instead of two.

**4. "Promote to reusable" is the symmetric inverse operation:** select any subtree (however it
was authored — sketched or already-instanced), "Save as Definition" → write it out as a new
Definition record, replace the selection in place with an Instance pointing at it. This is how a
from-scratch sketch and a catalogue-drop coexist in one canvas without special-casing.

**5. Layers (venue vs dressing vs shot) are just 2–3 fixed, ordered override-sets, not a general
arbitrary stack.** Resolve as: `Definition → apply Venue overrides → apply Dressing overrides →
apply Shot overrides`, last-write-wins per field, removals/adds accumulate. This gives USD's
LIVRPS *benefit* (deterministic, inspectable precedence) without needing its full generality.

**6. Plan for resync from day one, even minimally.** When a Definition changes shape (a child
localId is deleted), scan every Instance's override list for orphaned `path`s and flag them in
the UI rather than silently dropping them — Blender's pain point is a preview of yours if this
step is skipped.

---

# Part 3 — The unified Node model (the step-10 draft)

The concrete model behind ROADMAP_CATALOGUE step 10: one node type for a part leaf, a group, a light,
and an instance of a catalogue Definition. The sequence lives in that roadmap (10.1–10.5); the type,
the decisions and the migration checklist live here.

## One node type, used fractally

```ts
import type { DistributiveOmit, LightConfig } from '../domain/types.js';
import type { PartDraft, JointSnapshot } from './types.js';
import type { Transform } from './transform.js';

/** What a node is; decides which payload field is meaningful. */
export type NodeRole = 'prop' | 'structure' | 'light';

/**
 * One node type, used fractally: a part leaf, a group, a light, or an instance of a
 * catalogue Definition. A group is a node with children; an instance is a node with a
 * `ref`; a group-of-groups is a node whose child is another node. Every node owns a
 * local transform, so leaves and groups are read, realised and written back the same
 * way — one walker, one realiser, one write-back.
 */
export type SetNode = {
  /** Stable, parent-unique name segment — the animation-facing path segment ('lamp-03'). */
  id: string;
  role: NodeRole;
  /** Local, relative to the parent node (world at the document root). */
  transform: Transform;
  /** Child nodes; always present, empty on a leaf. */
  children: SetNode[];
  /** Catalogue Definition this node is an instance of (entry id). */
  ref?: string;
  /** Sparse patches over the referenced Definition, applied in list order. */
  overrides?: NodeOverride[];
  tags?: string[];
  /** role: 'prop' — the leaf's body. */
  content?: PartDraft;
  /**
   * role: 'light' — the light's configuration. The node `id` *is* the light id and the
   * node transform is its position; a spot's `target` stays here, since it is a second
   * point rather than the node's own placement.
   */
  light?: DistributiveOmit<LightConfig, 'id' | 'position'>;
  /** Named groups: the semantic name, and pure group vs attach assembly. */
  name?: string;
  isGroup?: boolean;
};

export type NodeOverride = {
  /** Path into the referenced Definition, from this node: 'row-2/chair-3/lamp'. */
  path: string;
  op: 'remove' | 'swap_ref' | 'set';
  /** 'swap_ref': the replacement entry id. 'set': the field patch. */
  value?: string | Record<string, unknown>;
};

export type SetDocument = {
  root: SetNode[];
  /** Attach joints between part leaves, by part id — flat, independent of nesting. */
  joints: JointSnapshot[];
  /** HDRI catalogue id — a whole-scene property, not a placed, transformable node. */
  environmentMap?: string;
  /** Durable group bonds (step 9). */
  groupComponents?: string[][];
};
```

`role` names map 1:1 onto this doc's `Prop | Light | Camera | Structure | RigAnchor` in the
codebase's lowercase style; `camera`/`rig` are added when 10.5 has something to place. The doc's
`content: PropContent` is this codebase's `PartDraft` — the same tag set (`primitive` / `sketch` /
`lathed` / `catalogue`) plus the appearance fields — and there is no `gltf` leaf, because a pre-made
body is a `catalogue` part or a `ref`.

## What the one type buys

A schoolroom with a row of chairs and a desk lamp — group-of-groups, an instance carrying an
override, and a light that moves with its group:

```json
{
  "root": [
    {
      "id": "schoolroom",
      "role": "structure",
      "name": "Schoolroom",
      "transform": { "position": [0, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1] },
      "children": [
        {
          "id": "row-2",
          "role": "structure",
          "name": "Row 2",
          "transform": { "position": [0, 0, 3.2], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1] },
          "children": [
            {
              "id": "chair-3",
              "role": "prop",
              "ref": "chair",
              "overrides": [{ "path": "cushion", "op": "remove" }],
              "transform": { "position": [1.2, 0, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1] },
              "children": []
            }
          ]
        },
        {
          "id": "desk-lamp",
          "role": "light",
          "transform": { "position": [0.4, 1.1, 0], "quaternion": [0, 0, 0, 1], "scale": [1, 1, 1] },
          "light": { "type": "point", "color": 16764006, "intensity": 2, "distance": 6, "decay": 2 },
          "children": []
        }
      ]
    }
  ],
  "joints": []
}
```

- **Group** — any `structure` node. **Group-of-groups** — a `structure` node whose child is another
  `structure` node. No new concept and no new code: the Group action wraps the selected nodes in a
  node, whichever level they sit at.
- **Solidify** ("Save as Item") — write the subtree to the catalogue, replace the node in place with
  `ref: <entry id>`. The modelling UI does not change; only where the data ends up.
- **Instance** — `ref` + `transform` + `overrides`. **Definition-of-definition** — a Definition whose
  child carries a `ref`, which is how chair → table-and-chairs → schoolroom needs no special case.
- **One walker** serves `collectParts`, `countParts`, the realiser, `writeBack`, the AI projection and
  any future outliner, because `children` and `transform` are on every node.
- **Lights become placeable, nestable, addressable** with a stable path, moving with the group that
  owns them, instead of a document-level list of world positions.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Node shape | one flat type with a `role` tag plus a load-time `normalizeDocument()`, not a TypeScript discriminated union | `ref`, `overrides`, the id-diff and any patch operate on arbitrary nodes; a union forces a `role` narrow at every patch site — the un-generic tax. Cost: TS cannot prove payload-vs-role agreement; paid once, at load, where reporting beats throwing |
| Transform | on the node, required | leaves and groups then read, realise and write back identically; `writeBack`/`syncFromDocument` lose their `kind` branches |
| `children` | always present | one walker; no `'children' in node` guards |
| Lights | `role: 'light'` nodes in 10.1 | their shape changes in the same pass regardless; the *renderer* contract stays `LightConfig[]` via `collectLights(doc)`, so `StoredScene` and the light actions keep their shape — what ends is the compiler seeding the scene's lights from an entry, because a setting's lights now arrive with its document at realisation |
| `camera` / `rig` | additive roles later (10.5) | a new enum member plus an optional payload needs no document migration — nothing is gained by pre-adding them |
| Environment | stays `document.environmentMap` | a whole-scene background is not a placed, transformable object. The scene's own `environmentMap` is the author's value; the setting's document supplies the default at load, and the precedence is formalised in 10.5 |
| `SetPieceEntry.partCount` | kept | the one derived value with a reader that cannot load documents: the catalogue list shows a part count per row |
| Joints | stay a flat document list keyed by part id | attach is leaf-level; nesting does not change it (a joint *across* two instances needs paths — a 10.3 question, not a 10.1 field) |
| `NodeOverride` scope | one primitive, two scopes | the same path-addressed override type and resolution serve 10.4's per-instance overrides and 10.5's per-scene setting overrides (N7). Two mechanisms would recreate the combinatorial mess the architecture doc exists to avoid |
| `SetPieceEntry.lights` / `environmentId` | deleted | they were a covering-index copy so the sync compiler could seed `scene.lights`/`scene.environmentMap` from an entry without loading its document (`fountainCompiler.ts:437`). With lights as nodes the copy has no reader: geometry already arrives from the document at realisation, the async tier is where documents get materialised anyway (`storedSceneToModelAsync`), and light-block intensity inference can read the realised lights. Keeping it would leave one setting's lighting in three places at once — its document, its entry, and the compiled scene |
| Addressing | unchanged in 10.1: parts by guid, groups by node id | selection and the gizmo are guid-based, so path addressing is not a rider on this rework — but **10.3 requires it**: two instances of one Definition collide on part id, breaking the id-diff, joints and animation addressing, so N8 moves up or folds into 10.3 |
| Document `version` | dropped (deleted ahead of 10.1) | `version: 2` was written by `emptyDocument()`, `documentFromParts()` and `OPFSCatalogueStore`'s `EMPTY_DOCUMENT` and read by nothing — no check, no upgrader, no compatibility branch. A version field implies a promise we are not keeping, and a stale document is simply abandoned. `normalizeDocument()` is the load-time guard instead: it reads what it recognises and reports what it does not, which catches any stale or malformed file rather than only a version mismatch |

**Not in 10.1** — the address scheme (guid → path, which 10.3 pulls forward — see the addressing
row) and animation addressing (N8); joint semantics; the renderer's `StoredScene`/`SetPiece` contract,
where `SetPiece` stays the scene *slot* type (10.1
deletes its dead `parent` field; the flat slot list becomes a tree in 10.3, when resolution stops
flattening); and the AI draft grammar, which stays a flat projection that simply reads
`node.transform`.

Accepted limits, named so they stay decisions rather than omissions and documented in full elsewhere:
no lazy payload loading (documents resolve eagerly — fine at this scale), a fixed 2–3 layer stack
rather than USD's composition-arc generality, and turn-based editing with no true concurrency
(this doc's synthesis §5; `SKETCHER_ROADMAP.md`'s deferred table; `ROADMAP_API.md`'s out-of-scope
list).

## The AI surface

Principle: **the catalogue is the AI's API** — `describe_catalogue` gives it *visibility* (id, label,
kind, summary), the draft grammar gives it *construction* (primitive/sketch/lathe parts, flat named
groups, lights, environment), and the verb that connects the two is **`ref`**.

Today the AI is a primitive-only Definition author: `normalizeAIDraft` accepts only
`primitive | sketch | lathed` (`aiDraftSchema.ts`), the generation prompt only teaches primitives,
and `AIPart.kind`'s `catalogue` member is rejected rather than realised. The AI can *see* a catalogue
chair but cannot *use* one.

Decision: the AI drafts **flat Definitions** — primitives + groups + `ref` parts — and nested
structure is always *referenced*, never authored by the AI. A `ref` part is a handle plus a placement:

```json
{ "id": "chair-3", "name": "Chair", "ref": "chair", "position": [1, 0, 0], "rotation": [0, 0, 0] }
```

with optional path-addressed `overrides` (`[{ "path": "chair/back", "op": "remove" }]`). The round
trip ends in a `ref` node, never a copy:

- `fromAIDraft` maps a `ref` part to a `SetNode` with `ref` + `overrides` — no inlining; the
  referenced Definition carries the geometry and any nesting;
- `toAIDraft` projects a `ref` node back to a `ref` part (an opaque handle), so identity survives an
  edit loop; unreferenced nesting still flattens in the projection, because the grammar cannot
  express it and only the referenced case needs to;
- it lands in **10.3**, the same increment that gives the node model `ref` — deliberately, so there
  is no flatten-at-authoring stopgap.

Because nesting is referenced rather than expressed, the flat grammar stays flat and gains full
composition power: a preformed "school desk and chair" (itself desk-and-chair groups-of-parts) is one
`ref` part, and "that chair minus its back" is one `ref` part with an override. Layering
(venue/dressing/shot) remains compiler-side composition, not AI grammar.

Deferred: a `describe_definition` tool (expose a Definition's node paths) so the AI can target
overrides intelligently — not needed to place an item, only to vary it.

## Migration checklist

Ordered and mechanical — one pass touches every file below.

1. `src/core/sketcher/types.ts` — `PartDraft` drops `position`/`quaternion`/`scale`; they belong to
   the node now.
2. `src/core/domain/types.ts` — export `DistributiveOmit` (moved out of `catalogue/types.ts`, where
   only `LightEntry.config` uses it); delete `SetPiece.parent`.
3. `src/core/sketcher/documentTree.ts` — the node type, `NodeRole`, `NodeOverride`, `version: 3`;
   delete `partTransform()`; `insertPart(doc, content, transform?)` plus a
   `PartSeed = { content: PartDraft; transform?: Transform }` for `documentFromParts`; `groupParts`,
   `ungroupPart` and `promoteToRoot` re-localise `node.transform`; `setPartTransform` writes
   `node.transform`; the light ops `addLightNode` / `removeLightNode` / `findLightNode` /
   `collectLights`; `normalizeDocument()`.
4. `src/core/sketcher/realise.ts` — `realiseNode` reads `node.transform`; `buildPartMesh(content,
   transform)`; light nodes realise here too (`buildLight`), so the headless realiser covers a whole
   document rather than geometry only.
5. `src/core/sketcher/CartoonSketcher.ts` — the four `PartDraft` construction sites and `partToLeaf`
   lose their transform fields; `syncFromDocument` sets transforms from nodes; `writeBack` collapses
   to one transform branch plus a payload refresh; `addLight`/`removeLight` become node ops and
   `getLights()` becomes `collectLights(this.document)`; `document.lights` is gone.
6. `src/core/catalogue/bundledSets.ts` — its `part()` helper returns a seed.
7. `src/core/sketcher/aiDraft.ts` / `applyDraft.ts` — read and write `node.transform`; the diff
   carries seeds rather than bare drafts.
8. `src/routes/sketch/+page.svelte` — `persistSet`'s metadata loses `lights`/`environmentId` (item 9),
   `getLights()` reads the document, `duplicateSet` stops copying them; otherwise typing only.
9. The entry cache — drop `SetPieceEntry.lights`/`environmentId` and their plumbing (`StoredEntry`,
   `SetPieceMeta`, `toUserEntry`, `createSetPieceDocument`), `persistSet`'s two meta fields,
   `duplicateSet`'s two copies, and the compiler's `scene.environmentMap`/`scene.lights` seeding.
   Light-block intensity inference (`storedSceneToModel.ts:183`) reads the realised lights instead.
   `isSettingEntry` keeps only the explicit flag.
10. Tests — `documentTree`, `realise`, `CartoonSketcher`, `applyDraft`, `aiDraft`, `aiDraftSchema`,
    `catalogue` (the two `isSettingEntry` lighting-heuristic assertions go).

## Open questions for 10.3+

Deliberately unanswered here, so 10.1 stays bounded:

- **Joints across an instance boundary** — a joint between two parts that live inside different
  Definitions needs a path, not a part id.
- **Override granularity** — may `op: 'set'` patch only the transform, or any field (colour, light
  payload, geometry)?
- **Resolution timing** — resolve `ref`s lazily per node, or eagerly per document at load?

