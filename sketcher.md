# Cartoon 3D Sketcher — Project Brief & Conversation Summary

## Project Goal

Build a **fast, fun, cartoon-style 3D sketcher** in Three.js. This is explicitly **not** a CAD tool — the priority is quick, intuitive model creation with support for:

- Freeform polygon sketching & extrusion
- Cartoon/stylised aesthetic (low-poly, rounded, expressive)
- Skeletal rigging & skinning (`THREE.SkinnedMesh`)
- Physics engine compatibility (Rapier.js recommended)
- Fast iteration, not engineering accuracy

---

## Key Decision: Not CSG/B-Rep

We explored CSG (via `three-bvh-csg`) and B-Rep as potential geometry kernels but **ruled them out** as the primary approach for this use case because:

- CSG/B-Rep output needs conversion to be rigging/physics compatible
- They are over-engineered for cartoon aesthetics
- They don't naturally support skinning or bone hierarchies

---

## Chosen Approach: Primitive Stacking + Freeform Extrusion

### Core Paradigm
- **Primitive parts** (rounded boxes, capsules, spheres) stacked and attached to each other
- **Freeform polygon sketching** → extrude via drag handle → solid mesh
- Each part/solid maps naturally to a **bone** in a skeleton
- Physics = one **convex hull collider per part** (instant ragdoll)

### Inspiration
Think *Spore creature creator*, not FreeCAD.

---

## Recommended Tech Stack

| Library | Role |
|---|---|
| `three.js` | Rendering, scene graph, camera |
| `THREE.SkinnedMesh` | Rigging & skinning (built-in) |
| `THREE.Skeleton` | Bone hierarchy (built-in) |
| `THREE.ExtrudeGeometry` | Sketch profile → solid mesh |
| `THREE.Shape` | 2D sketch representation |
| `three-bvh-csg` | Optional: Boolean cuts/holes later |
| `three-mesh-bvh` | Spatial queries, raycasting |
| `Rapier.js` | Physics (WASM, fast, great JS support) |
| `tweakpane` or `leva` | Parameter sliders / UI controls |

---

## Implemented: Freeform Polygon Sketcher + Extrusion Handle

### Interaction Flow
1. User clicks **Start Sketch**
2. Clicks on the sketch plane to **place polygon vertices**
3. **Double-click** or click near first point to **close the shape**
4. A **yellow grab handle** appears above the shape centroid
5. User **drags handle upward** → extrusion depth updates live
6. **Release** → completed `THREE.Mesh` solid ready for rigging/physics

### Key Classes Written

#### `PolygonSketcher`
- Raycasts mouse onto a `THREE.Plane` to get world-space points
- Places visual vertex dots as user clicks
- Draws rubber-band preview line following cursor
- Converts closed point array → `THREE.Shape` (2D)
- Fires `onShapeClosed(shape, centroid)` callback

#### `ExtrusionHandle`
- Attaches a draggable yellow sphere handle at shape centroid
- On `pointermove` drag: maps pixel delta → extrusion depth
- Live-rebuilds `THREE.ExtrudeGeometry` during drag
- Uses `bevelEnabled: true` for instant cartoon roundness
- Fires `onExtrusionComplete(mesh, depth)` callback

#### `CartoonSketcher`
- Wires `PolygonSketcher` → `ExtrusionHandle` pipeline
- Stores completed solids in `this.solids[]`
- Entry point: `sketcher.startNewSketch()`

### Important Implementation Notes
- `ExtrudeGeometry` is rotated `X: -Math.PI / 2` so extrusion goes up the Y axis
- Rebuild should be **throttled to ~30fps** during drag for performance:
  ```javascript
  _rebuildMesh = throttle(this._rebuildMesh.bind(this), 33);
  ```
- Handle uses `depthTest: false` and `renderOrder: 999` to stay visible through geometry
- Snapping points to a 0.1 grid recommended for cleaner shapes

### Cartoon Feel Enhancements Discussed
| Touch | Method |
|---|---|
| Rounded edges | `bevelEnabled: true` on ExtrudeGeometry |
| Handle visibility | Pulsing scale via `Math.sin(time)` |
| Smooth drag | Lerp depth toward target value |
| Outline effect | Backface inflation shader trick |
| Cleaner shapes | Snap vertices to 0.1 grid |

---

## Output of Each Solid

Each completed extruded mesh is:
- A standard `THREE.Mesh` — immediately renderable
- Convertible to `THREE.SkinnedMesh` for rigging
- Ready for `Rapier.js` `ConvexHull` collider for physics
- Compatible with `three-bvh-csg` for optional Boolean cuts later
- Can receive materials, textures, toon shaders

---

## Next Steps (Not Yet Implemented)

- [ ] **Auto-bone placement** on completed solid (place bone along extrusion axis)
- [ ] **Proximity-based skin weight computation**
- [ ] **Convex hull collider** setup in Rapier.js per solid
- [ ] **Part attachment** — snap one solid to a face of another
- [ ] **Primitive stacking UI** (place capsules, spheres, rounded boxes)
- [ ] **Toon shader / outline** pass for cartoon rendering
- [ ] **Sketch plane selection** — click a face to sketch on it
- [ ] **Boolean cuts** via `three-bvh-csg` (optional, for holes/cutouts)

---

## Code Location

All three classes (`PolygonSketcher`, `ExtrusionHandle`, `CartoonSketcher`) were
designed as standalone ES module classes, ready to drop into a Three.js project.
No framework assumed — plain Three.js + ES modules.