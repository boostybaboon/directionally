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

## Phase HP-0 — Stop-gap seam smoothing (Option A, no mesh rework)

Cheapest possible visual improvement, shippable independently of everything else below, while
the single-mesh rework (HP-1+) is designed/built.

- Increase joint-sphere/tube overlap (`insetFactor` already exists — tune its default and range).
- Add a subtle bevel/rounding pass on tube end caps.
- Optionally raise segment/joint polygon counts for the `organic` style only (cheap — this style
  isn't meant to look faceted the way c3po's octagonal tubes are).

Exit criteria: bent elbow/knee poses show a softer, less obviously-segmented silhouette; zero
new dependencies; `organic` style only, `c3po`/`sonny` untouched.

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

## Phase HP-5 — Research spike: implicit/SDF skinning *(only if HP-2 proves insufficient)*

Not committed work. If, after HP-2/HP-3 ship, the hand-authored morph library turns out not to
cover enough persona range (e.g. very extreme builds, or body types the sculpted morphs simply
weren't designed for), investigate a signed-distance-field or similar implicit body
representation, meshed at runtime. This is a substantial engineering investment with no existing
precedent in this codebase's geometry stack (the sketcher deliberately chose
`THREE.Shape`/`ExtrudeGeometry` for simplicity) — do not start this without first exhausting
whether more/better-authored morph targets solve the gap more cheaply.

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
