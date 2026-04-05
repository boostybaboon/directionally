# Directionally — Sketcher Workflows

Standard authoring workflows for manual testing of the `/sketch` route.
Each workflow is a step-by-step sequence that can be followed top-to-bottom to verify the feature works end-to-end.

**Preconditions for all workflows:** App running (`yarn dev --open`). Navigate to `http://localhost:5173/sketch`.

**Status key:** `—` not yet tested · `OK` works as described · `Partial` works with workaround (see Issues) · `Fail` step not achievable as written

---

## Workflow SK1 — Happy Path: Build a Table

**Goal:** Create a simple 4-legged table using the primitive palette, per-part colour, duplicate, and glue features; export the assembled table to the catalogue and confirm it is usable in a production.

---

### Part A — Navigate to the sketcher

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 1 | Open the app (`yarn dev --open`) | OK | |
| 2 | Navigate to `http://localhost:5173/sketch` directly in the browser | OK | |
| ✓ | Canvas loads with a 3D viewport; toolbar is visible; no parts in scene | OK | |

---

### Part B — Create and colour the first leg

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 3 | Click **Cylinder** in the primitive toolbar; a cylinder appears at origin and is auto-selected (TC gizmo visible) | OK | |
| 4 | In the colour HUD, pick a wood-brown colour (e.g. hex `#8B5E3C`); cylinder updates | OK | |
| 5 | Use the translate gizmo (**W**) to move the cylinder to a corner at roughly `(-1, 0, -1)` | OK | |
| ✓ | One wood-brown cylinder at the first corner; TC gizmo attached | OK | |

---

### Part C — Duplicate to four legs

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 6 | Press **Shift+D** or click **Duplicate** in the colour HUD; a second cylinder appears, auto-selected | OK | |
| 7 | Move the new cylinder to `(1, 0, -1)` using the TC gizmo | OK | |
| 8 | Click the first cylinder to re-select it; press **Ctrl+D** | OK | |
| 9 | Move the third cylinder to `(-1, 0, 1)` | OK | |
| 10 | Select any leg and press **Ctrl+D** one more time | OK | |
| 11 | Move the fourth cylinder to `(1, 0, 1)` | OK | |
| ✓ | Four wood-brown cylinders at the four corners; all top-level parts | OK | |

---

### Part D — Create and scale the tabletop

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 12 | Click **Cube** in the primitive toolbar; a cube appears at origin, auto-selected | OK | |
| 13 | Pick the same wood-brown colour as the legs | OK | |
| 14 | Press **R** to switch to scale mode; scale the cube to a flat slab — stretch X and Z, compress Y (e.g. roughly `2.5 × 0.2 × 2.5`) | OK | |
| 15 | Press **W** to return to translate mode; move the tabletop up to sit just above the tops of the legs (e.g. `(0, 1.1, 0)`) | OK | |
| ✓ | Flat brown tabletop hovering above the four legs; 5 unconnected top-level parts | OK | |

---

### Part E — Glue the legs to the tabletop

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 16 | Click the first leg (front-left) to select it | — | |
| 17 | Press **G** or click **"Glue…"** in the HUD; cursor changes; status bar enters glue-pick mode | OK | |
| 18 | Move the cursor over the underside of the tabletop; the closest face highlights yellow | OK | |
| 19 | Click the highlighted face; the leg snaps so its top cap is flush with the tabletop underside; a group forms (`Group_1`) containing the leg and tabletop | FAIL | tabletop snapped to middle of cylinder. Can't move the glued pair |
| 20 | Click the second leg; press **G**; hover the tabletop underside; click to glue — `Group_1` grows to 3 parts | — | |
| 21 | Repeat for the third leg | — | |
| 22 | Repeat for the fourth leg | — | |
| ✓ | `Group_1` contains all 5 parts; scene has no remaining top-level SketcherParts outside the group | — | |

---

### Part F — Verify group behaviour in normal mode

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 23 | Click any mesh in the table (either a leg or the top); the whole assembly selects; TC gizmo appears at the group centroid | — | |
| 24 | Drag the gizmo to translate the whole table to a new position; all 5 parts move together | — | |
| 25 | Press **R** and scale the whole group; all parts scale together | — | |
| ✓ | Assembled table moves and scales as a single unit | — | |

---

### Part G — Verify glue-edit mode and joint replay

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 26 | Click away to deselect; press **G** to toggle into glue-edit mode; status bar shows "Glue edit" in amber | — | |
| 27 | Click one leg; TC gizmo attaches to that individual leg (not the whole group) | — | |
| 28 | Press **R** to switch to scale; drag the Y axis to make the leg visibly taller; release the gizmo | — | |
| 29 | After releasing, the leg repositions so its top cap remains flush with the tabletop underside (joint recipe replays automatically) | — | |
| 30 | Press **G** again to exit glue-edit mode; group normalises | — | |
| ✓ | Individual part editing within a group works; joints replay on drag-end to preserve face contact | — | |

---

### Part H — Unglue a leg and re-glue it

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 31 | Enter glue-edit mode (**G**); click one leg to select it | — | |
| 32 | Press **U** or click **"Unglue"** in the HUD; the joint is removed | — | |
| 33 | Observe: if the leg was the only joint on that leg, the leg is detached from `Group_1` and returns to the scene as a top-level part; the remaining 4 parts stay in the group | — | |
| 34 | Move the detached leg to a different position using the TC gizmo | — | |
| 35 | Select the moved leg; press **G**; hover the tabletop underside; click to re-glue | — | |
| 36 | The leg snaps back flush; re-joins `Group_1` | — | |
| ✓ | Unglue followed by re-glue works cleanly | — | |

---

### Part I — Export to catalogue

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 37 | Click **Export to Catalogue** in the toolbar | — | |
| 38 | Status bar shows "Saved to catalogue as sketch-[timestamp].glb" | — | |
| 39 | Navigate to `http://localhost:5173/` (the main production app) | — | |
| 40 | Open the **Catalogue** tab in the left panel; the table asset appears under Set Pieces | — | |
| 41 | Drag the table into a scene; the assembled model loads in the 3D canvas | — | |
| ✓ | User-created table is usable in productions | — | |

---

###

Part J - Repeat the above but drawing polys and extruding

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 42 | Make four legs from small squares extruded | — | |
| 43 | Make a tabletop from a large rectangle extruded | — | |
| 44 | Colour them appropriately | — | |
| 45 | Glue them | — | |
| 46 | Save for use in a production | — | |
| ✓ | Have a wonky table savable to a catalogue | — | |

---

### Known gaps (do not expect these to work yet)

| Item | Phase |
|---|---|
| Per-face colour on individual faces | SA7 |
| Texture dragged onto a face | SA8 |
| Save assembly for re-editing later | SA9 |
| Sketch shape presets (rectangle, circle) | SA6 |
