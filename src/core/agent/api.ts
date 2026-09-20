/**
 * Headless authoring surface (ROADMAP_API.md): the machine-facing verbs an AI
 * agent (or a human client) calls to discover, preview, create, and bind
 * catalogue assets against a production's script.
 *
 * This is the **client-side core**. The state these verbs read/write — the user
 * catalogue (OPFS), productions (IndexedDB), and cast/setting bindings — lives
 * in the browser, so the stateful verbs are functions, not HTTP routes. The
 * stateless *preview* verbs already exist as server routes (`/agent/character`,
 * `/agent/setting`).
 *
 * Implemented: describe_catalogue, describe_script, bind, create_setting,
 * create_character (with spec-backed render via storedSceneToModelAsync), make
 * (create-or-resume + bind), and the tool manifest (toolManifest).
 * Not yet built: make's free-text → document step (the LLM), which is
 * ROADMAP_AI.md's territory, not this surface's.
 */

import { CATALOGUE_ENTRIES } from '../catalogue/entries.js';
import { getById, isSettingEntry } from '../catalogue/catalogue.js';
import type { CatalogueEntry } from '../catalogue/types.js';
import { collectLights, countParts, isLightNode, isPartNode, isRefNode } from '../sketcher/documentTree.js';
import type { SetNode } from '../sketcher/documentTree.js';
import { IDENTITY_TRANSFORM, localToWorld } from '../sketcher/transform.js';
import type { Transform } from '../sketcher/transform.js';
import { scaleToSize, toEulerDeg, toAIDraft } from '../sketcher/aiDraft.js';
import type { AIDraft, AIDraftProjection } from '../sketcher/aiDraft.js';
import type { SetDocument } from '../sketcher/documentTree.js';
import type { LightConfig } from '../domain/types.js';
import { resolveCastName, resolveSetting } from '../treatment/fountainCompiler.js';
import type { ResolveBindings } from '../treatment/fountainCompiler.js';
import type { ScriptDocument } from '../treatment/fountain.js';
import { createSetPiece as createSetting } from '../setting/authoringApi.js';
import { createCharacter, CHARACTER_JSON_SCHEMA } from '../character/authoringApi.js';
import { AI_DRAFT_JSON_SCHEMA } from '../sketcher/aiDraftSchema.js';
import type { AIProvider } from './provider.js';

export type CatalogueSummary = {
  id: string;
  label: string;
  kind: CatalogueEntry['kind'];
  isSetting: boolean;
  summary: string;
};

export type NameStatus =
  | { state: 'bound'; catalogueId: string; label: string }
  | { state: 'ambiguous'; matches: number }
  | { state: 'unresolved' };

export type ScriptDescription = {
  cast: Array<{ name: string; status: NameStatus }>;
  settings: Array<{ name: string; status: NameStatus }>;
};

function summarise(entry: CatalogueEntry): string {
  switch (entry.kind) {
    case 'character': return 'character';
    case 'set-piece': return isSettingEntry(entry) ? 'set-piece (scenery)' : 'set-piece (prop)';
    case 'environment': return 'environment (HDRI)';
    case 'light': return 'light';
  }
}

/** describe_catalogue — list entries with enough detail to reuse or pick them. */
export function describeCatalogue(entries: CatalogueEntry[] = CATALOGUE_ENTRIES): CatalogueSummary[] {
  return entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    kind: entry.kind,
    isSetting: isSettingEntry(entry),
    summary: summarise(entry),
  }));
}

export type DefinitionNodeSummary = {
  /** Node ids from the Definition root, joined with '/' — what an override's `path` addresses. */
  path: string;
  /** The node's semantic name: a part's label or preset, a group's name, an instance's name. */
  name: string;
  role: 'prop' | 'structure' | 'light';
  body: 'part' | 'instance' | 'group' | 'light';
  /** An instance: the catalogue entry it references. */
  ref?: string;
  /** A part built from a primitive preset: the preset, and its absolute dimensions in metres. */
  shape?: string;
  size?: number[];
  /** World placement, in the AI Draft's convention: metres, +Y up, Euler degrees. */
  position: [number, number, number];
  rotation: [number, number, number];
  /** True when the Definition itself hides the node. */
  hidden?: boolean;
};

export type DefinitionDescription = {
  id: string;
  label: string;
  /** Every node in the tree, in tree order — lights included, since a path may need to name one. */
  nodes: DefinitionNodeSummary[];
  /** The Definition's own lights, as the renderer reads them. */
  lights: LightConfig[];
  environmentMap?: string;
  partCount: number;
};

/**
 * describe_definition — what a Definition is made of, and *where* each node sits inside it: the paths
 * an override addresses, the names to talk about them by, the placements, and an instance's reference.
 * `describe_catalogue` says what exists; this says what one of them contains, which is the difference
 * between naming a chair and varying one.
 *
 * The entry must carry its document (`document`): bundled entries carry it inline, a saved set is
 * attached by the caller — as anywhere else a document is read. Returns null for an entry that is not
 * a set-piece, or one with no document to describe.
 */
export function describeDefinition(
  id: string,
  entries: CatalogueEntry[] = CATALOGUE_ENTRIES,
): DefinitionDescription | null {
  const entry = getById(id, entries);
  if (entry?.kind !== 'set-piece' || !entry.document) return null;

  const document = entry.document;
  const nodes: DefinitionNodeSummary[] = [];
  const walk = (list: SetNode[], parent: Transform, prefix: string): void => {
    for (const node of list) {
      const path = prefix ? `${prefix}/${node.id}` : node.id;
      const world = localToWorld(node.transform, parent);
      const content = node.content;
      nodes.push({
        path,
        name: node.name ?? content?.label ?? content?.name ?? node.id,
        role: node.role,
        body: isRefNode(node) ? 'instance' : isPartNode(node) ? 'part' : isLightNode(node) ? 'light' : 'group',
        ...(isRefNode(node) ? { ref: node.ref } : {}),
        ...(content?.kind === 'primitive'
          ? { shape: content.name.toLowerCase(), size: scaleToSize(content.name.toLowerCase(), world.scale) }
          : {}),
        position: world.position,
        rotation: toEulerDeg(world.quaternion),
        ...(node.hidden === true ? { hidden: true } : {}),
      });
      walk(node.children, world, path);
    }
  };
  walk(document.root, IDENTITY_TRANSFORM, '');

  return {
    id: entry.id,
    label: entry.label,
    nodes,
    lights: collectLights(document),
    ...(document.environmentMap !== undefined ? { environmentMap: document.environmentMap } : {}),
    partCount: countParts(document),
  };
}

/**
 * describe_session — the live session as an AI Draft, plus the handle-to-identity map that applying an
 * edited draft needs: without it a part the AI left alone could not be recognised as the same part.
 * The projection is the editor's own (toAIDraft), so the draft an agent reads and the draft it answers
 * with are the same grammar in both directions.
 */
export function describeSession(document: SetDocument): AIDraftProjection {
  return toAIDraft(document);
}

/**
 * editToDocument — the draft-in / draft-out LLM step behind /agent/edit. The draft is sent whole and
 * the answer is expected whole, rather than as a patch: the grammar is small, a model rewrites far more
 * reliably than it invents diffs, and the app-side id-diff is what turns the difference into edits —
 * which is the property that keeps an AI turn one undoable step.
 *
 * Not validated here, deliberately: an untrusted draft is clamped where it is applied, the same shape
 * describeToDocument has.
 */
export async function editToDocument(
  provider: AIProvider,
  draft: AIDraft,
  instruction: string,
  history: string[] = [],
): Promise<unknown> {
  const systemPrompt = 'You edit one JSON scene draft for a 3D animation app. '
    + 'Return the whole draft, changed only where the instruction asks: keep every id, name, group '
    + 'and placement you are not asked to change, and keep every part you do not need to touch. '
    + 'The draft is a flat list of parts (each with an id, name, shape, absolute size in metres, '
    + 'position in metres, Euler rotation in degrees, and hex color), named groups over part ids, '
    + 'and optional lights and environment. A part with a ref places a catalogue item instead of '
    + 'describing a body. Coordinate convention: units are metres; up is +Y with the ground at '
    + 'Y=0; forward is -Z. Respond with JSON only.';
  const userPrompt = JSON.stringify({ instruction, draft, history });
  return provider.generate(systemPrompt, userPrompt, AI_DRAFT_JSON_SCHEMA);
}

function merged(userEntries: CatalogueEntry[]): CatalogueEntry[] {
  return [...CATALOGUE_ENTRIES, ...userEntries];
}

function describeCast(name: string, userEntries: CatalogueEntry[], bindings?: Record<string, string>): NameStatus {
  const r = resolveCastName(name, userEntries, bindings);
  if (r.placeholder) {
    const matches = r.sameLabel ?? 0;
    return matches > 1 ? { state: 'ambiguous', matches } : { state: 'unresolved' };
  }
  const label = merged(userEntries).find((e) => e.id === r.catalogueId)?.label ?? r.catalogueId;
  return { state: 'bound', catalogueId: r.catalogueId, label };
}

function describeSetting(name: string, userEntries: CatalogueEntry[], bindings?: Record<string, string>): NameStatus {
  const r = resolveSetting(name, userEntries, bindings);
  if (r.kind === 'placeholder') {
    const matches = r.sameLabel ?? 0;
    return matches > 1 ? { state: 'ambiguous', matches } : { state: 'unresolved' };
  }
  return { state: 'bound', catalogueId: r.entry.id, label: r.entry.label };
}

function uniqueSettings(doc: ScriptDocument): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const scene of doc.scenes) {
    const s = (scene.setting ?? '').trim().toUpperCase();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

/** describe_script — the production's cast + settings with resolution status. */
export function describeScript(
  doc: ScriptDocument,
  userEntries: CatalogueEntry[] = [],
  bindings: ResolveBindings = {},
): ScriptDescription {
  return {
    cast: doc.cast.map((name) => ({ name, status: describeCast(name, userEntries, bindings.cast) })),
    settings: uniqueSettings(doc).map((name) => ({ name, status: describeSetting(name, userEntries, bindings.setting) })),
  };
}

/**
 * bind — return a copy of `bindings` with `name` pointing at `catalogueId`
 * (uppercase-keyed), or removed when `catalogueId` is null. Callers pass the
 * cast or setting map they mean; the input map is never mutated.
 */
export function bindName(
  name: string,
  catalogueId: string | null,
  bindings: Record<string, string>,
): Record<string, string> {
  const key = name.toUpperCase();
  const next = { ...bindings };
  if (catalogueId) next[key] = catalogueId; else delete next[key];
  return next;
}

// create_setting / create_character are re-exported under their API verb names.
export { createSetting, createCharacter };
export { toolManifest } from './toolManifest.js';
export type { ToolDefinition } from './toolManifest.js';

/**
 * Result of `make`: the entry now backing a script name, plus the binding maps
 * with that name wired to it. The input maps are never mutated — callers apply
 * the returned maps to their production state.
 */
export type MakeResult = {
  entry: CatalogueEntry;
  /** The script name now bound (uppercase). */
  boundTo: string;
  /** False when an existing same-label entry was reused instead of created. */
  created: boolean;
  castBindings: Record<string, string>;
  settingBindings: Record<string, string>;
  warnings: string[];
};

/**
 * make — the orchestration verb (API-3): ensure an asset exists (create, or
 * resume an existing same-label entry), then bind `name` to it. One call turns
 * an `UNRESOLVED` script name into a bound, resolvable asset.
 *
 * `document` is the document the matching `create_*` verb accepts (it carries
 * `label`; if absent, `name` is used as the label). Pass a free-text
 * description string plus `options.provider` instead to have the LLM build that
 * document first (ROADMAP_AI.md AI-0).
 *
 * Settings generate an AI Draft and resume in the user catalogue (the create verb
 * owns that); characters resume against the merged bundled + user catalogue.
 */

/** The JSON schema the AI must fill for a given asset kind. */
function targetSchema(kind: 'setting' | 'character'): Record<string, unknown> {
  return kind === 'character' ? CHARACTER_JSON_SCHEMA : AI_DRAFT_JSON_SCHEMA;
}

/**
 * describeToDocument — the free-text → document (LLM) step inside `make`. Asks
 * the provider to emit one JSON document matching the asset kind's schema. The
 * returned value is not validated here; the matching `create_*` verb clamps it
 * (ROADMAP_AI.md AI-4 hardens this with retry + rate limiting).
 *
 * Scenery uses the AI Draft grammar, so the result becomes the same tree document a
 * human-drawn set has — `create_setting` stores it on the entry unchanged.
 */
export async function describeToDocument(
  provider: AIProvider,
  kind: 'setting' | 'character',
  description: string,
): Promise<unknown> {
  const systemPrompt = kind === 'setting'
    ? 'You design scenery for a 3D animation app. Produce one JSON object describing the setting as named primitive parts, optionally organised into named groups. '
      + 'Give the whole setting a `label` (a short, human-friendly name). '
      + 'Coordinate convention: units are metres; up is +Y with the ground plane at Y=0; forward is -Z. '
      + 'Each part needs a unique `id` handle, a semantic `name`, `shape` (box, sphere, cylinder, capsule, cone, or torus), absolute `size` in metres, `position` in metres, `rotation` as Euler angles in degrees [x, y, z], and a hex `color`. '
      + 'Group related parts via `groups` (an `id`, optional `name`, and a `children` array of part handles). '
      + 'Keep it compact so the whole JSON fits in one response. Respond with JSON only.'
    : 'You design a character for a 3D animation app. Produce one JSON document matching the supplied schema. Respond with JSON only.';
  return provider.generate(systemPrompt, description, targetSchema(kind));
}

export async function make(
  kind: 'setting' | 'character',
  name: string,
  document: unknown,
  options: {
    userEntries?: CatalogueEntry[];
    castBindings?: Record<string, string>;
    settingBindings?: Record<string, string>;
    /** When set and `document` is a free-text description, this provider builds the spec (AI-0). */
    provider?: AIProvider;
  } = {},
): Promise<MakeResult> {
  const userEntries = options.userEntries ?? [];
  const castBindings = options.castBindings ?? {};
  const settingBindings = options.settingBindings ?? {};

  const spec = typeof document === 'string' && options.provider
    ? await describeToDocument(options.provider, kind, document)
    : document;

  const source = (typeof spec === 'object' && spec !== null ? spec : {}) as Record<string, unknown>;
  const label = (typeof source.label === 'string' && source.label.trim()) ? source.label.trim() : name.trim();
  const doc = { ...source, label };

  const key = name.trim().toUpperCase();

  if (kind === 'setting') {
    // Scenery has one create verb, which owns create-or-resume: an AI Draft becomes
    // the entry's tree document (and carries its lights/environment), so a repeat
    // `make` updates that set rather than minting a duplicate.
    const { entry, created } = await createSetting(doc, { isSetting: true, fallbackLabel: label });
    return {
      entry,
      boundTo: key,
      created,
      castBindings,
      settingBindings: bindName(key, entry.id, settingBindings),
      warnings: created ? [] : [`Reused existing "${entry.label}".`],
    };
  }

  const existing = [...CATALOGUE_ENTRIES, ...userEntries].find(
    (e) => e.kind === 'character' && e.label.trim().toLowerCase() === label.toLowerCase(),
  );
  const entry: CatalogueEntry = existing ?? await createCharacter(doc);

  return {
    entry,
    boundTo: key,
    created: existing == null,
    castBindings: bindName(key, entry.id, castBindings),
    settingBindings,
    warnings: existing ? [`Reused existing "${existing.label}".`] : [],
  };
}
