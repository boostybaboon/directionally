---
applyTo: "src/core/domain/**"
---

# Domain Model – Context for Copilot

This directory contains the pure TypeScript domain model (no Three.js, no Tone.js).

## Hierarchy

```
Production → Act[] → Scene[]
```

- **Production:** actor roster (`Actor[]`) + acts. Actors have stable `id`s used throughout scenes.
- **Act:** named grouping of scenes.
- **Scene:** owns camera, lights, set pieces, staged actors, and a timeline of `SceneAction`s.

## Authoring pattern

```ts
const production = new Production('Title');
const actor = production.addActor('Name', { type: 'gltf', url: '/models/robot.glb' });
const act = production.addAct('Act 1');
const scene = act.addScene('Opening', { duration: 10 });

scene
  .setCamera({ position: [0, 2, 8], lookAt: [0, 0, 0] })
  .addLight({ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x333333, intensity: 1 })
  .stage(actor.id, { startPosition: [0, 0, 0] })
  .addAction({ type: 'animate', actorId: actor.id, startTime: 0, animationName: 'Walk' });

const model = sceneToModel(scene, production.actors); // → passes to Presenter.loadModel()
```

## `Vec3`

Always `[x, y, z]` tuples — no `THREE.Vector3` in this layer.

## Adding a new `SceneAction` type

1. Add the type to the discriminated union in `types.ts`.
2. Handle it in `SceneBridge.ts` — or add a `console.warn` + skip if renderer support isn't ready yet.
3. Do not import Three.js into `types.ts` or any other file in this directory.

## `SceneBridge.ts`

`sceneToModel(scene, actors)` is the only exit point from the domain layer — it converts to the legacy `Model` format for the renderer. Keep this as the single conversion boundary.
