# Directionally — AI-Assisted Asset Generation Roadmap

Not scheduled work. Parked here so the design isn't lost. This document covers the
**provider side** only: how an LLM turns a free-text descriptor into the schema-validated JSON
the [Authoring API](ROADMAP_API.md) consumes. The authoring surface itself — the verbs
(`describe`/`preview`/`create`/`bind`/`make`), the schemas, and the headless apply path — lives
in [ROADMAP_API.md](ROADMAP_API.md); this document is deliberately subordinate to it and must
not drift from it.

**Scope — asset design only, never script content.** AI here helps a script writer *visualise*
their production by designing **characters and sets**. It does not, and deliberately will not,
generate the creative content of the production itself — there is **no script API** by design,
and none is planned in this roadmap.

**Current state.** The authoring surface the AI feeds — the verbs, the two JSON schemas, their
normalisers, and `make`'s create-or-resume + bind — is already implemented in `src/core/agent/`
(see ROADMAP_API.md). Everything below is `make`'s one missing step: the free-text → document
(LLM) step, which is this document's territory.

**Early-skeleton goal.** Before any identity/billing work, prove the AI is a useful accelerator:
e.g. DeepSeek reliably turns "a middle-aged woman" and "a classroom" into valid documents. This
is exercised by `yarn agent:experiment` (scripts/agentExperiment.ts) against a dev
`DEEPSEEK_API_KEY`. Identity, auth, and billing for the deployed tool are deliberately deferred —
success here is the *motivation* to solve them, not a prerequisite.

**Finding (DeepSeek).** Both kinds generate and validate: a character descriptor yields a valid
`CharacterSpec`, and a setting descriptor yields a valid, coherent `compose` scene (floor, walls,
furniture, lights). Rough edges to resolve when generation is wired into the app:
- Colour fields sometimes invent a plausible-but-unlisted hex rather than a listed swatch — if
  fidelity matters, tighten `hairColor`/`eyeColor` to label-or-hex (`oneOf`, like `skinTone`).
- The setting prompt has no catalogue context, so `environmentId`/`ref` values can be
  hallucinated — inject `describe_catalogue` output into the prompt during orchestration.

## Implementation checklist — the walking skeleton

The phases below are ordered as a **walking skeleton**: get the smallest end-to-end slice
working (one provider → one asset kind → one `make` call that turns a text descriptor into a
bound, renderable asset), then broaden to the second asset kind, then harden, then let users
plug in their own model. Each tick maps to the phase section of the same name further down; it
is a visible checkpoint, with no hidden work behind it.

### Walking skeleton — minimal end-to-end (character)

- [x] **AI-0 · Provider interface** — define `AIProvider.generate(systemPrompt, userPrompt, jsonSchema)` and a first adapter (`DeepSeekProvider`, OpenAI-wire-compatible, zero Azure spend). A `make` call returns *some* JSON from the model.
- [ ] **AI-0 · Default backend** — provision Azure OpenAI + `AzureOpenAIProvider` as the shipped default; swapping providers is a config value, not a route/schema change.
- [ ] **AI-1 · Character generation** — system prompt embeds `CHARACTER_JSON_SCHEMA`; the model emits a `CharacterSpec`; the server clamps it via `validateCharacterSpec`. `make("character", "BERNARD", "middle-aged portly gentleman…")` returns a bound, rebuildable character.
- [ ] **AI-3 · Wire the LLM into `make`** — the free-text → document step joins the existing `make` (describe → create → bind), idempotent by name. The name flips `UNRESOLVED`/`AMBIGUOUS` → `BOUND` in the Roster with no page reload.

### Broaden — scenery parity

- [ ] **AI-2 · Scenery generation** — same path for `SET_PIECE_JSON_SCHEMA` (`SettingSpec`) → `normalizeSetPieceInput`. `make("setting", "PUB", "traditional English pub…")` returns a bound, resolvable setting.

### Harden

- [ ] **AI-4 · Validation & cost** — schema validation (Zod or equivalent), retry-once-on-invalid-JSON, per-session/per-IP rate limit. Malformed output never reaches the renderer; rapid "regenerate" clicks are throttled with a visible message.

### Production posture *(only if this graduates past POC)*

- [ ] **AI-5 · Production** — split the AI proxy into its own Azure Function App (Flex Consumption); Azure OpenAI key → Key Vault via Managed Identity; Application Insights on latency / error / validation-failure rate.

### Provider flexibility

- [ ] **AI-6 · BYOK** — `ClaudeProvider` (native Messages API + `tool_choice`), an "AI Settings" panel, per-request key header, and a cost/latency disclaimer. The zero-config default stays unchanged.
- [ ] **AI-7 · Local models** — `OllamaProvider`, an "Ollama (local)" option, server-proxied + client-direct (`OLLAMA_ORIGINS`) paths, and the validation module shared client-side.

---

## Why this is possible cheaply

Both asset creators in this app are **parametric, not freeform mesh editors** — a fact that
changes what "AI generates a 3D asset" needs to mean here. Crucially, the AI targets the
**high-level semantic schemas**, never the low-level engine parameters:

- **Character** (`CharacterSpec`): a small, all-optional, natural-language-friendly JSON —
  `height`, `build`, `muscularity`, `age`, `feminineMasculine`, `skinTone`, `hairColor`,
  `hairGreying`, `eyeColor`, `outfit`. The app maps this down to bone/ring params
  (`semanticToBoneParams`/`semanticToRingParams`) at build time — the LLM never emits a
  per-bone radius.
- **Scenery** (`SettingSpec` / `NewProceduralSetPiece`): a compositional document — `floor`,
  `backdrops`, `props` (catalogue `ref`s or inline primitives), `lights`, `environment`. The
  app resolves it to geometry at render time — the LLM never hand-places a primitive.

So "AI generates a starting asset" reduces to **an LLM producing JSON that validates against
a schema Directionally already has code to render** — a schema-constrained text-to-JSON task,
not text-to-3D. This avoids needing a hosted generative-mesh/diffusion model, GPU inference
infrastructure, or an unvalidatable binary blob landing in the catalogue. It is also the only
approach consistent with the Roadmap Principle in `ROADMAP.md`: *"Nothing is ever guessed... No
heuristic parsing... every mutation is validated before it reaches the domain model."* An LLM
response that must pass schema validation before touching the renderer honours that; a
generated mesh that can't be validated does not.

A full text-to-mesh path is explicitly **out of scope** for this roadmap — a diffusion-generated
GLB can't be schema-validated and wouldn't match the Mixamo bone-naming convention the bundled
animation library depends on (the sketcher roadmap already defers VRM/Ready Player Me retargeting
for the analogous reason).

---

## Where this attaches

The AI draft no longer lands in a blank editor. It lands through the
[Authoring API](ROADMAP_API.md)'s `make` verb: `describe_script` tells the model which cast names
and settings are `UNRESOLVED`/`AMBIGUOUS`, the model emits a `CharacterSpec`/`SettingSpec`
document, and `create` + `bind` persist it and wire it to the script name — the same
`castBindings`/`settingBindings` the Roster tab edits. Unique matches auto-snapshot into a
binding; ambiguous names surface a diagnostic the user resolves once.

The interactive `/character` and `/sketch` editors remain as an optional *refinement* surface —
`make` can return a preview instead of committing — but they are no longer a mandatory gate the
draft must pass through.

---

## Architecture

```
Client (browser, agent, CLI, or test harness)
  │
  │  POST /agent/make { kind, name, description }   (see ROADMAP_API.md)
  ▼
SvelteKit +server.ts route (bundled into the existing Azure Function via
svelte-adapter-azure-swa — no new Azure resource required for a v1)
  │
  │  1. describe_script → which cast names/settings are UNRESOLVED/AMBIGUOUS.
  │  2. Build a system prompt embedding the *actual* schema —
  │     CHARACTER_JSON_SCHEMA (CharacterSpec) or SET_PIECE_JSON_SCHEMA
  │     (SettingSpec) — so the model only proposes values the app can
  │     validate and render.
  │  3. Call the configured AIProvider adapter with JSON-schema-constrained
  │     ("structured outputs" / tool-forcing) response mode — see "Provider
  │     flexibility" below for what backs this by default vs. by choice.
  ▼
AIProvider adapter (pluggable — Azure OpenAI by default; DeepSeek, Claude, or
a local Ollama model when configured; see "Provider flexibility" below)
  │
  │  4. Returns JSON matching the requested schema.
  ▼
Server route (same +server.ts)
  │
  │  5. Validate + clamp (normalizeSetPieceInput / validateCharacterSpec);
  │     retry once on schema violation or unknown enum values.
  │  6. create → persist the spec as a catalogue entry (not a baked GLB);
  │     bind → write castBindings/settingBindings; return
  │     { entry, boundTo, warnings }.
  ▼
Client — the script placeholder resolves via the existing CAT-4 recompile loop;
the Roster tab now shows the name as BOUND, with Edit/Rebind/Rename available.
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
/agent/make  (the AI step inside it — see ROADMAP_API.md)
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
  browser calls `/agent/make` as today; the server route forwards to whichever provider is
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
| Integration point | `make` → `create` + `bind` on the Authoring API, surfacing in the Roster tab | Same flow as the human-facing Roster (Edit/Rebind/Rename); no parallel AI-only pathway |
| Applied via | `create` persists the validated spec to the catalogue (no GLB) and `bind` writes the script name→id binding | Headless by default; the interactive editor is optional refinement |

---

## Phase AI-0 — Provider adapter interface

- Define the `AIProvider` interface (`generate(systemPrompt, userPrompt, jsonSchema):
  Promise<unknown>`) up front, before wiring any single backend — this is what keeps every later
  phase (BYOK, local models) a small additive adapter rather than a rework.
- Implement a `DeepSeekProvider` first for development: fully OpenAI-wire-compatible, near-zero
  cost, no Azure resource required to start iterating. Use an existing DeepSeek key for local dev.
- Wire it into the Authoring API's `make` verb as an optional step (build the
  `CharacterSpec`/`SettingSpec` document from the free-text descriptor); no schema validation yet
  — proves the wiring end-to-end before hardening.
- Provision the Azure OpenAI Service resource + `AzureOpenAIProvider` adapter once the DeepSeek
  path is proven — same interface, swapped in as the shipped default (see Decisions: "AI backend
  (default)"). Store the key as an Azure Static Web Apps application setting.

Exit criteria: a `make` call with a text descriptor returns *some* JSON from the model against
the DeepSeek adapter using an existing key at zero incremental Azure cost; swapping the configured
provider to `AzureOpenAIProvider` requires no route or schema changes, only a config value.

## Phase AI-1 — Character document generation

- The generation target is `CHARACTER_JSON_SCHEMA` (`CharacterSpec`) from ROADMAP_API.md, not
  raw `BoneParamMap`/`FaceParams` — the LLM fills the high-level semantic surface, and the app
  maps it down to bone/ring params at build time.
- System prompt embeds the schema's field names, enums, and safe ranges (e.g. `build` ±1,
  `feminineMasculine` ±1, and the `SKIN_TONES`/`HAIR_COLORS`/outfit choices).
- Server validates/clamps via `validateCharacterSpec` before persisting.
- `create_character` stores the resolved spec as a catalogue entry (no GLB); `bind` wires it to a
  script name.

Exit criteria: `make("character", "BERNARD", "middle-aged portly gentleman…")` returns a bound
catalogue character whose spec is valid and rebuildable at scene load.

## Phase AI-2 — Scenery document generation

- The generation target is `SET_PIECE_JSON_SCHEMA` (`SettingSpec`/`NewProceduralSetPiece`) from
  ROADMAP_API.md, not a batch of `CartoonSketcher` primitive commands — the LLM composes a
  declarative document (`floor`/`props`/`lights`/`environment`), and the app resolves it at
  render time.
- Server validates/clamps via `normalizeSetPieceInput` before persisting.
- `create_setting` persists the document (reusing `createSetPiece`); `bind` wires it to a
  `#setting` name.

Exit criteria: `make("setting", "PUB", "traditional English pub…")` returns a bound, resolvable
setting whose document validates.

## Phase AI-3 — `make` orchestration

- `make` (describe → create → bind, idempotent by name) already exists in `src/core/agent/api.ts`;
  this phase wires the LLM step in front of it — build/resolve the document from the free-text
  descriptor — without touching the existing create-or-resume + bind path.
- Confirm the Roster tab reflects the result immediately: the name flips from `UNRESOLVED`/
  `AMBIGUOUS` to `BOUND`, with Edit/Rebind/Rename available — no special-casing needed downstream.

Exit criteria: an `UNRESOLVED` name like `Sanders` in the script can be turned into a bound,
resolvable character with a single `make` call, visible in the Roster without a page reload.

## Phase AI-4 — Validation & cost hardening

- Add Zod (or equivalent) schema validation in place of manual guards from AI-0/AI-1/AI-2.
- Add a retry-once-on-invalid-JSON policy.
- Add a per-session/per-IP rate limit on the AI step inside `make` so repeated "regenerate" clicks
  don't run away Azure OpenAI spend.

Exit criteria: malformed model output never reaches the renderer/catalogue un-clamped; a burst
of rapid regenerate clicks is throttled with a visible message, not a silent cost spike.

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
  except as a per-request header to the app's own `/agent/make` proxy.
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

- **Script/content generation** — there is deliberately no script API. AI proposes only the
  *asset* layer (characters and sets); the script's dialogue, action, and story are authored by
  the writer and never generated here.
- Text-to-mesh / diffusion-generated GLBs — unvalidatable output, breaks the Mixamo
  bone-naming convention the animation library depends on.
- A direct browser → Azure OpenAI network call using the app owner's key — the server proxy
  boundary is not optional for the default/BYOK-remote path (see AI-7 for the one narrow
  exception: a user's own fully-local model, which the server genuinely cannot reach).
- Unvalidated AI output reaching the catalogue — every `create` passes the schema normaliser
  (`normalizeSetPieceInput`/`validateCharacterSpec`) before it can touch the renderer.
- Server-side storage of user-supplied BYOK keys — forwarded per-request only, never persisted.

---

## Relevant skills when picked up

`azure-ai` / `microsoft-foundry` (Azure OpenAI / Azure AI Foundry provisioning),
`entra-app-registration` (Managed Identity for AI-5), `appinsights-instrumentation`
(AI-5 telemetry).
