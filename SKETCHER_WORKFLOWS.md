# Directionally — Sketcher Manual Test Plan

Manual test scenarios for the `/sketch` route. Run after any change to the sketcher to confirm no regressions.

**Preconditions for all scenarios:** `yarn dev --open` running. Navigate to `http://localhost:5173/sketch`.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround · `Fail` broken

---

## T01 — Insert primitives

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **Cube** in the Insert bar | Cube appears at origin, auto-selected; TC gizmo visible | OK | |
| 2 | Click **Sphere** | Sphere appears, auto-selected | OK | |
| 3 | Click **Cylinder**, **Capsule**, **Cone** in turn | Each inserts and auto-selects | OK | |
| 4 | Click empty space | Parts deselect; TC gizmo disappears | OK | |
| 5 | Click any part | That part re-selects; status bar shows shortcut hint | OK | |

---

## T02 — Transform gizmo (translate / rotate / scale)

Select any primitive first.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Press **W** (or click **Move** in toolbar) | TC switches to translate arrows | OK | |
| 2 | Drag the X axis arrow | Part moves along world X; other parts unaffected | OK | |
| 3 | Press **E** / click **Rotate** | TC ring gizmo | OK | |
| 4 | Drag the Y ring | Part rotates around Y | OK | |
| 5 | Press **R** / click **Scale** | TC scale gizmo | OK | |
| 6 | Drag the X scale handle | Part scales on X only; Y and Z unchanged | OK | |
| 7 | Look at the inspector panel; confirm Pos/Rot/Scale rows reflect world-space values | Inspector shows correct position, rotation (degrees), scale | OK | |
| 8 | Type a new value in inspector Pos X; press Enter | Part moves to that X; inspector updates | OK | |
| 9 | Type a new value in inspector Scale X; press Enter | Part scales on X only (lock off); other axes unchanged | OK | |
| 10 | Click the 🔓 button in the Scale row | Button shows 🔒; uniform lock active | OK | |
| 11 | Drag any TC scale handle with 🔒 on | All three axes scale by the same ratio | OK | |
| 12 | With 🔒 on, type a new Scale X in inspector; press Enter | Y and Z fields update proportionally; part scales uniformly | OK | |
| 13 | Press **Esc** | Part deselects | OK | |

---

## T03 — Colour: whole-part and per-face

Select a **Cube** first.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click a swatch in the colour HUD | Entire part changes to that colour | OK | |
| 2 | Type a hex value in the colour input | Part updates live | OK | |
| 3 | Click the **⬜ Face paint** button (it highlights) | Face paint mode active; TC gizmo hides; HUD shows "click a face" | OK | |
| 4 | Hover over different faces of the cube | Yellow highlight dot tracks the hovered face | OK | |
| 5 | Click a face | That face paints with the selected colour; HUD label updates to "face N"; **↺ col** button appears | — | |
| 6 | Click a different colour swatch | Colour applies immediately to the locked face; no second click needed | — | |
| 7 | Click **↺ col** | Locked face resets to the body colour; undoable with Ctrl+Z | — | |
| 8 | Click a second face | New face locks and paints; label updates to new face number | — | |
| 9 | Click empty canvas area (not on the part) | Lock clears; HUD returns to "click a face" | — | |
| 10 | Click **Face paint** again to toggle off | TC gizmo reappears; hover highlight clears | OK | |
| 11 | Ctrl+Z to undo face colour changes | Per-face colour changes undo in order | — | |

---

## T04 — Texture drag-and-drop onto a face

Requires an image file on disk (any JPG/PNG).

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a cube | Cube selected | OK | |
| 2 | Drag an image file from the OS file manager over the canvas | Hover highlight follows the face under the cursor | OK | |
| 3 | Drop the image onto a specific face | Face shows the texture unmodified (no colour tint from the part colour); status "Texture applied." | OK | |
| 4 | Change the part colour via the colour HUD | Texture-bearing face is unaffected; texture remains unmodified | OK | |
| 5 | Ctrl+Z | Texture removed; face reverts to its previous painted colour (not a default) | OK | |
| 6 | Drop on a different face | Only that face gets the texture; other faces show their solid colour unchanged | OK | |
| 7 | Enable **Face paint**; click the textured face to lock it | HUD shows "face N"; **↺ col** and **✕ tex** buttons both appear | OK | |
| 8 | Click **✕ tex** | Texture removed; face shows its solid colour; **✕ tex** button disappears | OK | |
| 9 | Ctrl+Z | Texture restored to that face | OK | |

---

## T05 — Sketch polygon and extrude

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **New sketch** in the toolbar | Status "Click to place polygon vertices…"; a fine grid appears over the floor plane | Partial | Z-fighting from fine grid overprinting the main grid |
| 2 | Click five or six points in the viewport | Vertices snap to the visible grid; line connects them; rubber-band preview tracks cursor | OK | |
| 3 | Try to click a point that would make a crossing edge | Click is silently rejected; no new vertex placed | OK | |
| 4 | Move cursor near the first dot until it turns yellow | Closure marker highlights | OK | |
| 5 | Click to close the polygon | Snap grid disappears; extrusion handle appears; flat shape visible; outer outline remains | OK | |
| 6 | Drag the extrusion handle upward | Shape extrudes; depth value updates live | OK | |
| 7 | Type a value in the **Depth** numeric field in the HUD | Extrusion jumps to that depth | OK | |
| 8 | Release the handle; click the extruded part | Part selects; TC gizmo attaches | OK | |
| 9 | Hold **Alt** + drag during polygon drawing | Camera orbits without placing a vertex | OK | |

### T05b — Extrusion with holes

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **New sketch**; draw and close a large polygon | Snap grid disappears; outer shape outline stays visible; **Add hole** and **Extrude** buttons appear | OK | |
| 2 | Click **Add hole** | Snap grid reappears; status prompts to draw hole boundary | OK | |
| 3 | Draw a smaller closed polygon inside the outer shape | Rubber-band preview and closure marker work normally; outer outline still visible as reference | OK | |
| 4 | Close the hole | Snap grid disappears; hole outline added; **Add hole** and **Extrude** buttons return | OK | |
| 5 | Click **Add hole** again; draw a second hole; close it | Second hole outline added | OK | |
| 6 | Click **Extrude** | Part appears with both holes punched through; outer outline removed | OK | |
| 7 | Press **Esc** after closing outer shape (before adding holes) | Drawing cancelled; outlines cleared; orbit re-enabled | OK | |

### T05c — Revolve sketch

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **Revolve…** in the toolbar | Camera pivots to front (XY) view; orbit locked; existing parts ghosted; red Y-axis line visible; snap grid appears | OK | |
| 2 | Click several points for a half-profile to the right of the Y axis | Vertices snap to grid; line preview visible | OK | |
| 3 | Close the profile | Snap grid disappears; angle slider and **Revolve** / **Cancel** buttons appear | OK | |
| 4 | Drag the angle slider to ~180° | Preview updates if available; slider shows 180° | — | |
| 5 | Click **Revolve** | Lathed part appears in the scene; camera restores; existing parts un-ghost | OK | |
| 6 | Click **Cancel** on a fresh revolve (before confirming) | Drawing discarded; camera restores; parts un-ghost; no part added | OK | |

---

## T06 — Duplicate and undo/redo

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a part | TC gizmo visible | OK | |
| 2 | Press **Shift+D** or click **Duplicate** | Copy appears, auto-selected; status "Duplicated. Reposition with gizmo." | OK | |
| 3 | Move the copy to a different position | Original stays put | OK | |
| 4 | Ctrl+Z | Duplicate disappears; original re-selects | OK | |
| 5 | Ctrl+Shift+Z | Duplicate reappears at the moved position | OK | |
| 6 | **Delete** while a part is selected | Part removed | OK | |
| 7 | Ctrl+Z | Part restored | OK | |

---

## T07 — Snap to floor

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a part and move it above `y = 0` with translate gizmo | — | OK | |
| 2 | Press **F** or click **⬇ Floor** in the primitives bar | Part translates so its lowest vertex sits at `y = 0`; orientation unchanged | OK | |
| 3 | Select a rotated part (~30° tilt) and press **F** | Part settles with its lowest point at `y = 0` | OK | |
| 4 | Ctrl+Z | Part returns to pre-snap position | OK | |

---

## T08 — Multi-select and Group / Ungroup

Group fuses selected parts into a rigid THREE.Group that moves and scales as one unit.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert a **Cube** and a **Cylinder**; position them side by side | — | OK | |
| 2 | Click the cube; **Shift+click** the cylinder | Both highlighted; **Group** button appears | OK | |
| 3 | Click **Group** | Status "Grouped. Parts joined as one rigid unit."; TC attaches to group centroid | OK | |
| 4 | Drag the TC gizmo | Both parts move together | OK | |
| 5 | Press **R** and scale the group | Both parts scale together | OK | |
| 6 | Click any member of the group | Whole group selects; **Ungroup** button appears | OK | |
| 7 | Click **Ungroup** | Status "Ungrouped. Parts returned to scene root."; TC attaches to the clicked mesh | OK | |
| 8 | Drag the cube alone | Cylinder stays in place | OK | |
| 9 | Ctrl+Z twice | Ungroup and Group both undo; group restored | OK | |

---

## T09 — Enter-group edit mode

Requires a group from T08 (or create one).

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click the group to select it | TC at group centroid | OK | |
| 2 | **Double-click** one member | Group edit mode: TC attaches to that mesh; other members dim to ~20% opacity; **Exit group edit** button appears | OK | |
| 3 | Drag the TC gizmo | Only that member moves | OK | |
| 4 | Single-click a different member inside the group | TC switches to the new member | OK | |
| 5 | Press **Esc** | Group edit mode exits; TC snaps back to group centroid; dimming clears | OK | |
| 6 | Double-click again; move a member; Ctrl+Z | Member's local move undoes | OK | |
| 7 | Click outside the group | Deselects and exits group edit mode | OK | |

---

## T10 — Attach (live positional constraint)

Attach connects the *mover*'s face flush to the *anchor*'s face contact point. Moving the anchor pulls the mover with it by re-running constraint resolution each frame. Parts are **not** merged into a group — they stay at scene root or in their own groups.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert a **Cylinder** and a **Cube**; position them apart | — | OK | |
| 2 | Press **G** or click **Attach…** | Status "Click any surface to place the anchor blob. Esc cancels." | OK | |
| 3 | Hover a face on the cylinder | Yellow dot tracks the surface | OK | |
| 4 | Click to set the anchor | Pink blob appears on the cylinder; status "Now click any surface on a different part to snap it here. Esc cancels." | OK | |
| 5 | Hover a face of the cube | Yellow dot tracks the cube; cylinder already excluded from second pick | OK | |
| 6 | Click the cube face | Cube rotates face-flush and snaps its contact point to the pink blob; status "Attached." | OK | |
| 7 | Select the cylinder and translate it | Cube follows, maintaining the joint offset | OK | |
| 8 | Click the cube (mover) | **Detach** button appears | OK | |
| 9 | Press **U** or click **Detach** | Status "Detached."; cube stays at current position; cylinder ignores it | OK | |
| 10 | Ctrl+Z to undo the attach | Both parts return to pre-attach positions; joint removed | OK | |

---

## T11 — Attach / group interactions

Full coverage of attach joints where one or both sides involve a group. Tests constraint chaining, group topology survival, undo/redo, and member-edit access.

### T11a — Group as attach mover

Confirms a group (rigid entity) can be the mover in an attach joint.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Group two cubes together | Group created | OK | |
| 2 | Insert a standalone cylinder | — | OK | |
| 3 | Press **G**; click the cylinder as anchor | Pink blob on cylinder | OK | |
| 4 | Click a face of one cube in the group | Entire group rotates and snaps to the cylinder | OK | |
| 5 | Select and translate the cylinder | Group follows as a rigid unit | OK | |
| 6 | Click the group; press **U** or click **Unattach** | Joint removed; group remains intact at current position | OK | |

### T11b — Group bond survives detach of an attached appendage

Regression for the bug where detaching an attached part would silently destroy the group that had been merged into the same assembly.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert **Cube A** and **Cube B**; group them together | Amber bounding box spans both cubes; status bar shows group hint | OK | |
| 2 | Insert **Cylinder C** (standalone) | — | OK | |
| 3 | Press **G**; click a face of **Cube B** as anchor; click a face of **Cylinder C** | Cylinder snaps flush; all three parts merge into one assembly group | OK | |
| 4 | Click **Cylinder C** to select it | **Detach** button appears (cylinder has a attach joint); **Ungroup** button is absent (cylinder is not a group member) | OK | |
| 5 | Press **U** / click **Detach** | Status "Detached."; Cylinder C returns to standalone | OK | |
| 6 | Verify **Cube A** and **Cube B** are still grouped | Amber bounding box spans A and B; clicking either selects the group; **Ungroup** button appears | OK | |
| 7 | Translate the A+B group | Both cubes move together as one rigid unit; Cylinder C stays put | OK | |

### T11c — Multiple appendages; ungluing one leaves the others

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Group **Cube A** and **Cube B** | Group | OK | |
| 2 | Attach **Cylinder C** to the top of Cube A | A+B+C in one assembly | OK | |
| 3 | Attach **Sphere D** to the side of Cube B | A+B+C+D in one assembly | OK | |
| 4 | Click **Cylinder C**; press **U** | C detaches; A+B+D remain in one assembly | OK ||
| 5 | Confirm A+B group bond intact | Amber box spans A+B+D; **Ungroup** button visible | OK | |
| 6 | Click **Sphere D**; press **U** | D detaches; A+B remain as a standalone group | OK | |
| 7 | Translate the A+B group | Both move together; C and D stay put | OK | |

### T11d — Undo/redo preserves group bond topology

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Group **Cube A** and **Cube B** | Group; 0 attach joints | OK | |
| 2 | Attach **Cylinder C** to Cube B (step 3 of T11b) | A+B+C merged assembly | OK | |
| 3 | Ctrl+Z to undo the attach | C returns to standalone; A+B re-form as a group | OK | |
| 4 | Ctrl+Z to undo the group | A and B are now separate standalone parts | OK | |
| 5 | Ctrl+Shift+Z to redo the group | A+B group restores; **Ungroup** button visible | OK | |
| 6 | Ctrl+Shift+Z to redo the attach | A+B+C merged assembly again; C snapped back to its position | OK | |
| 7 | Ctrl+Z to undo the attach (second time) | A+B group intact; C standalone | OK | |

### T11e — Double-click member-edit inside a mixed assembly

Confirms you can enter group-edit mode on any member of a mixed assembly and switch the active member. Translate in group-edit mode is only meaningful for **group** members repositioned relative to the group pivot; attachd appendages carry a frozen local-contact-point record and have no supported independent motion (a future "reposition attach blob on face" gesture would update `localPointA`/`localPointB` on the `AttachJoint` rather than translating the mesh).

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Set up A+B group + C attachd to B (same as T11b steps 1–3) | A+B+C assembly | OK | |
| 2 | Single-click any part of the assembly | Whole assembly selects (amber box, group TC) | OK | |
| 3 | Double-click **Cube A** (group member) | Group-edit mode enters; TC attaches to Cube A's mesh; other parts dim | OK | |
| 4 | Double-click **Cylinder C** (attachd appendage) while still in group-edit | Active member switches to Cylinder C; TC attaches to C's mesh | OK | |
| 5 | Click outside the assembly | Exits group-edit; full assembly re-selects | OK | |

### T11f — Unattach vs Ungroup button visibility

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a standalone part | Neither **Unattach** nor **Ungroup** button visible | OK | |
| 2 | Select a part in a pure group (no attach joints) | **Ungroup** visible; **Unattach** absent | OK | |
| 3 | Select **Cylinder C** in the T11b assembly (attach-only member) | **Unattach** visible; **Ungroup** absent | OK | |
| 4 | Attach two standalone parts with no group involved; select either | **Unattach** visible; **Ungroup** absent | OK | |
| 5 | Group two parts and then attach a third to one group member; select the group member in the merged assembly | **Unattach** absent (group members have no direct attach joint); **Ungroup** visible; pressing **U** ungroups the bond — group core members with no attach joints go standalone, attach-jointed members stay in their group | OK | |

### T11g — Constraint chaining through a group

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert three standalone cubes: **P**, **Q**, **R** | — | OK | |
| 2 | Group **Q** and **R** | Q+R group | OK | |
| 3 | Attach **P** (anchor) ← top of P → bottom of Q | P–Q attach joint; P+Q+R in one assembly | OK | |
| 4 | Insert **Cylinder S**; attach R's top face as anchor → S's bottom | P+Q+R+S in one assembly | OK | |
| 5 | Select the entire assembly; translate it upward by dragging TC | All four parts move together | OK | |
| 6 | Enter group-edit; select **P**; translate P upward | Q and R follow via attach joint; S follows because it is attachd to R | OK | |
| 7 | Press **Esc** to exit group-edit; click **P**; press **U** | P detaches; Q+R group remains; S stays attachd to R; Q+R+S remain in one assembly | OK | |

---

## T12 — Named assemblies (OPFS)

### T12a — Name and autosave

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | On a fresh session, insert a primitive | Assembly auto-saves after ~500 ms (no error in console) | OK | |
| 2 | Click the name field ("Untitled") and type "My Robot"; press Enter or click away | Name updates; autosave fires | OK | |
| 3 | Reload the page | "My Robot" loads back with the same parts; name field shows "My Robot" | OK | |

### T12b — New assembly

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | With "My Robot" loaded, click **New** in the toolbar | Session clears; name resets to "Untitled"; empty viewport | OK | |
| 2 | Insert a Sphere and rename to "Alien Eye" | — | OK | |
| 3 | Reload | "Alien Eye" restores | OK | |

### T12c — Open panel

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **Open…** | Panel appears listing "My Robot" and "Alien Eye" with dates | OK | |
| 2 | Click "My Robot" in the list | "My Robot" loads | OK | |
| 3 | Open the panel again | "My Robot" entry highlighted (current) | OK | |
| 4 | Click **✕** next to "Alien Eye" | "Alien Eye" disappears from the list | OK | |
| 5 | Press **Esc** or click the panel close button | Panel closes | OK | |

### T12d — Groups survive round-trip

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Load "My Robot"; group two parts together; rename to "Group Test"; reload | Group reconstructed; clicking any member selects the group | OK | |

---

## T13 — Export to Catalogue and use in a production

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Name the assembly; ensure it has at least one part | — | OK | |
| 2 | Click **Export to Catalogue** | Status "Exporting…" then success message using the assembly name | OK | |
| 3 | Navigate to `http://localhost:5173/` | Main app loads | OK | |
| 4 | Open the **Catalogue** tab; scroll to Set Pieces | The exported entry is visible under the assembly's name | OK | |
| 5 | Drag the entry into a scene | 3D model loads in the viewport | OK | |

---

## T14 — Integration: build a table from primitives

Full authoring path using primitives, group, snap to floor, and export.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **New**; name it "Dining Table" | Empty viewport | — | |
| 2 | Insert a **Cube**; scale to a flat slab (`~2.5 × 0.15 × 2.5`); colour wood-brown | Tabletop | — | |
| 3 | Insert a **Cylinder**; scale to a thin tall leg; colour matching; press **F** to floor-snap | First leg at `y = 0` | — | |
| 4 | Shift+D ×3; position each copy at a corner under the tabletop; floor-snap each | Four legs at `y = 0` | — | |
| 5 | Shift-click all four legs → **Group** | Four legs become one rigid group | — | |
| 6 | Shift-click the leg group + the tabletop → **Group** | All five parts in one group | — | |
| 7 | Translate and rotate the whole group | All five parts move together | — | |
| 8 | Click **Export to Catalogue** | Entry "Dining Table" appears in main app catalogue | — | |

---

## T15 — Integration: articulated character using attach

Tests live constraint chaining across parts and groups.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert a **Cube** (body) and a **Cylinder** (neck); group them together | Body+neck group | — | |
| 2 | Insert a **Sphere** (head) | Standalone part | — | |
| 3 | Press **G**; click the top of the cylinder as anchor | Pink blob | — | |
| 4 | Click the bottom of the sphere | Sphere snaps flush to the cylinder top; status "Attached." | — | |
| 5 | Translate the group (body+neck) | Sphere follows, maintaining joint offset | — | |
| 6 | Click the sphere; **Unattach** | Sphere no longer follows; stays at current position | — | |

---

## T16 — Integration: extruded parts table

Repeat of T14 using only extruded polygon shapes.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Sketch and extrude a small square for a table leg; colour it | — | — | |
| 2 | Shift+D ×3; position and floor-snap each copy | Four extruded legs at `y = 0` | — | |
| 3 | Sketch and extrude a large rectangle for the tabletop; scale and position it above the legs | — | — | |
| 4 | Group all five parts together | One rigid group | — | |
| 5 | Export to catalogue; verify in main app | Entry usable in a production | — | |

---

## Known gaps (not yet implemented)

| Feature | Phase |
|---|---|
| Extrusion depth numeric input (already in HUD — verify in T05 step 7) | SA12 |
| Nominated-face floor snap (mark a specific face as the floor contact) | SA11b |
| Attach point editor (adjust contact point position and twist on an existing joint) | SA12 |
