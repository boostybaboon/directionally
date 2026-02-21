---
agent: ask
description: Add a PlaybackEngine shuttle/seek invariant test
---

Add a new test to `src/core/scene/PlaybackEngine.test.ts` that verifies a PlaybackEngine shuttle behaviour.

Requirements:
- Use `setupEngine(animations)` and `createAnimationEntry(start, end, loop)` helpers already in the file.
- The test must be deterministic — no real timers, no real Three.js objects.
- Follow the existing `describe` block `PlaybackEngine - Shuttle Invariants`.
- Name the test clearly so it reads as a behaviour contract.

If the new test requires a new `FakeAnimationAction` property, add it to the class and keep the `as unknown as THREE.AnimationAction` cast in `createAnimationEntry`.

Describe the behaviour you want to test:
