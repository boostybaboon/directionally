# Directionally — Roadmap

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

ScriptDocument is the source of truth. Built programmatically, never derived from
heuristic parsing of unscoped free-form text. The text editor is a locked-down
controller: every keystroke either fills a field that is already scoped to a
closed set (a **sigil-scoped token** — see Track SCR) or is verbatim dialogue text
that is never interpreted. Nothing is ever guessed from prose shape or position.

API-first semantics, thin UX seam now, broader UX rework later.

- `ScriptDocument` ↔ sigil-tokenized text editor (typed, always valid, round-trips
  losslessly: `render(tokenize(text)) === text` and `tokenize(render(doc)) === doc`)
- `ScriptDocument` → `compileScriptDocument()` → production (deterministic, testable)
- No heuristic parsing of unscoped prose in the critical path. Sigil-scoped tokens
  (`@actor`, `>action`, `#scene`) resolve deterministically against closed sets —
  this is the same closed-set resolution the old Combobox UI performed, just
  triggered by a sigil character instead of a mouse click into a dropdown.
- FDX is an interchange format only (import/export adapters).

---

## Data Contract (Locked)

Directionally uses a four-layer authoring model:

1. Treatment layer
- Human intent documents (`TREATMENT*.md`).
- Natural language, no strict grammar requirement.
- Guides authoring and acceptance testing; not executed by the engine directly.

2. Script layer
- `ScriptDocument` is the structured source of truth — scenes, beats, cast, assignments.
- The text editor only allows mutations that map to legal `ScriptDocument` changes.
- Movement verbs (`enter`, `exit`, `move`, `hold`) are structured beat types,
  not loose text to be pattern-matched post-hoc.
- Authoring surface is a single sigil-tokenized text buffer (Track SCR): `@actor`,
  `>action`, `#scene` sigils scope autocomplete before any content is interpreted.
  No regex parsing of unscoped prose — every token's type is known from its sigil
  before a single character of its value is typed.

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

## Track TDA — Treatment-Driven Authoring

`ScriptDocument` → `compileScriptDocument()` → production is complete and unchanged by the
editor rework in Track SCR (see [ROADMAP_ARCHIVE.md](ROADMAP_ARCHIVE.md) for TDA-1/2/3 history).
One item remains open:

### TDA-4 — FDX Interchange + Override Merge

Goal: FDX import/export adapters; manual refinements survive recompile.

Deliverables:
- FDX import: FDX XML → `ScriptDocument` (best-effort, lossy for non-dialogue content).
  Extracted action lines become direction notes. User resolves any ambiguity.
- FDX export: `ScriptDocument` → Fountain → FDX conversion (consumes the clean
  `renderFountain()` output described in SCR-5, not the sigil buffer directly).
- Override layer: manual timeline/viewport edits persist across recompilation.
- Conflict reporting for upstream ScriptDocument changes.

Exit criteria:
- Round-trip: import FDX → `ScriptDocument` → compile → export FDX preserves known structure.
- Manual edits survive recompilation in automated tests.

---

## Track CAP — Capability Continuation (supporting)

These are still valuable, but subordinate to the SCR/CAT tracks below.

### CAP-1 — Lighting rig completion
- Finish point-light authoring surface and controls.

### CAP-2 — Audio timeline completion
- Audio block strip rendering, waveform preview, catalogue integration.

### CAP-3 — Remote asset pipeline
- Swap local catalogue store for remote asset store via existing abstraction.

### CAP-4 — Video export
- Off-screen render and encoded output pipeline.

---

## Track CAT — Catalogue Integration & Placeholder Resolution (primary, interleaved with SCR)

Today the script compiler fakes catalogue resolution entirely: every cast member — regardless
of the typed name — is bound to `CATALOGUE_ENTRIES.find(e => e.kind === 'character')`, i.e.
always the same first bundled character (currently the Robot). The scene heading's `setting`
field is captured but never read by the compiler — `compileSceneBlock()` always calls
`buildStageFloor()` regardless of what was typed. `CataloguePanel.svelte` (a complete
characters/set-pieces/lights/environments browser with drag-and-drop and "Edit in Sketcher"
links) is fully built but mounted nowhere — the script view has no reference to it, and no nav
links to `/character` or `/sketch` exist from the main app. The three surfaces — script,
sketcher, character creator — are genuinely disconnected islands.

This track makes cast names and scene settings resolve against a real (bundled + user-authored)
catalogue, and makes the failure mode when nothing matches into a clearly-marked, legible
placeholder rather than a silent wrong-asset substitution. This is the direct architectural
prerequisite for "type `Bob (male, 66)` and get a character" — resolution has to exist and be
honest about when it *hasn't* resolved before typing can feel trustworthy. It is also the
architectural prerequisite for Track SCR's safety property: sigil typing can only stay
uninterrupted if an unmatched name safely becomes a placeholder instead of blocking.

### CAT-0 — Bundle a generic default humanoid as a real catalogue asset

The character creator (`/character`) already has an implicit generic default — `DEFAULT_COLORS`
+ `DEFAULT_BONE_PARAMS` + `DEFAULT_FACE_PARAMS` + `'organic'` style is exactly what a fresh
session loads before any tuning. It is not, however, a usable catalogue asset the way the Robot
is — there is no bundled `CharacterEntry` for it. This is a real gap independent of placeholder
work: users have no generic-human option in the catalogue at all today.

- Export the default-parameter humanoid via the existing `/character` → Export to Catalogue
  pipeline (`exportCharacterGLB`), save the GLB as `static/models/gltf/generic-human.glb`
  (same treatment as `RobotExpressive.glb`).
- Add a bundled `CharacterEntry` in `entries.ts`: `id: 'generic-human'`, sensible
  `defaultAnimation`/`defaultScale`.

Exit criteria: "Generic Human" appears in the catalogue alongside "Robot" and is directly
assignable to a cast member like any other bundled character — independent of any placeholder
behaviour.

### CAT-1 — Cast member → catalogue resolution + placeholder indicator

- `compileScriptDocument` resolves each cast name against the merged catalogue (bundled
  `CATALOGUE_ENTRIES` + `OPFSCatalogueStore.list()`) — explicit `catalogueId` binding first
  (once CAT-3 exists to set one), case-insensitive label match second.
- No match → the cast member is staged with the CAT-0 generic-human body (not a capsule, not a
  silent copy of some other character) plus a floating **lozenge label** above the head showing
  the typed name and an unresolved marker (e.g. `ALPHA ⚠` or `ALPHA (placeholder)`). Reuse the
  existing `CanvasTexture` + `THREE.Sprite` mechanism already built for speech bubbles in
  `Presenter.svelte` — same billboard/label pattern, different content and persistence (visible
  for the actor's whole time on stage, not just while speaking).
- Diagnostic emitted per unresolved cast member: `info`-level, e.g. "ALPHA has no catalogue
  match — using the generic placeholder."

Exit criteria: two cast members in one scene, one bound to an existing catalogue entry, one
unbound, render as visually distinct — the unbound one is unmistakably marked as a placeholder,
not a wrong-but-confident character.

### CAT-2 — Setting → scenery resolution + placeholder indicator

- Scene heading `setting` resolves against merged catalogue `SetPieceEntry`/`EnvironmentEntry`
  labels instead of the compiler always calling `buildStageFloor()`.
- No match → synthesize a simple placeholder room (floor plane sized to a default footprint) —
  visually distinct from the hardcoded stage-and-wings — tagged with the same lozenge-label
  sprite mechanism as CAT-1, floating above the setting, showing the typed setting name and an
  unresolved marker.

Exit criteria: typing a setting with no catalogue match produces a legibly-labelled placeholder
room; typing a setting matching a bundled or Sketcher-exported set piece resolves to the real
geometry with no placeholder marker.

### CAT-3 — Surface the catalogue and cross-tool navigation in the script view

- Mount `CataloguePanel.svelte` as a tab/panel in `+page.svelte`, merging bundled entries with
  `OPFSCatalogueStore.list()` (the merge pattern is already used by `CataloguePanel`'s own props
  — it just isn't fed real data by anything today).
- Add topbar nav links to `/character` and `/sketch` (currently unreachable from the main script
  view — there is no way to get there without typing the URL).
- `onadd` for a character sets the selected cast member's explicit `catalogueId` binding
  (overrides label-match resolution); `onadd` for a set-piece binds the active scene's setting
  to a specific catalogue entry the same way.

Exit criteria: a user can browse the real catalogue from the script view, explicitly bind a cast
member or setting to a specific asset, and open the character/sketcher tools without leaving the
app shell.

### CAT-4 — Bootstrapping bridge: "Create real asset" from a placeholder

- Each unresolved-cast/unresolved-setting diagnostic (CAT-1/CAT-2) gains a "Create →" action
  that opens `/character` or `/sketch` in a new tab, pre-seeded with the typed name via a query
  param (`?prefillName=Bob`).
- The script view listens for the `BroadcastChannel('directionally-catalogue')`
  `catalogue-updated` message (already emitted by `/character`'s export flow) and re-runs
  `compileAndApply` on receipt — a newly-exported asset whose label matches a still-unresolved
  cast/setting name silently replaces the placeholder, no script edits required.

Exit criteria: type `Bob`, see the generic-human placeholder with a `Bob ⚠` lozenge; click
Create →, the Character creator opens pre-seeded "Bob"; tune and export; back in the script tab,
Bob's placeholder becomes the authored character and the diagnostic clears — with zero edits to
the script itself.

### CAT-5 — Bundled starter archetypes *(fine-tuning, not a prerequisite)*

A handful of additional bundled humanoid archetypes (age/gender variants on CAT-0's
generic-human) and generic sceneries (classroom, park, café, living room) so common names
resolve directly without needing the CAT-4 create flow. Demoted to an enhancement here because
CAT-0 through CAT-2 already guarantee nothing blocks — an unresolved name always renders
something legible and clearly marked, so richer bundled defaults are purely a quality-of-life
improvement on top of a system that already works end-to-end.

### Future direction — AI-assisted asset generation *(north star, not scheduled)*

When no catalogue or user-authored match exists for a typed setting (`aircraft cabin`) or
character descriptor (`schoolteacher, male, 56`), an AI-assisted step could synthesize a
starting asset instead of leaving the placeholder as the end state — a scenery layout via the
Sketcher's primitive pipeline, or a character via parametric `ProceduralHumanoid` sliders driven
by a text-to-parameters model — pre-filling the CAT-4 create flow instead of opening it blank.
This depends on CAT-4's create-flow plumbing existing first and on a choice of AI backend that is
out of scope for this POC's architecture today. Tracked here as direction, not committed work.

---

## Track SCR — Sigil-Tokenized Script Editor (primary, interleaved with CAT)

Highland Pro's writing feel comes from parsing a *prose-shaped* page heuristically (position,
capitalization, blank lines) into formatting — the parse target is a readable page, and a bad
guess just looks wrong, it never breaks a running program. Directionally's parse target is
executable data: an actor name must resolve to an actorId, a verb must resolve to one of four
enum values with typed args. Heuristic prose-parsing degrades gracefully for a human reading a
page and catastrophically for a compiler that needs a valid `ActionVerb` — which is exactly why
the Roadmap Principle bans it. The tension this track resolves: dropdown-driven structured
fields are safe but slow — every beat needs mouse trips into comboboxes.

The chosen direction — **inline sigils** — wins because the sigil scopes a token's type *before*
a single character of its value is typed. `@`, `>`, `#` are not heuristics; they are an explicit,
tiny, unambiguous grammar the user opts into by typing them. The tokenizer never has to guess "is
this a character name or a verb?" the way loose Fountain text does — that question is already
answered by which sigil started the line. This keeps every keystroke inside the Roadmap
Principle's rule while making the buffer read like a screenplay as you type it.

This replaces the previous boxed Combobox editor outright — not an incremental
keyboard-ification of dropdowns, but a replacement editing surface over the same
`ScriptDocument`/`compileScriptDocument()` core, which is untouched. (Prior interaction models
considered and rejected — Combobox-keyboard-only, Emmet-style snippet tab-stops, command-palette
fuzzy matching, loose-Fountain-with-confirm-diff — are recorded in
[ROADMAP_ARCHIVE.md](ROADMAP_ARCHIVE.md) for context.)

### Sigil grammar

```
#INT CLASSROOM DAY

>ALPHA enters left
>BETA enters right

@ALPHA
We start here. Multiple lines of dialogue
just keep going until the next sigil line.

>ALPHA moves center

@BETA
Copy that.

#EXT PARK DAY

>ALPHA exits right
```

- `#` — scene heading. Starts a new scene. Tokens after it (INT/EXT, setting, time-of-day)
  complete against the same closed sets the heading Comboboxes used.
- `>` — action beat. `>ALPHA enters left` tokenizes actor → verb (enter/exit/move/hold, light
  synonym normalisation) → verb-specific arg (side/mark/seconds) — the same closed sets
  `ActionBeat` already has.
- `@` — speaker cue. `@ALPHA` alone on a line sets "current speaker"; every non-sigil line after
  it, up to the next sigil line, is dialogue text attributed to that speaker — verbatim, never
  tokenized. This is Fountain's own character-cue-then-dialogue-block convention, made
  unambiguous with an explicit sigil instead of Fountain's fragile ALL-CAPS-plus-blank-line
  heuristic.
- Blank lines are pure visual separation, ignored by the tokenizer.
- An unmatched `@BOB` or `#AIRCRAFT CABIN` never blocks or errors — it becomes a placeholder-
  eligible name that flows straight into **Track CAT**'s resolution pipeline. This combination —
  sigils removing type ambiguity, CAT placeholders removing the need to stop and resolve — is
  what makes uninterrupted forward typing safe. See "Interleaving with Track CAT" below.

### SCR-0 — Caret-position autocomplete primitive (spike)

The single highest-uncertainty, highest-reuse piece; every sigil depends on it. Recommend a
plain `<textarea>` (native cursor/selection/undo/IME handling) with a popup positioned via the
standard "mirror div" technique — an offscreen div with identical font/padding, text copied up
to the caret, a marker span read for pixel offset. Well-precedented (early CodeMirror,
`textarea-caret-position`, various inline @mention implementations) — deliberately not
contenteditable, which brings a long tail of cursor/selection/IME edge cases out of proportion
to a single-developer POC.

- Spike one sigil (`@` actor completion) end-to-end before generalising to `>` and `#`.
- Tab/Enter with the popup open splices the completion into the textarea's value at the cursor
  via plain string manipulation — no DOM diffing.

Exit criteria: typing `@AL` against cast `[ALPHA, BETA]` shows an inline popup positioned at the
caret; Tab/Enter commits; Escape dismisses; feel is validated before building the full tokenizer.

### SCR-1 — Tokenizer + lossless round-trip (core data layer)

- `tokenizeScript(text): { doc: ScriptDocument, diagnostics }` and `renderScript(doc): string` —
  the sigil-editor's own render/parse pair, replacing the boxed editor's data flow. Distinct from
  `renderFountain()`, which is repurposed as a clean-output renderer (see SCR-5).
- Golden round-trip tests: `tokenizeScript(renderScript(doc)) === doc` and
  `renderScript(tokenizeScript(text)) === text`, mirroring the discipline already proven for
  `renderFountain`/`compileScriptDocument`.
- Both treatment fixtures (`TREATMENT_DIALOGUE_DRIVEN.md`, `TREATMENT_ACTION_DRIVEN.md`)
  expressed as sigil text, tokenizing losslessly.

Exit criteria: round-trip tests green for both fixtures; `ScriptDocument`/`Beat`/`compileScriptDocument`
types and logic are completely unchanged — only a new text ↔ data mapping is added.

### SCR-2 — Textarea editing surface with inline autocomplete

- Single `<textarea>` replaces the boxed beat-row editor as the primary authoring surface.
- On input, tokenize only the current line (cheap) to determine the open sigil scope and
  position the SCR-0 popup.
- `@` scopes to cast names. A typed name with no cast match still commits as plain text — no
  block, no interrupt — and becomes a Track CAT placeholder at compile time (requires CAT-1
  landed first; see interleaving below).
- `>` scopes to verb after the actor resolves, then the verb's conditional arg (side/mark/seconds).
- `#` scopes scene-heading tokens (INT/EXT, setting, time-of-day); an unmatched setting becomes a
  Track CAT placeholder scene (requires CAT-2).
- Debounced tokenize-whole-buffer → `ScriptDocument` → `compileScriptDocument()`, same 500ms
  pattern as today's `scheduleCompile`.

Exit criteria: a full scene (heading, two actors entering, a dialogue exchange, an action beat)
is authored keyboard-only in the textarea, autocomplete guiding every sigil-scoped token, and
compiles correctly with no mouse interaction.

### SCR-3 — Multi-scene authoring via `#` breaks

Because `#` both starts a heading and marks a scene boundary, a multi-scene document falls out of
SCR-1/SCR-2 directly — keep typing past one scene into the next, no separate scene-switcher UI
needed for *authoring*.

Exit criteria: both treatment fixtures authored as one continuous buffer compile to N-scene
productions; switching the viewport to a given scene works from the SCR-4 navigator (or a
temporary scene-index fallback if SCR-4 hasn't landed yet).

### SCR-4 — Scene/act navigation minimap *(polish, not core)*

A read-only hierarchical outline of scenes/acts alongside the buffer, click-to-scroll-to — the
same navigational aid commercial Fountain editors (Highland, Slugline) provide over a page-based
document. Explicitly polish: the core typing loop (SCR-0 through SCR-3) works without it; this
only helps navigate a long multi-scene document once one exists.

### SCR-5 — Sigil visibility toggle + clean export view

- "Hide sigils" toggle — Word's show/hide-formatting-marks pattern — renders the buffer with
  sigils faded or hidden, showing cast-case names and prose only, closer to a pure screenplay
  look, without changing the underlying buffer or data.
- Drop the boxed editor's read-only Fountain `<details>` preview pane entirely — redundant once
  the primary buffer already reads like a screenplay.
- `renderFountain()` (today's function, currently used for the live preview) is repurposed as a
  clean **export/print-preview** renderer — pure Fountain output, no sigils — feeding the future
  TDA-4 FDX export and any print-preview feature, no longer part of the primary editing surface.

Exit criteria: toggling "hide sigils" changes only visual presentation, never the underlying
text/data; the FDX/print export path uses `renderFountain()`'s clean output independently of
whatever sigil-visibility state the editor is in.

### Interleaving with Track CAT

SCR's safety property — typing a new name never interrupts the flow — depends on Track CAT's
placeholder resolution existing first, otherwise every unmatched name would need a blocking
disambiguation dialog, defeating the point. Build order:

1. **SCR-0** (spike) and **SCR-1** (tokenizer) — independent of CAT, pure editor/data-layer work.
2. **CAT-0** (bundled generic-human asset) — needed before CAT-1 can stage a real placeholder body.
3. **CAT-1** (cast resolution + placeholder) — makes it safe for SCR-2 to accept unmatched `@`
   names without interrupting.
4. **SCR-2** (textarea + inline autocomplete) — now safe to ship for `@`/`>`; the `#` setting
   sigil can land in the same pass or wait one step for CAT-2.
5. **CAT-2** (setting resolution + placeholder) — makes `#` setting-name typing equally safe.
6. **SCR-3** (multi-scene via `#`) — falls out once SCR-2 is complete.
7. **CAT-3** (catalogue panel + nav links) — independent, can land any time after CAT-0–2.
8. **CAT-4** (create-real-asset bridge) — depends on CAT-1/CAT-2's diagnostics existing.
9. **SCR-4** (navigation minimap) and **SCR-5** (sigil visibility + clean export) — polish, any order.
10. **CAT-5** (bundled starter archetypes) — polish, any order.

---

## Current Focus

**Next up: SCR-0** — caret-position autocomplete spike (`@` actor completion in a plain
textarea). Then proceed through the interleave order above.

| Step | What | Check |
|------|------|-------|
| 1 | SCR-0: caret-autocomplete spike (`@` actor completion in a plain textarea) | Popup follows caret; Tab/Enter commits; Escape dismisses |
| 2 | CAT-0: bundle generic-human as a real catalogue `CharacterEntry` | "Generic Human" selectable like "Robot" |
| 3 | SCR-1: tokenizer + `renderScript()`, lossless round-trip tests on both treatment fixtures | Round-trip tests green |
| 4 | CAT-1: cast resolution + placeholder lozenge sprite + diagnostic | Two cast members, one resolved one placeholder, visually distinct |
| 5 | SCR-2: textarea replaces boxed editor; `@`/`>` sigils live, `@` accepts unmatched names safely | Full scene authored keyboard-only, no dropdowns |
| 6 | CAT-2: setting resolution + placeholder room | Unmatched setting → labelled placeholder room |
| 7 | SCR-3: `#` sigil scene breaks — multi-scene falls out | Both fixtures as one buffer compile to N-scene productions |
| 8 | CAT-3: catalogue panel + cross-tool nav links | Browse catalogue and reach `/character`/`/sketch` from the script view |
| 9 | CAT-4: "Create real asset" bridge from a placeholder diagnostic | Placeholder → authored asset round-trip with zero script edits |
| 10 | SCR-4 / SCR-5 / CAT-5: navigation minimap, sigil visibility toggle, bundled archetypes | Polish, any order |

---

## Acceptance Fixtures

- [TREATMENT_DIALOGUE_DRIVEN.md](TREATMENT_DIALOGUE_DRIVEN.md)
- [TREATMENT_ACTION_DRIVEN.md](TREATMENT_ACTION_DRIVEN.md)

Each milestone must be validated against both fixtures.
