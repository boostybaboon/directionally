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

Glue is a two-phase pick. **First click** on any surface sets the anchor (stays still). **Second click** on a different part is the mover — it rotates face-flush and snaps to the anchor point. Both parts are merged into an assembly group.

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 16 | Press **G** or click **Glue…** in the primitives bar; status bar shows "Click any surface to place the anchor blob. Esc cancels." | — | |
| 17 | Move the cursor over the underside of the tabletop; a yellow sphere dot tracks the hovered surface point | — | |
| 18 | Click the tabletop underside; a pink blob marks the fixed anchor point; status changes to "Now click any surface on a different part to snap it here. Esc cancels." | — | |
| 19 | Move the cursor over the first leg's top; the yellow dot now tracks only the leg surface (the tabletop and any group members are excluded from the second pick) | — | |
| 20 | Click the leg top; the leg rotates so its top face becomes flush with the tabletop underside, then snaps so the two contact points meet; status "Glued. Parts joined in assembly group." | — | |
| 21 | TC gizmo re-attaches to the new assembly group; drag the gizmo and confirm both parts move together | — | |
| 22 | Repeat steps 16–20 for the three remaining legs, anchoring on the tabletop underside each time; the same group grows with each repeat | — | |
| ✓ | Assembly group `assembly-1` contains all 5 parts; no standalone legs remain at scene root | — | |

---

### Part F — Verify group behaviour in normal mode

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 23 | Click any mesh in the table (either a leg or the top); the whole assembly selects; TC gizmo appears at the group centroid | — | |
| 24 | Drag the gizmo to translate the whole table to a new position; all 5 parts move together | — | |
| 25 | Press **R** and scale the whole group; all parts scale together | — | |
| ✓ | Assembled table moves and scales as a single unit | — | |

---

### Part G — Extend the assembly with an additional part

**G** works at any time — you can anchor on a surface that already belongs to an existing group. The mover joins that group.

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 26 | Insert a new **Cube** via the primitives bar; position it near (but not touching) the assembled table | — | |
| 27 | Press **G**; status "Click any surface to place the anchor blob." | — | |
| 28 | Click any face of the existing table assembly as the anchor (e.g. the tabletop side face); pink blob appears | — | |
| 29 | Click a face on the new standalone cube; the cube rotates to face-align and snaps to the table | — | |
| 30 | Drag the TC gizmo; all six parts (original 5 + new cube) move as a unit | — | |
| ✓ | Gluing a new part to an existing group expands the group correctly | — | |

---

### Part H — Unglue a leg and re-glue it

`U` removes **all** joints touching the currently tracked part. Clicking a mesh in a group selects the group for TC, but the specifically-clicked mesh is tracked — so click the exact leg you want to detach, then press `U`.

| Step | Description | Status | Issues |
|:----:|-------------|:------:|--------|
| 31 | Click the leg you want to detach; TC attaches to the whole group, but the clicked leg is tracked (the **Unglue** button appears in the primitives bar confirming which part is active) | — | |
| 32 | Press **U** or click **Unglue** in the primitives bar; all joints touching the clicked leg are removed | — | |
| 33 | The leg detaches from the group and returns to scene root as a standalone part; the remaining parts stay in the group | — | |
| 34 | Move the detached leg to a different position using the TC gizmo | — | |
| 35 | Press **G**; click the detached leg's top as anchor (pink blob); click the tabletop underside to complete the re-glue | — | |
| 36 | The leg snaps flush to the tabletop underside and re-joins the assembly group | — | |
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
| Named assemblies (open/save/re-edit across sessions) | SA9 |
| Sketch shape presets (rectangle, circle) | SA6 |
| Individual-part transforms within a group (clicking a mesh in a group moves the whole group; TC cannot target a single member) | post-SA13 |
| Undo / redo | SA13 |
