# Directionally — Humanoid Parameterisation & Look Roadmap

Not scheduled work. A creative review/planning exercise, parked here to be picked up whenever.
Complements [ROADMAP_AI.md](ROADMAP_AI.md) — this roadmap's minimal parameter set is intended to
become that roadmap's AI-1 (character generation) schema. Extends and partially supersedes
`SKETCHER_ROADMAP.md`'s CB1 (bone proportion editor) and CB2 (colour customisation), which
described the current segment-based approach as the target end state; this roadmap proposes a
different mesh technique underneath the same slider-driven authoring feel.

---

## Problem statement

Two problems, and they share one solution.

### 1. The "set of cylinders" look

`ProceduralHumanoid._attachBodyGeom()` builds one **rigid** `CylinderGeometry` tube per bone
segment, parented directly to that bone, meeting the next segment at a joint sphere. Each tube
tracks its own bone's rotation every frame (`_syncBodyLinks`) — correct articulation, but no
per-vertex skin blending across the joint. In a resting pose this reads as a stylised, blocky
"toy robot" look, which suits the C3PO/Sonny robot styles deliberately. For the `organic`
(human) style it shows two concrete problems:

- Visible seams/creases at every joint, worst at extreme bend angles (a sharply bent elbow
  doesn't smoothly taper — the two rigid tube ends just rotate independently).
- No continuous surface for a texture, cloth-like shading, or any effect that assumes one
  manifold mesh.

### 2. The parameter-count problem

The current authorable surface, counted directly from `ProceduralHumanoid.ts`:

- 15 `BoneParams` groups (`BONE_GROUPS`), each with up to 9 fields (`tubeRadiusX/Z`,
  `jointRadius`, `jointRadiusY/Z`, `jointOffsetY/Z`, `tubeOffsetForward`,
  `jointFrustumRatio(Z)`, `atlasRadius`) — well over 60 raw numeric fields when expanded.
- 19 `FaceParams` fields (eye/nose/mouth/hair/brow geometry).
- 5 `BodyColors` fields, plus style/inset/neck-tilt globals.

This is a good design for a human with live sliders and instant visual feedback — the current
`/character` page. It is a poor target for "type `24yo rookie LA cop` and get a plausible
starting character," because neither an LLM nor a human typing a one-line descriptor has any
semantic anchor for what `jointFrustumRatioZ` or `hairlineTempleRecession` should be for that
persona. `ROADMAP_AI.md`'s AI-1 phase needs a schema an LLM can fill *confidently*, not merely
*validly* — confidence requires the fields to correspond to things a text description actually
implies (age, build, height, hair colour), not low-level geometry construction parameters.

### Why these problems share one solution

Real **linear-blend skinning** on a single continuous mesh — standard rigging, the same
technique every Mixamo mesh character already uses, not a research project — decouples **pose**
(the skeleton, unchanged) from **shape** (the mesh). Once shape lives on its own axis, the
industry-standard way to keep it low-dimensional while covering a wide range of bodies is a
small set of named **morph targets** (glTF-native, `three.js`-native — no custom tooling
required) blended by a handful of semantic sliders: build, age, muscularity, and so on. This is
architecturally the same idea SMPL/SMPL-X uses (a low-dimensional shape-coefficient space over a
single rigged mesh), scaled down to a scope a single-developer project can hand-author rather
than needing a licensed statistical body model or a PCA training pipeline.

So: fixing the look (single skinned mesh) is the same architectural move that makes the minimal
parameter set possible (morph targets are only meaningful on a single continuous mesh). One
rework serves both goals.

---

## Options considered

| Option | Description | Verdict |
|---|---|---|
| **A. Keep segments, add smoothing only** | Round the tube/joint junctions cosmetically (larger overlap, rounded caps) without true skinning. | Rejected as the end state — cheapest possible improvement but caps out well short of a believable organic body; keeps the same 60+-parameter surface. Still worth doing as a stop-gap (see Phase HP-0). |
| **B. Single skinned mesh, hand-authored base + morph targets** | One continuous `SkinnedMesh` bound to the existing Mixamo skeleton via bone weights; a small library of hand-sculpted morph targets (age, build, height, muscularity, bust, etc.) blended by scalar sliders. | **Chosen.** Fixes the seam problem via standard skinning; delivers a minimal parameter set as a side effect of morph-target design; no new runtime dependency (glTF morph targets are native to Three.js's loader/exporter and to `AnimationMixer`). |
| **C. Statistical body model (SMPL/SMPL-X or similar)** | Adopt a licensed, PCA-trained parametric body model with a continuous shape-coefficient space. | Rejected for this project's scope — SMPL/SMPL-X licensing is non-commercial/research-restricted for the base model, requires a Python/PyTorch training and export pipeline this codebase has no infrastructure for, and is significant overkill for a cartoon/stylised toon-shaded aesthetic. Revisit only if a fully commercial-license equivalent appears and photorealism becomes a goal. |
| **D. Sculpt/SDF-based implicit skinning** | Represent the body as a signed-distance field or similar implicit surface, mesh it at runtime (marching cubes). | Rejected for v1 — real-time SDF meshing is a substantial engineering investment with no existing precedent in this codebase (the sketcher's geometry kernel is explicitly `THREE.Shape`/`ExtrudeGeometry`, chosen for simplicity). Parked as a research spike (Phase HP-5) only if hand-authored morphs prove insufficiently flexible after Phase HP-2/HP-3 ship. |
| **E. Swap in third-party mesh characters (Mixamo mesh, Ready Player Me)** | Use existing rigged human meshes instead of building one. | Rejected as the *default* — already considered and deferred in `SKETCHER_ROADMAP.md` (creates a third-party asset dependency, loses the parametric-proportions benefit that's core to this app's "type a persona, get a body" goal). Could still be added later as an optional "photoreal" character slot alongside the procedural one, orthogonal to this roadmap. |

---

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Mesh technique | Single `SkinnedMesh` per style, real bone-weight skinning | Fixes joint seams; industry-standard; native to Three.js/glTF, no new dependency |
| Shape parameterisation | A small set of hand-authored morph targets blended by scalar sliders (0–1 or -1–1) | Minimal, semantically-named parameter set; the same architectural pattern as SMPL's shape space, scoped to hand-authoring instead of a trained statistical model |
| Base mesh authoring | Sculpted once per style (organic/c3po/sonny) in Blender, exported via the existing `scripts/*.py` Blender-headless pipeline | Reuses established tooling (`extractRig.py`/`extractAnimations.py` already automate Blender headless GLB export) |
| Colour regions | Keep as material-level regions (skin/torso/legs/shoes/hands), now as UV-mapped material slots or vertex colours on the single mesh instead of per-segment materials | Same authoring feel for users; adapts to one mesh instead of many |
| Face | Keep as a separate overlay system (eyes/brows/mouth as attached primitives on the head bone), not merged into the body mesh's morph targets | Face rigging (blink/gaze/mouth-shape) is already working, bone-pivot-driven, and orthogonal to body shape — no reason to entangle it with body morphs in v1 |
| Statistical body model (SMPL etc.) | Not adopted | Licensing + infra + fidelity mismatch for a toon aesthetic (see Options table) |
| Robot styles (C3PO/Sonny) | Keep the current segmented-tube geometry | The rigid-segment look is deliberately correct for a robot aesthetic; only the `organic` style needs re-skinning |

---

## Target minimal parameter set

The design goal: enough axes to make a body "fit a persona," each one a plain word a human or
an LLM can map a descriptor onto directly, none requiring knowledge of the underlying rig.

### Shape sliders (morph target weights, each roughly 0–1 or −1–1)

| Slider | What it drives | Persona cue examples |
|---|---|---|
| `height` | Uniform vertical scale + morph blend toward tall/short base shapes | "6'4\"", "petite", "towering" |
| `build` (−1 slim ↔ +1 heavy) | Blend across slim/average/heavy body morphs | "athletic", "stocky", "wiry", "heavyset" |
| `muscularity` | Blend toward a more defined/muscular morph | "rookie cop, athletic", "frail", "bodybuilder" |
| `age` (young ↔ old) | Blend across young-adult/middle-age/elderly morphs (posture, proportion, minor sag) | "24yo", "elderly", "middle-aged" |
| `feminineMasculine` (−1 ↔ +1) | Blend across a feminine/masculine base-shape pair (bust, hip-to-shoulder ratio, jaw) | "Ms Sanders", "male, 56" |

Five sliders. Each is a single scalar the domain layer stores and the mesh layer resolves to a
blended set of morph target weights — the *rig* still exposes fine bone control underneath for
power users (Phase HP-4), but the **minimal/default/AI-facing surface is five numbers.**

### Appearance parameters (unchanged in spirit, simplified in count)

| Field | Notes |
|---|---|
| `skinTone` | Single colour, replaces the current 5-field `BodyColors` region split for skin — see note below |
| `hairColor` | Unchanged from current `FaceParams.hairColor` |
| `hairStyle` | Enum selecting a bundled hair mesh/morph preset (ties into `SKETCHER_ROADMAP.md`'s CB3 hair-swap plan), replacing today's ~6 hairline-shape sliders |
| `outfitColor` (or a small `{ top, bottom, shoes }` triple) | Replaces the rest of `BodyColors`; kept separate from skin since clothing colour is an obviously distinct persona cue ("navy LAPD uniform") |
| `clipSet` / `defaultAnimation` | Unchanged — bundled Mixamo clip name, already a closed enum |

`skinTone` deliberately stays separate from `outfitColor` rather than collapsing to one colour —
"skin tone" and "uniform colour" are semantically distinct things a descriptor states
independently ("dark hair", "navy uniform"), and collapsing them would lose real expressiveness
for no parameter-count benefit (still one field either way).

### Full authorable count: **~10 fields** (5 shape sliders + 5 appearance fields), down from 60+

Power-user fine control (individual bone scale, precise face geometry) remains available as an
**advanced/expert panel** in the `/character` UI (Phase HP-4) — this reduction targets the
*default and AI-facing* surface, not a removal of manual expressiveness for users who want it.

### Worked examples

- `@SANDERS` — "24yo rookie LA cop, athletic": `age≈0.15, build≈-0.1, muscularity≈0.4,
  feminineMasculine≈-0.6, skinTone=<any>, hairColor=dark, hairStyle=bun,
  outfitColor={ navy, navy, black }`.
- `#AIRCRAFT CABIN` extras — "elderly passenger": `age≈0.9, build≈0.1, muscularity≈-0.3,
  feminineMasculine≈0, hairColor=grey, hairStyle=short`.

Both map cleanly onto the ten fields above with no rig knowledge required — this is the schema
`ROADMAP_AI.md`'s AI-1 phase should target.

---

## Risks, dependencies & scope clarifications

- **Blender authoring is the critical path.** HP-1 (sculpted base mesh + weight painting) and HP-2
  (sculpted morph targets) are artist labour, not programmer effort — the *code* side of both is
  small (`SkinnedMesh` + `morphTargetInfluences`). If that sculpting isn't available, the HP-1→HP-3
  chain stalls; HP-0.5 below exists specifically as a no-Blender path that de-risks the surface
  first.
- **Morph range is discrete, not continuous.** Four-to-six hand-authored morphs bound the shape
  space. `feminineMasculine` is the first candidate to under-deliver: it bundles bust +
  hip-to-shoulder ratio + jaw into one morph pair — split into separate morphs if the combined pair
  proves under-expressive.
- **"Costuming" here is recolouring, not clothing shapes.** `outfitColor` recolours the existing
  body regions; actual costume silhouettes (uniforms, coats, hats) are a separate accessory-preset
  concern, out of scope for this roadmap.
- **The minimal set drops facial shaping.** The 19 `FaceParams` collapse to `hairColor` +
  `hairStyle` by default, so the face loses its nose/eye/mouth shape axes — the highest-signal axis
  for "humanoid stereotype" variety. Consider keeping 2–3 face-shape presets on the default surface
  rather than only hair.

## Phase HP-0 — Stop-gap seam smoothing (Option A, no mesh rework)

Cheapest possible visual improvement, shippable independently of everything else below, while
the single-mesh rework (HP-1+) is designed/built.

- Increase joint-sphere/tube overlap (`insetFactor` already exists — tune its default and range).
- Add a subtle bevel/rounding pass on tube end caps.
- Optionally raise segment/joint polygon counts for the `organic` style only (cheap — this style
  isn't meant to look faceted the way c3po's octagonal tubes are).

Exit criteria: bent elbow/knee poses show a softer, less obviously-segmented silhouette; zero
new dependencies; `organic` style only, `c3po`/`sonny` untouched.

## Phase HP-0.5 — Semantic sliders + first-order skinning over the segmented mesh *(no Blender)*

A code-only intermediate that delivers the Mii-like tuner surface *and* closes the joint seam on
the existing generated geometry, before any sculpting exists. Two halves, both independent of
HP-1/HP-2:

1. **Semantic → `BoneParams` mapping.** Drive the current segmented tubes from the five semantic
   sliders (`height`, `build`, `muscularity`, `age`, `feminineMasculine`) via a small mapping onto
   `BoneParams` (bone scale ratios, joint radii, `tubeOffsetForward`, skin/outfit colours). This
   proves the slider surface, the data model, and the AI-facing schema today, and is superseded —
   not thrown away — when morph targets land.
2. **First-order skinning of the tubes ("zero → first order" FEM).** Treat the current rigid
   per-bone tubes as zero-order (piecewise-constant) skinning; upgrade to first-order by emitting
   the generated body as one `THREE.SkinnedMesh` with per-vertex bone weights computed
   procedurally from each vertex's parametric position along its tube — plain linear-blend
   skinning, the same technique the Mixamo skinned meshes already use. A vertex at parameter `t`
   along a tube between joints A→B gets weight `smoothstep(t)` to bone B and `1 − smoothstep(t)`
   to bone A, so the two tube ends at a shared joint deform together and the seam closes. No
   weight painting and no Blender: the geometry is generated, so the weights are known in code. The
   existing `xbot` skeleton and `AnimationMixer` drive the bones unchanged.

Exit criteria: the five semantic sliders drive the current segmented body; bent elbows/knees stay
connected (no seam/crease separation) with no sculpting; `c3po`/`sonny` remain rigid-segment.
Known limit: LBS is C0, not C1 — extreme bends still show slight candy-wrapper pinching (a
dual-quaternion skinning pass is the cheap later fix), and a genuinely *smooth* elbow silhouette
still needs the sculpted/lofted mesh from HP-1.

## Phase HP-0.6 — Non-Blender escalation ceiling (volume-preserving, then stop at the tubes)

The honest ceiling of pushing the *tube-specific* HP-0.5 approach further:

- **Volume-preserving skinning (cheap, worthwhile if needed).** If HP-0.5's linear blend shows
  candy-wrapper pinching at extreme bends, swap in dual-quaternion skinning (or spherical blend
  skinning) — blend dual quaternions instead of matrices. Code-only, `three.js`-native
  (`USE_DUAL_QUATERNIONS` in the skinning shader), and it removes most pinching without touching
  the geometry. Applies to any skinned mesh, including HP-5's output.
- **C1 tube-lofting (superseded — skip).** Smoothing the tube-into-sphere crease by lofting the
  joint region is a tube-specific fix that becomes wasted effort once the single-surface goal moves
  to SDF (HP-5). Don't invest here; the smooth silhouette is HP-5's job, not a lofting job.

Exit criteria: none — a decision guide. Ship HP-0.5, add DQS only if pinching is visible, and go
straight to HP-5 for the single surface rather than polishing the tubes.

## Phase HP-0.5+ — Appearance coupling + the "no M/F skeleton" note *(contingent, try if skinning lands)*

A cheap follow-on to HP-0.5, only worth doing once first-order skinning (Part 2) works — if that
fails, none of this is reached. Two small items:

1. **Couple appearance to the shape sliders.** The HP-0.5 schema is shape-only (`height`, `build`,
   `muscularity`, `age`, `feminineMasculine`). Add the appearance fields already in the target set
   (`skinTone`, `hairColor`, `hairStyle`, `outfitColor`) and two derived couplings: `age` → hair
   greying (desaturate/whiten `hairColor`) plus a subtle skin-tone shift; `feminineMasculine` →
   hair-length / brow-thickness / facial-hair bias (via `hairStyle` presets + `FaceParams`). The raw
   appearance fields stay individually overridable.
2. **No distinct Mixamo M/F skeleton.** The Mixamo male/female characters share the same
   `mixamorig` bones — the body-shape difference lives in their skinned *mesh*, not in a distinct
   skeleton. We generate our own body on `xbot-rig.glb`'s bones, so there is no "female skeleton"
   to swap in; dimorphism is geometry (girth via `semanticParams` now, skinning/morph later), not a
   rig change. Proportional differences (limb length, pelvis placement) would require a rig /
   bone-position change, not a Mixamo asset choice.

Exit criteria: none — a "try if cheap" follow-on, not a prerequisite. Applies only if HP-0.5's
skinning lands and the semantic surface still feels under-expressive.

## Phase HP-1 — Base mesh authoring + skinning pipeline

- Sculpt one base `organic` body mesh in Blender (roughly A-pose, matching current proportions
  as a starting point) bound to the existing Mixamo `xbot` skeleton (`xbotSkeleton.ts`) via
  standard bone weight painting.
- Extend the existing Blender-headless script pattern (`scripts/extractRig.py`,
  `scripts/extractAnimations.py`) with a new `scripts/exportSkinnedBase.py` that exports the
  mesh + skin weights + skeleton as one GLB, no animations baked in (clips stay separate, as
  today).
- Load this GLB in `ProceduralHumanoid` as a `THREE.SkinnedMesh` behind a feature flag, running
  alongside (not yet replacing) the existing segment-tube path for A/B comparison.
- Confirm all bundled Mixamo clips (`idle`, `walk`, `run`, …) drive the skinned mesh correctly
  via the unchanged `AnimationMixer` — bone names are unchanged, so this should work with zero
  compiler/domain-layer changes.

Exit criteria: a single skinned mesh plays the full existing clip library with correct
deformation at bent joints, loadable side-by-side with the current segmented look for visual
comparison; `c3po`/`sonny` styles untouched.

## Phase HP-2 — Morph target shape library

- Author 4–6 morph targets on the HP-1 base mesh in Blender: at minimum a slim/heavy pair, a
  short/tall pair (or bake height into uniform scale + a stockiness morph), a young/old pair, and
  a feminine/masculine pair — matching the five sliders in the target parameter set above (some
  sliders may share a morph pair with sign-flipped blending, e.g. `build` as one bidirectional
  morph rather than two).
- Export via the same headless pipeline, with morph targets included (glTF morph target export
  is a native Blender glTF exporter option — no new tooling).
- `ProceduralHumanoid` gains a `setShape({ height, build, muscularity, age, feminineMasculine })`
  method that sets `SkinnedMesh.morphTargetInfluences` directly — no custom blending math beyond
  simple linear weight assignment.

Exit criteria: dragging each of the five sliders visibly and smoothly changes body shape across
its full range with no mesh popping or self-intersection artefacts at extremes; combinations of
sliders (e.g. old + heavy) blend plausibly.

## Phase HP-3 — Replace segmented body for the `organic` style

- Swap `/character`'s `organic` style over to the HP-1/HP-2 skinned mesh + shape sliders as the
  default; remove the per-bone `BoneParams` UI for `organic` (kept for `c3po`/`sonny`, which stay
  on the segmented-tube path per the Decisions table).
- Migrate `CharacterDesignStore`'s saved-design schema: old segment-based `organic` designs get a
  best-effort one-time conversion (e.g. derive an approximate `build`/`height` from the saved
  bone scale ratios) or are flagged for manual re-creation — decide based on how many existing
  saved designs exist at implementation time.
- Update `exportCharacterGLB.ts` to export the skinned mesh + baked morph weights (glTF supports
  baking a fixed morph blend into the exported mesh, or exporting the morph targets live — decide
  based on whether the catalogue/production renderer needs post-export shape editing; simplest
  v1 is bake-on-export, matching how the segmented approach already bakes bone scale into static
  geometry at build time).

Exit criteria: `/character`'s default `organic` humanoid is the single skinned mesh with the
five-slider shape UI; exported GLBs render correctly in the production catalogue/`Presenter`
with no `SceneBridge`/`storedSceneToModel` changes required (bone-driven animation is unchanged,
so this should be transparent to the rest of the app).

## Phase HP-3.5 — First-class face animation (blink loop + jaw-hinge talking)

The face is already a separate overlay (see Decisions table), but its *animation* is currently
procedural — `ProceduralHumanoid.update()` tweens eyelid rotations for blink, and `setMouth()`
**disposes and rebuilds** lip/hole geometry for mouth shapes. Neither survives export: a GLB
bakes the mesh and bone clips but not the per-frame driver, so the production `Presenter` shows
a frozen face. Blink is already addressed — the production scene view synthesises the same 4s
cycle as a real looping `AnimationClip` (`src/lib/scene/blink.ts`) and plays it through the
actor's mixer, so it blends/seeks like any other clip.

The mouth cannot be first-class as-is, because `AnimationClip` tracks animate node transforms,
not geometry. Proposal: re-model the mouth as a **jaw hinge** so talking becomes transform-based
and therefore animatable/schedulable like `idle`/`walk`:

- Parent the lower lip, mouth-hole fill, and lower lip caps to the jaw pivot (today the hole is
  parented to the head — a mismatch), and hinge `jawPivot.rotation.x` around the ear-line axis.
- Replace `setMouth()`'s geometry rebuild with jaw-pivot rotation (+ an upper-lip raise pivot if
  lip-raise is wanted); keep `smile`/`frown` as corner-lift pivots if desired, or defer them.
- Name the jaw hinge and bake a neutral rest in `exportCharacterGLB` so the scene view can find
  and drive it.
- In the production scene view, synthesise a looping "talk" clip (jaw open/close wobble, same
  runtime synthesis as blink) and schedule it per `speechEntry` window (start = line start,
  end = start + `estimateDuration(text)`), so mouth movement syncs to TTS through the normal
  mixer/Tone schedule.

Trade-off vs today: a jaw hinge gives a simpler open/close (no lip bowing) but becomes a
first-class, blendable, seekable animation — and makes `/character`'s speak preview match the
scene view by driving the same transform path.

Exit criteria: a talking line in the production view opens/closes the jaw in sync with its
speech window; blink already loops as a first-class clip; `/character`'s speak toggle uses the
same jaw-hinge path so preview and playback agree.

## Phase HP-4 — Advanced panel + appearance field simplification

- Collapse `BodyColors`'s 5 regions to the target set's `skinTone` + `outfitColor` (top/bottom/
  shoes triple) in the default UI; keep the full 5-region picker behind an "Advanced" disclosure
  for users who want per-region control.
- Collapse `FaceParams`'s ~19 fields to `hairColor` + `hairStyle` (enum preset, ties into
  `SKETCHER_ROADMAP.md` CB3) in the default UI; keep the full slider set behind the same
  Advanced disclosure.
- Confirm `CharacterDesignStore` persists both the simplified fields and the advanced
  fine-tuning fields together, so a user who tweaks Advanced doesn't lose those tweaks on reload.

Exit criteria: a first-time user sees ~10 fields and gets a good-enough result; a power user can
still reach every knob the current system exposes, one disclosure click away.

## Phase HP-5 — SDF soft-union: the non-Blender "single surface" *(now the intended target)*

Reframed: this is no longer a fallback gated on HP-2. For the cartoon rapid-visualiser goal, a
single continuous body of smoothly-stitched primitives is the natural end-state of the non-Blender
route — and it's a *programming* task, not a sculpting task.

Re-express the current tube-bone/sphere-joint system as one smooth field: each bone becomes a
**capsule** (a line segment + radius — the smooth version of a tube+two-spheres), the head an
**ellipsoid**, and the body is the **smooth-min union** of all of them, meshed at runtime via
marching cubes. The head/pelvis/shoulder cases that defeat tube-stitching fall out naturally:

- **Head** = ellipsoid smooth-min'd into the neck capsule.
- **Pelvis** = smooth-min of the two leg capsules + the spine capsule (a natural 3-way junction).
- **Shoulder** = smooth-min of the torso capsule + the arm capsule, deforming as a socket as the
  arm rotates.

This is also the enabler for **programmatic body sculpting**: every localised feature becomes "add
a primitive and let the field blend it" — a subtle **bust** is two chest ellipsoids smooth-min'd
into the chest capsule (the demo feature); hips/belly/muscle-bulges are the same trick with
different primitives. The `BoneParams`/semantic sliders (HP-0.5 Part 1) feed the capsule radii, and
the `SkinnedMesh`+skeleton plumbing (Part 2) skins the marching-cubes output — both carry over;
only the tube *geometry* is thrown away.

Honest costs: (1) a substantial engineering chunk — SDF evaluation + marching cubes + deriving
per-vertex bone weights from the per-bone field (elegant but fiddly); (2) the result is smooth and
"doll-like" — ideal for cartoon, wrong for anatomical realism. Do a small spike first (one limb +
one joint, meshed + skinned) before committing.

## Phase HP-6 — Junction volumes with ports (hybrid: elliptical lofts + local SDF)

Refines HP-5 into two concerns, each solved the simplest way:

- **1-D chains (limbs, neck, spine, fingers) = elliptical lofts.** Each bone becomes a stack of
  **rings** — ellipses in the bone's X/Z plane whose radii interpolate between the joint and tube
  cross-sections already in `BoneParams` (`tubeRadiusX/Z`, `jointRadius`, `jointRadiusY/Z`,
  `tubeOffsetForward`, frustum ratios). Consecutive rings stitch into triangle strips — a
  generalized cylinder that tapers and bends — giving analytic normals and the exact current
  silhouette, without HP-5's constant-radius blobbiness.
- **Junctions (pelvis, shoulders, hands) = local SDF, or an authored junction mesh.** The general
  answer to "knit a tube into another tube" is a **junction volume with ports**: a small solid
  whose surface the incoming tubes terminate on, each tube's end ring being a port. The pelvis is
  a **hip girdle** (wide, shallow ellipsoid), each shoulder a rounded cap, each hand a flattened
  palm ellipsoid. The smooth-min is applied only to the junction volume and its tubes, isolating
  the hard branching to a few small tunable pieces.
- **Head** stays the existing ellipsoid; the neck loft terminates on its surface.

Why not pure SDF? SDF blends N-way junctions for free, but constant-radius capsules were blobby;
re-deriving tapered elliptical capsules is more work than lofting cross-sections we already have.
Why not pure loft? A loft cannot express a branch without a merge volume. The hybrid uses each
where it is strongest.

**Pelvis / "trousers" note:** replace the current wide tube + two leg balls with a hip girdle —
extend the girdle's rings down from the waist to a shallow bottom face, and terminate the two leg
lofts on that underside, so the legs enter the bottom of a trouser-like pelvis instead of bulging
out of two spheres. The crotch is the smooth-min (or a small gusset patch) of the two leg tops +
the girdle bottom.

**Ring debug visualisation:** the final implementation exposes a debug overlay that renders the
ring/ellipse skeleton (and the junction volumes) directly, so the cross-section layout can be
inspected without committing to the skinned mesh.

Exit criteria: the organic body is one skinned mesh built from lofts + junction volumes, the
pelvis reads as trousers rather than two balls, and the ring overlay can be toggled for debugging.

*Superseded by HP-7 — HP-6's per-bone loft + SDF projection is the prototype; keep the SDF
projection as the fallback for oblique ports.*

---

## Phase HP-7 — Ring-graph skin (envelopes + ports, explicit loft)

A wholly separate path from the segmented **tube** body (HP-0.5). The tube body keeps its own
manually-tuned offsets (`tubeOffsetForward`, `jointOffset*`, frustum ratios) and stays selectable
as the `tubes` body mode; HP-7 does not consume or modify those — it borrows only the tube
cross-section numbers as starting values. Implemented behind the existing `loft` body mode,
replacing HP-6's per-bone prototype.

**Ring graph.** The skin is one set of rings over the skeleton, **one ring per joint (shared)**.
A ring = { centre, frame, `rx`, `rz` }. Along a 1-D chain a bone ramps its ellipse from its own
tube radius (at its start) to the child's tube radius (at its end) and adds **no ring at the end**
— the child's start ring sits there. Adjacent bones share the same ring vertices, so lofting them
is watertight by construction (no coplanar ring pairs, no separate welding pass).

**Envelopes.** Branching bones become an **envelope** — a short ring set with **ports** (closed
loops of vertices on its surface) where child tubes attach:

- **Hips** = pelvis girdle (waist → leg holes); spine exits the top, the two legs exit the bottom.
- **Spine2 + left/right shoulder** = chest girdle; neck exits the top, the two arms exit the sides.
- **Hand** = palm frustum; four fingers exit the knuckle edge, the thumb exits the radial side.

**Ports come in two kinds:**

- **Fan** — several ports on one ring (legs at the pelvis base, fingers at the knuckle edge):
  partition the ring's perimeter into arcs, one per child, and loft each arc to its child ring.
- **Side port** — the child's base ring welded onto the envelope's surface (arm into the chest
  girdle side, thumb into the palm side).

**Side-port junction algorithm** — the arm → chest side is the canonical case. The child tube
leaves the parent surface roughly perpendicular to its axis (a T-junction), so the hole is cut
**in ring space** as a bracket of parent rings, not in triangle space as a post-hoc deletion.
Choose a set of **bracket rings** on the parent envelope spanning the child's attachment height
(`N` rings; 3 for the shoulder, 2 for the thumb), then for each bracket ring split it into three
arcs — a **cut arc** that opens into the port, plus a **front residual arc** and **back residual
arc** that keep the parent surface continuous on either side. Two seam vertices on each bracket
ring separate the arcs. The port boundary loop chains those arcs across all `N` bracket heights:

1. bottom cut arc (bottom front seam → bottom back seam);
2. front seam chain (bottom front seam → … → top front seam, one chord per ring interval);
3. top cut arc, reversed (top back seam → top front seam);
4. back seam chain (top back seam → … → bottom back seam).

That loop is inherently non-planar (it spans `N` different ring heights), which is what lets the
hole wrap the arm's bulge instead of reading as a flat disk; with `N` bracket rings it has `2N − 2`
sides (a quad at 2 rings, a hexagon at 3). Then weld the boundary loop to the child's base ring
with the existing closed-loop loft, and skin the weld with directional weights.

**Shoulder:** a stack of wide rings at the `Spine2` level, with the neck exiting the top. Three
additive bracket rings at shoulder-socket height carry a hand-authored narrow→wide→narrow cut-arc
profile (armpit crease → widest deltoid cross-section → shoulder cap); their boundary loop forms a
hexagon around the arm. Weld the arm's base ring to it with front-deltoid-follows-arm /
back-follows-chest weighting. See the HP-8 "Side-port junction — implementation sequence".

**Thumb:** same mechanism at the palm's radial side, with a two-ring bracket (quad boundary loop)
at the thumb base. Its base ring is oblique to the palm side, so the weld is a twisted bridge; the
two-ring bracket keeps it in the existing loft machinery rather than HP-6's SDF projection.

Exit criteria: the `loft` body mode shows one watertight ring-graph mesh (hips, chest, arms,
hands, fingers, feet), with the Rings overlay rendering the graph before lofting.

---

## Explicitly out of scope

- Adopting SMPL/SMPL-X or another licensed statistical body model (see Options table).
- Reworking the `c3po`/`sonny` robot styles — their segmented look is intentional.
- Merging face rigging (blink/gaze/mouth) into the body mesh's morph target system — face stays
  a separate bone-pivot-driven overlay.
- Full physically-based cloth simulation or user-uploaded clothing meshes (unchanged from
  `SKETCHER_ROADMAP.md`'s existing "out of scope" note on this).

---

## Cross-references

- [ROADMAP_AI.md](ROADMAP_AI.md) — AI-1 (character parameter generation) should target this
  roadmap's ten-field minimal schema once HP-2/HP-3 exist, rather than the current 60+-field
  `BoneParamMap`/`FaceParams` surface.
- `SKETCHER_ROADMAP.md` — CB1 (bone proportion editor) and CB2 (colour customisation) describe
  the pre-rework system this roadmap supersedes for the `organic` style; CB3 (hair/accessory
  swap) is reused directly as `hairStyle`'s implementation.
- `scripts/extractRig.py`, `scripts/extractAnimations.py` — existing Blender-headless export
  pattern this roadmap's `exportSkinnedBase.py` (HP-1) extends.

---

## Implementation task list — non-Blender route *(checkboxes track progress)*

Concrete, ordered, testable steps. Parts 1–2 give the durable foundation (semantic schema +
skinning plumbing); Part 3 is optional; Part 4 was the HP-5 SDF spike; Part 5 was the HP-6 hybrid
prototype. **Part 6 is the current target** — HP-7 ring-graph skin: a single shared ring set over
the skeleton, envelopes with ports, and explicit loft. Scoped to the live `/character` editor and
`ProceduralHumanoid`; the compiler/domain/storage layers are untouched. The only cross-boundary
items are the export round-trip checks.

### Part 1 — Semantic sliders over the segmented mesh

- [x] 1. Semantic schema + `semanticToBoneParams` + `semanticHeightScale` in
  `src/core/character/semanticParams.ts` (pure, tested).
- [x] 2. 5 sliders as the default `/character` body UI; per-bone sliders behind "Advanced".

### Part 2 — First-order skinning of the tubes

- [x] 3. Weight math (`tubeSkinWeights`, `assignTubeWeights`) in `src/core/character/skinning.ts`
  (pure, tested).
- [x] 4. Organic body tubes as per-region `SkinnedMesh` with procedural weights
  (`_attachSkinnedBodyTubes`).
- [x] 5. Round-trip: `exportCharacterGLB` → `GLTFLoader` reproduces the skinned body (or scope
  skinning to the live editor and file the export follow-up separately).

### Part 3 — HP-0.6 volume-preserving skinning *(optional)*

- [ ] 6. DQS (`USE_DUAL_QUATERNIONS`) if the elbow/knee crook pinches — applies to any skinned
  mesh, including HP-5's output.

### Part 4 — HP-5 SDF soft-union *(done, superseded by Part 5)*

- [x] 7. **Spike:** one limb (upper arm + forearm) as two capsules, smooth-min at the elbow,
  meshed and skinned with per-bone field weights — bends with no seam/tear. Core proven in Node
  tests (`sdf.ts`, `marchingTetra.ts`, `fieldSkinning.ts` + `sdfLimb.test.ts`): marching tetra for
  now (marching cubes is the production refinement); synthetic 2-bone chain (real `xbot` bind lands
  in step 10).
- [x] 8. Generalise to the whole body: per-bone capsules + head ellipsoid + smooth-min junctions
  (pelvis/shoulder); tune blend radius against webbing/melting. Done in `_attachSdfBody`
  (`ProceduralHumanoid.ts`) — blend radius 4 cm.
- [ ] 9. **Bust demo** — two chest ellipsoids smooth-min'd into the chest capsule (scale param):
  the "add a primitive, let it blend" proof.
- [x] 10. Swap in for `_attachSkinnedBodyTubes` (organic only, behind a `bodyMode` toggle); keep
  the face separate, keep `c3po`/`sonny` rigid; reuse Part 1's sliders → capsule radii and Part 2's
  skeleton/skinning.
- [ ] 11. Round-trip export + Presenter check for the SDF body.

### Part 5 — HP-6 junction volumes (hybrid loft + local SDF) *(prototype, superseded by Part 6)*

- [x] 12. **Spike — one arm:** loft upper arm + forearm from elliptical `BoneParams` rings (taper +
  `tubeOffsetForward`), bridge the elbow, and knit the shoulder into a small junction volume (local
  smooth-min). Done: `loft.ts` (`loftRings`, `boneRings`, `projectPointToSurface`) + `loft.test.ts`;
  generalised into `_attachLoftBody` in `ProceduralHumanoid.ts`.
- [x] 13. Generalise the loft to the remaining 1-D chains: legs (heel), feet, neck, spine, fingers.
  Done for hips/spine/neck/shoulders/arms/forearms/legs/feet; **fingers/toes deferred** and the foot
  is a simplified loft (its `jointRadiusY`/`jointOffsetY` heel shape not yet modelled).
- [x] 14. Add the junction volumes. Done via local SDF smooth-min (reuse `sdf.ts`): each tube's end
  rings are projected onto the union field so pelvis/shoulders/elbow/knee blend. The explicit
  hip-girdle "trousers" shape is a later refinement, not yet done.
- [x] 15. **Ring debug overlay** — toggle to render the ring/ellipse skeleton + junction volumes so
  the cross-section layout can be inspected before skinning. Rings done (`Rings` button +
  `setRingDebugVisible`); junction-volume visualisation not yet drawn.
- [x] 16. Swap in for the organic body (behind a `bodyMode` toggle — `tubes`/`sdf`/`loft` buttons),
  keeping the face separate and `c3po`/`sonny` rigid; reuses Part 1's sliders → cross-sections and
  Part 2's skinning plumbing.
- [ ] 17. Round-trip export + Presenter check.

### Part 6 — HP-7 ring-graph skin *(the target)*

- [x] 18. **Ring graph as pure data:** one ring per joint (shared), each = { centre, frame, rx, rz };
  envelopes for hips / chest+shoulders / palm with ports. Extend the Rings overlay to render the
  graph (not per-bone tubes). Done — `ringGraph.ts` (`buildRingGraph`) + the Rings overlay show
  shared ramping rings; chest/shoulders are a widened Spine2 ring and the hips are a custom girdle
  (two wide rings below the pelvis). Palm envelope still pending.
- [x] 19. Loft the linear chains with shared rings (hip→…→foot, shoulder→…→hand, fingers, toes);
  verify watertight. Done — `buildRingLoft` stitches each bone's rings plus the child's start ring.
- [ ] 20. **Side port — arm into chest:** ring-space bracket cut + closed-loop loft at the
  shoulder (see HP-8 "Side-port junction — implementation sequence"); verify a single mesh with
  no twist. Shoulder is still overlap-only (no cut/bridge).
- [ ] 21. **Fan** the legs into the pelvis base and fingers into the knuckle edge (partition ring
  perimeter into arcs). Legs still overlap the girdle base (fan deferred).
- [ ] 22. **Side port — thumb** into the palm radial side (2-ring bracket + oblique bridge).
- [x] 23. Skin the ring graph (weights from ring ownership) and swap into the `loft` body mode,
  replacing HP-6's per-bone prototype. Done — `_attachLoftBody` binds one SkinnedMesh from
  `buildRingLoft` with `tubeSkinWeights`.
- [ ] 24. Round-trip export + Presenter check.

#### HP-7 leg fan — mini-plan *(incremental; visualise + stop each step)*

The pelvis→legs junction is a 1→2 branch, done as small geometric steps. Check the Rings overlay after each.

- [x] **1. `loftStrip` primitive** — general N→M open-polyline strip lofter (`ringGraph.ts`).
- [x] **2. Split the girdle bottom ring into two hemi-disks** — `splitRingArcs` partitions the
  ring into left/right arcs sharing two seam verts; the Rings overlay draws them in red/green.
- [x] **3. D-shape hemi-disk** — a straight seam chord (`seamEdgePoints`) closes each hemi into
  a loop of `segments` verts, matching the leg ring for a 1:1 stitch.
- [x] **4. Girdle = pelvis + buttocks** — the hips bone carries a single cross-section from the
  waist, widening to the hips at the hip joint, then narrowing to the crotch (the split ring).
- [x] **5. Upper-leg skin starts at the crotch** — the upleg's rings begin ~¼ down the femur
  with dense top spacing (no artificial interpolated rings).
- [x] **6. Skinning: 3-bone chain hips→upleg→leg** — top leg rings blend hips↔upleg at the
  crotch (`BodyRing.parentWeight`), bottom rings blend upleg↔leg at the knee.
- [x] **7. Stitch** the girdle crotch ring into the two leg tops (`buildLegFans`: D-shape
  hemi-disk → leg ring, 1:1, shared crotch chord with hips + both uplegs), then full
  `vitest` + `tsc`.

### Do-not-do *(keeps the POC bounded)*

- Sculpted/morph anatomy (HP-1/HP-2) — only if realism over cartoon is ever needed. Note:
  cosmetic body-shape features (e.g. bust) no longer require this — see HP-9's branch-envelope
  technique below, which reuses the ring-graph/fan machinery instead of morph targets.
- C1 procedural lofting of joint regions — superseded by HP-7's ring-graph skin (one shared ring
  per joint, envelopes with ports, explicit loft).
- Tube-offset manual tuning (`tubeOffsetForward`, `jointOffset*`, frustum ratios) stays
  tube-body-only — the HP-7 ring path borrows the cross-section numbers as starting values but
  must not mutate the tube parameters.
- Face geometry — stays the existing bone-pivot overlay; these sliders are body-only.
- Compiler/domain/storage changes — none needed; confined to `ProceduralHumanoid`, the character
  route, and the new pure mapping module.

---

## Part 7 — HP-8+: the long-term vision, and where we actually stand

Not scheduled work; a checkpoint written after HP-7's leg fan shipped, to answer "how far is the
ring-graph approach from a fully procedural, configurable, AI-drivable humanoid?" The dream
pipeline, stage by stage, mapped onto concrete phases below:

| # | Stage (as envisioned) | Status | Phase |
|---|---|---|---|
| 1 | Bones | **Done** — Mixamo `xbot` skeleton, unchanged since project start | — |
| 2 | Rings along linear bones, custom ring sets around branching bones | **Done for hips**; shoulders/wrists/ankles still generic overlap | HP-7 (done) / HP-8 |
| 3 | Stitching of tubes to custom ring sets at branches | **Done for hips** (`buildLegFans`); shoulder/wrist/ankle unstitched | HP-8 |
| 4 | Triangulation from rings | **Done** — `buildRingLoft` for every linear chain + the hip fan | HP-7 (done) |
| 5 | Ellipsoidal capping on open ends (fingers, toes) | **Done** — `capTerminalEnds` fans each terminal ring to an apex vertex | HP-8 |
| 6 | Wholly special treatment of the head | **Done** — head stays a separate ellipsoid + face-overlay system, deliberately not merged into the ring graph (see Decisions table) | — |
| 7 | Bone weights to triangulation vertices | **Done** — `tubeSkinWeights` (linear chains) + `parentWeight` (crotch) + 3-bone fan weights (`buildLegFans`) | HP-7 (done) |
| 8 | Animatable skin | **Done** — one `SkinnedMesh` bound to the real skeleton, driven by the existing `AnimationMixer`/clips, no export changes needed | — |
| 9 | Feminising enhancements | **Not done** — see HP-9's branch-envelope proposal (no morph targets, no Blender) | HP-9 |
| 10 | Region mapping → texture / clothing approximation | **Partially done** — vertex-colour regions (`regionColors`/`BodyColors`) exist; no UV/texture layer | HP-9 |
| 11 | Accessories (hair, beard, glasses, …) | **Partially done** — `SKETCHER_ROADMAP.md` CB3 (hair swap) designed but not ported to the ring-graph body | HP-9 |
| 12 | API for AI driving | **Designed, not wired to the ring graph** — `ROADMAP_AI.md` AI-1 targets the legacy `BoneParams` schema; needs re-pointing at the semantic-slider surface once HP-10 lands | HP-10 |
| 13 | Configurable humanoid | **Partially done** — `semanticParams.ts`'s 5 sliders drive `BoneParams` (HP-0.5); not yet wired to the ring graph's own radii | HP-10 |

Nice-to-haves called out separately: animatable face (blink done, jaw-hinge talking designed —
HP-3.5), hair length/colour and glasses as accessory presets (HP-9), sitting/gesture poses as
additional bundled clips (HP-11).

**Assessment: this is more reachable than it looks.** The hard part of the whole pipeline —
turning a bone graph into one watertight, correctly-weighted skin at an actual branch — is what
HP-7's leg fan just proved out. Stages 9–13 above are largely the *same four techniques* applied
to new sites, not new architecture:

- **Ring set** (`buildBoneRings` per-bone envelope, as the hips girdle already is).
- **Split** (`splitRingArcs`) when one ring must feed two or more children.
- **Directional/3-bone weights** (front-vs-back blend, shared-vertex multi-bone weights) at the
  weld.
- **Fan/loft** (`loftStrip`/`buildLegFans`-style 1:1 stitch) to close the gap watertightly.

### HP-7.5 — Ring parameter surface (data-driven ring system)

The ring system already produces the mesh causally (`buildRingGraph` → `buildRingLoft` → one
`SkinnedMesh`), but it has no *parameter surface*: its inputs are the legacy tube `BoneParams`
(shimmed through `tubeParams` in `_attachLoftBody`) and its customisations are hardcoded,
bone-name-keyed special cases. So there is nothing clean for the sliders (`semanticParams.ts`),
the API (`ROADMAP_AI.md` AI-1), or a hand-tuning file to drive. This phase turns the ring system
from a generator into a declarative model — the through-line `bones → rings → ring customisations
→ triangulated skin → regions → sliders → API`.

The numeric settings are currently scattered across four places:

- `DEFAULT_BONE_PARAMS` (radii/offsets, still the tube schema);
- `buildBoneRings`' per-bone cases (hips girdle `below` stops, upleg `parentWeight` tapers, palm
  stops/margin, thumb start offset, Spine2 girdle `sigma`/`count`/`deepRz`);
- the port functions (`buildLegFans` chord/weights, `buildThumbPorts`/`buildShoulderPorts`
  half-widths, hand-fan web chords);
- `tubeSkinWeights` + the inline directional-weight arithmetic in the welds.

- [x] **Collate into one file** (`src/core/character/ringSurface.ts`): every number above as a
  named constant/type — a `RingEnvelopeSpec` per group (`{ group, shape, name? }`) and a
  `PortSpec` (`{ kind: 'fan' | 'sidePort', parent, child, widths/weights }`). Reference them
  from the existing code *without changing behaviour* — this step is pure extraction, safe
  against the current tests.
- [x] **Migrate** `buildBoneRings` + the four port functions + the weight logic to consume the
  spec, deleting the per-bone-name special cases. Each junction (hips, hand/fingers, thumb,
  shoulder, and later ankle/toe) becomes a data entry, not a new function. *(Ports are
  `PORT_SPECS` data entries via `buildPorts`; envelopes are `RING_ENVELOPE_SPECS` data entries
  dispatched by shape in `buildBoneRings`; weld weights come from the specs.)*
- [x] **Re-point** `semanticParams.ts` at `ringSurface.ts` instead of `BoneParams` (hands off to
  HP-10 once the spec exists). *(`semanticToRingParams` → `RingParamMap` drives the loft natively
  via `DEFAULT_RING_PARAMS`; `semanticToBoneParams` remains only for the not-yet-retired
  tubes/SDF/face and the persisted design schema.)*
- [x] **Retire tubes/SDF**: collapse `BodyMode` to `loft`; delete `_attachTubeBody`,
  `_attachSdfBody`, `BONE_GROUPS`, and the tube half of `DEFAULT_BONE_PARAMS` (git keeps history).
  *(`BodyMode` removed — organic now always lofts; `_attachSdfBody` + `_attachSkinnedBodyTubes` +
  the SDF field builder deleted; the robot styles (`c3po`/`sonny`) keep `_attachBodyGeom` and the
  full `DEFAULT_BONE_PARAMS`/`semanticToBoneParams` for the head ellipsoid + face.)*

Do this *before* finishing the remaining HP-8 junctions (ankle/toe), so each new site lands as a
spec entry rather than another special-case function. It is also the prerequisite HP-10 assumes
("re-point sliders at the ring graph's own radii/lengths") and it lets HP-9's bust be declared as
a `PortSpec` (branch envelope) instead of new code.

### HP-8 — Generalise the ring-graph skin to every remaining junction

- [~] **Shoulder side-port.** Redo as a ring-space side port: `Spine2` becomes a shoulder girdle
  (deep cross-section at the shoulder joint, the clavicle bones are absorbed — no separate tube)
  and each arm's start ring welds to a roughly-circular hexagon cut into the girdle side.
  Sequence below. First pass landed (`buildShoulderPorts` + `weldSidePort` + `bracketRingsAround`,
  watertightness test); remaining polish is the hard weld weight seam (directional deltoid/chest
  blend) and tuning the girdle depth/arm widths once visualised.
- [~] **Thumb side-port.** Same side-port mechanism at the palm's radial side, but as a hexagon:
  the port spans the hand rings from the wrist up to `t=0.4` (the thumb is shallow to the hand, so
  its junction is an elongated slit, not a short collar), with a middle bracket ring at `t=0.2`.
  The thumb's base ring welds to the hexagonal boundary loop. Sequence below. First pass landed
  (`buildThumbPorts` + `thumbPortCuts` + `thumbBracketRings`, watertightness test, Rings-overlay
  cut/seam-chain visualisation); per-ring cut widths taper `1.2× → 2× → 1.2×` thumb radius so the
  junction bulges in the middle, the thumb tube starts just outside the palm (distal start-ring
  offset), and each cut is centred on the thumb root (local X/Z distance window) so the seam chains
  stay in line with the thumb. Remaining polish: the hard weld weight seam and any final tweak to
  the widths/offset once visualised.
- [~] **Wrist → palm envelope + finger ports.** Palm envelope done (`buildBoneRings` hand case:
  a flattened wrist→knuckle tube, replacing the hand ellipsoid). Finger fan into the knuckle ring
  is the next item.
- [~] **Ankle → foot + toe ports.** Deprecated — xbot has no toe bones (the foot chain
  terminates at `mixamorig{Left,Right}Toe_End`, already closed by `capTerminalEnds`), and feet
  won't be modelled digit-by-digit. Approximate with a foot tube + a textured toe cap instead.
- [x] **Terminal end caps.** Fingertip and toe-tip rings are now closed — `capTerminalEnds`
  fans each terminal ring to a single apex vertex weighted 100% to the terminal bone, leaving no
  open boundaries at the extremities.
- [ ] Regenerate the round-trip export test with a fully closed mesh and confirm no boundary
  edges (`geometry` has no edges with only one adjacent triangle).

#### HP-8 side-port junction — implementation sequence

The side port generalises the hip-fan / knuckle-fan machinery (`splitRingArcs` →
`seamEdgePoints` → `buildLegFans` / `assembleKnucklePlates`) from "split a whole ring into N
children and stop" to "cut one arc out of a ring that also keeps going". It stays entirely in ring
space — no triangle-intersection pass, no mesh deletion — so the existing winding/watertightness
tests and the `Rings` overlay keep applying.

1. **Ring-arc split helper.** Generalise `splitRingArcs` to cut a ring into *three* arcs — cut,
   front residual, back residual — with two seam vertices each shared by two arcs. Add an
   assertion that each residual arc stays non-degenerate (non-zero angle) at every bracket ring,
   so a too-wide cut can't pinch the parent surface shut.
2. **Bracket rings.** Give the parent envelope additive stops *dedicated to the port*, independent
   of its general shading cadence (the same way the hips girdle carries its own `below` stops).
   - **Shoulder (`Spine2` chest girdle): 3 bracket rings** at shoulder-socket height, with a
     hand-authored narrow→wide→narrow cut-arc width/offset profile (armpit crease → widest
     deltoid → shoulder cap), expressed as explicit per-ring numbers like the palm envelope's
     fixed stops rather than derived.
   - **Thumb (palm envelope): 2 bracket rings** at the thumb base, cut on the palm's radial side.
3. **Port boundary loop.** Chain each bracket ring's cut arc through the front/back seam chains as
   in the HP-7 algorithm — a quad loop for the thumb, a hexagon for the shoulder.
4. **Weld to the child ring.** Reuse the existing closed-loop loft for the arm/thumb base ring →
   port loop stitch, but factor one canonical "weld an N-vertex boundary loop to an M-vertex ring"
   re-order helper from `orderLegRingForHemi` / `bestFingerRotation` instead of adding a third
   bespoke variant.
5. **Skin weights.** Directional blend at the weld, following the existing `parentWeight`
   convention: front deltoid (and the port seam on the arm-facing side) follows the arm, the back
   (and the residual parent arcs) follows the chest; for the thumb, the radial side follows the
   thumb while the rest of the palm stays with the hand.
6. **Test.** Add a `ringGraph.test.ts` watertightness/winding case per site — every edge in the
   port region has exactly two adjacent triangles, and the port loop's Newell winding agrees with
   the child ring — mirroring the hand-fan checks.
7. **Order of work.** Thumb first (simpler 2-ring quad, smaller site, validates the new primitive
   in isolation), then the 3-ring shoulder hexagon, then mirror the shoulder port to the right
   side. Finish with full `vitest` + `tsc`.

The bracket-ring count is a tunable, not a fixed constant: `N` bracket rings yield a `2N − 2`-sided
port loop, so the same sequence covers both the thumb (2) and shoulder (3) without new machinery.

### HP-9 — Cosmetic & identity layer (no Blender, no morph targets)

- [ ] **Feminising/masculinising enhancements as a branch envelope**, not a morph target: e.g. a
  bust is two small "breast" pseudo-bones (like the existing finger tips) parented to Spine2,
  each with its own tiny ring set fanned into the chest ring exactly like the crotch fan — scale
  the fan's radius/protrusion from the existing `feminineMasculine` semantic slider. Same
  technique for hip width, jaw/shoulder breadth, etc. This keeps every enhancement inside the
  ring-graph/skinning system already built, instead of introducing a second (morph-target) shape
  pipeline.
- [ ] **Region → texture.** Promote `regionColors`'s per-vertex flat colour to a small UV atlas
  (skin / top / bottom / shoes regions get their own UV island) so "clothing" becomes a swappable
  texture instead of only a flat tint — still no cloth simulation, just a richer material layer
  over the same mesh.
- [ ] **Accessories.** Port `SKETCHER_ROADMAP.md` CB3 (hair/hat as a child `Object3D` on
  `mixamorigHead`) onto the ring-graph body; add beard/glasses as the same pattern (small preset
  meshes parented to head/jaw bones, no new skinning).

### HP-10 — Configurable humanoid + AI-driving API

- [ ] Re-point the semantic sliders (`semanticParams.ts`) at the HP-7.5 ring surface
  (`ringSurface.ts`) instead of the legacy `BoneParams` intermediate — the ring surface is now
  the real skin, so the sliders should shape it natively rather than through a compatibility shim.
- [ ] Publish the resulting schema (five shape sliders + appearance fields, per the Decisions
  table above) as the target for `ROADMAP_AI.md`'s AI-1 phase — that phase already exists and is
  designed around this exact minimal schema; it currently targets `BoneParams` and should be
  re-pointed here once this lands.
- [ ] Add a small validation/clamping layer so AI-authored parameter sets can't produce
  degenerate rings (negative radius, zero-length bone, etc.) before they reach `ProceduralHumanoid`.

### HP-11 — Pose & animation nice-to-haves

- [ ] Jaw-hinge talking + blink as first-class exportable clips — already designed in HP-3.5
  above; do this once the face overlay is confirmed compatible with the ring-graph body (it
  should be, since the head stays a separate system by design).
- [ ] Hair length/colour and a small glasses preset set, as HP-9 accessory presets.
- [ ] A handful of bundled static poses (sitting, common gestures) as additional Mixamo-style
  clips, reusing the existing `AnimationMixer`/clip pipeline — no new runtime mechanism, just more
  bundled `.glb` clip assets.

**Sequencing note:** HP-7.5 (the ring parameter surface) should land before HP-10, since HP-10's
"sliders shape the ring surface directly" assumes a data-driven surface that doesn't exist while
the ring system is still imperative. HP-8 (finish every junction) should also land before
HP-9/HP-10, since HP-9's bust-branch technique and HP-10's sliders both assume the ring graph is
the complete, watertight skin — not a mix of ring-graph limbs and ellipsoid stopgaps.
