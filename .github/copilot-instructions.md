# Directionally – Repository Instructions for Copilot

These instructions provide repo-specific technical context. Stylistic and process rules live in `AGENTS.md`.

## Quick Architecture

```
src/lib/Presenter.svelte   # UI orchestration layer (Svelte) – mounts canvas, wires controls
src/lib/Model.ts           # Scene model definition (camera, lights, meshes, actions)
src/lib/model/             # Asset type modules (Mesh, GLTF, Light, etc.)
src/core/scene/ScenePlayer.ts  # Extracted non-UI playback core (scene+animation+transport)
```

Target direction:
```
src/core/                  # headless core (model, sequencing, playback API)
src/lib/                   # Svelte UI components consuming core
```

## Runtime Responsibilities

ScenePlayer:
- Builds Three.js scene from `Model`
- Orchestrates animations via `AnimationAction`
- Bridges Tone.js transport time → animation progression
- Owns fragile seek logic (see invariants below)

Presenter.svelte:
- Instantiates `ScenePlayer`
- Renders frame loop (renderer.render)
- Handles user shuttle controls → delegates to ScenePlayer

## Shuttle / Timeline Fragility Invariants

Maintain these or tests must fail:
1. When paused, seeking must NOT use `mixer.setTime()` for mid-animation positioning – use `anim.anim.time` directly.
2. Order for seek: disable all animations → compute target enabling/time → re-enable subset.
3. Looping animations (`THREE.LoopRepeat`) must wrap time modulo (end-start).
4. Rewind (time=0) must leave initial animations enabled at time=0, others disabled.
5. Tone.js transport seconds is single source of truth for current playback time; never derive from clock delta.

## Recommended Tests (High Priority)

Write tests before further refactors touching shuttle logic:
- play → pause → play preserves position.
- seek while paused into middle of looping animation sets modulo time.
- seek backwards into completed one-shot animation keeps final frame (LoopOnce case).
- rewind after completion resets all mixers and leaves no mid-frame artifacts.
- rapid seek spam (e.g. 0 → 5 → 2 → 7) leaves consistent `anim.enabled` states.

## Commands Cheat Sheet

```bash
# Install deps
yarn install

# Dev server (Svelte + Vite)
yarn dev --open

# Type checking
yarn check

# Tests (Vitest)
yarn test            # Run once and exit
yarn test:watch      # Watch mode for development
yarn test:coverage   # Run once with coverage report

# Build & preview
yarn build
yarn preview
```

## Refactor Safety Checklist

Before moving shuttle logic or animation code:
- Preserve existing domain comments (anim.time vs mixer.setTime rationale).
- Add/confirm tests that lock current behavior.
- Avoid merging stylistic changes with behavioral moves (1 commit per concern).
- Validate play/pause button state still toggles correctly.

## Git Conventions

Use conventional commits, one clear change per commit. Examples:
- `fix: seek preserves loop repeat modulo logic`
- `refactor: extract ScenePlayer headless core`
- `test: add rewind invariants for one-shot animations`

## Adding New Features

1. Model extension (new asset/action): add type in `src/lib/model/`, extend `Model.ts` aggregator, update ScenePlayer handling if needed.
2. UI control addition: implement in Presenter (or future separated UI component), delegate to ScenePlayer for core logic.
3. Audio sync feature: ensure Tone.js transport remains source of truth; never invent a parallel clock.

## Resources
- Three.js Animation: https://threejs.org/docs/#manual/en/introduction/Animation-system
- Tone.js Docs: https://tonejs.org/docs/
- Vitest: https://vitest.dev/
- SvelteKit: https://kit.svelte.dev/

## Copilot Instructions Scope (per GitHub Docs)
- Repository-wide instructions live in `.github/copilot-instructions.md` and are applied to all Copilot requests in this repo.
- Path-specific instructions can be added under `.github/instructions/NAME.instructions.md` with frontmatter `applyTo: "glob"` (optional `excludeAgent: "code-review"|"coding-agent"`).
- Agent instructions (`AGENTS.md`) may exist anywhere; nearest file takes precedence. Copilot may use these to guide coding agents. See `AGENTS.md` in repo root.
- Prompt files (optional) live under `.github/prompts/*.prompt.md` to share reusable chat prompts.

For authoritative guidance, see: https://docs.github.com/en/copilot/how-tos/configure-custom-instructions/add-repository-instructions

## Instructions Behavior
- Priority: Personal > Repository > Organization; relevant sets can be combined.
- Verification: When used in Copilot Chat, this file appears under References.
- Path-specific files combine with repo-wide; avoid conflicting guidance as resolution is non-deterministic.

## Tooling Notes
- Path-specific files must include `applyTo` in frontmatter; optionally use `excludeAgent: "code-review"|"coding-agent"`.
- VS Code prompt files require enabling `"chat.promptFiles": true` and are stored in `.github/prompts/*.prompt.md`.
- `AGENTS.md` nearest-in-tree takes precedence; in VS Code, using non-root `AGENTS.md` may require enabling per VS Code docs.

## When Unsure
Prefer: add a focused test → make change → ensure green. If a refactor makes seek logic simpler but a test fails, revert and document.

