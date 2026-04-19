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

## Workflow S4 — Sketcher: Glue, Weld, Snap-to-Floor, and Group Scaling

**Goal:** Combine separate parts into rigid assemblies using glue (face-to-face join with a live joint) and weld (arbitrary rigid group), settle the assembly onto the ground plane with snap-to-floor, then scale the whole assembly and individual members independently.

**Preconditions:** App running. Navigate to `/sketch`. Two or more extruded parts already in the scene (create via Workflow S1/S2, or extrude simple polygons now).

---

### Part A — Glue two parts together (face-to-face joint)

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Click **Glue…** in the toolbar (shortcut **G**); the toolbar adds a **⊕ Centre** toggle and the status bar reads "Click any surface to place the anchor blob. Esc cancels." | — | |
| 2 | Click a flat face on Part A (the source part); a pink blob marker appears on that face confirming the anchor point | — | |
| 3 | Status bar updates to "Now click a face on a different part to complete the joint" | — | |
| 4 | Click a face on Part B (the target part); the two parts snap together so the chosen faces are coplanar | — | |
| 5 | The joint is committed; both parts become an assembly. The **Unglue** button appears when either part is selected | — | |
| ✓ | The two parts are joined at the chosen faces; moving the assembly moves them as a unit | — | |

**Tip — Snap anchor to face centre:** Before clicking the source face, toggle **⊕ Centre** on. The anchor snaps to the centroid of the face's draw group rather than the exact cursor hit, giving a cleaner, symmetric joint.

---

### Part B — Unglue and re-join at a different face

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 6 | Click either part of the glue assembly to select it; click **Unglue** (shortcut **U**) | — | |
| 7 | The parts separate and return to independent positions; the joint is removed | — | |
| 8 | Use the transform inspector or gizmo to reposition Part B | — | |
| 9 | Perform a new **Glue…** picking a different face pair | — | |
| ✓ | Re-glued assembly reflects the new face alignment | — | |

---

### Part C — Weld multiple parts into a rigid group

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 10 | Click Part A to select it; then **Shift+click** Part B and Part C to multi-select (all selected parts gain a highlight outline) | — | |
| 11 | The **Weld** button appears in the toolbar (visible only when 2+ parts are selected) | — | |
| 12 | Click **Weld**; a weld group is created at the centroid of the selection; the TC gizmo attaches to the group | — | |
| 13 | Drag or use the inspector to move the weld group; all members move as one rigid unit | — | |
| ✓ | The three parts form a rigid group; the Weld button is replaced by **Unweld** | — | |

---

### Part D — Enter group edit to reposition a single member

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 14 | With the weld group selected, **double-click** any member inside the group | — | |
| 15 | The tool enters **group edit mode**; the clicked member is highlighted; other members are dimmed; the TC gizmo attaches to that member alone | — | |
| 16 | Drag or use the inspector to move, rotate, or scale the member **within** the group | — | |
| 17 | Double-click a different member to switch the active edit target | — | |
| 18 | Press **Esc** or click **Exit group edit** to return to whole-group selection | — | |
| ✓ | Individual member was repositioned inside the group without dissolving it | — | |

---

### Part E — Scale an individual member inside a weld group

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 19 | Double-click the member you want to resize (enter group edit mode) | — | |
| 20 | Switch the toolbar transform mode to **Scale** (shortcut **R**), or use the **Scale** row in the transform inspector | — | |
| 21 | Drag the scale gizmo handles; the member resizes in-place; other group members are unaffected | — | |
| 22 | For a precise size: type the target value in the **Scale X/Y/Z** inspector fields and press **Enter**; lock the **🔒** button for proportional scaling | — | |
| 23 | Press **Esc** to exit group edit; the group resumes whole-group selection with the updated member size baked in | — | |
| ✓ | One member is a different size than before; the weld group is intact | — | |

---

### Part F — Scale the entire weld group

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 24 | Click the weld group (single click, not inside a group edit); the TC gizmo attaches to the group origin | — | |
| 25 | Switch to **Scale** mode; drag a gizmo handle to scale all members together | — | |
| 26 | Or use the **Scale** inspector: lock **🔒**, set **Scale X** to `1.5`, press **Enter** — all three axes scale to 1.5× | — | |
| 27 | Confirm all members grew uniformly; relative positions and member sizes inside the group are preserved | — | |
| ✓ | The entire assembly is 1.5× larger; internal proportions unchanged | — | |

---

### Part G — Snap the assembly to the floor

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 28 | Select the weld group (or any standalone part); click **⬇ Floor** in the toolbar (shortcut **F**) | — | |
| 29 | The lowest point of the selected object's bounding box is translated to Y = 0; the part or group rests on the ground plane | — | |
| 30 | If in group edit mode, floor-snapping moves only the selected **member** to Y = 0 (useful to align a leg or base without lifting the whole assembly) | — | |
| ✓ | The bottom of the assembly sits exactly on the floor; no part clips below Y = 0 | — | |

---

### Part H — Unweld and verify members retain their transforms

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 31 | Click the weld group; click **Unweld** | — | |
| 32 | All three parts are returned to scene root maintaining their current world position, rotation, and scale | — | |
| 33 | Click each part individually; confirm the inspector shows the same values they had while nested in the group | — | |
| 34 | Use **↩ Undo** to restore the weld group | — | |
| ✓ | Unweld preserves all world transforms; undo restores the group correctly | — | |

---

### Part I — Scale a glue assembly and re-snap to floor

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 35 | Select either member of a glue assembly; the TC gizmo attaches to the part (glue assemblies do not use a Three.js group; scale one part at a time) | — | |
| 36 | Scale Part A larger using the inspector; Part B remains at its current size and position — the live joint is not re-solved automatically | — | |
| 37 | Click **Glue…** → **Unglue** then re-glue at the same face pair to re-solve the joint with the new size | — | |
| 38 | Click **⬇ Floor** to settle the re-glued assembly back onto the ground plane | — | |
| ✓ | Assembly size updated and re-snapped to floor | — | |
