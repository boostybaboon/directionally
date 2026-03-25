# Directionally — Workflows

Standard authoring workflows for manual testing and onboarding.
Each workflow is written as a step-by-step sequence that can be followed top-to-bottom to verify the feature works end-to-end.

---

## Workflow 1 — Happy Path: Full Multi-Scene Production

**Goal:** Create a production with 2+ acts, 2+ scenes per act, and 2+ characters; author dialogue and basic staging for every scene; play back the whole production in presentation mode.

**Preconditions:** App running (`yarn dev --open`). No existing productions required — start from scratch.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

### Part A — Create the production

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Open the app; left panel shows the **Productions** tab | OK | |
| 2 | Click **+ New**; a production row appears with the name field already selected | OK | |
| 3 | Type `"The Robot Play"` and press **Enter**; production is created and loaded | OK | |
| 4 | Right panel switches to the **Staging** tab automatically (production is empty) | OK | |
| ✓ | Left panel shows "The Robot Play" as the active production | OK | |

General section snags:

~~When reloading the productions view, clicking on the expander arrow only shows the cast list. Only after clicking the production name do we see the scenes. Thereafter clicking the expander shows cast plus acts/scenes.
Am expecting when clicking on the production name for it to expand/collapse the section also~~ Fixed

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

General section snags:

~~Can't add a top level scene before Act 1 after Act 1 is created. i.e. can't post-facto add the Prologue if I forget. Can add epilogue~~ Fixed 
~~No visual indication of scene grouping. Maybe indenting, or implement collapsible tree structure to collapse acts?~~ Fixed
~~If I delete all acts and am left with just the Epilogue for example, I can't delete the Epilogue scene. Lack X on top level scenes after I delete a scene or act. Maybe not limited to top level items, seems an issue with X being available on items after a deletion~~ Fixed
Can't rearrange scenes in the tree-like view (known future work?)
~~Scenes should fill the remaining area in the left hand tab, if examples and Speech and Audio are collapsed then I'd expect these to collapse at the bottom leaving maximum space for an overview of acts/scenes~~ Fixed

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

General section snags:

- Find a better 'add actor from cast to scene' visual paradigm

- Plan a better interaction with the scene tree for arbitrarily adding acts and scenes (too many randomly popping up buttons currently, and can't rearrange the tree conveniently)


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

Snags for these scenes:
- Add and item from catalogue: Can add supported lights to this (Hemispherical, Directional)

Edit mode paradigm
- Confusing paradigm currently. Unclear when an edit to a spawn parameter or a block end target parameter is committed to the system
- Overlays which are attempting to help you actually confuse, and don't follow the mode you're actually in, i.e. don't always change when you select different scene items
- Unclear when you're in t=0 mode
- The upper HUD for edit things appears in the middle of the whole view, should be on the design half of the view, if we keep it
- Still unclear when we are applying the current design view camera position to the scene camera position (either spawn or block end), and when we are syncing the design view camera position with the current presentation view position

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

### Known gaps (do not expect these to work yet)

| Item | Status |
|---|---|
| Resize / recolour placed set pieces | Not yet — Phase 9.A |
| Preset-sized environment pieces (wall flat, stage deck) | Not yet — Phase 9.B |
| Character ground disc markers (tell Alpha from Beta in viewport) | Not yet — Phase 9.C |
| Drag scenes between acts to reorder | Not yet — Phase UX3 |
| Full-production scrollable screenplay view | Not yet — Phase UX2.6 |
| Scene transition fade | Not yet — deferred after UX2.8 |

---

## Future workflows (stubs)

- **Workflow 2 — Set Dressing**: resize and recolour primitives, apply a preset environment (Phase 9)
- **Workflow 3 — Character Animation**: draw blocks, assign clips, walk from A to B (Phase 8 surface)
- **Workflow 4 — Camera Work**: place camera blocks, cut between angles (Phase 7)
- **Workflow 5 — Lighting**: fade a spotlight in and out (Phase 10)
- **Workflow 6 — Print Script**: view full-production screenplay and use browser print (Phase UX2.6)
