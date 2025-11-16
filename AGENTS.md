# Directionally - Development Commands & Philosophy

## Project Overview

**Directionally** is an animated scene authoring and playback engine built with Three.js, Tone.js, and Svelte.

**Current State:** POC with monolithic `Presenter.svelte` → **Target:** Modular TypeScript library + Svelte UI layer.

---

## Development Principles

1. **Only production code** - No files that merely document agent changes. No comments like "//NEW: added xyz". Documentation exists in code intent, not in meta-narrative.
2. **No file bloat** - Essential files only. No multiple documentation files explaining the same thing.
3. **Test-driven for fragile systems** - The shuttle control (play/pause/rewind/seek) coordinates Three.js and Tone.js in complex ways. Tests lock down behavior before changes.
4. **Small incremental changes** - Each git commit should do ONE thing clearly.

---

## Essential Commands

```bash
# Setup
yarn install

# Development
yarn dev              # Start dev server (http://localhost:5173)
yarn check            # TypeScript type checking
yarn check:watch      # Watch mode

# Testing
yarn test             # Run tests once
yarn test:watch       # Watch mode
yarn test:ui          # Interactive UI dashboard
yarn test:coverage    # Coverage report

# Build
yarn build
yarn preview
```

---

## Architecture

### Current Structure (v0)
```
src/lib/Presenter.svelte    # Monolithic: play/pause, rendering, animations
src/lib/Model.ts            # Scene definition
src/lib/model/              # Asset types
```

### Target Structure (v1)
```
src/core/
├── timeline/
│   └── Timeline.ts          # Shuttle control (testable, reusable)
├── scene/                   # Coming: scene building API
├── speech/                  # Coming: speech system
└── index.ts

src/lib/
├── Presenter.svelte         # UI layer (uses core Timeline API)
├── Model.ts                 # Scene definition
└── model/                   # Asset types

tests/
├── core/
│   └── timeline.test.ts     # Core library tests
└── integration/             # Integration tests
```

---

## Current Work: Phase 1 - Stabilize Shuttle Control

**Goal:** Extract play/pause/rewind/seek logic into tested `Timeline` class.

**Why:** The shuttle control is the fragile centerpiece. It coordinates:
- Tone.js transport (audio timing)
- Three.js AnimationMixer (animation frame updates)
- Animation state (enabled/disabled, playback position)

Changes to any of these break shuttle control. Tests protect against this.

**Status:** Timeline skeleton exists. 25+ tests define expected behavior. Implementation task: make tests pass.

**Next Step:** Implement `src/core/timeline/Timeline.ts` to pass `tests/core/timeline.test.ts`

---

## Testing Philosophy

Tests are **specifications**, not afterthoughts:

1. Write tests that describe expected behavior
2. Tests fail (they define the contract)
3. Implement code to pass tests
4. Future changes: if tests still pass, behavior is unchanged

For the shuttle control, this means:
- Play/pause transitions work correctly
- Seek repositions animations to the correct frame
- Rewind works (seek to 0)
- All work together without breaking

---

## Debugging: Three.js / Tone.js Fragility

### The Problem
When you call `seek(time)` while paused:
- Tone.js transport.seconds must be updated
- Tone.js timeScale is 0 (paused)
- Three.js AnimationMixer must update animation to frame at that time
- AnimationMixer respects timeScale, which is 0

Result: Animation doesn't update correctly because timeScale=0 blocks interpolation.

### Current Workarounds
- Use `AnimationAction.time` directly instead of `mixer.setTime()`
- Disable animations before seeking, re-enable after
- Document the exact pattern that works

### When Adding Features
- Always verify seek behavior works with new features
- Add test cases before implementing
- Document any pattern changes in code comments

---

## Making Changes

### For Timeline Changes
1. Write a test case for the behavior you want
2. Run tests - watch it fail
3. Implement code to pass test
4. Run all tests - ensure no regressions
5. Commit with clear message: `fix: correct animation seek with paused transport`

### For Model/Scene Changes
1. Update Model.ts if schema changes
2. Update example models if needed
3. No test requirements (not core library)
4. Test manually with `yarn dev`

### For UI Changes
1. Update Presenter.svelte
2. Verify shuttle controls work
3. No tests required (UI layer)
4. Test manually with example models

---

## Code Style

**Files should speak for themselves:**
- Method names describe what they do: `play()`, `pause()`, `seek()`
- JSDoc comments on public methods
- No comment redundancy ("// increment i" on `i++`)
- Meaningful variable names
- Implementation details clear from code structure

**Do not:**
- Add comments about what version/date this was added
- Explain agent changes in code
- Over-document obvious behavior
- Add temporary debugging statements

---

## Git Workflow

```bash
# Create feature branch
git checkout -b feat/timeline-seek-fix

# Make changes, run tests
yarn test

# Commit with conventional commits
git commit -m "fix: seek repositions animations correctly when paused"
git commit -m "test: add seek edge cases for looping animations"

# Push and create PR
git push origin feat/timeline-seek-fix
```

---

## Known Issues & Decisions

**Issue: Animation seek with timeScale=0**
- Status: Workaround documented, needs implementation testing
- Decision: Use AnimationAction.time directly, not mixer.setTime()
- Tests will verify this works

**Decision: Why Vitest over Jest**
- ESM-native (better with Svelte Kit)
- Faster execution
- Better DX with UI dashboard
- Can be changed later if needed

**Decision: Why test Timeline before Presenter**
- Shuttle control is fragile, needs protection first
- Can build Presenter refactor with confidence
- Tests are fast, low-cost way to verify behavior

---

## Next Immediate Steps

1. Study `tests/core/timeline.test.ts` - understand what behavior is expected
2. Implement `src/core/timeline/Timeline.ts` - make tests pass
3. When done: `yarn test` should show all passing
4. Then: Integrate into Presenter, verify no regressions

---

## Resources

- **Three.js Animation System**: https://threejs.org/docs/#manual/en/introduction/Animation-system
- **Tone.js API**: https://tonejs.org/docs/
- **Vitest**: https://vitest.dev/
- **Svelte Kit**: https://kit.svelte.dev/
