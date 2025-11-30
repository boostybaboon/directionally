# Directionally - Development Commands & Philosophy

yarn dev --open       # Start dev server (http://localhost:5173)
yarn check            # TypeScript type checking
yarn check:watch      # Watch mode
yarn test             # Run tests once
yarn test:watch       # Watch mode
yarn test:ui          # Interactive UI dashboard
yarn test:coverage    # Coverage report
yarn build
yarn preview
## Overview & Scope

This file defines **stylistic and process conventions** for the Directionally codebase. Technical architecture, commands, and fragile runtime invariants live in `.github/copilot-instructions.md` for repository-scoped Copilot context.

## Development Principles

1. **Only production code** – No comments or files whose sole purpose is narrating refactors or AI changes.
2. **No file bloat** – Keep a single source of truth for a topic; remove duplicates.
3. **Protect fragile systems with tests** – Before altering shuttle/seek logic, ensure tests cover current behavior.
4. **Single-purpose commits** – One clear change per commit; avoid mixing style and behavior.

## Code Style & Comment Policy
## Code Style

**Files should speak for themselves:**
- Method names describe what they do: `play()`, `pause()`, `seek()`
- JSDoc comments on public methods only
- No comment redundancy ("// increment i" on `i++`)
- Meaningful variable names
- Implementation details clear from code structure

**Comments: Preserve Domain Knowledge, Discard Meta-Narrative**

Preserve:
- Unexplained complexity or gotchas (e.g., "Uses anim.anim.time directly, not getMixer().setTime(), because timeScale=0 when paused breaks mixer scaling")
- Non-obvious constraints that will break if changed (e.g., "Disable animations before seeking, re-enable after - order matters")
- Links to external issues or specifications
- TODOs that represent actual debt needing investigation

**Do not add:**
- "Extracted from X" or "Moved to Y" (refactoring history is in git)
- "Agent-added" or version/date markers
- Meta-comments about code organization decisions
- Redundant restatements of what the code already says
- Comments that duplicate the method name or obvious behavior

**Rule: Refactors must preserve all non-meta comments.** When moving code between files, migrate existing domain-knowledge comments with the code. If you lose them, you've lost institutional knowledge.

---

git checkout -b feat/timeline-seek-fix
yarn test
git commit -m "fix: seek repositions animations correctly when paused"
git commit -m "test: add seek edge cases for looping animations"
git push origin feat/timeline-seek-fix
## Git Workflow (Style Aspect)

Follow conventional commits for clarity:
`feat:`, `fix:`, `refactor:`, `test:`, `chore:`, `docs:`.
Behavioral change and test addition may be separate commits; prefer clarity over compression.

## Refactor Rules

1. **Preserve domain comments** – If moving code, carry over non-meta comments explaining fragile logic or rationale.
2. **Do not annotate history** – Remove / reject comments like "extracted from X" or timestamps; Git already tracks lineage.
3. **Stage then simplify** – For risky moves, first do a mechanical move keeping structure, then a second pass to clean naming/shape with tests in place.
4. **No speculative rewrites** – If intent is unclear, add a TODO with a narrow question instead of rewriting.

## Test Discipline (Process Focus)

Tests encode behavior contracts. When editing code that interacts with:
- Tone.js transport time
- Three.js AnimationMixer seeking
- Animation enable/disable ordering

Ensure existing tests stay green; if missing, add them before deep refactors.

## When Uncertain

Add a TODO with a concrete investigative action (e.g., `TODO: isolate mixer.setTime vs anim.time scaling while paused`). Avoid generic TODOs.

## Anti-Patterns to Reject

- Comment blocks describing prior file locations.
- AI/meta commentary ("agent moved this").
- Duplicate configuration examples.
- Large speculative refactors without test safety net.

## Performance Considerations (Stylistic)

Prefer clear intent over premature micro-optimizations. Profile before optimizing render loop or mixer update cadence.

## Ownership

Any contributor may enforce these rules during review; style consistency > personal preference.
