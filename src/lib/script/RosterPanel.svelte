<script lang="ts">
  import { getCharacters, getSetPieces, getEnvironments, isSettingEntry } from '../../core/catalogue/catalogue.js';
  import { CATALOGUE_ENTRIES } from '../../core/catalogue/entries.js';
  import type { CatalogueEntry } from '../../core/catalogue/types.js';
  import { resolveCastName, resolveSetting } from '../../core/treatment/fountainCompiler.js';

  interface Props {
    cast: string[];
    settings: string[];
    castBindings: Record<string, string>;
    settingBindings: Record<string, string>;
    userEntries: CatalogueEntry[];
    onrebind?: (kind: 'cast' | 'setting', name: string, catalogueId: string | null) => void;
    onrename?: (kind: 'cast' | 'setting', oldName: string, newName: string) => void;
    oncreate?: (kind: 'cast' | 'setting', name: string) => void;
    ongenerate?: (kind: 'cast' | 'setting', name: string) => void;
    generating?: boolean;
  }

  let {
    cast,
    settings,
    castBindings,
    settingBindings,
    userEntries,
    onrebind,
    onrename,
    oncreate,
    ongenerate,
    generating = false,
  }: Props = $props();

  const characters = $derived<CatalogueEntry[]>([
    ...getCharacters(CATALOGUE_ENTRIES),
    ...getCharacters(userEntries),
  ]);
  const settingEntries = $derived<CatalogueEntry[]>([
    ...getSetPieces(CATALOGUE_ENTRIES),
    ...getEnvironments(CATALOGUE_ENTRIES),
    ...getSetPieces(userEntries),
    ...getEnvironments(userEntries),
  ]);
  // Only venues/scenery may be assigned to a `#setting`; components (props) may not.
  const topLevelSettingEntries = $derived<CatalogueEntry[]>(settingEntries.filter(isSettingEntry));

  // Per-name inline rename state (one rename at a time).
  let renamingKey = $state<string | null>(null);
  let renameDraft = $state('');

  function charEntry(id: string): CatalogueEntry | undefined {
    return characters.find((c) => c.id === id);
  }

  function editHref(entry: CatalogueEntry | undefined): string | null {
    if (!entry) return null;
    const sid = (entry as { sourceAssemblyId?: unknown }).sourceAssemblyId;
    if (typeof sid !== 'string' || sid.length === 0) return null;
    if (entry.kind === 'character') return `/character?id=${encodeURIComponent(sid)}`;
    if (entry.kind === 'set-piece') return `/sketch?assemblyId=${encodeURIComponent(sid)}`;
    return null;
  }

  // Distinguishes duplicate labels within a candidate list by suffixing the id.
  function labelWithDisambiguation(entries: CatalogueEntry[]): Map<string, string> {
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.label, (counts.get(e.label) ?? 0) + 1);
    const out = new Map<string, string>();
    for (const e of entries) {
      out.set(e.id, (counts.get(e.label) ?? 0) > 1 ? `${e.label} (${e.id.slice(0, 6)})` : e.label);
    }
    return out;
  }

  const castOptionLabels = $derived(labelWithDisambiguation(characters));
  const settingOptionLabels = $derived(labelWithDisambiguation(settingEntries));

  function startRename(kind: 'cast' | 'setting', name: string) {
    renamingKey = `${kind}:${name}`;
    renameDraft = name;
  }

  function commitRename(kind: 'cast' | 'setting', oldName: string) {
    const next = renameDraft.trim();
    renamingKey = null;
    renameDraft = '';
    if (next && next.toUpperCase() !== oldName.toUpperCase()) {
      onrename?.(kind, oldName, next);
    }
  }

  function cancelRename() {
    renamingKey = null;
    renameDraft = '';
  }

  function castStatus(name: string): { kind: 'resolved' | 'ambiguous' | 'unmatched'; label?: string } {
    const r = resolveCastName(name, userEntries, castBindings);
    if (r.placeholder) {
      return (r.sameLabel ?? 0) > 1 ? { kind: 'ambiguous' } : { kind: 'unmatched' };
    }
    return { kind: 'resolved', label: charEntry(r.catalogueId)?.label ?? r.catalogueId };
  }

  function settingStatus(name: string): { kind: 'resolved' | 'ambiguous' | 'unmatched'; label?: string; entry?: CatalogueEntry } {
    const r = resolveSetting(name, userEntries, settingBindings);
    if (r.kind === 'placeholder') {
      return (r.sameLabel ?? 0) > 1 ? { kind: 'ambiguous' } : { kind: 'unmatched' };
    }
    return { kind: 'resolved', label: r.entry.label, entry: r.entry };
  }

  function rebindSelectValue(kind: 'cast' | 'setting', name: string): string {
    if (kind === 'cast') return castBindings[name.toUpperCase()] ?? '';
    return settingBindings[name.toUpperCase()] ?? '';
  }

  // Rebinding a setting offers only top-level entries; a currently-bound
  // component stays listed (so the dropdown still reflects reality) but is the
  // only non-venue option shown.
  function settingRebindOptions(name: string): CatalogueEntry[] {
    const boundId = settingBindings[name.toUpperCase()];
    if (boundId && !topLevelSettingEntries.some((e) => e.id === boundId)) {
      const bound = settingEntries.find((e) => e.id === boundId);
      return bound ? [...topLevelSettingEntries, bound] : topLevelSettingEntries;
    }
    return topLevelSettingEntries;
  }

  function onRebind(kind: 'cast' | 'setting', name: string, value: string) {
    onrebind?.(kind, name, value || null);
  }
</script>

<div class="roster">
  <section class="roster-section">
    <h3 class="roster-heading">Cast</h3>
    {#if cast.length === 0}
      <p class="roster-empty">No cast in this script yet — add an <code>@ACTOR</code> line.</p>
    {:else}
      <ul class="roster-list">
        {#each cast as name (name)}
          {@const status = castStatus(name)}
          {@const entry = charEntry(resolveCastName(name, userEntries, castBindings).catalogueId)}
          {@const renameKey = `cast:${name}`}
          <li class="roster-row">
            <div class="roster-main">
              <span class="roster-name">{name}</span>
              {#if status.kind === 'resolved'}
                <span class="roster-status">→ {status.label}</span>
              {:else if status.kind === 'ambiguous'}
                <span class="roster-status roster-warn">ambiguous — pick one</span>
              {:else}
                <span class="roster-status roster-placeholder">unmatched</span>
              {/if}
            </div>

            {#if renamingKey === renameKey}
              <div class="roster-rename">
                <input class="roster-rename-input" bind:value={renameDraft} onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename('cast', name);
                  else if (e.key === 'Escape') cancelRename();
                }} />
                <button class="roster-btn" onclick={() => commitRename('cast', name)}>OK</button>
                <button class="roster-btn" onclick={cancelRename}>✕</button>
              </div>
            {:else}
              <div class="roster-actions">
                <select
                  class="roster-select"
                  value={rebindSelectValue('cast', name)}
                  onchange={(e) => onRebind('cast', name, e.currentTarget.value)}
                  title="Point this name at a catalogue character"
                >
                  <option value="">auto</option>
                  {#each characters as c (c.id)}
                    <option value={c.id}>{castOptionLabels.get(c.id) ?? c.label}</option>
                  {/each}
                </select>
                {#if editHref(entry)}
                  <a class="roster-btn" href={editHref(entry)!} target="_blank" rel="noopener">Edit</a>
                {/if}
                {#if status.kind === 'unmatched'}
                  <button class="roster-btn" onclick={() => ongenerate?.('cast', name)} disabled={generating}>✨ Generate</button>
                  <button class="roster-btn" onclick={() => oncreate?.('cast', name)}>Create</button>
                {/if}
                <button class="roster-btn" onclick={() => startRename('cast', name)}>Rename</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="roster-section">
    <h3 class="roster-heading">Scenery</h3>
    {#if settings.length === 0}
      <p class="roster-empty">No settings in this script yet — add a <code>#INT SETTING DAY</code> line.</p>
    {:else}
      <ul class="roster-list">
        {#each settings as name (name)}
          {@const status = settingStatus(name)}
          {@const renameKey = `setting:${name}`}
          <li class="roster-row">
            <div class="roster-main">
              <span class="roster-name">{name}</span>
              {#if status.kind === 'resolved'}
                <span class="roster-status">→ {status.label}</span>
              {:else if status.kind === 'ambiguous'}
                <span class="roster-status roster-warn">ambiguous — pick one</span>
              {:else}
                <span class="roster-status roster-placeholder">unmatched</span>
              {/if}
            </div>

            {#if renamingKey === renameKey}
              <div class="roster-rename">
                <input class="roster-rename-input" bind:value={renameDraft} onkeydown={(e) => {
                  if (e.key === 'Enter') commitRename('setting', name);
                  else if (e.key === 'Escape') cancelRename();
                }} />
                <button class="roster-btn" onclick={() => commitRename('setting', name)}>OK</button>
                <button class="roster-btn" onclick={cancelRename}>✕</button>
              </div>
            {:else}
              <div class="roster-actions">
                <select
                  class="roster-select"
                  value={rebindSelectValue('setting', name)}
                  onchange={(e) => onRebind('setting', name, e.currentTarget.value)}
                  title="Point this name at a catalogue set-piece or environment"
                >
                  <option value="">auto</option>
                  {#each settingRebindOptions(name) as e (e.id)}
                    <option value={e.id}>{settingOptionLabels.get(e.id) ?? e.label}</option>
                  {/each}
                </select>
                {#if editHref(status.entry)}
                  <a class="roster-btn" href={editHref(status.entry)!} target="_blank" rel="noopener">Edit</a>
                {/if}
                {#if status.kind === 'unmatched'}
                  <button class="roster-btn" onclick={() => ongenerate?.('setting', name)} disabled={generating}>✨ Generate</button>
                  <button class="roster-btn" onclick={() => oncreate?.('setting', name)}>Create</button>
                {/if}
                <button class="roster-btn" onclick={() => startRename('setting', name)}>Rename</button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>


<style>
  .roster {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 10px 12px;
    overflow-y: auto;
    height: 100%;
  }

  .roster-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .roster-heading {
    margin: 0;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: #888;
  }

  .roster-empty {
    margin: 0;
    font-size: 12px;
    color: #555;
  }

  .roster-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .roster-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 8px;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
    background: #141418;
  }

  .roster-main {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .roster-name {
    font-weight: 700;
    font-size: 12px;
    color: #ddd;
    letter-spacing: 0.04em;
  }

  .roster-status {
    font-size: 11px;
    color: #96d0a0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .roster-status.roster-warn {
    color: #d9b26a;
  }

  .roster-status.roster-placeholder {
    color: #777;
    font-style: italic;
  }

  .roster-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .roster-select {
    flex: 1;
    min-width: 120px;
    background: #1e1e1e;
    color: #ccc;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
  }

  .roster-btn {
    background: #1a2a3a;
    color: #4a9eff;
    border: 1px solid #2a4a6a;
    border-radius: 3px;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
    text-decoration: none;
    font-family: inherit;
    white-space: nowrap;
  }

  .roster-btn:hover {
    background: #1e3248;
    border-color: #4a9eff;
  }

  .roster-rename {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .roster-rename-input {
    flex: 1;
    min-width: 100px;
    background: #1e1e1e;
    color: #ddd;
    border: 1px solid #4a9eff;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
  }

  code {
    color: #c8c8d2;
    background: #1e1e1e;
    padding: 0 3px;
    border-radius: 2px;
    font-size: 11px;
  }
</style>

