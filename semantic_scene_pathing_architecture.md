# Architecture Guide: Semantic 3D Scene Modeling & Character Pathing for Rapid Previsualization

## 1. Executive Summary & The Core Problem

When translating a screenplay, stage play, or theatrical script into a 3D previsualization scene (e.g., using Svelte, TypeScript, Three.js, and Tone.js), developers face a fundamental disconnect:

* **The Dramatic Gap:** Scripts specify intent, relationships, and emotional beats in deliberately vague terms (*"ALICE paces restlessly"*, *"BOB retreats to the counter"*, *"An awkward silence settles across the table"*).
* **The Geometric Reality:** A 3D engine requires continuous mathematical coordinates, collision boundaries, orientations, and bone transforms.

Simulating full physics (rigid bodies, dynamic character capsules, continuous collision response) produces jitter, clipping, physics instability, and fights cinematic blocking. 

The production-proven architectural solution is a **three-tier model**:
1. **Dramatic Intent** (The Script / LLM Parser)
2. **Semantic Spatial Layer** (Discrete Named Zones, Smart Prop Anchors, Proxemic Distances)
3. **Geometric Runtime Layer** (Automated Recast/Detour NavMesh, Splines, Floor Clamping)

```
[ DRAMATIC INTENT LAYER ]
   Screenplay / Director Intent: "Alice confronts Bob at the island, lingering nervously"
               │
               ▼
[ SEMANTIC SPATIAL LAYER ]
   Discrete Targets: Zone["Kitchen_Prep"], Anchor["Island_Lean_Front"], Proxemics: 1.0m
               │
               ▼
[ GEOMETRIC RUNTIME LAYER ]
   Recast NavMesh (A* Path) ──► Catmull-Rom Spline ──► Character Kinematics & Audio Cues
```

---

## 2. The Three-Tier Architecture

### Tier 1: The Dramatic / Intent Layer
Operates strictly in narrative time and dramatic concepts:
* Scene beats, character moods, actions (`enter`, `exit`, `confront`, `inspect`, `sit`, `pace`).
* Does not know or care about raw $(X, Y, Z)$ floating-point coordinates.

### Tier 2: The Semantic Spatial Layer (The Bridge)
Endows the 3D scene with vocabulary and spatial affordances:
* **Semantic Zones:** Convex areas defining theatrical regions (`STAGE_LEFT_WING`, `UPSTAGE_CENTER`) or narrative spaces (`KITCHEN_NOOK`, `MEZZANINE_BALCONY`).
* **Interaction Anchors ("Smart Sockets"):** Discrete interaction slots attached to props specifying where an actor should stand, which way they face, and what pose they take.
* **Proxemic Rules:** Mathematical spacing ranges derived from dramatic relationships (Intimate, Personal, Social, Public).

### Tier 3: The Geometric Runtime Layer
Executes deterministic 3D movement:
* **NavMesh (Recast/Detour via Wasm):** Handles multi-level topology, stair climbing, wall avoidance, and door clearances.
* **Trajectory Smoothing:** Wraps polygonal waypoints into smooth `CatmullRomCurve3` splines.
* **Execution & Sockets:** Moves root transforms along curves while driving animation states and spatialized audio (Tone.js).

---

## 3. Automated NavMesh Deduction (Using `@recast-navigation/three`)

Rather than having an AI author complex navigation meshes or hand-crafting waypoints, **deduce the NavMesh automatically from generated 3D primitives** using `@recast-navigation/three` (an open-source MIT/Zlib WebAssembly port of the industry-standard Recast/Detour library).

### Why Recast Excels for Rapid Prototypes
* **Voxelization Pipeline:** Converts messy, overlapping 3D meshes into vertical voxel columns. It is completely immune to non-manifold geometry, coplanar faces, zero-area sliver triangles, and missing backfaces.
* **Multi-Story / Degeneracy Support:** Natively supports overlapping vertical levels (e.g., stage floor directly beneath an upper mezzanine) because voxel columns maintain multiple distinct open and solid spans.
* **Automatic Stair Handling:** Steps with rise $\le \text{walkableClimb}$ are automatically merged into a continuous, climbing walkable surface.

### Implementation Pattern

1. **Tag Scene Primitives during Generation:**
   ```typescript
   // Every generated mesh carries its physical role
   floorMesh.userData = { navRole: 'walkable' };
   stageFlat.userData = { navRole: 'obstacle' };
   counterMesh.userData = { navRole: 'obstacle' };
   ```

2. **Deduce NavMesh in One Shot:**
   ```typescript
   import * as THREE from 'three';
   import { init } from 'recast-navigation';
   import { threeToSoloNavMesh, NavMeshHelper } from '@recast-navigation/three';

   export async function generateStageNavMesh(scene: THREE.Scene) {
     await init();

     const meshes: THREE.Mesh[] = [];
     scene.updateMatrixWorld(true);

     scene.traverse((obj) => {
       if (obj instanceof THREE.Mesh && obj.userData.navRole) {
         meshes.push(obj);
       }
     });

     const navConfig = {
       cs: 0.1,                // 10cm voxel resolution
       ch: 0.1,                // 10cm vertical voxel resolution
       walkableSlopeAngle: 45, // Max slope angle (stairs: ~30-35 deg)
       walkableHeight: 18,     // 18 * ch = 1.8m actor head clearance
       walkableClimb: 3,       // 3 * ch = 0.3m max step rise (steps: yes, counters: no)
       walkableRadius: 3,      // 3 * cs = 0.3m body clearance from walls/edges
     };

     const { success, navMesh } = threeToSoloNavMesh(meshes, navConfig);
     return success ? navMesh : null;
   }
   ```

3. **Querying 3D Multi-Level Paths:**
   ```typescript
   import { NavMeshQuery } from 'recast-navigation';

   export function findPathAcrossLevels(
     navMesh: any,
     startPos: THREE.Vector3,
     targetPos: THREE.Vector3
   ): THREE.Vector3[] {
     const query = new NavMeshQuery({ navMesh });

     // Keep vertical search extents tight (1.0m to 1.5m) so the query does not
     // confuse a mezzanine floor with the stage floor directly beneath it.
     const searchExtents = [1.0, 1.5, 1.0];

     const { success, path } = query.computePath(startPos, targetPos, {
       startFilterExtents: searchExtents,
       endFilterExtents: searchExtents,
     });

     if (!success || path.length === 0) return [];
     return path.map((p) => new THREE.Vector3(p.x, p.y, p.z));
   }
   ```

---

## 4. Endowing the Space with Semantic Meaning

To turn raw geometry into a navigable theatrical environment, enrich the scene with metadata models:

### A. Semantic Zones (Spatial Regions)
Regions on the floor with theatrical or narrative identity:
```typescript
interface SemanticZone {
  id: string;                      // e.g. "UPSTAGE_RIGHT", "KITCHEN_NOOK"
  name: string;                    // Human/AI-readable label
  bounds: THREE.Box2 | THREE.Vector2[]; // 2D boundary footprint
  tags: ('stage' | 'backstage' | 'intimate' | 'public' | 'transitional')[];
  defaultFacing: THREE.Vector3;   // Direction to face (e.g. toward audience/camera)
}
```

### B. Smart Interaction Anchors ("Sockets")
Furniture and architectural elements expose explicit interaction points:
```typescript
interface InteractionAnchor {
  id: string;                     // e.g. "island_front_prep"
  parentPropId: string;           // "kitchen_island"
  position: THREE.Vector3;        // Exact landing coordinate for feet
  facing: THREE.Vector3;          // Target point/vector actor should face
  affordance: 'stand' | 'lean' | 'sit' | 'inspect';
  occupiedBy?: string | null;     // Actor ID currently claiming this socket
}
```

#### Procedural Derivation for Rapid Prototypes:
For a rapid visualizer where furniture is generated from boxes, anchors can be computed automatically from bounding boxes:
* **Front Anchor:** Center $X$, Floor $Y$, $Z + (\text{depth}/2) + 0.4\text{m}$, Facing toward item center.
* **Rear Anchor:** Center $X$, Floor $Y$, $Z - (\text{depth}/2) - 0.4\text{m}$, Facing toward item center.
* **Left/Right Anchors:** Calculated similarly with $\pm(\text{width}/2) + 0.4\text{m}$ offset.

### C. Theatrical Proxemics (Relational Distance)
Translating dramatic interactions into target distances:
* **Intimate ($< 0.5\text{m}$):** Whispers, romance, direct physical threats.
* **Personal ($0.5\text{m} \text{--} 1.2\text{m}$):** Friendly conversation, kitchen prep together.
* **Social ($1.2\text{m} \text{--} 3.0\text{m}$):** Casual distance, tension across a table, formal talks.
* **Public ($> 3.0\text{m}$):** Estrangement, soliloquies, yelling across a room.

When an actor "retreats" or "confronts", the solver casts candidate points on the NavMesh along or against the direction vector between actors, snapping to the target proxemic band.

---

## 5. Director Tooling & Interactive Path Editing

Never lock the director or user into raw AI-generated or NavMesh-generated lines. Use NavMesh as the **initial draft**, then expose an interactive spline layer:

```
[NavMesh Output: Discrete 3D Waypoints]
               │
               ▼
[THREE.CatmullRomCurve3 (centripetal)]
               │
               ├── Render visual ribbon/line in Three.js
               ├── Spawn handle spheres at control points
               └── Attach TransformControls to selected handles
```

### Implementation Pattern

1. **Curve Construction:**
   ```typescript
   const rawPoints = findPathAcrossLevels(navMesh, startPos, endPos);
   const curve = new THREE.CatmullRomCurve3(rawPoints);
   curve.curveType = 'centripetal'; // Prevents sharp loops on tight corners
   ```

2. **Interactive Handles:**
   * Place small interactive meshes (e.g., spheres) at each waypoint.
   * Attach Three.js `TransformControls` to the active handle.
   * On handle drag (`change` event):
     * Update `curve.points[index].copy(handle.position)`.
     * Re-sample curve geometry: `line.geometry.setFromPoints(curve.getPoints(100))`.
3. **Safety / NavMesh Clamping (Optional):**
   * As handles are dragged, call `navMeshQuery.getClosestPoint(handle.position)` to prevent the user from floating waypoints into mid-air or sinking them into floors.
   * Run Detour line raycasts between adjacent handles. If a segment cuts through an unwalkable barrier, highlight the curve in red to warn the user.
4. **Director Timing & Cues:**
   * Attach temporal metadata to waypoints:
     ```typescript
     interface WaypointCue {
       pauseDuration: number;    // e.g. pause for 3.0s to deliver line
       facingMode: 'path' | 'audience' | 'character';
       targetCharacterId?: string;
       audioCueId?: string;      // Trigger Tone.js playback
     }
     ```

---

## 6. Integration Checklist for Svelte + Three.js + Tone.js

| System | Role & Best Practice |
| :--- | :--- |
| **`recast-navigation`** | Initialize WebAssembly (`await init()`) on app or component mount. Re-run `threeToSoloNavMesh` whenever the set layout or walls are regenerated. |
| **Three.js** | Keep character logic off rigid-body physics. Drive roots along `curve.getPointAt(t)`. Rotate character towards `curve.getTangentAt(t)` (or towards a look-at target). |
| **Svelte State / Runes** | Store scene metadata (`zones`, `anchors`, `activeCues`, `actors`) in reactive stores/runes. Let UI bind directly to selected anchors or waypoint properties. |
| **Tone.js** | Hook into path milestones: trigger footstep synthesis while moving, trigger room reverb changes when crossing zone boundaries (e.g., entering backstage wing), and trigger audio lines at designated waypoint cue pauses. |
