# Directionally — Catalogue Identity & Resolution Roadmap

Not scheduled work. A forward-looking sighter, parked here to steer the catalogue/resolution
design as the app moves from single-user development toward shared, multi-user deployments.
Complements the Track CAT milestones in [ROADMAP.md](ROADMAP.md) — those describe *what to build
now*; this describes *how the resolution model should evolve* so the current name-based behaviour
doesn't become a scaling liability.

---

## Problem statement

Track CAT resolves script names against the merged catalogue in two ways:

1. **Explicit binding** (CAT-3) — `StoredProduction.castBindings` / `settingBindings` map a role
   name / setting name to a specific `catalogueId`. Id-valued, durable, survives recompile.
2. **Label match** (CAT-1/CAT-2/CAT-4) — the typed name (`BOB`, `CLASSROOM`) is matched
   case-insensitively against catalogue entry *labels*, falling back to a placeholder on miss.
   CAT-4's auto-resolve depends on the same label match.

Label matching is the right **bootstrap** behaviour — type a name and it "just works" — but it is
not a scaling contract. This document records why, and what replaces it.

### Why name-matching won't survive multi-user

- **Collision / ambiguity.** Two assets can share a label ("Soldier" bundled, a user's "Soldier",
  a crowd-uploaded "Soldier"). `find()` returns the *first* hit, which is arbitrary and
  non-deterministic across installations. There is no way to say *which* "Soldier" is meant.
- **Renames break intent.** The sigil buffer is the source of truth, but it references a *mutable
  label*. A catalogue rename ("Robot" → "Robot Mk II") silently breaks resolution, or worse,
  silently re-resolves to a *different* asset that now owns the label.
- **Flat namespace collapse.** User-local, bundled, shared, and crowdsourced assets all live in
  one undifferentiated space. Crowdsourcing thousands of assets makes label matching unmanageable.
- **No provenance / version.** A label cannot express "this specific asset, from this author, at
  this revision."

---

## Principles

1. **Names are for humans; ids are for machines.** The production document carries *intent*
   (role names, setting names) plus optional *stable asset ids* — never a display label as the
   resolution contract.
2. **Resolution happens at compile against the live catalogue**, not at authoring time. The
   production stays portable; the target environment resolves ids through its own catalogue.
3. **Name-match is discovery; binding is commitment.** The convenient default should *lead to* a
   stable, persisted decision, not be the decision itself.

---

## Target architecture

### 1. Stable, namespaced asset ids

`CatalogueEntry.id` evolves from a bare `crypto.randomUUID()` into a namespaced URN. The seed
already exists: set pieces persist `opfs://<id>` references resolved to session blob URLs at load.
Generalise to a small scheme such as:

- `asset://character/<id>`
- `asset://setpiece/<id>`
- `asset://environment/<id>`

with reserved namespaces:

- **bundled** — shipped with the base product, versioned with the app, immutable.
- **user** — per-account local assets (today's OPFS, later synced to an account).
- **shared** — the base product's common catalogue (read-mostly).
- **crowd** — publish/import: a user uploads an asset, it receives a stable public id, others
  reference it by id.

Two different "Bob"s then have different ids and cannot collide.

### 2. Resolution as a service lookup by id

Compile resolves against the *visible* scope — bundled + the user's own assets + anything they have
subscribed/imported — with **fetch-on-miss for cloud ids** and a well-defined fallback: placeholder
+ a "resolve / bind" affordance (the CAT-4 bridge generalised). The production document remains
shareable; whoever opens it resolves the ids through their own visible catalogue.

### 3. Name-match = discovery, binding = commitment

Keep "type a name and it just works" as the bootstrap, but:

- an **ambiguous name** produces a diagnostic ("`Bob` matches N assets — pick one"), never a silent
  first-match;
- a successful name-resolve (including CAT-4's auto-resolve) **snapshots the id into a binding**, so
  the decision is stable from then on and survives later renames.

### 4. Binding upgrades

CAT-3's bindings are already id-valued; the weak points are the *key* (role/setting name) and that
ids are bare. Future work:

- **Rekey on rename** — detect a binding whose name no longer appears in the cast/settings, emit a
  "was bound to X — re-attach?" diagnostic, and never silently drop the binding.
- **Namespace the ids** so bindings are globally meaningful across users and installations.

### 5. Versioning / revisions

Id is stable; content gets a revision. A binding references the id (resolving to the latest
revision); revision pinning is a later refinement for reproducibility — do not build it until
needed.

---

## What's already in place to build on

- `crypto.randomUUID()` ids throughout — globally unique, just un-namespaced.
- `opfs://<id>` set-piece references — the first real namespaced reference pattern.
- CAT-3 `castBindings` / `settingBindings` — id-valued, the right shape; wrong key/namespace only.
- CAT-4 `BroadcastChannel('directionally-catalogue')` + recompile — the seed of "resolution reacts
  to a changing catalogue," which generalises to a remotely-updated catalogue.

---

## Near-term de-risking (no UX change required)

1. **Namespace anything that crosses a boundary** — lean on `opfs://` / a URN prefix for persisted
   state rather than bare ids.
2. **Add an "ambiguous name" diagnostic** (multiple label matches) so silent first-match never
   becomes user-visible data loss.
3. **Snapshot id bindings on auto-resolve** — when CAT-4 resolves a name, record the binding so the
   label isn't re-resolved on every compile.

---

## Explicitly out of scope

- Revision pinning / content versioning (until reproducibility is a real requirement).
- A full catalogue server, auth, or licensing model — this document only fixes the *identity and
  resolution* shape those would sit on.
- Changing the sigil grammar to embed asset ids inline (e.g. `@BOB{id}`) — keep the buffer as clean
  human text; ids live in bindings, not prose.

---

## Cross-references

- [ROADMAP.md](ROADMAP.md) — Track CAT (CAT-1/2/3/4/5) and the Data Contract's refinement-layer
  merge rule ("recompile preserves manual overrides").
- [ROADMAP_AI.md](ROADMAP_AI.md) — AI-generated characters land on the same CAT-4 bridge, so they
  inherit the same identity/resolution concerns.
- [ROADMAP_HUMANOID.md](ROADMAP_HUMANOID.md) — humanoid rework that changes how characters are
  produced, not how they are identified.