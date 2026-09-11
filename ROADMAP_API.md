# Directionally — Authoring API Roadmap

The machine-facing surface through which an AI agent (or a human client) can
discover, preview, create, and bind catalogue assets — **characters** and
**scenery** — against a production's script. Deliberately **declarative** (one
full JSON document per creation), not a granular CRUD API.

Status: the verbs `describe_catalogue`, `describe_script`, `bind`, `create_setting`,
`create_character`, and `make` are implemented as **client-side core functions**
in `src/core/agent/api.ts` (the stateful surface lives in the browser — productions
in IndexedDB, catalogue in OPFS — so it's functions, not HTTP routes). The
stateless `preview` verbs exist as `/agent/character` + `/agent/setting`, and
`toolManifest()` (API-4) exposes the verb list + schemas as provider tool
definitions. Remaining: `make`'s free-text → document step (the LLM,
ROADMAP_AI.md's territory).

---

## Why a dedicated API, not just "AI generation"

[ROADMAP_AI.md](ROADMAP_AI.md) covers the *provider* side — an LLM producing
schema-validated JSON for a starting asset. This document covers the **data
contract + apply path** that generated JSON lands on: a stable, versioned,
callable surface that a machine or a human client can drive without the Three.js
runtime or the Svelte UI. Keeping the two separate means the API can be exercised
by a test harness, a CLI, or a non-LLM client, and the LLM part can be swapped or
removed without changing the surface.

---

## Current state

| Verb | Purpose | Today |
|---|---|---|
| `preview_character` | resolve `CharacterSpec` → build params (no persist) | ✅ `POST /agent/character` |
| `preview_setting` | resolve `SettingSpec` → scene (no persist) | ✅ `POST /agent/setting` |
| `create_setting` | validate + persist a full setting document | ⚠️ core `createSetPiece` only (no HTTP) |
| `create_character` | validate + persist a full character document | ❌ |
| `describe_catalogue` | list entries (`id`, `label`, `kind`, `isSetting`, summary) | ❌ |
| `describe_script` | cast + settings + resolution status | ❌ |
| `bind` | point a script name at a catalogue id | ⚠️ UI only (Roster / Catalogue panel) |
| `make` | describe → create → bind, idempotent | ❌ |

The asymmetry to close: **scenery can be created headlessly (it's procedural
primitives); characters cannot (they're GLB-backed and built only in the browser).**

---

## Design principles

1. **Declarative, not procedural.** Creation is a single document, never a script
   of `add-prop`/`add-light` calls. Granularity lives *inside* the document (the
   `compose`/`props`/`lights` arrays), not in the verb set.
2. **Names for humans, ids for machines.** The script keeps human labels
   (`@BOB`, `#INT PUB DAY`); the API binds those labels to stable catalogue ids.
   See [ROADMAP_CATALOGUE.md](ROADMAP_CATALOGUE.md).
3. **Discovery → preview → commit.** The AI must be able to *see* the world
   before changing it, and *preview* before persisting.
4. **Persist the description, build at render time.** A catalogue entry is a
   validated spec, not a baked asset; the renderer materialises it on load. This
   is what makes both kinds creatable without the runtime.
5. **Idempotent create-or-update.** Creating "PUB" twice must not duplicate; a
   repeat `create` with the same name/`sourceAssemblyId` updates in place.
6. **One shape for both kinds.** Character and scenery documents validate,
   persist, and bind through the same path, differing only in schema.

---

## The surface (verbs)

```
Read
  describe_catalogue() -> CatalogueEntry[]              # GET /agent/catalogue
  describe_script()    -> { cast, settings, bindings }  # GET /agent/script

Preview (no side effects — both already exist)
  preview_character(spec)  -> ResolvedCharacter         # POST /agent/character
  preview_setting(spec)    -> ResolvedSetting           # POST /agent/setting

Commit
  create_setting(document)   -> CatalogueEntry          # POST /agent/setting/create
  create_character(document) -> CatalogueEntry          # POST /agent/character/create

Bind (name -> id)
  bind(kind, name, catalogueId) -> ok                   # POST /agent/bind

Orchestrate (the common "make this" path)
  make(kind, name, description) -> { entry, boundTo, warnings }
                                                        # POST /agent/make
```

- `create_*` accepts an optional `bindTo: { kind, name }` so the common
  "create **and** wire it to this script name" is one call, not two.
- `make` = `describe` → resolve/build document (optionally via an LLM) →
  `create` → `bind`, returning the created id and the name it now resolves to.
  Idempotent by `name` (resume an existing same-named asset rather than minting
  a duplicate — the N11 concern in the sketcher roadmap).

---

## The character unlock: persist the spec, not the GLB

Characters are GLB-backed today, so `create_character` cannot run headlessly. The
fix that makes characters symmetric with scenery:

> **Store the resolved character *spec*** (`ringParams`/`boneParams`/face/outfit
> plus the original `CharacterSpec`) **as the catalogue entry**, and rebuild the
> mesh from that spec at scene-load time.

This mirrors how scenery already stores `geometry`/`compose`/`material` and
expands at render (`expandEntry`). It gives headless creation,
spec-as-source-of-truth editability, and removes the browser Three.js export as a
prerequisite for the API. GLB export becomes a caching/portability step, not a
correctness requirement.

---

## Contracts (JSON Schemas)

- `SET_PIECE_JSON_SCHEMA` — **exists** (`src/core/setting/authoringApi.ts`),
  already the validated contract for scenery. Covers leaf / composite / whole
  setting (`compose` + `lights` + `environmentId`) and `isSetting`.
- `CHARACTER_JSON_SCHEMA` — **new**, mirroring it: `CharacterSpec`
  (`height/build/muscularity/age/feminineMasculine`, `skinTone`, `hairColor`,
  `hairGreying`, `eyeColor`, `outfit`) plus a `label`.

Both are already JSON-serialisable and have normalisers
(`normalizeSetPieceInput` / `validateCharacterSpec`). Exposing these as tool
definitions (OpenAI `input_schema` / Anthropic `tool_choice`) is a thin wrapper
over the schemas — the contracts *are* the grammar handed to the AI.

---

## Phases

### API-0 — Discovery (read-only)

- `GET /agent/catalogue`: list all entries — `id`, `label`, `kind`, `isSetting`,
  and a one-line summary (e.g. `"wood table (set-piece, component)"`).
- `GET /agent/script`: the active production's cast + unique settings, each with
  resolution status (`BOUND(<id>)` / `UNRESOLVED` / `AMBIGUOUS(n)`).

Exit: an agent can answer "what already exists?" and "what still needs making?"
with zero side effects.

### API-1 — Scenery create + bind over HTTP

- Wrap `createSetPiece` as `POST /agent/setting/create`.
- `POST /agent/bind` writes `castBindings`/`settingBindings` (uppercase name →
  catalogue id), triggering the existing CAT-4 recompile loop.
- `create_*` gains `bindTo`.

Exit: an agent can create a procedural setting and wire it to a `#setting` name
end-to-end over HTTP.

### API-2 — Character create (persist the spec)

- Add `createCharacter` (mirror of `createSetPiece`) storing the resolved spec
  as a catalogue entry (no GLB required).
- `POST /agent/character/create`.
- Scene-load path rebuilds the humanoid from the stored spec.

Exit: `BERNARD` (or any `CharacterSpec`) can be created and bound headlessly,
symmetric with scenery.

### API-3 — `make` orchestration

- `POST /agent/make`: `describe` → build/resolve the document (optionally calling
  the configured LLM) → `create` (or resume by name) → `bind` → return
  `{ entry, boundTo, warnings }`.

Exit: a single call turns "make PUB" / "make BERNARD" into a bound, resolvable
asset, with no knowledge of the underlying verbs required.

### API-4 — Tool manifest

- Emit the verb list + schemas as provider tool definitions (OpenAI/Anthropic),
  so an agent is *handed* the grammar rather than discovering it.
- Thin, read-only derivation from the schemas in the Contracts section.

---

## Explicitly out of scope

- **Granular CRUD** (query-place-prop, add-light as separate verbs) — creation
  stays a single validated document.
- **Text-to-mesh / diffusion GLBs** — unvalidatable, breaks the Mixamo convention
  (see ROADMAP_AI.md).
- **Provider orchestration, BYOK, rate limits** — that lives in ROADMAP_AI.md,
  not here.
- **Auto-apply without review** — `make` may *propose* and return a preview;
  committing is an explicit `create`.

---

## Cross-references

- [ROADMAP_AI.md](ROADMAP_AI.md) — the LLM/providers that feed these endpoints.
- [ROADMAP_CATALOGUE.md](ROADMAP_CATALOGUE.md) — names vs ids; the binding layer `bind` writes into.
- [ROADMAP.md](ROADMAP.md) — Track CAT (resolve/bind/auto-resolve) and the
  "Create →" bootstrapping bridge this surface replaces with a programmatic path.

