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
import { isSettingEntry } from '../catalogue/catalogue.js';
import type { CatalogueEntry } from '../catalogue/types.js';
import { resolveCastName, resolveSetting } from '../treatment/fountainCompiler.js';
import type { ResolveBindings } from '../treatment/fountainCompiler.js';
import type { ScriptDocument } from '../treatment/fountain.js';
import { createSetPiece as createSetting, SET_PIECE_JSON_SCHEMA } from '../setting/authoringApi.js';
import { createCharacter, CHARACTER_JSON_SCHEMA } from '../character/authoringApi.js';
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
 * `document` is the full spec the matching `create_*` verb accepts (it carries
 * `label`; if absent, `name` is used as the label). Pass a free-text
 * description string plus `options.provider` instead to have the LLM build that
 * spec first (ROADMAP_AI.md AI-0). Resume-by-name checks the merged bundled +
 * user catalogue so a repeat `make` never duplicates.
 */

/** The JSON schema the AI must fill for a given asset kind. */
function targetSchema(kind: 'setting' | 'character'): Record<string, unknown> {
  return kind === 'character' ? CHARACTER_JSON_SCHEMA : SET_PIECE_JSON_SCHEMA;
}

/**
 * describeToDocument — the free-text → document (LLM) step inside `make`. Asks
 * the provider to emit one JSON document matching the asset kind's schema. The
 * returned value is not validated here; the matching `create_*` verb clamps it
 * (ROADMAP_AI.md AI-4 hardens this with retry + rate limiting).
 */
export async function describeToDocument(
  provider: AIProvider,
  kind: 'setting' | 'character',
  description: string,
): Promise<unknown> {
  const systemPrompt =
    'You design assets for a 3D animation app. Produce exactly one JSON document matching the schema supplied alongside this request. Respond with JSON only.';
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

  const entryKind = kind === 'setting' ? 'set-piece' : 'character';
  const existing = [...CATALOGUE_ENTRIES, ...userEntries].find(
    (e) => e.kind === entryKind && e.label.trim().toLowerCase() === label.toLowerCase(),
  );

  const entry: CatalogueEntry = existing ?? (kind === 'setting'
    ? await createSetting(doc)
    : await createCharacter(doc));

  const key = name.trim().toUpperCase();
  const warnings = existing ? [`Reused existing "${existing.label}".`] : [];

  return {
    entry,
    boundTo: key,
    created: existing == null,
    castBindings: kind === 'character' ? bindName(key, entry.id, castBindings) : castBindings,
    settingBindings: kind === 'setting' ? bindName(key, entry.id, settingBindings) : settingBindings,
    warnings,
  };
}
