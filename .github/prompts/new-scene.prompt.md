---
agent: ask
description: Scaffold a new scene using the Production domain API
---

Create a new scene file at `src/lib/` using the Production domain API and SceneBridge pattern from `exampleProduction1.ts`.

The scene should:
- Declare a `Production`, add any actors needed, add an `Act`, and add a `Scene` with a sensible duration.
- Chain `.setCamera()`, at least one `.addLight()`, and appropriate `.addSetPiece()` or `.stage()` + `.addAction()` calls.
- Export a `Model` produced by `sceneToModel(scene, production.actors)` so it can be passed directly to `presenter.loadModel()`.
- Follow all patterns in `src/core/domain/` — no Three.js imports in the domain layer; `Vec3` tuples for positions.

Describe what the scene should contain (actors, set pieces, animations, duration):
