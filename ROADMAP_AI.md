# Directionally — AI-Assisted Asset Generation Roadmap

Not scheduled work. Parked here so the design isn't lost, to be picked up once
[ROADMAP.md](ROADMAP.md)'s Track CAT / Track SCR reach completion — specifically after
**CAT-4** (the "Create real asset" bootstrapping bridge from a placeholder) exists, since
every phase below extends that flow rather than replacing it.

---

## Why this is possible cheaply

Both asset creators in this app are **parametric, not freeform mesh editors** — a fact that
changes what "AI generates a 3D asset" needs to mean here:

- **Character** (`src/core/character/ProceduralHumanoid.ts`): a character is a typed JSON
  object — `BoneParamMap` (per-bone tube/joint radii in cm, ±40% documented safe range),
  `BodyColors`, `FaceParams` (eye/nose/mouth/hair sliders), a height scale, and a fixed
  library of ~15 bundled Mixamo clips (`idle`, `walk`, `run`, `talk`, `wave`, …). The geometry
  is *computed* from these parameters by existing code — there is no mesh to generate.
- **Scenery** (`src/core/sketcher/CartoonSketcher.ts` + `AttachManager.ts`): a set is a list
  of primitives (box/sphere/cylinder/capsule/cone) with transform + colour/face-colour/texture,
  optionally grouped or attached via `AttachJoint`s. Again, structured data, not a mesh.

So "AI generates a starting asset" reduces to **an LLM producing JSON that validates against
a schema Directionally already has code to render** — a schema-constrained text-to-JSON task,
not text-to-3D. This avoids needing a hosted generative-mesh/diffusion model, GPU inference
infrastructure, or an unvalidatable binary blob landing in the catalogue. It is also the only
approach consistent with the Roadmap Principle in `ROADMAP.md`: *"Nothing is ever guessed... No
heuristic parsing... every mutation is validated before it reaches the domain model."* An LLM
response that must pass schema validation before touching `ProceduralHumanoid`/`SketcherPart`
honours that; a generated mesh that can't be validated does not.

A full text-to-mesh path is explicitly **out of scope** for this roadmap — a diffusion-generated
GLB can't be schema-validated and wouldn't match the Mixamo bone-naming convention the bundled
animation library depends on (the sketcher roadmap already defers VRM/Ready Player Me retargeting
for the analogous reason).

---

## Where this attaches to Track CAT

`ROADMAP.md`'s CAT-4 already specifies the bootstrapping bridge this depends on: each
unresolved-cast/unresolved-setting diagnostic (CAT-1/CAT-2) gains a "Create →" action that opens
`/character?prefillName=Sanders` or `/sketch?prefillName=...`, and the script view listens for
`BroadcastChannel('directionally-catalogue')`'s `catalogue-updated` message to auto-resolve the
placeholder once a matching-label asset is exported — with zero script edits. Everything below
pre-fills that flow with an AI first draft instead of opening it blank.

---

## Architecture

```
Browser (Azure Static Web Apps SPA)
  │
  │  1. CAT-1/CAT-2 diagnostic → "Create →" opens /character or /sketch,
  │     pre-seeded with ?prefillName=Sanders (existing CAT-4 plan)
  │  2. User adds a free-text descriptor in a "Generate with AI" box, e.g.
  │     "24yo rookie LA cop, athletic, dark hair in a bun, navy LAPD uniform"
  │     or "aircraft cabin, narrow aisle, rows of seats either side"
  │  3. POST { name, descriptor } to /api/generate/character or /api/generate/scenery
  ▼
SvelteKit +server.ts route (bundled into the existing Azure Function via
svelte-adapter-azure-swa — no new Azure resource required for a v1)
  │
  │  4. Server builds a system prompt embedding the *actual* schema:
  │     BONE_GROUPS keys + documented safe ranges, BodyColors fields,
  │     FaceParams fields, bundled clip names (character) — or the primitive
  │     kinds CartoonSketcher.insertPrimitive() accepts + transform/colour
  │     shape (scenery) — so the model only ever proposes values the app
  │     already knows how to render.
  │  5. Calls Azure OpenAI Service with JSON-schema-constrained
  │     ("structured outputs" / function-calling) response mode.
  ▼
Azure OpenAI Service (chat model, e.g. gpt-4o-mini — cheap, fast, sufficient
for parameter guessing; no self-hosted GPU inference infra needed)
  │
  │  6. Returns JSON matching the requested schema.
  ▼
Server route (same +server.ts)
  │
  │  7. Validates the JSON (Zod or manual guards) — clamps any numeric value
  │     to the documented safe bounds (e.g. bone scale ±40%), rejects/retries
  │     once on schema violation or unknown enum values.
  │  8. Returns the *validated* typed object to the client.
  ▼
Browser
  │
  │  9. Applies the result through the *same Command pipeline* a human uses —
  │     e.g. a batch of InsertPartCommand/ChangeColorCommand run through
  │     SketcherDocument.execute() for scenery, or a direct ProceduralHumanoid
  │     parameter set for the character page — so it's undoable (one Ctrl+Z
  │     removes the whole AI draft) and indistinguishable from manual
  │     authoring to the rest of the app.
  │  10. User tunes sliders/gizmos as normal, clicks "Export to Catalogue"
  │      (existing, unchanged flow) → OPFSCatalogueStore.add() →
  │      BroadcastChannel → script placeholder resolves automatically.
```

**No direct browser-to-AI-vendor link, ever.** The client never holds an API key; it only
talks to the app's own server route. This is the answer to "what would the end-user link to AI
be?" — there isn't one; there's a server-side proxy boundary, the same kind of boundary
`compileScriptDocument()` already is for script parsing.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Generation target | Schema-constrained JSON parameters, not mesh/GLB generation | Both creators are parametric; validated JSON is the only output type consistent with the Roadmap Principle (never guessed, always validated before touching the domain model) |
| AI backend | Azure OpenAI Service (chat model, structured outputs) | Already deployed to Azure; no new infra category; cheap enough for parameter-guessing use |
| Client/AI boundary | Server-side proxy route only, key never reaches the browser | Standard secret-handling; consistent with "nothing guessed client-side" principle |
| Integration point | Extends CAT-4's "Create real asset" bridge | Reuses an already-planned flow instead of a parallel AI-only pathway |
| Applied via | Same Command/export pipeline as manual authoring (`SketcherDocument.execute()`, `OPFSCatalogueStore`) | Undoable; AI draft is indistinguishable from manual work to the rest of the app |

---

## Phase AI-0 — Azure OpenAI provisioning + proxy route scaffold

- Provision an Azure OpenAI Service resource + one chat model deployment (e.g. `gpt-4o-mini`).
- Store the key as an Azure Static Web Apps application setting (hidden secret in the Portal).
- Add `src/routes/api/generate/character/+server.ts` and `.../scenery/+server.ts` as bare
  proxy routes: accept `{ name, descriptor }`, call Azure OpenAI, return raw JSON. No schema
  validation yet — proves the wiring end-to-end before hardening.

Exit criteria: a POST with a text descriptor returns *some* JSON from the model, visible in
a manual `curl`/Postman check; no UI wiring required yet.

## Phase AI-1 — Character parameter generation

- Define the JSON schema for the character-generation response: a subset of `BoneParamMap`
  keys (from `BONE_GROUPS`), `BodyColors`, `FaceParams`, plus a `defaultAnimation` chosen from
  the bundled clip list.
- System prompt embeds the real field names, units (cm), and the ±40% safe bone-scale range
  documented in `SKETCHER_ROADMAP.md`'s CB1.
- Server route validates/clamps the response before returning it.
- `/character` page gains a "Generate with AI" input; submitting applies the returned
  parameter set to the current `ProceduralHumanoid` instance (same code path the sliders use),
  then leaves the user in the normal tuning UI.

Exit criteria: typing `"24yo rookie LA cop"` and generating produces a humanoid with
plausible build/colour/hair choices, fully editable afterward via existing sliders, and
undoable as a single step.

## Phase AI-2 — Scenery parameter generation

- Define the JSON schema for the scenery-generation response: an array of primitive
  descriptors (kind, transform, colour, optional face colours/textures) matching what
  `CartoonSketcher.insertPrimitive()` + `ChangeColorCommand`/`ChangeFaceColorCommand` accept,
  optionally with `AttachJoint` pairs for assemblies.
- Server route validates each primitive's kind against the known enum and clamps transform
  values to sane bounds (e.g. no zero/negative scale).
- `/sketch` page gains the same "Generate with AI" input; submitting runs a batch of
  `InsertPartCommand`/`ChangeColorCommand`/etc. through `SketcherDocument.execute()` so the
  whole draft is one undo step.

Exit criteria: typing `"aircraft cabin"` and generating produces a rough primitive layout
(seat blocks, aisle, wall panels) in the sketcher, undoable as one step, further editable with
existing gizmo/colour/group tools.

## Phase AI-3 — CAT-4 integration

- Wire AI-1/AI-2 into the actual CAT-4 "Create →" flow: the pre-filled name from
  `?prefillName=` also pre-fills the AI descriptor box (or auto-generates a first draft
  immediately on page load, no extra click).
- Confirm the `BroadcastChannel('directionally-catalogue')` auto-resolve behaviour works
  identically whether the exported asset originated from manual authoring or an AI draft —
  no special-casing needed downstream.

Exit criteria: type `Sanders` in the script, click Create →, land on `/character` with an
AI-generated rookie-cop draft already applied and ready to tune/export — zero blank-page start.

## Phase AI-4 — Validation & cost hardening

- Add Zod (or equivalent) schema validation in place of manual guards from AI-0/AI-1/AI-2.
- Add a retry-once-on-invalid-JSON policy.
- Add a per-session/per-IP rate limit on `/api/generate/*` so repeated "regenerate" clicks
  don't run away Azure OpenAI spend.

Exit criteria: malformed model output never reaches `ProceduralHumanoid`/`SketcherDocument`
un-clamped; a burst of rapid regenerate clicks is throttled with a visible message, not a
silent cost spike.

## Phase AI-5 — Production posture *(only if this graduates past POC)*

- Split the AI proxy into its own Azure Function App (Flex Consumption) so it scales/fails
  independently of the SvelteKit SSR function.
- Move the Azure OpenAI key into Azure Key Vault, referenced via the Function App's Managed
  Identity (SWA's built-in Functions integration doesn't support Managed Identity; a standalone
  Function App does).
- Wire Application Insights around latency, error rate, and schema-validation-failure rate.

Exit criteria: AI proxy failures/latency are visible in Application Insights; the Azure OpenAI
key is not present in any application setting, only in Key Vault.

---

## Explicitly out of scope

- Text-to-mesh / diffusion-generated GLBs — unvalidatable output, breaks the Mixamo
  bone-naming convention the animation library depends on.
- Any direct browser → Azure OpenAI network call — the server proxy boundary is not optional.
- Auto-applying an AI draft straight to the catalogue without a human tuning/export step —
  every generated asset still goes through the existing Export to Catalogue action.

---

## Relevant skills when picked up

`azure-ai` / `microsoft-foundry` (Azure OpenAI / Azure AI Foundry provisioning),
`entra-app-registration` (Managed Identity for AI-5), `appinsights-instrumentation`
(AI-5 telemetry).
