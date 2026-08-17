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
  │  5. Calls the configured AIProvider adapter with JSON-schema-constrained
  │     ("structured outputs" / tool-forcing) response mode — see "Provider
  │     flexibility" below for what backs this by default vs. by choice.
  ▼
AIProvider adapter (pluggable — Azure OpenAI by default; DeepSeek, Claude, or
a local Ollama model when configured; see "Provider flexibility" below)
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

**No direct browser-to-your-Azure-key link, ever.** The client never holds *your* API key; it
only talks to the app's own server route by default. This is the answer to "what would the
end-user link to AI be?" — for the default (vanilla) experience there isn't one; there's a
server-side proxy boundary, the same kind of boundary `compileScriptDocument()` already is for
script parsing. Advanced users can opt into supplying their own key or their own local model —
see "Provider flexibility" immediately below for how that stays safe.

---

## Provider flexibility — dev without spend, BYOK, and local models

### Motivation

Three real needs, all solved by the same design:

1. **Development and testing without incurring Azure OpenAI cost.** A developer working on this
   feature locally shouldn't need to spend money against Azure just to iterate.
2. **Advanced end users bringing their own AI account.** Someone who already pays for DeepSeek,
   OpenAI, or Claude API access shouldn't be forced through the app owner's Azure bill.
3. **Fully local / offline / zero-cost generation.** A privacy-conscious or offline user should
   be able to point the app at a model running on their own machine (Ollama, LM Studio) with no
   API key and no network call leaving their machine at all (beyond the one hop to the local
   server on `localhost`).

### Confirmed provider compatibility (checked directly, not assumed)

| Provider | Wire format | Structured JSON output | Cost for this use case |
|---|---|---|---|
| **Azure OpenAI** | Native OpenAI Chat Completions | `response_format: json_schema`, fully supported | Pay-per-token, cheap on a small-schema chat model |
| **DeepSeek** | Fully OpenAI-compatible (`base_url: https://api.deepseek.com`) — an official Anthropic-compatible endpoint also exists (`/anthropic`) | Native "JSON Output" mode, fully supported | Very cheap — a small-schema single-call generation costs fractions of a cent |
| **Claude (Anthropic)** | Has an OpenAI-compat shim, **but it explicitly ignores `response_format`** ("For JSON output, use Structured Outputs with the native Claude API") | Not via the OpenAI shim — use the **native Messages API** with `tool_choice` forcing a single tool whose `input_schema` is the target schema; Claude reliably fills that schema as a "tool call" | Pay-per-token via user's own key |
| **Ollama (local)** | OpenAI-compatible `/v1/chat/completions` out of the box | Native `/api/generate`/`/api/chat` accepts a `format` field that takes a full JSON Schema for constrained output | Free — runs on the user's own hardware |

This confirms the design is workable exactly as hoped: DeepSeek and Ollama are close to drop-in
replacements for Azure OpenAI (same wire format, same `response_format`/`format` JSON-schema
mechanism); Claude needs a distinct adapter path (native Messages API + tool-forcing) rather than
its OpenAI-compat shim, since that shim doesn't support structured output.

### Architecture: a pluggable `AIProvider` adapter

```
/api/generate/character, /api/generate/scenery  (unchanged endpoints)
              │
              ▼
   AIProvider interface: generate(systemPrompt, userPrompt, jsonSchema) → Promise<unknown>
              │
   ┌──────────┼──────────┬──────────────┬─────────────────────┐
   ▼          ▼          ▼              ▼                     ▼
Azure      DeepSeek    Claude        Ollama              (future) any
OpenAI     Provider    Provider      Provider            OpenAI-wire-
Provider   (OpenAI-    (native       (OpenAI-compat or   compatible
(default,  compat,     Messages,     native /api/        endpoint a
server-    server-or-  tool_choice   generate with        user points
held key)  user key)   forcing)      format:json)         at directly
```

Each adapter implements the same one-method interface. **Schema validation and clamping (Phase
AI-4) stays provider-agnostic and runs identically after any adapter returns** — the app never
trusts one provider's output more than another's; a malformed response gets clamped or rejected
the same way whether it came from Azure, DeepSeek, Claude, or a small local model.

### Two request paths — server-proxied vs. client-direct

- **Server-proxied (default and recommended for Azure/DeepSeek/Claude/BYOK-remote):** the
  browser calls `/api/generate/*` as today; the server route forwards to whichever provider is
  configured. Keeps validation/clamping in one place; avoids CORS entirely; works for any
  provider reachable from the server, including an Ollama instance running on the *same host* as
  the server itself.
- **Client-direct (needed only for Ollama/LM Studio running on the *user's own machine* while
  the app is hosted on Azure):** a server-side Azure Function cannot reach `http://localhost:11434`
  on a user's laptop, so this one case requires the browser to call the local model directly.
  This needs the user to set `OLLAMA_ORIGINS` (Ollama has no CORS allowance by default) — an
  accepted one-time setup cost for this specific, fully-local configuration. Validation/clamping
  logic must then also be reachable client-side (a shared module, not duplicated).

### The three user-facing tiers

| Tier | Config required | Cost | Path used |
|---|---|---|---|
| **Default (vanilla)** | None — works out of the box | App owner's Azure OpenAI spend (small, cheap model, small schema) | Server-proxied → Azure OpenAI |
| **BYOK** | User pastes their own DeepSeek/OpenAI/Claude key into an "AI Settings" panel | User's own account | Server-proxied → user's chosen provider, using their key for that request only |
| **Local model** | User points the app at their own Ollama/LM Studio endpoint | Free | Server-proxied if reachable from the server host; client-direct if the model runs on the user's own machine |

BYOK/local config lives exactly where every other per-user setting in this app already lives —
`localStorage`/IndexedDB (the same pattern as `CharacterDesignStore`/`OPFSCatalogueStore`), never
a server-side account/database, since this app has none. A user's key is sent per-request (e.g.
a request header) to the proxy route, forwarded to their chosen provider, and never written to
server-side storage or logs.

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Generation target | Schema-constrained JSON parameters, not mesh/GLB generation | Both creators are parametric; validated JSON is the only output type consistent with the Roadmap Principle (never guessed, always validated before touching the domain model) |
| AI backend (default) | Azure OpenAI Service (chat model, structured outputs) | Already deployed to Azure; no new infra category; cheap enough for parameter-guessing use |
| AI backend (pluggable) | `AIProvider` adapter interface — Azure OpenAI, DeepSeek, Claude, or Ollama behind one `generate(prompt, schema)` method | Lets development/testing avoid Azure spend (DeepSeek/Ollama), lets advanced users BYOK or run fully local, with zero change to the rest of the pipeline |
| Client/AI boundary | Server-side proxy route by default, key never reaches the browser unless the user explicitly supplies their own | Standard secret-handling; consistent with "nothing guessed client-side" principle; BYOK keys are forwarded per-request only, never persisted server-side |
| Integration point | Extends CAT-4's "Create real asset" bridge | Reuses an already-planned flow instead of a parallel AI-only pathway |
| Applied via | Same Command/export pipeline as manual authoring (`SketcherDocument.execute()`, `OPFSCatalogueStore`) | Undoable; AI draft is indistinguishable from manual work to the rest of the app |

---

## Phase AI-0 — Provider adapter interface + proxy route scaffold

- Define the `AIProvider` interface (`generate(systemPrompt, userPrompt, jsonSchema):
  Promise<unknown>`) up front, before wiring any single backend — this is what keeps every later
  phase (BYOK, local models) a small additive adapter rather than a rework.
- Implement a `DeepSeekProvider` first for development: fully OpenAI-wire-compatible, near-zero
  cost, no Azure resource required to start iterating. Use an existing DeepSeek key for local dev.
- Add `src/routes/api/generate/character/+server.ts` and `.../scenery/+server.ts` as proxy
  routes: accept `{ name, descriptor }`, call the configured `AIProvider`, return raw JSON. No
  schema validation yet — proves the wiring end-to-end before hardening.
- Provision the Azure OpenAI Service resource + `AzureOpenAIProvider` adapter once the DeepSeek
  path is proven — same interface, swapped in as the shipped default (see Decisions: "AI backend
  (default)"). Store the key as an Azure Static Web Apps application setting.

Exit criteria: a POST with a text descriptor returns *some* JSON from the model against the
DeepSeek adapter using an existing key at zero incremental Azure cost; swapping the configured
provider to `AzureOpenAIProvider` requires no route or schema changes, only a config value.

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

## Phase AI-6 — BYOK (bring your own key)

- Add a `ClaudeProvider` adapter using the **native Messages API** with `tool_choice` forcing a
  single tool whose `input_schema` is the target schema — not the OpenAI-compat shim, which
  ignores `response_format` for structured output (confirmed against Anthropic's docs).
- Add an "AI Settings" panel (any page using generation) where a user can select a provider
  (Azure default / DeepSeek / OpenAI / Claude) and paste their own API key. Stored in
  `localStorage`, mirroring `CharacterDesignStore`'s persistence pattern — never sent anywhere
  except as a per-request header to the app's own `/api/generate/*` proxy.
- Proxy route reads the user-supplied provider/key header when present and uses it instead of
  the app owner's Azure default for that request only; falls back to the Azure default when
  absent so the vanilla zero-config path is completely unaffected.
- Add a visible cost/latency disclaimer in the AI Settings panel — the user's own key means
  the user's own billing, and this should be unambiguous in the UI.

Exit criteria: a user with no configuration gets the Azure default silently; a user who pastes a
DeepSeek or Claude key sees their own key used for generation (verifiable via that provider's own
usage dashboard), with zero Azure spend attributed to their requests.

## Phase AI-7 — Local model support (Ollama)

- Add an `OllamaProvider` adapter: OpenAI-compatible `/v1/chat/completions` for basic use, or the
  native `/api/generate`/`/api/chat` `format` field (accepts a full JSON Schema) for stronger
  constrained-output guarantees.
- AI Settings panel gains an "Ollama (local)" option with an endpoint URL field, defaulting to
  `http://localhost:11434`.
- Server-proxied path: works when the configured Ollama endpoint is reachable from the server
  (e.g. self-hosted deployments, or a server and Ollama on the same LAN/host).
- Client-direct path: when the app is Azure-hosted and Ollama runs on the *user's own machine*,
  the server cannot reach `localhost` on the user's laptop — the browser must call Ollama
  directly. Requires the user to set `OLLAMA_ORIGINS` (documented in-app, since Ollama has no
  CORS allowance by default) and requires the schema-validation/clamping module to be usable
  client-side (extract to a shared module rather than duplicating it).

Exit criteria: a user running `ollama pull llama3.2` locally, with `OLLAMA_ORIGINS` set, can
generate a character/scenery draft with zero API key, zero cost, and zero network call leaving
their machine beyond the local Ollama server.

---

## Explicitly out of scope

- Text-to-mesh / diffusion-generated GLBs — unvalidatable output, breaks the Mixamo
  bone-naming convention the animation library depends on.
- A direct browser → Azure OpenAI network call using the app owner's key — the server proxy
  boundary is not optional for the default/BYOK-remote path (see AI-7 for the one narrow
  exception: a user's own fully-local model, which the server genuinely cannot reach).
- Auto-applying an AI draft straight to the catalogue without a human tuning/export step —
  every generated asset still goes through the existing Export to Catalogue action.
- Server-side storage of user-supplied BYOK keys — forwarded per-request only, never persisted.

---

## Relevant skills when picked up

`azure-ai` / `microsoft-foundry` (Azure OpenAI / Azure AI Foundry provisioning),
`entra-app-registration` (Managed Identity for AI-5), `appinsights-instrumentation`
(AI-5 telemetry).
