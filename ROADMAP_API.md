# Directionally — Authoring API Roadmap

The machine-facing surface through which an AI agent **co-edits set/scenery design** with the
Sketcher, alongside a human. This is the *interactive* layer; the batch "generate a whole asset"
surface and the catalogue/binding verbs are supporting layers below. Supersedes the
declarative-create API in [ROADMAP_API_ARCHIVE.md](ROADMAP_API_ARCHIVE.md).

## Core idea: one canonical draft, a sympathetic AI Draft

- The canonical, persisted design is the **`SketcherDraft`** — what the Sketcher's command UI
  writes via `toDraft()` and reconstructs via `loadDraft()`. It is flat: each part carries a
  world-space `position`/`quaternion`/`scale` and a guid, plus joints and flat group membership.
- The AI **never reads or writes `SketcherDraft` directly.** It reads/writes an **AI Draft** — a
  sympathetic projection of the same document: Euler rotation, semantic names + handles, named
  groups, and an explicit coordinate convention (`units`, `up`, `groundY`, `forward`).
- The **projection pair** `toAIDraft()` / `fromAIDraft()` bridges the two. `SketcherDraft` stays
  the single source of truth; the AI Draft is derived, never persisted as a second format.

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

## Contracts

- **`AI_DRAFT_JSON_SCHEMA`** — the AI-facing grammar for *editable* scenery: named parts with
  absolute `size`, Euler `rotation`, named `groups`, and a `convention` block. The editable
  generate path (`generateEditableSetting`) fills it; `normalizeAIDraft` validates it;
  `fromAIDraft` rebuilds the canonical draft. (`core/sketcher/aiDraftSchema.ts`.)
- **`SketcherDraft`** (canonical, existing) — enriched: semantic part names, group `id`+`name`,
  primitive `size` (replacing `scale`).
- **`CHARACTER_JSON_SCHEMA`** (retained) — the semantic-slider surface for characters.
- **`SET_PIECE_JSON_SCHEMA`** (retained) — the procedural `compose` contract for the headless
  `make`/`create_setting` verb (a lightweight, non-editable catalogue entry); no longer the
  editable-generation grammar.

## The id-diff contract (app-side)

Given the returned draft vs the live session, by stable id: same id + same data → no-op; new id →
add; missing id → remove; same id + changed data → update.

## Relationship to the set-staging Node model

The AI Draft is the **stable abstraction**; the projection pair is the **adapter** that changes.
Today it bridges AI Draft ↔ flat `SketcherDraft`. When the core migrates to the Node model
(`set-staging-architecture*.md`; Track SET in `SKETCHER_ROADMAP.md`), `toAIDraft`/`fromAIDraft`
are re-implemented against the Node tree — but the AI Draft (Euler, names, groups) stays
identical, so the AI and its prompts survive the migration untouched.

**Render-time structure.** The production renderer must materialise the *same* hierarchy the
editor holds — groups (and groups-of-groups) as `THREE.Group`s with stable paths — not a
flattened mesh soup, so a "table" or "car" can be addressed and animated as a unit. Today
`resolveInstances` flattens `ref`s at render; keeping the structure is a Track SET / renderer
change, not an AI-surface change.

## Phases

- **P0 — AI Draft grammar + projection (no LLM).** ✅ Done — `AI_DRAFT_JSON_SCHEMA` +
  `normalizeAIDraft`, `toAIDraft`/`fromAIDraft`, `applyDraft`, and the `SketcherDraft`
  enrichment (part names, group id/name, primitive `size`) are all landed and tested.
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
