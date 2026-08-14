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

### CAT-0 — Bundle a generic default humanoid as a real catalogue asset ✅ COMPLETE

Delivered: `scripts/exportGenericHuman.mjs` drives the real `/character` → Export to Catalogue
flow headlessly via Playwright (starts the dev server, loads `/character` with zero tuning,
clicks Export, pulls the resulting GLB out of OPFS) — guarantees the bundled asset matches
exactly what a fresh session produces, not a reimplementation of the export logic. Output saved
to `static/models/gltf/generic-human.glb` (2.98 MB). Bundled `CharacterEntry` added in
`entries.ts` (`id: 'generic-human'`, `defaultAnimation: 'idle'`, `defaultScale: 1`), with 2 new
tests in `catalogue.test.ts` confirming it resolves via `getCharacters`/`getById` alongside the
Robot.


### CAT-1 — Cast member → catalogue resolution + placeholder indicator ✅ COMPLETE

Delivered: `compileScriptDocument(doc, userEntries?)` now takes an optional merged-catalogue
argument and resolves each cast name via case-insensitive label match against
`CATALOGUE_ENTRIES` + any passed-in user (OPFS) entries; unresolved names fall back to the
CAT-0 `generic-human` id and are flagged `placeholder: true` on the `StoredActor`, with an
`info`-level diagnostic. `placeholder` threads through `Actor` (domain), `Model.placeholderActors`
(`src/lib/Model.ts`), and `SceneBridge.sceneToModel()`. `Presenter.svelte` renders a persistent
amber lozenge sprite (`⚠ NAME`) above each placeholder actor's head for its entire time on
stage — reuses the `CanvasTexture`/`THREE.Sprite` billboard mechanism already built for speech
bubbles, but attached at scene-load time instead of per-line. `+page.svelte` loads
`OPFSCatalogueStore.list()` on mount and passes the merged entries into both
`compileScriptDocument` and `storedSceneToModel`, so user-authored characters resolve too. 6 new
tests in `fountainCompiler.test.ts` covering bundled-label match, placeholder fallback,
two-actors-distinct, and OPFS-entry resolution.

Exit criteria met: two cast members in one scene, one bound to an existing catalogue entry, one
unbound, render as visually distinct — the unbound one is unmistakably marked as a placeholder,
not a wrong-but-confident character.


### CAT-2 — Setting → scenery resolution + placeholder indicator ✅ COMPLETE

Delivered: `compileSceneBlock()` now resolves the heading's `setting` against the merged
catalogue (`SetPieceEntry` first, then `EnvironmentEntry`) via case-insensitive label match — the
compiler no longer calls `buildStageFloor()` unconditionally (that hardcoded stage-and-wings
builder is removed). A `SetPieceEntry` match stages the real geometry (user-authored OPFS set
pieces are persisted as `opfs://<id>` gltfPath references resolved by `storedSceneToModel`); an
`EnvironmentEntry` match sets `StoredScene.environmentMap`; no match synthesises a placeholder
room — a single floor plane (`placeholder-room`, 6×6, slate blue, visually distinct from the old
stage-and-wings) with an `info`-level diagnostic. The typed setting name is threaded through
`StoredScene.placeholderSetting` → `Scene` → `Model.placeholderSetting` (mirroring CAT-1's
`placeholderActors`), and `Presenter.svelte` draws it as a `CanvasTexture` on the floor plane
itself (`⚠ NAME`) rather than a floating billboard. 6 new tests in `fountainCompiler.test.ts`
plus 2 in `storedSceneToModel.test.ts`.

Exit criteria met: typing a setting with no catalogue match produces a placeholder room with the
setting name legibly written on the floor; typing a setting matching a bundled or
Sketcher-exported set piece resolves to the real geometry with no placeholder marker.

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

### SCR-0 — Caret-position autocomplete primitive (spike) ✅ COMPLETE (superseded by SCR-2)

Delivered: `src/core/treatment/sigilAutocomplete.ts` (pure, DOM-free tokenizer:
`findActiveSigilToken`, `applySigilCompletion`, `filterCastOptions`, 15 tests) +
`src/lib/script/SigilTextarea.svelte` (plain `<textarea>` with mirror-div caret-position
popup, wired behind a "@ sigil spike" toggle in `+page.svelte`, not yet connected to
compile). Validated the `@` actor-completion feel end-to-end before generalising to `>`/`#`
in SCR-2, which replaced the toggle-gated spike with the primary authoring surface.



### SCR-1 — Tokenizer + lossless round-trip (core data layer) ✅ COMPLETE

Delivered: `src/core/treatment/sigilScript.ts` — `tokenizeScript(text)` and `renderScript(doc)`,
the sigil editor's text ↔ `ScriptDocument` mapping, fully independent of the boxed editor's
`renderFountain()`/`compileScriptDocument()` (both untouched). 28 tests in
`sigilScript.test.ts`, including golden round-trip tests in both directions
(`tokenizeScript(renderScript(doc)) === doc` structurally, and
`renderScript(tokenizeScript(text)) === text` for canonical text) against scene structures
mirroring both treatment fixtures (dialogue-driven and action-driven styles). Diagnostics are
emitted (not thrown) for unscoped lines, action beats before any scene heading, and unknown
verbs — consistent with the "never blocks" principle Track CAT depends on.


### SCR-2 — Textarea editing surface with inline autocomplete ✅ COMPLETE

Delivered: `sigilAutocomplete.ts` generalised from the SCR-0 `@`-only spike to all three sigils —
`findActiveSigilToken()` now returns `tokenIndex`/`priorTokens` so a multi-field line
(`>ALPHA enters left`) knows which field the caret is in, and `sigilFieldOptions(sigil,
tokenIndex, priorTokens, cast)` resolves the closed set for that field (cast names for `@`/`>`
token 0, verbs for `>` token 1, side/mark/open for `>` token 2 depending on the verb already
typed, INT/EXT for `#` token 0, open free text for setting/time-of-day/dialogue/hold-seconds).
`VERB_ALIASES`/`SIDE_WORDS`/`MARK_WORDS` moved to exports on `sigilScript.ts` so both modules
share one closed-set source of truth. 31 tests in `sigilAutocomplete.test.ts` (up from 15),
covering multi-field token detection and every `sigilFieldOptions` branch.

`SigilTextarea.svelte` is now the primary authoring surface in `+page.svelte`, replacing the
boxed Combobox beat editor outright (the SCR-0 "spike" toggle is gone — this is no longer
experimental). It owns its own popup lifecycle: refreshes the active token and closed-set
options on every input/click/keyup, positions the popup via the existing mirror-div technique,
and commits a selection with a trailing space when the sigil grammar expects another field to
follow on the same line (e.g. after an actor name on a `>` line) versus no trailing space on a
line's final field (dialogue speaker cue, an action beat's last arg) — Enter naturally starts the
next line there. `+page.svelte` wires the buffer through `tokenizeScript()` → `ScriptDocument` on
every change, debounced into the existing 500ms `scheduleCompile()` → `compileScriptDocument()`
path, unchanged. The sigil buffer text itself is persisted as `NamedScene.dslSource` so
re-opening a production restores the authored text verbatim, not a re-render of compiled data.
The boxed per-field editor (`Combobox`-driven beat rows, heading fields, cast add/rename UI) and
the now-redundant SCR-0 toggle were removed from `+page.svelte`; `ScriptEditor.svelte` (the
separate dialogue-line-list editor) and `Combobox.svelte` are unused by the script view as of
this change and are left in place as-is pending a follow-up cleanup pass, since nothing else in
the roadmap currently depends on deleting them.

Exit criteria met: a full scene (heading, two actors entering, a dialogue exchange, an action
beat) is authorable keyboard-only in the textarea, autocomplete guiding every sigil-scoped token
via Tab/Enter/arrow-keys, Escape dismissing without committing, and the result compiles via the
unchanged `compileScriptDocument()` path with no mouse interaction required. 599 tests green,
`svelte-check` clean.


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

**SCR-2 and CAT-2 landed.** ⏸ **Paused here for review/testing before continuing to SCR-3**, per
the plan below.

| Step | What | Check |
|------|------|-------|
| 1 ✅ | SCR-0: caret-autocomplete spike (`@` actor completion in a plain textarea) | Popup follows caret; Tab/Enter commits; Escape dismisses |
| 2 ✅ | CAT-0: bundle generic-human as a real catalogue `CharacterEntry` | "Generic Human" selectable like "Robot" |
| 3 ✅ | SCR-1: tokenizer + `renderScript()`, lossless round-trip tests on both treatment fixtures | Round-trip tests green |
| 4 ✅ | CAT-1: cast resolution + placeholder lozenge sprite + diagnostic | Two cast members, one resolved one placeholder, visually distinct |
| 5 ✅ | SCR-2: textarea replaces boxed editor; `@`/`>`/`#` sigils live, unmatched names/verbs/settings commit safely | Full scene authored keyboard-only, no dropdowns |
| 6 ✅ | CAT-2: setting resolution + placeholder room | Unmatched setting → labelled placeholder room |
| — | **⏸ Pause here for review/testing before continuing** | |
| 7 | SCR-3: `#` sigil scene breaks — multi-scene falls out | Both fixtures as one buffer compile to N-scene productions |
| 8 | CAT-3: catalogue panel + cross-tool nav links | Browse catalogue and reach `/character`/`/sketch` from the script view |
| 9 | CAT-4: "Create real asset" bridge from a placeholder diagnostic | Placeholder → authored asset round-trip with zero script edits |
| 10 | SCR-4 / SCR-5 / CAT-5: navigation minimap, sigil visibility toggle, bundled archetypes | Polish, any order |






---

## Acceptance Fixtures

- [TREATMENT_DIALOGUE_DRIVEN.md](TREATMENT_DIALOGUE_DRIVEN.md)
- [TREATMENT_ACTION_DRIVEN.md](TREATMENT_ACTION_DRIVEN.md)

Each milestone must be validated against both fixtures.
