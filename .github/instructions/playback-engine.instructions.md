---
applyTo: "src/core/scene/**"
---

# PlaybackEngine – Context for Copilot

This directory owns the headless playback core. All changes here must preserve these invariants.

## Critical Invariants (must not break)

1. **Paused seeks use `anim.anim.time`, never `mixer.setTime()`** — `timeScale` is 0 when paused; `mixer.setTime()` scales by `timeScale` and produces wrong results. Set `anim.anim.time` directly.
2. **Seek order is strict:** disable+reset all animations first, then re-enable the correct subset. Never enable before disabling.
3. **LoopRepeat modulo:** `animTime = (time - start) % (end - start)` — do not clamp.
4. **Rewind (`seek(0)`):** first animation (`i === 0`) always ends up `enabled=true, time=0`; all others `enabled=false`.
5. **`Transport.seconds` requires both getter and setter.** A getter-only property throws at runtime when `setPosition()` writes to it. `ToneTransportAdapter` must expose a setter; test mocks must too.
6. **`engine.load()` must not call `transport.cancel()`** — Presenter schedules Tone events before calling `load()`; cancelling them breaks audio sync.
7. **`engine.load()` before `seek(0)`** — calling `seek(0)` before `load()` means no animations are registered; the initial state is silently wrong.

## Test coverage

Tests live in `PlaybackEngine.test.ts`. Before any refactor touching seek/play/pause/rewind:
- Run `yarn test` and confirm all pass.
- Add a test for any behaviour not yet covered, then make the change.

The regression test `setPosition writes to transport seconds setter` specifically guards invariant 5 above — do not remove it.
