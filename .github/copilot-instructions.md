# Directionally – Repository Instructions for Copilot

These instructions provide repo-specific technical context. Stylistic and process rules live in `AGENTS.md`.

## Architecture

```
src/core/domain/          # Production → Group → Scene domain model (no Three.js)
  Production.ts           # addActor(), addGroup(), addScene() — actor roster + nestable tree
  Group.ts                # nestable container: children: Array<Group | Scene>, getScenes() DFS
  Scene.ts                # fluent builder: setCamera, addLight, addSetPiece, stage, addAction
  types.ts                # Vec3, GeometryConfig, LightConfig, SceneAction union, etc.
  SceneBridge.ts          # sceneToModel(scene, actors) → Model  (domain → renderer bridge)

src/core/scene/           # Headless playback core
  PlaybackEngine.ts       # play/pause/seek/rewind/stop/update — delegates from Presenter
  types.ts                # Transport interface, PlaybackState, AnimationEntry, EngineLoadPayload

src/core/storage/         # Production persistence
  ProductionStore.ts      # list/get/save/delete/create — localStorage-backed, no key names outside
  types.ts                # StoredProduction: { id, name, createdAt, modifiedAt, script }

src/core/document/        # Editing API — headless, no UI/browser dependencies
  Command.ts              # interface Command { execute(doc): StoredProduction; label: string }
  commands.ts             # RenameProductionCommand, AddScriptLineCommand, SetScriptCommand, etc.
  ProductionDocument.ts   # execute(cmd), undo(), redo(), current, canUndo, canRedo, history[]

src/core/catalogue/       # Bundled asset catalogue (characters, set pieces)
  types.ts                # CharacterEntry, SetPieceEntry, CatalogueEntry, CatalogueKind
  entries.ts              # Seed data: RobotExpressive (6 clips), Soldier (3 clips, MIT Three.js) + geometry primitives
  catalogue.ts            # Pure service: getCharacters(), getSetPieces(), getById()

src/lib/                  # UI layer (Svelte) + legacy model format
  Presenter.svelte        # Mounts canvas, wires controls, owns render loop; transport state as $bindable props
  TransportBar.svelte     # Transport controls component (bottom panel)
  CataloguePanel.svelte   # Asset catalogue browser UI (Catalogue tab in left panel)
  PreviewRenderer.svelte  # Self-contained Three.js canvas for catalogue preview (OrbitControls, clip discovery)
  Model.ts                # Legacy scene definition: camera, lights, meshes, gltfs, actions
  types.ts                # VoiceMode, VoiceBackend (shared UI types)
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

**New scene (domain API):** `Production.addActor()` → `.addGroup()` or `.addScene()` on the production or a group → chain `.setCamera()`, `.addLight()`, `.addSetPiece()`, `.stage()`, `.addAction()` → `sceneToModel()` for rendering.

**New asset/action type in legacy layer:** add type in `src/lib/model/`, extend `Model.ts` aggregator, handle in `Presenter.svelte`. Update `SceneBridge.ts` if it should be author-able via the domain API.

**New SceneAction type:** add to discriminated union in `src/core/domain/types.ts`, handle in `SceneBridge.ts` (or log warning + skip if renderer support is pending).

**Audio sync:** Tone.js transport remains the single source of truth; never invent a parallel clock.

## Test & Static Analysis Discipline

**Write tests before or alongside new modules** — especially for pure logic in `src/core/`. See `catalogue.test.ts`, `PlaybackEngine.test.ts`, and `ProductionDocument.test.ts` as exemplars.

**inject dependencies for testability** — service functions take an optional `entries`/`animations`/etc. argument so tests pass controlled fixtures instead of real globals.

**Run after every change:**
```bash
yarn test                                        # all tests must stay green
npx svelte-check --tsconfig tsconfig.json        # 0 errors, 0 warnings
```

Tests live next to the code they exercise (`foo.test.ts` beside `foo.ts`). UI components are not unit-tested (only their data layer is). Integration smoke is done manually in the browser.

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

