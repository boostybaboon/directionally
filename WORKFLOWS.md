# Directionally — Workflows

Standard authoring workflows for manual testing and onboarding.
Each workflow is written as a step-by-step sequence that can be followed top-to-bottom to verify the feature works end-to-end.

---

## Workflow 1 — Happy Path: Full Multi-Scene Production

**Goal:** Create a production with 2+ acts, 2+ scenes per act, and 2+ characters; author dialogue and basic staging for every scene; play back the whole production in presentation mode.

**Preconditions:** App running (`yarn dev --open`). No existing productions required — start from scratch.

---

### Part A — Create the production

1. Open the app. The left panel shows the **Productions** tab.
2. Click **+ New**. A new production row appears with the name field already selected.
3. Type `"The Robot Play"` and press **Enter**. The production is created and loaded.
4. The right panel switches to the **Script** tab automatically (production is empty).

*Checkpoint: left panel shows "The Robot Play" as the active production.*

---

### Part B — Build the cast

5. Expand the production row in the left panel (click the **▶** toggle if it is collapsed).
6. Click **+ Add** in the Cast section.
   - A new actor row appears in inline rename mode, pre-named "Character 1".
7. Type `"Alpha"` and press **Enter**.
8. In the model selector `<select>` on the same row, choose **Robot Expressive** (should be default).
9. Repeat steps 6–8 to add a second actor named `"Beta"`, also Robot Expressive.

*Checkpoint: Cast shows Alpha and Beta, both as Robot Expressive.*

---

### Part C — Create the act and scene structure

10. Scroll to the **Scenes** section in the production's expanded panel.
11. Click **+ Act**. An act group appears in inline rename mode. Type `"Act 1"` and press **Enter**.
12. Click **+ Act** again and name it `"Act 2"`.
13. Under Act 1, click the **+ Scene** button that appears at the bottom of the act's children.
    - A scene appears in inline rename mode. Type `"The Encounter"` and press **Enter**.
    - Click **+ Scene** under Act 1 again; name it `"The Chase"`.
14. Under Act 2, click **+ Scene**; name it `"The Confrontation"`.
15. Click **+ Scene** under Act 2 again; name it `"Resolution"`.
16. For a scene not belonging to any act, use the root **+ Scene** button at the bottom of the Scenes section; name it `"Prologue"`.

*Checkpoint: Scenes section shows 2 act groups each containing 2 scenes, plus a top-level Prologue — 5 scenes total. Clicking a scene name switches to it.*

---

### Part D — Author Scene 1 (Prologue)

17. Click **Prologue** in the Scenes list. The canvas loads the scene.
18. Switch to **Design view** (click the `✏ Switch to Design view` button or the toggle in the bottom panel header).

#### Stage the actors
19. In the Cast section, click the **○** badge next to **Alpha**. It becomes **●** — Alpha is staged offstage.
20. Click the **○** badge next to **Beta**. Beta is also staged.

#### Position Alpha
21. In the timeline (bottom panel), click the pre-t=0 block for Alpha (the coloured block to the left of the zero line). The Staging tab highlights Alpha's spawn position fields.
22. In the 3D canvas, click Alpha's character model. Drag it to a position on the left of the stage (e.g. `[-3, 0, 0]`).
23. The spawn position updates automatically on drag end.

#### Position Beta
24. Repeat for Beta: click Beta's pre-block, click Beta's model in the canvas, drag to `[3, 0, 0]`.

#### Write dialogue
25. Open the **Script** tab in the right panel.
26. Click **+ Add line**.
27. Set the actor to **Alpha** and type: `"Beta, we meet at last."`
28. Click **+ Add line** again.
29. Set actor to **Beta**, type: `"Indeed, Alpha. I have been waiting."`

#### Play Scene 1
30. Click **▶ Switch to Playback view** and press **▶** in the transport bar.
    - Alpha and Beta should speak their lines. Speech bubbles should appear.
31. Press **■** (rewind) to return to t=0.

*Checkpoint: two characters on stage, two spoken lines play correctly.*

---

### Part E — Author Scene 2 (The Encounter)

32. Click **The Encounter** in the Scenes list (under Act 1).
33. Stage both **Alpha** and **Beta** (click their **○** badges).
34. In Design view, position Alpha at `[-2, 0, 2]` and Beta at `[2, 0, 2]` using the same drag-spawn workflow.
35. In the Script tab, add two lines:
    - Alpha: `"We have come far."`
    - Beta: `"The journey is not over."`
36. In the timeline, draw a **walking block** for Alpha:
    - Drag from t=0 to t=2 on Alpha's track row.
    - Select the new block; in the Staging tab set **Clip** to `Walking`.
    - Set **End position** by dragging Alpha in the canvas to `[0, 0, 2]` or clicking **⊕ Capture end position**.
37. Play the scene to confirm Alpha walks while dialogue plays.

*Checkpoint: Alpha walks across stage during the second scene.*

---

### Part F — Author Scenes 3, 4, and 5

38. Click **The Confrontation** (under Act 2). Stage both actors and add 2–3 dialogue lines.
39. Click **Resolution** (under Act 2). Stage both actors and add a final line each.
40. Click **Prologue** (top-level). Stage both actors and add an opening line each.
41. For each scene, scrub the transport slider to verify the duration is non-zero.

*Checkpoint: all 5 scenes have staged actors and dialogue.*

---

### Part G — Present the full production

41. In the **bottom panel header**, click **⏵⏵ Present**.
    - The left panel, right panel, and timeline collapse.
    - The canvas fills the window.
    - A minimal HUD at the bottom shows the current scene name and "Esc to exit".
42. The first scene (Prologue) begins playing automatically.
43. When Prologue ends, the tool cuts to Act 1 — The Encounter and plays it.
44. Scenes continue depth-first until Act 2 — Resolution finishes.
45. After the last scene ends, presentation mode exits and the tool returns to the last manually selected scene.

*Checkpoint: all 5 scenes play in order without manual intervention; canvas fills the window throughout.*

---

### Part H — Exit and verify persistence

46. Press **Esc** during any scene to exit presentation mode early. The tool returns to the scene that was active before presentation started.
47. Reload the page (`Cmd/Ctrl+R`).
48. Click **The Robot Play** in the productions list.
49. Confirm the cast (Alpha, Beta) is intact and the scene tree (5 scenes) is intact.
50. Press ▶ on any scene to confirm dialogue still plays.

*Checkpoint: production survives a page reload with all data intact.*

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
