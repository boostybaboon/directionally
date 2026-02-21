# Directionally – Repository Instructions for Copilot

These instructions provide repo-specific technical context. Stylistic and process rules live in `AGENTS.md`.

## Architecture

```
src/core/domain/          # Production → Act → Scene domain model (no Three.js)
  Production.ts           # addActor(), addAct() — actor roster + acts
  Act.ts                  # addScene() — returns chainable Scene
  Scene.ts                # fluent builder: setCamera, addLight, addSetPiece, stage, addAction
  types.ts                # Vec3, GeometryConfig, LightConfig, SceneAction union, etc.
  SceneBridge.ts          # sceneToModel(scene, actors) → Model  (domain → renderer bridge)

src/core/scene/           # Headless playback core
  PlaybackEngine.ts       # play/pause/seek/rewind/stop/update — delegates from Presenter
  types.ts                # Transport interface, PlaybackState, AnimationEntry, EngineLoadPayload

src/lib/                  # UI layer (Svelte) + legacy model format
  Presenter.svelte        # Mounts canvas, wires controls, owns render loop, delegates to PlaybackEngine
  Model.ts                # Legacy scene definition: camera, lights, meshes, gltfs, actions
  model/                  # Asset types: Mesh, GLTF, Light, Camera, Geometry, Material, Action
  exampleModel*.ts        # Direct Model construction (legacy examples)
  exampleProduction1.ts   # Example using Production API + SceneBridge
```

## Runtime Responsibilities

**PlaybackEngine** (`src/core/scene/PlaybackEngine.ts`):
- Owns play/pause/seek/rewind state machine
- Bridges Tone.js transport time → Three.js AnimationAction positioning
- Owns fragile seek logic (see invariants below)

**Presenter.svelte**:
- Instantiates PlaybackEngine; calls `engine.load()` **before** `seek(0)` (ordering is critical)
- Renders frame loop (`renderer.render`)
- Handles user shuttle controls → delegates to PlaybackEngine
- Owns Tone.js schedule setup (`engine.load` must NOT call `transport.cancel()`)

## Shuttle / Timeline Fragility Invariants

Maintain these or tests will fail:
1. When paused, seeking must NOT use `mixer.setTime()` for mid-animation positioning — use `anim.anim.time` directly (timeScale=0 when paused breaks mixer scaling).
2. Order for seek: disable all animations → compute target enabling/time → re-enable subset.
3. Looping animations (`THREE.LoopRepeat`) must wrap time modulo `(time - start) % (end - start)`.
4. Rewind (time=0) must leave the first animation enabled at time=0, all others disabled.
5. Tone.js transport `seconds` is single source of truth; never derive from clock delta.
6. `Transport` implementations must have both a getter **and a setter** for `seconds` — a getter-only property throws at runtime when `setPosition()` is called.

## Commands

```bash
yarn install
yarn dev --open         # http://localhost:5173
yarn check              # svelte-check type checking
yarn test               # run once and exit (use in CI / agent scripts)
yarn test:watch         # interactive watch mode
yarn test:coverage
yarn build
yarn preview
```

## Adding New Features

**New scene (domain API):** `Production.addActor()` → `act.addScene()` → chain `.setCamera()`, `.addLight()`, `.addSetPiece()`, `.stage()`, `.addAction()` → `sceneToModel()` for rendering.

**New asset/action type in legacy layer:** add type in `src/lib/model/`, extend `Model.ts` aggregator, handle in `Presenter.svelte`. Update `SceneBridge.ts` if it should be author-able via the domain API.

**New SceneAction type:** add to discriminated union in `src/core/domain/types.ts`, handle in `SceneBridge.ts` (or log warning + skip if renderer support is pending).

**Audio sync:** Tone.js transport remains the single source of truth; never invent a parallel clock.

## Refactor Safety Checklist

Before moving shuttle or animation code:
- Preserve domain comments explaining fragile logic (they are institutional knowledge, not noise).
- Confirm existing tests pass; add tests for any uncovered behaviour before refactoring.
- One concern per commit — no mixing style changes with behavioural moves.

## Resources
- Three.js Animation: https://threejs.org/docs/#manual/en/introduction/Animation-system
- Tone.js Docs: https://tonejs.org/docs/
- Vitest: https://vitest.dev/
- SvelteKit: https://kit.svelte.dev/

## When Unsure
Add focused test → make change → ensure green. If a refactor simplifies seek logic but a test fails, revert and document.

