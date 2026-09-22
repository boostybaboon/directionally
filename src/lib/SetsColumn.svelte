<script lang="ts">
  import { isSettingEntry } from '../core/catalogue/catalogue.js';
  import type { UserCatalogueEntry } from '../core/storage/OPFSCatalogueStore.js';

  interface Props {
    /** Document-backed sets, most recently modified first. */
    entries: UserCatalogueEntry[];
    /** The set currently open for editing, highlighted in the list. */
    currentId?: string | null;
    /** Id of the row whose name is being edited; bound so a new set opens its name field. */
    renamingId?: string | null;
    /** Called when the user opens a set — clicking a row drills into that set. */
    onopen?: (id: string) => void;
    oncreate?: () => void;
    onrename?: (id: string, label: string) => void;
    onduplicate?: (id: string) => void;
    ondelete?: (id: string) => void;
    /** Called when the user reclassifies a set as scenery (a venue) or a prop (a component). */
    onclassify?: (id: string, isSetting: boolean) => void;
    oncollapse?: () => void;
  }

  let {
    entries,
    currentId = null,
    renamingId = $bindable(null),
    onopen,
    oncreate,
    onrename,
    onduplicate,
    ondelete,
    onclassify,
    oncollapse,
  }: Props = $props();

  // Pending edit text. Null means untouched, so the field shows the entry's own label
  // until the user types — a freshly created set shows "Untitled" preselected.
  let renameDraft = $state<string | null>(null);
  let renameField: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (renamingId && renameField) {
      renameField.focus();
      renameField.select();
    }
  });

  function startRename(entry: UserCatalogueEntry) {
    renamingId = entry.id;
    renameDraft = null;
  }

  function commitRename(entry: UserCatalogueEntry) {
    const next = (renameDraft ?? entry.label).trim() || 'Untitled';
    cancelRename();
    if (next !== entry.label) onrename?.(entry.id, next);
  }

  function cancelRename() {
    renamingId = null;
    renameDraft = null;
  }
</script>

<aside class="sets-column">
  <header class="sets-header">
    <span class="sets-title">Sets</span>
    <button class="sets-icon" onclick={() => oncollapse?.()} title="Hide the sets column" aria-label="Hide the sets column">«</button>
  </header>

  <button class="sets-new" onclick={() => oncreate?.()} title="Start a new set">+ New set</button>

  {#if entries.length === 0}
    <p class="sets-empty">No sets yet.</p>
  {:else}
    <ul class="sets-list">
      {#each entries as entry (entry.id)}
        {@const setting = isSettingEntry(entry)}
        <li class="sets-row" class:current={entry.id === currentId}>
          {#if renamingId === entry.id}
            <input
              class="sets-rename-input"
              bind:this={renameField}
              value={renameDraft ?? entry.label}
              oninput={(e) => { renameDraft = e.currentTarget.value; }}
              onblur={() => commitRename(entry)}
              onkeydown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') cancelRename();
              }}
              aria-label="Set name"
            />
          {:else}
            <button
              class="sets-open"
              onclick={() => onopen?.(entry.id)}
              aria-current={entry.id === currentId ? 'true' : undefined}
              title={entry.id === currentId ? `Editing "${entry.label}"` : `Edit "${entry.label}"`}
            >
              {entry.label}
            </button>
            <button
              class="sets-tag"
              class:prop={!setting}
              onclick={() => onclassify?.(entry.id, !setting)}
              title={setting
                ? 'Scenery — a venue a scene can be set in. Click to make it a component prop.'
                : 'Component prop. Click to make it scenery (a venue).'}
            >{setting ? 'scenery' : 'prop'}</button>
            <div class="sets-actions">
              <button class="sets-icon" onclick={() => startRename(entry)} title="Rename {entry.label}" aria-label="Rename {entry.label}">✎</button>
              <button class="sets-icon" onclick={() => onduplicate?.(entry.id)} title="Duplicate {entry.label}" aria-label="Duplicate {entry.label}">⧉</button>
              <button class="sets-icon" onclick={() => ondelete?.(entry.id)} title="Delete {entry.label}" aria-label="Delete {entry.label}">✕</button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .sets-column {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: #16162c;
    border-right: 1px solid #2a2a4a;
  }

  .sets-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 6px 6px 12px;
    border-bottom: 1px solid #2a2a4a;
  }

  .sets-title {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8888cc;
  }

  .sets-new {
    margin: 8px 10px;
    padding: 5px 8px;
    background: #1e1e40;
    border: 1px solid #3a3a6a;
    border-radius: 4px;
    color: #c0c0e0;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }
  .sets-new:hover { background: #28285a; }

  .sets-empty {
    margin: 0;
    padding: 4px 12px;
    font-size: 12px;
    font-style: italic;
    color: #5555a0;
  }

  .sets-list {
    list-style: none;
    margin: 0;
    padding: 0;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .sets-row {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px 2px 10px;
  }
  .sets-row.current { background: #25254a; }

  .sets-open {
    flex: 1;
    min-width: 0;
    padding: 5px 2px;
    background: none;
    border: none;
    border-radius: 3px;
    color: #d0d0f0;
    font-size: 13px;
    font-family: inherit;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
    cursor: pointer;
  }
  .sets-open:hover { color: #aaaae8; }

  .sets-rename-input {
    flex: 1;
    min-width: 0;
    background: #1e1e3a;
    border: 1px solid #6050c8;
    border-radius: 3px;
    color: #e0e0ff;
    font-size: 13px;
    font-family: inherit;
    padding: 3px 6px;
    outline: none;
  }

  .sets-tag {
    flex-shrink: 0;
    padding: 2px 6px;
    background: none;
    border: 1px solid #2a4a6a;
    border-radius: 8px;
    color: #4a9eff;
    font-size: 10px;
    font-family: inherit;
    letter-spacing: 0.03em;
    cursor: pointer;
  }
  .sets-tag:hover { background: #1a2a3a; }
  .sets-tag.prop { border-color: #3a3a6a; color: #8080a8; }

  .sets-actions {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .sets-icon {
    background: none;
    border: none;
    color: #5555a0;
    font-size: 12px;
    font-family: inherit;
    line-height: 1;
    padding: 4px 5px;
    border-radius: 3px;
    cursor: pointer;
  }
  .sets-icon:hover { color: #aaaae8; background: #2a2a50; }
</style>
