# Directionally — Sketcher Manual Test Plan

Manual test scenarios for the `/sketch` route. Run after any change to the sketcher to confirm no regressions.

**Preconditions for all scenarios:** `yarn dev --open` running. Navigate to `http://localhost:5173/sketch`.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround · `Fail` broken

---

## T01 — Insert primitives

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **Cube** in the Insert bar | Cube appears at origin, auto-selected; TC gizmo visible | — | |
| 2 | Click **Sphere** | Sphere appears, auto-selected | — | |
| 3 | Click **Cylinder**, **Capsule**, **Cone** in turn | Each inserts and auto-selects | — | |
| 4 | Click empty space | Parts deselect; TC gizmo disappears | — | |
| 5 | Click any part | That part re-selects; status bar shows shortcut hint | — | |

---

## T02 — Transform gizmo (translate / rotate / scale)

Select any primitive first.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Press **W** (or click **Move** in toolbar) | TC switches to translate arrows | — | |
| 2 | Drag the X axis arrow | Part moves along world X; other parts unaffected | — | |
| 3 | Press **E** / click **Rotate** | TC ring gizmo | — | |
| 4 | Drag the Y ring | Part rotates around Y | — | |
| 5 | Press **R** / click **Scale** | TC scale gizmo | — | |
| 6 | Drag the X scale handle | Part scales on X only | — | |
| 7 | Press **Esc** | Part deselects | — | |

---

## T03 — Colour: whole-part and per-face

Select a **Cube** first.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click a swatch in the colour HUD | Entire part changes to that colour | — | |
| 2 | Type a hex value in the colour input | Part updates live | — | |
| 3 | Click the **⬜ Face paint** button (it highlights) | Face paint mode active; TC gizmo hides | — | |
| 4 | Hover over different faces of the cube | Yellow highlight tracks the hovered face | — | |
| 5 | Click a face while hovering | That face changes to the selected colour; other faces unchanged | — | |
| 6 | Pick a different swatch and click another face | Second face gets the new colour | — | |
| 7 | Click **Face paint** again to toggle off | TC gizmo reappears; hover highlight clears | — | |
| 8 | Ctrl+Z twice | Both per-face colour changes undo | — | |

---

## T04 — Texture drag-and-drop onto a face

Requires an image file on disk (any JPG/PNG).

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a cube | — | — | |
| 2 | Drag an image file from the OS file manager over the canvas | Hover highlight follows the face under the cursor | — | |
| 3 | Drop the image onto a specific face | Face shows the texture; status "Texture applied." | — | |
| 4 | Ctrl+Z | Texture removed; face reverts to solid colour | — | |
| 5 | Drop on a different face | Only that face gets the texture; other faces unchanged | — | |

---

## T05 — Sketch polygon and extrude

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **New sketch** in the toolbar | Status "Click to place polygon vertices. Click near the first vertex to close the shape. Hold Alt to orbit." | — | |
| 2 | Click five or six points in the viewport | Green dots appear at each vertex; rubber-band preview visible | — | |
| 3 | Move cursor near the first dot until it snaps | Closure marker enlarges | — | |
| 4 | Click to close the polygon | Extrusion handle appears; flat shape visible | — | |
| 5 | Drag the extrusion handle upward | Shape extrudes; depth updates live | — | |
| 6 | Release; click the extruded part | Part selects; TC gizmo attaches | — | |
| 7 | Hold **Alt** + drag during polygon drawing | Camera orbits without placing a vertex | — | |

---

## T06 — Duplicate and undo/redo

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a part | TC gizmo visible | — | |
| 2 | Press **Shift+D** or click **Duplicate** | Copy appears, auto-selected; status "Duplicated. Reposition with gizmo." | — | |
| 3 | Move the copy to a different position | Original stays put | — | |
| 4 | Ctrl+Z | Duplicate disappears; original re-selects | — | |
| 5 | Ctrl+Shift+Z | Duplicate reappears at the moved position | — | |
| 6 | **Delete** while a part is selected | Part removed | — | |
| 7 | Ctrl+Z | Part restored | — | |

---

## T07 — Snap to floor

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Select a part and move it above `y = 0` with translate gizmo | — | — | |
| 2 | Press **F** or click **⬇ Floor** in the primitives bar | Part translates so its lowest vertex sits at `y = 0`; orientation unchanged | — | |
| 3 | Select a rotated part (~30° tilt) and press **F** | Part settles with its lowest point at `y = 0` | — | |
| 4 | Ctrl+Z | Part returns to pre-snap position | — | |

---

## T08 — Multi-select and Weld / Unweld

Weld fuses selected parts into a rigid THREE.Group that moves and scales as one unit.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert a **Cube** and a **Cylinder**; position them side by side | — | — | |
| 2 | Click the cube; **Shift+click** the cylinder | Both highlighted; **Weld** button appears | — | |
| 3 | Click **Weld** | Status "Welded. Parts grouped as one rigid unit."; TC attaches to group centroid | — | |
| 4 | Drag the TC gizmo | Both parts move together | — | |
| 5 | Press **R** and scale the weld group | Both parts scale together | — | |
| 6 | Click any member of the group | Whole group selects; **Unweld** button appears | — | |
| 7 | Click **Unweld** | Status "Unwelded. Parts returned to scene root."; TC attaches to the clicked mesh | — | |
| 8 | Drag the cube alone | Cylinder stays in place | — | |
| 9 | Ctrl+Z twice | Unweld and Weld both undo; group restored | — | |

---

## T09 — Enter-group edit mode

Requires a weld group from T08 (or create one).

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click the weld group to select it | TC at group centroid | — | |
| 2 | **Double-click** one member | Group edit mode: TC attaches to that mesh; other members dim to ~20% opacity; **Exit group edit** button appears | — | |
| 3 | Drag the TC gizmo | Only that member moves | — | |
| 4 | Single-click a different member inside the group | TC switches to the new member | — | |
| 5 | Press **Esc** | Group edit mode exits; TC snaps back to group centroid; dimming clears | — | |
| 6 | Double-click again; move a member; Ctrl+Z | Member's local move undoes | — | |
| 7 | Click outside the group | Deselects and exits group edit mode | — | |

---

## T10 — Glue (live positional constraint)

Glue attaches the *mover*'s face flush to the *anchor*'s face contact point. Moving the anchor pulls the mover with it by re-running constraint resolution each frame. Parts are **not** merged into a group — they stay at scene root or in their own weld groups.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert a **Cylinder** and a **Cube**; position them apart | — | — | |
| 2 | Press **G** or click **Glue…** | Status "Click any surface to place the anchor blob. Esc cancels." | — | |
| 3 | Hover a face on the cylinder | Yellow dot tracks the surface | — | |
| 4 | Click to set the anchor | Pink blob appears on the cylinder; status "Now click any surface on a different part to snap it here. Esc cancels." | — | |
| 5 | Hover a face of the cube | Yellow dot tracks the cube; cylinder already excluded from second pick | — | |
| 6 | Click the cube face | Cube rotates face-flush and snaps its contact point to the pink blob; status "Glued." | — | |
| 7 | Select the cylinder and translate it | Cube follows, maintaining the joint offset | — | |
| 8 | Click the cube (mover) | **Unglue** button appears | — | |
| 9 | Press **U** or click **Unglue** | Status "Unglued."; cube stays at current position; cylinder ignores it | — | |
| 10 | Ctrl+Z to undo the glue | Both parts return to pre-glue positions; joint removed | — | |

---

## T11 — Glue with weld groups as mover

Confirms a weld group (rigid entity) can be the mover in a glue joint.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Weld two cubes together | Weld group created | — | |
| 2 | Insert a standalone cylinder | — | — | |
| 3 | Press **G**; click the cylinder as anchor | Pink blob on cylinder | — | |
| 4 | Click a face of one cube in the weld group | Entire weld group rotates and snaps to the cylinder | — | |
| 5 | Select and translate the cylinder | Weld group follows as a rigid unit | — | |
| 6 | Click the weld group; **Unglue** | Joint removed; weld group remains intact at current position | — | |

---

## T12 — Named assemblies (OPFS)

### T12a — Name and autosave

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | On a fresh session, insert a primitive | Assembly auto-saves after ~500 ms (no error in console) | — | |
| 2 | Click the name field ("Untitled") and type "My Robot"; press Enter or click away | Name updates; autosave fires | — | |
| 3 | Reload the page | "My Robot" loads back with the same parts; name field shows "My Robot" | — | |

### T12b — New assembly

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | With "My Robot" loaded, click **New** in the toolbar | Session clears; name resets to "Untitled"; empty viewport | — | |
| 2 | Insert a Sphere and rename to "Alien Eye" | — | — | |
| 3 | Reload | "Alien Eye" restores | — | |

### T12c — Open panel

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **Open…** | Panel appears listing "My Robot" and "Alien Eye" with dates | — | |
| 2 | Click "My Robot" in the list | "My Robot" loads | — | |
| 3 | Open the panel again | "My Robot" entry highlighted (current) | — | |
| 4 | Click **✕** next to "Alien Eye" | "Alien Eye" disappears from the list | — | |
| 5 | Press **Esc** or click the panel close button | Panel closes | — | |

### T12d — Weld groups survive round-trip

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Load "My Robot"; weld two parts together; rename to "Weld Test"; reload | Weld group reconstructed; clicking any member selects the group | — | |

---

## T13 — Export to Catalogue and use in a production

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Name the assembly; ensure it has at least one part | — | — | |
| 2 | Click **Export to Catalogue** | Status "Exporting…" then success message using the assembly name | — | |
| 3 | Navigate to `http://localhost:5173/` | Main app loads | — | |
| 4 | Open the **Catalogue** tab; scroll to Set Pieces | The exported entry is visible under the assembly's name | — | |
| 5 | Drag the entry into a scene | 3D model loads in the viewport | — | |

---

## T14 — Integration: build a table from primitives

Full authoring path using primitives, weld, snap to floor, and export.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Click **New**; name it "Dining Table" | Empty viewport | — | |
| 2 | Insert a **Cube**; scale to a flat slab (`~2.5 × 0.15 × 2.5`); colour wood-brown | Tabletop | — | |
| 3 | Insert a **Cylinder**; scale to a thin tall leg; colour matching; press **F** to floor-snap | First leg at `y = 0` | — | |
| 4 | Shift+D ×3; position each copy at a corner under the tabletop; floor-snap each | Four legs at `y = 0` | — | |
| 5 | Shift-click all four legs → **Weld** | Four legs become one rigid weld group | — | |
| 6 | Shift-click the leg weld group + the tabletop → **Weld** | All five parts in one group | — | |
| 7 | Translate and rotate the whole group | All five parts move together | — | |
| 8 | Click **Export to Catalogue** | Entry "Dining Table" appears in main app catalogue | — | |

---

## T15 — Integration: articulated character using glue

Tests live constraint chaining across parts and weld groups.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Insert a **Cube** (body) and a **Cylinder** (neck); weld them together | Body+neck weld group | — | |
| 2 | Insert a **Sphere** (head) | Standalone part | — | |
| 3 | Press **G**; click the top of the cylinder as anchor | Pink blob | — | |
| 4 | Click the bottom of the sphere | Sphere snaps flush to the cylinder top; status "Glued." | — | |
| 5 | Translate the weld group (body+neck) | Sphere follows, maintaining joint offset | — | |
| 6 | Click the sphere; **Unglue** | Sphere no longer follows; stays at current position | — | |

---

## T16 — Integration: extruded parts table

Repeat of T14 using only extruded polygon shapes.

| Step | Action | Expected | Status | Notes |
|:----:|--------|----------|:------:|-------|
| 1 | Sketch and extrude a small square for a table leg; colour it | — | — | |
| 2 | Shift+D ×3; position and floor-snap each copy | Four extruded legs at `y = 0` | — | |
| 3 | Sketch and extrude a large rectangle for the tabletop; scale and position it above the legs | — | — | |
| 4 | Weld all five parts together | One rigid group | — | |
| 5 | Export to catalogue; verify in main app | Entry usable in a production | — | |

---

## Known gaps (not yet implemented)

| Feature | Phase |
|---|---|
| Numeric position / rotation / scale fields in properties panel | SA12 |
| Extrusion depth numeric input | SA12 |
| Uniform scale lock (X/Y/Z together) | SA12 |
| Rectangle and circle sketch presets | SA6 |
| Nominated-face floor snap (mark a specific face as the floor contact) | SA11b |
| Glue point editor (adjust contact point position and twist on an existing joint) | SA12 |
