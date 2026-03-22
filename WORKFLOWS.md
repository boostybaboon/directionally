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
| 1 | Open the app; left panel shows the **Productions** tab | — | |
| 2 | Click **+ New**; a production row appears with the name field already selected | — | |
| 3 | Type `"The Robot Play"` and press **Enter**; production is created and loaded | — | |
| 4 | Right panel switches to the **Script** tab automatically (production is empty) | — | |
| ✓ | Left panel shows "The Robot Play" as the active production | — | |

---

### Part B — Build the cast

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 5 | Expand the production row (click the **▶** toggle if collapsed) | — | |
| 6 | Click **+ Add** in the Cast section; a new actor row appears in inline rename mode, pre-named "Character 1" | — | |
| 7 | Type `"Alpha"` and press **Enter** | — | |
| 8 | In the model selector on the same row, choose **Robot Expressive** (should be default) | — | |
| 9 | Repeat steps 6–8 to add a second actor named `"Beta"`, also Robot Expressive | — | |
| ✓ | Cast shows Alpha and Beta, both as Robot Expressive | — | |

---

### Part C — Create the act and scene structure

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 10 | Scroll to the **Scenes** section in the production's expanded panel | — | |
| 11 | Click **+ Act**; an act group appears in rename mode — type `"Act 1"` and press **Enter** | — | |
| 12 | Click **+ Act** again; name it `"Act 2"` | — | |
| 13 | Under Act 1, click **+ Scene**; name it `"The Encounter"`. Click **+ Scene** again; name it `"The Chase"` | — | |
| 14 | Under Act 2, click **+ Scene**; name it `"The Confrontation"` | — | |
| 15 | Under Act 2, click **+ Scene**; name it `"Resolution"` | — | |
| 16 | Use the root **+ Scene** button at the bottom of the Scenes section; name it `"Prologue"` | — | |
| ✓ | Scenes section shows 2 act groups × 2 scenes + 1 top-level Prologue = 5 scenes; clicking a scene name switches to it | — | |

---

### Part D — Author Scene 1 (Prologue)

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 17 | Click **Prologue** in the Scenes list; canvas loads the scene | — | |
| 18 | Switch to **Design view** (click `✏ Switch to Design view` or the toggle in the bottom panel header) | — | |
| 19 | In the Cast section, click the **○** badge next to **Alpha**; it becomes **●** (staged offstage) | — | |
| 20 | Click the **○** badge next to **Beta**; Beta is staged | — | |
| 21 | Click Alpha's pre-t=0 block in the timeline (coloured block left of the zero line); the Staging tab highlights Alpha's spawn position fields | — | |
| 22 | In the 3D canvas, click Alpha's model and drag to `[-3, 0, 0]` | — | |
| 23 | Spawn position updates automatically on drag end | — | |
| 24 | Repeat for Beta: click Beta's pre-block, then drag Beta's model to `[3, 0, 0]` | — | |
| 25 | Open the **Script** tab in the right panel | — | |
| 26 | Click **+ Add line** | — | |
| 27 | Set actor to **Alpha**; type `"Beta, we meet at last."` | — | |
| 28 | Click **+ Add line** again | — | |
| 29 | Set actor to **Beta**; type `"Indeed, Alpha. I have been waiting."` | — | |
| 30 | Click **▶ Switch to Playback view** and press **▶**; Alpha and Beta speak with speech bubbles | — | |
| 31 | Press **■** (rewind) to return to t=0 | — | |
| ✓ | Two characters on stage; two spoken lines play correctly | — | |

---

### Part E — Author Scene 2 (The Encounter)

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 32 | Click **The Encounter** in the Scenes list (under Act 1) | — | |
| 33 | Stage both **Alpha** and **Beta** (click their **○** badges) | — | |
| 34 | In Design view, drag-spawn Alpha to `[-2, 0, 2]` and Beta to `[2, 0, 2]` | — | |
| 35 | Script tab: add Alpha `"We have come far."` and Beta `"The journey is not over."` | — | |
| 36 | In the timeline, drag from t=0 to t=2 on Alpha's track row to draw a walking block; set Clip to **Walking**; set end position by dragging Alpha to `[0, 0, 2]` or clicking **⊕ Capture end position** | — | |
| 37 | Play the scene; confirm Alpha walks while dialogue plays | — | |
| ✓ | Alpha walks across stage during the second scene | — | |

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
| 42 | In the bottom panel header, click **⏵⏵ Present**; left/right panels and timeline collapse; canvas fills the window; HUD shows current scene name and "Esc to exit" | — | |
| 43 | First scene (Prologue) begins playing automatically | — | |
| 44 | When Prologue ends, the tool cuts to Act 1 — The Encounter and plays it | — | |
| 45 | Scenes continue depth-first through Act 2 — Resolution | — | |
| 46 | After the last scene ends, presentation mode exits and the tool returns to the last manually selected scene | — | |
| ✓ | All 5 scenes play in order without manual intervention; canvas fills the window throughout | — | |

---

### Part H — Exit and verify persistence

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 47 | Press **Esc** during any scene to exit presentation mode early; tool returns to the scene active before presentation started | — | |
| 48 | Reload the page (`Cmd/Ctrl+R`) | — | |
| 49 | Click **The Robot Play** in the productions list | — | |
| 50 | Confirm the cast (Alpha, Beta) is intact and the scene tree (5 scenes) is intact | — | |
| 51 | Press **▶** on any scene; confirm dialogue still plays | — | |
| ✓ | Production survives a page reload with all data intact | — | |

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
