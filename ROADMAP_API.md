# Directionally — Authoring API Roadmap

The machine-facing surface through which an AI agent **co-edits set/scenery design** with the
Sketcher, alongside a human. This is the *interactive* layer; the batch "generate a whole asset"
surface and the catalogue/binding verbs are supporting layers below. Supersedes the
declarative-create API in [ROADMAP_API_ARCHIVE.md](ROADMAP_API_ARCHIVE.md).

## Core idea: one canonical draft, a sympathetic AI Draft

- The canonical, persisted design is the **`SetDocument`** — the tree the Sketcher edits and
  autosaves. Each part leaf carries a *local* `position`/`quaternion`/`scale` and a guid; group
  nodes nest, and joints + durable group bonds travel with the document. (`toDocument()` is the
  live session as a document, `loadDocument()` realises one.)
- The AI **never reads or writes a `SetDocument` directly.** It reads/writes an **AI Draft** — a
  sympathetic projection of the same document: Euler rotation, semantic names + handles, named
  groups, and an explicit coordinate convention (`units`, `up`, `groundY`, `forward`).
- The **projection pair** `toAIDraft()` / `fromAIDraft()` bridges the two, projecting world
  transforms (the AI grammar is flat, so nested groups flatten to their outermost group).
  `SetDocument` stays the single source of truth; the AI Draft is derived, never persisted as a
  second format.

**Whole-document, not command-level.** A human edits via the command/undo stack; an AI (like a
coding agent) thinks in documents — read the draft, write a new one. So the AI's unit of
expression is the whole AI Draft; the app turns it into a change by **id-diffing** it against the
live session and applying the delta as **one undoable command**. The diff is app-side, keyed by
stable id, for two reasons: (a) **drift protection** (unchanged parts the AI merely re-typed are
not touched), and (b) **review + undo** (the turn is one labelled, undoable step).

## The surface

- Read: `describe_session` → the live session as an AI Draft.
- Write (LLM, server-side): `edit` — `{ draft, instruction, history }` → `{ text, draft }`.
- Apply (client-side, **not** an LLM verb): `apply_draft` — id-diff → `SketcherDocument.execute()`
  (snapshot-based undo, no inverse commands).
- Retained (production binding, unchanged in `src/core/agent/`): `describe_catalogue`,
  `describe_script`, `bind`, `create_character`.

**Vocabulary against capability.** The catalogue's document layer is ahead of what these verbs can
name: an entry is described by kind and label with nothing about what is *inside* it, so an agent
cannot target a node inside a Definition and cannot therefore use the overrides its grammar already
carries (`describe_definition` is the missing read), and nothing here varies a venue *inside a
scene* — dressing (`NamedScene.set[].overrides`) is expressible today and has neither a verb nor a
script surface. The per-capability table, and the order the gaps unlock each other in, is
[ROADMAP_CATALOGUE.md](ROADMAP_CATALOGUE.md)'s *Surface reach*.

## Contracts

- **`AI_DRAFT_JSON_SCHEMA`** — the AI-facing grammar for *editable* scenery: named parts with
  absolute `size`, Euler `rotation`, named `groups`, and a `convention` block. The editable
  generate path (`generateEditableSetting`) fills it; `normalizeAIDraft` validates it;
  `fromAIDraft` rebuilds the canonical draft. (`core/sketcher/aiDraftSchema.ts`.)
- **`SetDocument`** (canonical) — the tree the Sketcher edits; the AI Draft is its projection.
- **`CHARACTER_JSON_SCHEMA`** (retained) — the semantic-slider surface for characters.
- **`SET_PIECE_JSON_SCHEMA`** (retained) — the procedural `compose` contract for the headless
  `make`/`create_setting` verb (a lightweight, non-editable catalogue entry); no longer the
  editable-generation grammar.

## The id-diff contract (app-side)

Given the returned document vs the live session's document, by stable id: same id + same data
→ no-op; new id → add; missing id → remove; same id + changed data → update.

The id is the part's guid for a part leaf, the node's id for an instance, and the group node's id for
a group — a `ref` node has no body to compare, so its placement *is* its state (Track SET 10.3-B).
Node ids are what survives the round trip, since `toAIDraft` re-derives them from the same names; a
node the AI re-points at another Definition is a drop and a place under one id.

**Transforms in the diff are world**, like the AI Draft's: a node's local transform depends on which
group it sits in, so comparing worlds is both what the AI means and what makes a member that moves
between groups read as unchanged. Placements are applied at world *before* the group pass, which
re-parents nodes without moving any of them.

**Group structure has its own pass** (Track SET 10.3's remainder): a group the draft names and the
document lacks is created around its members; one the draft drops is dissolved; and one that stays
has its membership reconciled — joiners adopted, leavers released to the root, world preserved.
Membership is compared as *what a group holds*, not as its direct children, because the AI's grammar
is flat and cannot tell a direct member from one inside a group of its own. Only **pure** groups
(`isGroup: true`) are managed: an attach assembly is a constraint the sketcher made, not the AI's to
rearrange.

## Relationship to the set-staging Node model

The AI Draft is the **stable abstraction**; the projection pair is the **adapter** that changes.
It bridges AI Draft ↔ `SetDocument`, the Node tree itself (`set-staging-architecture*.md`; Track SET
in `SKETCHER_ROADMAP.md`) — the pair was re-based on the tree without touching the AI Draft, so the
AI grammar (Euler, names, groups) and its prompts survived the migration unchanged.

**Render-time structure.** The production renderer must materialise the *same* hierarchy the
editor holds — groups (and groups-of-groups) as `THREE.Group`s with stable paths — not a
flattened mesh soup, so a "table" or "car" can be addressed and animated as a unit. Today
`resolveInstances` flattens `ref`s at render; keeping the structure is a Track SET / renderer
change, not an AI-surface change.

## Phases

- **P0 — AI Draft grammar + projection (no LLM).** ✅ Done — `AI_DRAFT_JSON_SCHEMA` +
  `normalizeAIDraft`, `toAIDraft`/`fromAIDraft`, `applyDraft`, and the document enrichment
  (part names, group id/name, primitive `size`) are all landed and tested.
- **P1 — bridge to catalogue.** ✅ Done — `generateEditableSetting` builds a draft → assembly →
  GLB bake → catalogue entry carrying `sourceAssemblyId`, using the same publish path a human
  "Save as Setting" uses; resume-by-name and `partCount` stop the catalogue from duplicating.
  ("Promote a subtree to a Definition" stays on Track SET, not here.)
- **P2 — `describe_session` + programmatic inserts.** `describe_session`; programmatic
  `insert_sketch`/`insert_lathe` so the AI can express extruded/lathed parts as data (deferable —
  primitives cover most).
- **P3 — `edit` route + agent loop.** `/agent/edit` (draft-in/draft-out), mirroring `/agent/make`'s
  server-held-key boundary.
- **P4 — conversation UX.** Chat panel in `/sketch`: human/AI turns, review + undo of AI turns,
  propose-vs-auto-apply.

## Out of scope / risks

- sketch/lathe polygons (medium — the AI must emit `shapePoints`/`lathePoints`); primitives-first.
- attach/joints (contact-point computation — `group`-only first).
- true concurrency (v1 is turn-based; the id-diff already absorbs drift).
- characters (a parallel, simpler semantic-slider surface).
