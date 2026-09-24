# Directionally — Workflows

Step-by-step walks through the app, each following the path a person would actually take, so a
feature can be verified end to end and the gaps it leaves can be named. Two families so far: the
script-era walks (W1, W2) and the sketcher’s (S1–S4).

Read **Recording a walkthrough** first: it fixes the status key, where the notes go, and what a
finished walkthrough closes with.

---

## Recording a walkthrough

A walkthrough is walked once as a person would walk it, and what comes back is the table filled in, not
a prose report. Workflow 1 is a filled example; S1 is the shape a fresh one starts in.

**Where the notes go:** a comment on the walkthrough's issue, one comment per run. The issue's own
close criterion is the document, so the comment is the raw record and the table above is where it ends
up once the walkthrough settles — which is what makes it re-runnable later.

```
Walkthrough: W1 — script to a watched scene
Run: 2026-09-24, preview <url> | local yarn dev, commit <sha>
Verdict: one sentence — is the thing this workflow is for actually possible?

| Step | Status | Note | Snag |
|:----:|:------:|------|------|
| 4 | OK | | |
| 5 | Partial | had to resize the window before the popup was visible | #72 |
| 7 | Fail | nothing appeared after the click | #73 |
| ✓ | OK | humanoids stand in the setting; proportions are wrong | #74 |

Friction that did not fail a step:
- ...

Snags filed: #72 #73 #74
Not walked: Part D — needs #27
```

**Two conventions the columns assume.**

- **One snag, one issue.** File it as it happens, quote the step number, and link the walkthrough in it.
  The Issues cell then carries the number, and the table becomes the index of what this workflow owes.
- **Friction is a finding even when the step passes.** A step that works awkwardly is `OK` in the Status
  column and still goes in the list underneath: the Status key has no value for "works, but I would not
  want to do that again", and that is exactly what the walkthroughs are being run to find.

---

### Part A — Create the production

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Open the app; left panel shows the **Productions** tab | OK | |
| 2 | Click **+ New**; a production row appears with the name field already selected | OK | |
| 3 | Type `"The Robot Play"` and press **Enter**; production is created and loaded | OK | |
| 4 | Right panel switches to the **Staging** tab automatically (production is empty) | OK | |
| ✓ | Left panel shows "The Robot Play" as the active production | OK | |

---

### Part B — Build the cast

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 5 | Expand the production row (click the **▶** toggle if collapsed) | OK | |
| 6 | Click **+ Add** in the Cast section; a new actor row appears in inline rename mode, pre-named "Character 1" | Ok | |
| 7 | Type `"Alpha"` and press **Enter** | Ok | |
| 8 | In the model selector on the same row, choose **Robot Expressive** (should be default) | OK | |
| 9 | Repeat steps 6–8 to add a second actor named `"Beta"`, also Robot Expressive | OK | |
| ✓ | Cast shows Alpha and Beta, both as Robot Expressive | OK | |

---

### Part C — Create the act and scene structure

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 10 | Scroll to the **Scenes** section in the production's expanded panel | OK | |
| 11 | Click **+ Act**; an act group appears in rename mode — type `"Act 1"` and press **Enter** | Ok | |
| 12 | Click **+ Act** again; name it `"Act 2"` | Ok | |
| 13 | Under Act 1, click **+ Scene**; name it `"The Encounter"`. Click **+ Scene** again; name it `"The Chase"` | Ok | |
| 14 | Under Act 2, click **+ Scene**; name it `"The Confrontation"` | Ok | |
| 15 | Under Act 2, click **+ Scene**; name it `"Resolution"` | Ok | |
| 16 | Use the root **+ Scene** button at the bottom of the Scenes section; name it `"Prologue"` | Ok | |
| ✓ | Scenes section shows 2 act groups × 2 scenes + 1 top-level Prologue = 5 scenes; clicking a scene name switches to it | Ok | |

---

### Part D — Author Scene 1 (Prologue)

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 17 | Click **Prologue** in the Scenes list; canvas loads the scene | OK | |
| 18 | Switch to **Design view** (click `✏ Switch to Design view` or the toggle in the bottom panel header) | OK | |
| 19 | In the Cast section, click the **○** badge next to **Alpha**; it becomes **●** (staged offstage) | OK | |
| 20 | Click the **○** badge next to **Beta**; Beta is staged | OK | |
| 21 | Click Alpha's pre-t=0 block in the timeline (coloured block left of the zero line); the Staging tab highlights Alpha's spawn position fields | Ok |  |
| 22 | In the 3D canvas, click Alpha's model and drag to `[-3, 0, 0]` | Ok | |
| 23 | Spawn position updates automatically on drag end | Ok | |
| 24 | Repeat for Beta: click Beta's pre-block, then drag Beta's model to `[3, 0, 0]` | Ok | |
| 25 | Open the **Script** tab in the right panel | Ok | |
| 26 | Click **+ Add line** | Ok | |
| 27 | Set actor to **Alpha**; type `"Beta, we meet at last."` | Ok | |
| 28 | Click **+ Add line** again | Ok | |
| 29 | Set actor to **Beta**; type `"Indeed, Alpha. I have been waiting."` | Ok | |
| 30 | Click **▶ Switch to Playback view** and press **▶**; Alpha and Beta speak with speech bubbles | Partial | characters don't do their idle animation |
| 31 | Press **■** (rewind) to return to t=0 | Ok | |
| ✓ | Two characters on stage; two spoken lines play correctly | Ok | |

---

### Part E — Author Scene 2 (The Encounter)

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 32 | Click **The Encounter** in the Scenes list (under Act 1) | Ok | |
| 33 | Stage both **Alpha** and **Beta** (click their **○** badges) | Ok | |
| 34 | In Design view, drag-spawn Alpha to `[-2, 0, 2]` and Beta to `[2, 0, 2]` | Ok | |
| 35 | Script tab: add Alpha `"We have come far."` and Beta `"The journey is not over."` | Ok | |
| 36 | In the timeline, drag from t=0 to t=2 on Alpha's track row to draw a walking block; set Clip to **Walking**; set end position by dragging Alpha to `[0, 0, 2]` or clicking **⊕ Capture end position** | Ok | |
| 37 | Play the scene; confirm Alpha walks while dialogue plays | Ok | |
| ✓ | Alpha walks across stage during the second scene | Ok | |

---

### Part F — Author Scenes 3, 4, and 5

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 38 | Click **The Confrontation** (under Act 2); stage both actors; add 2–3 dialogue lines | — | |
| 39 | Click **Resolution** (under Act 2); stage both actors; add a final line each | — | |
| 40 | Click **The Chase** (under Act 1); stage both actors; add 1–2 dialogue lines | — | |
| 41 | For each scene, scrub the transport slider; verify duration is non-zero | — | |
| ✓ | All 5 scenes have staged actors and dialogue | — | |

---

### Part G — Present the full production

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 42 | Next to the production title, click **⏵⏵ Present**; left/right panels and timeline collapse; canvas fills the window; HUD shows current scene name and "Esc to exit" | Partial | Switch to Design View is still present, which shouldn't be. Can't 'Esc to exit' on a touch device |
| 43 | First scene (Prologue) begins playing automatically | Ok | |
| 44 | When Prologue ends, the tool cuts to Act 1 — The Encounter and plays it | Ok | |
| 45 | Scenes continue depth-first through Act 2 — Resolution | Ok | |
| 46 | After the last scene ends, presentation mode pauses on final scene | Ok | |
| ✓ | All 5 scenes play in order without manual intervention; canvas fills the window throughout | Ok | |

---

### Part H — Exit and verify persistence

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 47 | Press **Esc** during any scene to exit presentation mode early; tool returns to the scene active before presentation started | Ok | |
| 48 | Reload the page (`Cmd/Ctrl+R`) | Ok | |
| 49 | Click **The Robot Play** in the productions list | Ok | |
| 50 | Confirm the cast (Alpha, Beta) is intact and the scene tree (5 scenes) is intact | Ok | |
| 51 | Press **▶** on any scene; confirm dialogue still plays | Ok | |
| ✓ | Production survives a page reload with all data intact | Ok | |

---

### Known gaps

Tracked in the [issue tracker](https://github.com/boostybaboon/directionally/issues?q=is%3Aissue+is%3Aopen)
— this table used to cite phases from a plan that no longer exists, which was worse than having no
table. The dressing surface it named as missing (#10) has since landed, syntax and panel both; a re-run
of this workflow is what would say whether anything else now stands in its way.

---

## Workflow W1 — Script to a Watched Scene

**Goal:** Write a scene in sigils — a venue and two characters — settle whatever the Roster calls unresolved, and watch it play: both actors enter the setting, speak their lines and move in it.

**Preconditions:** App running (`yarn dev --open`, or a preview URL from a pull request). No existing production needed.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — A production to write in

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Open the app. The topbar shows `☰`, a name field and the `Character` / `Set` links; the left panel's tabs read Script / Roster / Set / Catalogue, and it is on **Script** | — | |
| 2 | Click `☰`; the picker lists the existing productions, with `+ New production` and `Example scene` | — | |
| 3 | Click **+ New production**; the picker closes and the name field reads "Untitled Production" | — | |
| ✓ | A production exists with an empty script | — | |

---

### Part B — Write the scene

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 4 | Type `#INT KITCHEN DAY` as the first line; a scene appears in the minimap on the left, numbered 1 and reading `KITCHEN` | — | |
| 5 | On the next line, type `>ALICE enters left` | — | |
| 6 | Type `@ALICE`, then a line of dialogue such as `Where is everybody?` | — | |
| 7 | Type `>BOB enters right`, then `@BOB` and a line of his own | — | |
| ✓ | One scene, two characters, four sigil lines, a line of dialogue each | — | |

---

### Part C — Settle the Roster

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 8 | Click **Roster**. **Cast** lists `ALICE` and `BOB`; with no catalogue entry carrying those names, each row reads `unmatched` | — | |
| 9 | Choose **Robot** in ALICE's row; the row's status becomes `→ Robot` | — | |
| 10 | Do the same for BOB | — | |
| 11 | In **Scenery**, `KITCHEN` is listed with the same chooser. Pick **Studio (neutral)** — an environment resolves a setting too, and no venue is bundled (see Known gaps) | — | |
| 12 | Back on **Script**, the warnings under the editor are gone, and the `Set → …` line above the diagnostics names what the setting resolved to | — | |
| ✓ | Every name the script uses resolves, and the Roster says so | — | |

---

### Part D — Watch it

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 13 | The viewport shows the focused scene: the environment, with ALICE and BOB standing on the ground | — | |
| 14 | Press **▶** in the transport bar (it stays disabled until the audio backend reports ready) | — | |
| 15 | Both actors walk in from their sides, then speak, each line in turn | — | |
| 16 | Playback reaches the end of the scene and stops | — | |
| ✓ | A written scene is watchable: humanoids in a setting, saying the lines the script gave them | — | |

---

### Part E — It survived

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 17 | Reload the page (`Cmd/Ctrl+R`); the production is still listed, with the same script and the same bindings | — | |
| ✓ | The production persists across a reload | — | |

---

### Known gaps

Not yet walked, so nothing here is known from experience. One thing is known from the code: **no venue is
bundled**. `bundledSets.ts` ships props — Chair, Desk, Bench, Whiteboard, Blackboard, Window, Door,
Bookshelf, Cabin Seat — and none is marked scenery, so a setting resolves to an environment, or to a
venue authored in the Set editor. Bundled starter archetypes are
[#26](https://github.com/boostybaboon/directionally/issues/26).

---

## Workflow W2 — Dressing a Scene

**Goal:** Vary a venue for one scene without editing the venue itself — hide a piece, place it, take it out — and have the variation live in the script, visible to that scene alone.

**Preconditions:** A production whose focused scene has a setting resolving to a set-piece with a document. W1 leaves you next to this, minus the venue: author one in the Set editor (`/sketch`, save as item, marked scenery), or walk this against a venue you already have.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — See what the venue is made of

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Click **Set**; the panel names the focused scene's setting and lists its node paths, children indented under their parent | — | |
| 2 | The header shows no line count: this scene says nothing yet | — | |
| ✓ | The venue's nodes are listed | — | |

---

### Part B — Hide one, and see the script change

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 3 | Press **hide** beside a node; the row gains a `hidden` flag | — | |
| 4 | Click **Script**; `## hide <node>` sits under that scene's heading | — | |
| 5 | The viewport shows the piece gone from the scene | — | |
| 6 | Back on **Set**, press ✕ on the row; the line goes and the piece returns | — | |
| ✓ | Hiding is legible in both the script and the scene | — | |

---

### Part C — Place one

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 7 | Click the node's name; a detail strip opens with `At` and three number fields | — | |
| 8 | Enter x/y/z and press **place**; `## move <node> x y z` is written under the heading and the piece moves | — | |
| 9 | The piece keeps its own rotation and size, having only moved | — | |
| 10 | Press ✕ beside the strip; the placement is cleared and the piece returns to where the venue puts it | — | |

---

### Part D — Take one out

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 11 | Press **remove** on another node; `## remove <node>` is written and the piece is gone | — | |
| 12 | Click the scene in the minimap, then back; the dressing is unchanged | — | |
| ✓ | A venue can be varied without editing the venue | — | |

---

### Part E — Only this scene

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 13 | Add `#EXT STREET NIGHT` at the end of the script and give it the same setting | — | |
| 14 | Put the caret in the new scene: the **Set** tab shows no lines, and every node is present | — | |
| 15 | Type `##` on a line of the new scene; the completion offers hide / show / remove / move, then the venue's node paths once an op is chosen | — | |
| 16 | Type `## hide <node>` by hand and click away: the panel shows it, so text and panel agree | — | |
| ✓ | One scene varies its venue, the other does not, and the variation is legible in the script | — | |

---

### Known gaps

Not yet walked. Known from the code: the panel writes `##` lines into the script rather than into the
compiled scene, so the script is the record and undo travels with it; and the node field completes from
the venue's document, which a bundled venue carries inline and a user-authored one is read on demand.

---

## Workflow W3 — Character Animation

**Goal:** A character walks from one side of the scene to the other because the script says so: the clip is the walk, the motion is a block, and the block is visible on the actor's track.

**Preconditions:** A production whose Roster resolves a cast name to a character - **Robot** is bundled - in a scene they appear in. W1 leaves you there.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — The script puts them on stage

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | In the script write `>ALICE enters left`, then below it `>ALICE moves center` | — | |
| 2 | The timeline shows a row for ALICE, with one block per beat, each labelled with the clip it plays (`walk`, or `Walking` for the Robot) | — | |
| 3 | Add `>ALICE holds 2`: a third block appears, spanning two seconds and labelled `—` - a hold is a pause, not a movement | — | |
| ✓ | Every movement the script asks for is a block on that actor's track | — | |

---

### Part B — Watch the walk

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 4 | Press **▶** in the transport bar | — | |
| 5 | ALICE walks in from the left, then walks on to the centre mark | — | |
| 6 | The playhead crosses each block as its animation runs | — | |
| ✓ | A character walks from A to B, from script to screen | — | |

---

### Part C — Draw a block by hand

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 7 | Drag across ALICE's track in the timeline; a ghost block follows the pointer | — | |
| 8 | On release, a block exists for that span | — | |
| 9 | Drag the block's left or right edge to change when it starts and ends | — | |
| 10 | With a block selected, press **Delete**; it is removed | — | |
| ✓ | A block can be drawn, resized and removed without touching the script | — | |

---

### Part D — Choose what a block plays

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 11 | Select a block; its label names the clip it plays, and the clips the model actually carries are available to choose from | — | |
| 12 | Change that clip and watch the block play the other animation | — | |
| ✓ | A block's animation is a choice, not a consequence of the verb | — | |

---

### Known gaps

Read from the code before the walk, which is why Parts A and B should pass and Parts C and D should not:

- **The timeline is wired as a view.** `+page.svelte` passes it actors, blocks, scene duration, playhead position and the discovered clips - and no handlers at all. The ⊕ buttons, drawing on a track, edge dragging, deleting and speech dragging are all inert as wired today.
- **Filed as [#73](https://github.com/boostybaboon/directionally/issues/73)** — the inert controls above, and the reason Parts C and D are expected to Fail.
- **Blocks come from the script's verbs.** `enter` / `exit` / `move` compile to a walk-clip block each; the walk clip itself is the character's own (`walkAnimation`, `Walking` for the Robot), which is why step 11's chooser has nothing behind it either.

## Workflow W4 — Camera Work

**Goal:** Cut between angles: the scene opens on one view, and at a point in the scene it moves to another.

**Preconditions:** A production with a scene that plays — W1 leaves you there.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — What the camera does today

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Play a scene and note the view it opens on: the compiled scene carries a camera, and that is what the viewport shows | — | |
| 2 | Look down the timeline for a camera track, beside the actors' | — | |
| 3 | Press the ⊕ beside it — "Set scene opening camera view" | — | |
| 4 | Drag across the camera track to place an angle change at a point in the scene | — | |
| 5 | Play from the start: the view holds the opening angle, then cuts or moves at the block's time | — | |
| ✓ | A scene can be shot from more than one angle, decided in the app | — | |

---

### Known gaps

Read from the code before the walk, and it is a short walk: **no camera block ever reaches the
timeline.** `CameraBlock` exists in the model and `TimelinePanel` renders a camera row with a ⊕ for the
opening view, but the page passes the panel `actorBlocks` only, alongside the duration, the playhead and
the discovered clips. So step 2 has no row to find, and steps 3 to 5 have nothing behind them — the same
unwired-panel gap as [#73](https://github.com/boostybaboon/directionally/issues/73), except that actor
blocks at least have the script's verbs as a way in and camera blocks have no authoring surface at all.

Step 1 should pass, and is worth confirming: it is the one part of this workflow the app can do.

---

## Workflow W5 — Lighting

**Goal:** Light a scene with intent: a lamp that is off at the top of the scene comes up, holds, and goes down again — and its colour and brightness can be set before anything moves.

**Preconditions:** A production with a scene that plays — W1 leaves you there.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — What lights the scene today

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Play a scene: it is lit by what the venue’s own document carries, plus the starter rig a scene begins with | — | |
| 2 | Look down the timeline for a row per light | — | |
| 3 | Press the ⊕ beside a light — "Edit *light* initial properties" — and set its colour or intensity before the scene starts | — | |
| 4 | Drag across a light’s track to draw a block: off at 0s, up to full by 2s | — | |
| 5 | Play from the start and watch the light come up at that point, not before | — | |
| ✓ | A light can be set before a scene and changed during it | — | |

---

### Part B — The one place lighting is authorable

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 6 | Open the Set editor (`/sketch`) on the venue this scene uses | — | |
| 7 | Add a light node, position it, set its colour and intensity, save the venue | — | |
| 8 | Back in the production, the scene is lit by it — and so is **every** scene set in that venue, since this is the venue’s own document | — | |
| ✓ | A light added to a venue lights every scene set in it | — | |

---

### Known gaps

Read from the code before the walk. **Initial lighting lives in the venue’s document** — the Set editor’s
light nodes, which is Part B and should pass — and **timed lighting has no surface**: `LightBlock` exists
in the model, `TimelinePanel` would draw a row per light with an ⊕ for its initial properties, and the
page passes it neither lights nor blocks. Part A therefore fails from step 2, the same unwired panel as
[#73](https://github.com/boostybaboon/directionally/issues/73) — with the same consequence, that lighting
a *moment* is not currently something the app can be asked to do.

Part B is worth walking anyway: it is the honest answer to "how do I light this scene today", and it is
where the difference between a venue’s light and a scene’s light becomes visible.

---

## Workflow W6 — Print Script

**Goal:** Read the whole production as a screenplay and get it onto paper: clean prose, no sigils, no app around it.

**Preconditions:** A production with a scene or more — W1 leaves you there. Depends on [#27](https://github.com/boostybaboon/directionally/issues/27) (SCR-5) for the clean view.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — Read it

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | On the Script tab, open the **Fountain render** details under the editor | — | |
| 2 | The whole production is there as screenplay prose: scene headings, action lines, and characters above their dialogue | — | |
| 3 | Add a line of dialogue and watch the render follow it | — | |
| ✓ | The screenplay of the whole production can be read in the app | — | |

---

### Part B — Print it

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 4 | With the render open, use the browser’s print (Cmd/Ctrl+P) | — | |
| 5 | The printed page is the screenplay: no editor, no timeline, no topbar | — | |
| 6 | Hide the sigil syntax in the editor and read the script as prose (SCR-5) | — | |
| 7 | Send someone the script as a file they can open | — | |
| ✓ | A script prints as a script | — | |

---

### Known gaps

Read from the code before the walk. Part A should pass: `renderFountain` runs over the parsed document,
and the render is a `<details>` of that text. Part B should fail from step 5 — the app *has* print
stylesheets, and they are in `ProductionScriptView.svelte` and `ScriptEditor.svelte`, neither of which
anything imports ([#75](https://github.com/boostybaboon/directionally/issues/75)) — so printing today
carries the topbar, the panels and the timeline along with the script. Step 6 is
[#27](https://github.com/boostybaboon/directionally/issues/27) (SCR-5): the sigil visibility toggle and
the clean export view, which is what this walkthrough has been waiting on.

---

## Workflow S1 — Sketcher: Precise Positioning, Sizing, and All-Axis Scaling





**Goal:** Create a part, then use the numeric transform inspector to place it at an exact world position, set a precise rotation, and apply non-uniform scale — then re-lock to uniform scale.

**Preconditions:** App running. Navigate to `/sketch`.

---

### Part A — Create and extrude a part

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Click **New sketch**; the canvas enters drawing mode (status bar shows "Click to add points") | — | |
| 2 | Click three or more points on the canvas to form a polygon | — | |
| 3 | Click the first point again to close the shape; the outline turns solid and the shape enters pending-holes state | — | |
| 4 | Click **Extrude**; the part appears in 3D with the default depth | — | |
| ✓ | A solid extruded part is visible in the scene | — | |

---

### Part B — Set a precise world position

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 5 | Click the part to select it; the **transform inspector** appears below the toolbar showing **Pos / Rot° / Scale** rows | — | |
| 6 | In the **Pos** row, click the **X** field; type `2.00` and press **Enter** | — | |
| 7 | The part snaps to X = 2.0 in world space; the move gizmo repositions accordingly | — | |
| 8 | Repeat for **Y** (`0.50`) and **Z** (`-1.00`); confirm the gizmo follows | — | |
| ✓ | Inspector reads Pos X = 2.00, Y = 0.50, Z = −1.00 | — | |

---

### Part C — Set an exact rotation

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 9 | In the **Rot°** row, set **Y** to `45`; press **Enter** | — | |
| 10 | The part rotates 45° around the world Y axis | — | |
| 11 | Set **X** to `0` and **Z** to `0` to eliminate any drift | — | |
| ✓ | Part is cleanly rotated 45° around Y with no X or Z tilt | — | |

---

### Part D — Non-uniform scale on all three axes

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 12 | Confirm the uniform-scale lock shows 🔓 (unlocked) | — | |
| 13 | Set **Scale X** to `2.00`; press **Enter** — only X stretches; Y and Z are unchanged | — | |
| 14 | Set **Scale Y** to `0.50`; press **Enter** — the part flattens vertically | — | |
| 15 | Set **Scale Z** to `1.50`; press **Enter** — the part deepens along Z | — | |
| ✓ | Inspector reads Scale X = 2.00, Y = 0.50, Z = 1.50; part is visibly non-uniform | — | |

---

### Part E — Re-lock to uniform scale and resize proportionally

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 16 | Click the **🔓** lock button; it becomes **🔒** (uniform scale active) | — | |
| 17 | Change **Scale X** to `1.00`; press **Enter** | — | |
| 18 | Y and Z automatically recalculate to maintain the current proportions | — | |
| ✓ | All three scale axes change together; the lock button shows 🔒 | — | |

---

## Workflow S2 — Sketcher: Extrusion with Holes

**Goal:** Sketch a shape with one or more interior cutouts, then extrude it to produce a part with through-holes (e.g. a plate with a window opening and a bolt hole).

**Preconditions:** App running. Navigate to `/sketch`.

---

### Part A — Draw the outer profile

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Select **Rect** in the sketch-mode selector, then click **New sketch** | — | |
| 2 | Click two diagonal corners on the canvas to define a rectangle; the sketch closes automatically | — | |
| 3 | The shape enters pending-holes state; the status bar and HUD show **Add hole** and **Extrude** | — | |
| ✓ | Outer rectangle outline is solid; "Extrude" and "Add hole" buttons are visible | — | |

---

### Part B — Add a first hole

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 4 | Click **Add hole**; the tool re-enters drawing mode (status bar shows "Drawing hole") | — | |
| 5 | Click three or more points **inside** the outer rectangle to trace a hole polygon | — | |
| 6 | Click the first hole point to close it; the hole appears as a cut-out preview inside the outer shape | — | |
| 7 | Drawing returns to pending-holes state automatically | — | |
| ✓ | Shape preview shows the outer rectangle with one cut-out region | — | |

---

### Part C — Add a second hole

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 8 | Click **Add hole** again | — | |
| 9 | Draw a small polygon elsewhere inside the outer shape and close it | — | |
| ✓ | Shape preview shows two cut-out regions inside the outer rectangle | — | |

---

### Part D — Extrude to a specific depth

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 10 | Click **Extrude**; the depth HUD appears showing a numeric input defaulting to the previous depth | — | |
| 11 | Clear the field and type `0.20`; press **Enter** or click away from the field | — | |
| 12 | The part updates to 0.20 m depth in real time | — | |
| 13 | Press **Enter** or click on the canvas outside the HUD to commit; the part is finalised | — | |
| ✓ | An extruded plate with two through-holes appears in the scene; inside faces are visible through the holes | — | |

---

### Part E — Verify undo

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 14 | Click **↩ Undo** (or press **Ctrl+Z**) twice to remove the two hole drawing steps | — | |
| 15 | The part changes to a solid plate (holes removed from geometry) | — | |
| 16 | Click **↪ Redo** twice to restore both holes | — | |
| ✓ | Undo/redo correctly adds and removes hole geometry | — | |

---

## Workflow S3 — Sketcher: Lathing (Revolve)

**Goal:** Draw a half-profile in the XY revolve plane, revolve it around the Y axis at a specified angle, and verify partial and full 360° sweeps both serialise and reload correctly.

**Preconditions:** App running. Navigate to `/sketch`.

---

### Part A — Enter revolve mode and draw a profile

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Click **Revolve…** in the toolbar; the canvas camera pivots to face the XY plane and a Y-axis indicator line appears | — | |
| 2 | The status bar reads "Draw a profile on the right side of the Y axis (x > 0)" | — | |
| 3 | Click three or more points to the **right** of the Y axis (positive X side) to draw a half-profile; a typical vase shape: start at the bottom, go out, then up, then back in toward the axis | — | |
| 4 | Click the first point again to close the profile polygon | — | |
| 5 | The profile closes and the revolve-pending HUD appears showing an **Angle** slider (5–360 °) and **Revolve** / **Cancel** buttons | — | |
| ✓ | A closed half-profile is drawn on the XY plane; revolve HUD is visible | — | |

---

### Part B — Revolve at a partial angle

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 6 | Drag the **Angle** slider to **180**; the label shows `180°` | — | |
| 7 | Click **Revolve**; a half-torus / partial solid appears with flat end caps sealing the open edges | — | |
| 8 | Orbit the camera; confirm both flat end-cap faces are visible and the inner bore surface is visible from inside | — | |
| ✓ | The part is a 180° swept solid with two flat end caps and visible inner surfaces | — | |

---

### Part C — Verify serialisation of a partial sweep

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 9 | Click **Export to Catalogue** (or note the assembly is autosaved) | — | |
| 10 | Reload the page (`Ctrl+R` / `Cmd+R`) and open the same assembly via **Open…** | — | |
| 11 | The part reloads as a 180° sweep with the same geometry | — | |
| ✓ | `phiLength` is persisted in the draft; the loaded part matches the pre-save shape | — | |

---

### Part D — Revolve a second part to full 360°

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 12 | Click **Revolve…** again; draw a different half-profile (e.g. an L-shape or a thick ring cross-section) and close it | — | |
| 13 | Leave the **Angle** slider at **360** | — | |
| 14 | Click **Revolve**; a fully closed solid of revolution appears (no end caps needed) | — | |
| 15 | Orbit the camera; confirm the outer surface is smooth and no cap faces are present | — | |
| ✓ | 360° part has a single surface group and no flat end caps | — | |

---

### Part E — Adjust angle post-creation via the inspector

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 16 | Select the 180° part and use the **Scale** inspector to resize it proportionally | — | |
| 17 | Select the 360° part; scale Z to `0.5` to flatten it into a disc shape | — | |
| 18 | Both parts accept independent numeric transforms without affecting each other | — | |
| ✓ | Each lathed part transforms independently; inspector values match visible geometry | — | |

---

## Workflow S4 — Sketcher: Attach, Group, Snap-to-Floor, and Group Scaling

**Goal:** Combine separate parts into rigid assemblies using attach (face-to-face join with a live joint) and group (arbitrary rigid group), settle the assembly onto the ground plane with snap-to-floor, then scale the whole assembly and individual members independently.

**Preconditions:** App running. Navigate to `/sketch`. Two or more extruded parts already in the scene (create via Workflow S1/S2, or extrude simple polygons now).

---

### Part A — Attach two parts together (face-to-face joint)

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Click **Attach…** in the toolbar (shortcut **G**); the toolbar adds a **⊕ Centre** toggle and the status bar reads "Click any surface to place the anchor blob. Esc cancels." | — | |
| 2 | Click a flat face on Part A (the source part); a pink blob marker appears on that face confirming the anchor point | — | |
| 3 | Status bar updates to "Now click a face on a different part to complete the joint" | — | |
| 4 | Click a face on Part B (the target part); the two parts snap together so the chosen faces are coplanar | — | |
| 5 | The joint is committed; both parts become an assembly. The **Detach** button appears when either part is selected | — | |
| ✓ | The two parts are joined at the chosen faces; moving the assembly moves them as a unit | — | |

**Tip — Snap anchor to face centre:** Before clicking the source face, toggle **⊕ Centre** on. The anchor snaps to the centroid of the face's draw group rather than the exact cursor hit, giving a cleaner, symmetric joint.

---

### Part B — Detach and re-join at a different face

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 6 | Click either part of the attach assembly to select it; click **Detach** (shortcut **U**) | — | |
| 7 | The parts separate and return to independent positions; the joint is removed | — | |
| 8 | Use the transform inspector or gizmo to reposition Part B | — | |
| 9 | Perform a new **Attach…** picking a different face pair | — | |
| ✓ | Re-attached assembly reflects the new face alignment | — | |

---

### Part C — Group multiple parts into a rigid group

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 10 | Click Part A to select it; then **Shift+click** Part B and Part C to multi-select (all selected parts gain a highlight outline) | — | |
| 11 | The **Group** button appears in the toolbar (visible only when 2+ parts are selected) | — | |
| 12 | Click **Group**; a group is created at the centroid of the selection; the TC gizmo attaches to the group | — | |
| 13 | Drag or use the inspector to move the group; all members move as one rigid unit | — | |
| ✓ | The three parts form a rigid group; the Group button is replaced by **Ungroup** | — | |

---

### Part D — Enter group edit to reposition a single member

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 14 | With the group selected, **double-click** any member inside the group | — | |
| 15 | The tool enters **group edit mode**; the clicked member is highlighted; other members are dimmed; the TC gizmo attaches to that member alone | — | |
| 16 | Drag or use the inspector to move, rotate, or scale the member **within** the group | — | |
| 17 | Double-click a different member to switch the active edit target | — | |
| 18 | Press **Esc** or click **Exit group edit** to return to whole-group selection | — | |
| ✓ | Individual member was repositioned inside the group without dissolving it | — | |

---

### Part E — Scale an individual member inside a group

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 19 | Double-click the member you want to resize (enter group edit mode) | — | |
| 20 | Switch the toolbar transform mode to **Scale** (shortcut **R**), or use the **Scale** row in the transform inspector | — | |
| 21 | Drag the scale gizmo handles; the member resizes in-place; other group members are unaffected | — | |
| 22 | For a precise size: type the target value in the **Scale X/Y/Z** inspector fields and press **Enter**; lock the **🔒** button for proportional scaling | — | |
| 23 | Press **Esc** to exit group edit; the group resumes whole-group selection with the updated member size baked in | — | |
| ✓ | One member is a different size than before; the group is intact | — | |

---

### Part F — Scale the entire group

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 24 | Click the group (single click, not inside a group edit); the TC gizmo attaches to the group origin | — | |
| 25 | Switch to **Scale** mode; drag a gizmo handle to scale all members together | — | |
| 26 | Or use the **Scale** inspector: lock **🔒**, set **Scale X** to `1.5`, press **Enter** — all three axes scale to 1.5× | — | |
| 27 | Confirm all members grew uniformly; relative positions and member sizes inside the group are preserved | — | |
| ✓ | The entire assembly is 1.5× larger; internal proportions unchanged | — | |

---

### Part G — Snap the assembly to the floor

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 28 | Select the group (or any standalone part); click **⬇ Floor** in the toolbar (shortcut **F**) | — | |
| 29 | The lowest point of the selected object's bounding box is translated to Y = 0; the part or group rests on the ground plane | — | |
| 30 | If in group edit mode, floor-snapping moves only the selected **member** to Y = 0 (useful to align a leg or base without lifting the whole assembly) | — | |
| ✓ | The bottom of the assembly sits exactly on the floor; no part clips below Y = 0 | — | |

---

### Part H — Ungroup and verify members retain their transforms

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 31 | Click the group; click **Ungroup** | — | |
| 32 | All three parts are returned to scene root maintaining their current world position, rotation, and scale | — | |
| 33 | Click each part individually; confirm the inspector shows the same values they had while nested in the group | — | |
| 34 | Use **↩ Undo** to restore the group | — | |
| ✓ | Ungroup preserves all world transforms; undo restores the group correctly | — | |

---

### Part I — Scale an attach assembly and re-snap to floor

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 35 | Select either member of an attach assembly; the TC gizmo attaches to the part (attach assemblies do not use a Three.js group; scale one part at a time) | — | |
| 36 | Scale Part A larger using the inspector; Part B remains at its current size and position — the live joint is not re-solved automatically | — | |
| 37 | Click **Attach…** → **Detach** then re-attach at the same face pair to re-solve the joint with the new size | — | |
| 38 | Click **⬇ Floor** to settle the re-attached assembly back onto the ground plane | — | |
| ✓ | Assembly size updated and re-snapped to floor | — | |

## Walkthroughs still to walk

All six walks are written above: W1 to W6, covering the script through to the printed page. Each stays
open until it has been walked — the issue behind it carries the notes, and the table in its section is
where they settle.

Nothing is queued here now. The next walkthrough, if there is one, will be chosen by what these six
find rather than guessed at in advance.

---

## Legacy — Workflow 1: Happy Path (the pre-script UI)

> Superseded by Workflow W1. This walk was written for the UI before the script became the source
> of truth — a productions tree with a Cast section and a scene list — and its labels no longer
> match an app that is script-first and tabbed Script / Roster / Set / Catalogue. Kept as the record
> of what was walked in that era.

**Goal:** Create a production with 2+ acts, 2+ scenes per act, and 2+ characters; author dialogue and basic staging for every scene; play back the whole production in presentation mode.

**Preconditions:** App running (`yarn dev --open`). No existing productions required — start from scratch.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---
