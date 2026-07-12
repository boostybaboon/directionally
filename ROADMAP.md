# Directionally — Roadmap (Treatment-Driven Workflow)

Completed and superseded phases live in [ROADMAP_ARCHIVE.md](ROADMAP_ARCHIVE.md).

## Vision

Directionally should let a creator start from a treatment and reach a playable first pass quickly,
then iterate through structured refinement passes without expert-level setup.

Primary loop:

1. Write treatment / scene intent.
2. Compile to a first-pass production.
3. Refine staging, timing, animation, and voice.
4. Recompile safely without losing deliberate manual edits.

---

## Roadmap Principle

API-first semantics, thin UX seam now, broader UX rework later.

- The compiler contract is the source of truth.
- Natural-language and FDX adapters compile into the same canonical beat model.
- Existing timeline/staging tooling remains available as a refinement surface.

---

## Data Contract (Locked)

Directionally uses a four-layer authoring model:

1. Treatment layer
- Human intent documents (`TREATMENT*.md`).
- Natural language, no strict grammar requirement.
- Guides authoring and acceptance testing; not executed by the engine directly.

2. Script layer
- Authored inside Directionally using a constrained language (DSL or screenplay adapter).
- Must be deterministic enough to parse, validate, and diagnose.

3. Compile layer
- Script compiles to canonical beats.
- Beats compile to a playable first-pass production.
- Compiler emits diagnostics for unresolved or ambiguous intent.

4. Refinement layer
- Manual timeline/viewport/property edits are stored as overrides.
- Overrides are applied after compile output to refine presentation.

Source-of-truth split:
- Intent truth: script + canonical beats.
- Presentation truth: compiled production + override patch set.

Merge rule:
- Recompile must preserve manual overrides by default.
- Overrides are removed only by explicit reset actions at scene/beat granularity.

---

## Track TDA — Treatment-Driven Authoring (primary)

### TDA-1 — Canonical Beat API and Compile Contract (M1)

Goal: establish deterministic compile semantics before UX redesign.

Deliverables:
- `ProductionSpec`, `SceneSpec`, `BeatSpec`, `ConstraintSpec`, `CompileResult` types.
- `compileProduction(spec): CompileResult` service boundary.
- Diagnostics model for unresolved references and ambiguity.
- Golden tests for deterministic output.

Exit criteria:
- Same input spec always yields byte-stable compiled structure.
- Diagnostics are machine-readable and user-displayable.

### TDA-2 — Treatment Ingestion to Playable Stub (M2)

Goal: from prose treatment to runnable multi-scene production skeleton.

Deliverables:
- Treatment parser that extracts scenes, cast names, and ordered scene beats.
- First-pass generator for scene stubs: cast, default set, auto-staging, idle behavior.
- "Generate First Pass" action in UI.

Exit criteria:
- Both treatment fixtures produce playable productions without manual setup.
- New users can press Play immediately after generation.

### TDA-3 — Constrained Action-Line Compiler (M3)

Goal: make non-verbal/action-first scenes compile from natural language.

Deliverables:
- Controlled verb set: `enter`, `move/cross`, `hold`, `face`, `exit`.
- Stage-reference resolver: stage-left/right/center, near actor, by named set piece.
- Beat-to-block compiler into existing actor/camera/set block infrastructure.

Exit criteria:
- Action-driven treatment scene compiles to legible motion-first playback.
- Unrecognized lines fall back to diagnostics, not silent failure.

### TDA-4 — Override Merge and Safe Recompile (M4)

Goal: support second/third-pass refinement without destructive rebuilds.

Deliverables:
- Override layer for manual timeline/viewport edits.
- Recompile merge strategy: keep manual overrides unless explicitly reset.
- Conflict reporting for changed upstream beats.

Exit criteria:
- Manual edits survive recompilation in automated tests.
- User can selectively reset scene/beat overrides.

### TDA-5 — Script/FDX/Fountain Adapters (M5)

Goal: interoperability without coupling engine to one screenplay format.

Deliverables:
- FDX import/export adapter (tolerant parse + round-trip preservation).
- Fountain import/export adapter.
- Adapter tests against fixture corpus.

Exit criteria:
- Round-tripping preserves semantics for supported subset.
- Unknown fields/notes are retained where possible.

---

## Track UX-T — Treatment Flow UX (thin seam first)

### UX-T1 — Minimal compile UX (active)

- Source surface for treatment/script text.
- Primary CTA: `Generate First Pass` / `Rebuild`.
- Diagnostics panel: unresolved targets, ambiguous lines, compile warnings.

### UX-T2 — Refine UX bridge

- Clear "compiled vs overridden" indicators in timeline/properties.
- Quick actions: `Reset scene overrides`, `Reset selected beat override`.

### UX-T3 — Broader layout redesign (deferred until M4 stability)

- Main-area tab architecture and larger interaction model changes.
- Script-first and director-first entry flows unified in one shell.

---

## Track CAP — Capability Continuation (supporting)

These are still valuable, but subordinate to treatment-driven milestones.

### CAP-1 — Lighting rig completion
- Finish point-light authoring surface and controls.

### CAP-2 — Audio timeline completion
- Audio block strip rendering, waveform preview, catalogue integration.

### CAP-3 — Remote asset pipeline
- Swap local catalogue store for remote asset store via existing abstraction.

### CAP-4 — Video export
- Off-screen render and encoded output pipeline.

---

## Walking Skeleton Plan

### Skeleton A (now)
- Treatment -> playable stub.
- No movement compile required.
- Success: under 30 seconds from text to first playback.

### Skeleton B
- Constrained action-line compile to actor blocks.
- Success: action-first scene playable with minimal manual edits.

### Skeleton C
- Override merge on recompile.
- Success: user refinements survive treatment/script iteration.

---

## Acceptance Fixtures

- [TREATMENT_DIALOGUE_DRIVEN.md](TREATMENT_DIALOGUE_DRIVEN.md)
- [TREATMENT_ACTION_DRIVEN.md](TREATMENT_ACTION_DRIVEN.md)

Each milestone must be validated against both fixtures.

---

## Current Focus (branch: `treatment-driven-workflow`)

1. M1: Canonical beat compile contract and diagnostics.
2. M2: Generate First Pass from treatment fixtures.
3. Thin UX seam for compile + diagnostics.

### Immediate E2E Slice (M1+M2 combined)

Goal: prove `basic script DSL -> viewable first-pass production` with the smallest possible contract.

Minimal contract (strict):
- Single production with one scene.
- Cast declarations by name.
- Beat lines supporting only:
	- `say <Actor>: <Text>`
	- `enter <Actor>`
	- `move <Actor> to <mark>`
	- `hold <Actor> <seconds>`
	- `exit <Actor>`
- Fixed mark set only: `left`, `center`, `right`.
- Deterministic compile output:
	- staged actors,
	- dialogue sequence,
	- coarse actor movement blocks,
	- default environment/set if none specified.

Minimal UX seam:
- Script text input.
- `Generate First Pass` button.
- Playable preview loaded into existing production surface.
- Plain diagnostics list (parse/resolve errors).

Out of scope for this slice:
- Multi-scene scripts.
- FDX/Fountain import/export.
- Camera/light/audio compilation.
- Override merge logic (lands in M4).
- Any major layout redesign.

Success criteria:
1. A tiny script with 2 actors and 4-6 beats generates a playable scene in one click.
2. Unknown actor/mark or malformed line produces diagnostics (never silent failure).
3. Compile output is stable across repeated runs from identical input.

Everything else is secondary until Skeleton A is complete.
