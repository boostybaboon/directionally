<script lang="ts">
  import { getCharacters, getSetPieces } from '../core/catalogue/catalogue.js';
  import PreviewRenderer from './PreviewRenderer.svelte';

  const characters = getCharacters();
  const setPieces = getSetPieces();

  let selectedCharacterId = $state<string | null>(null);

  function toggleCharacter(id: string): void {
    selectedCharacterId = selectedCharacterId === id ? null : id;
  }

  const GEOMETRY_LABELS: Record<string, string> = {
    box: 'box',
    plane: 'plane',
    sphere: 'sphere',
    cylinder: 'cylinder',
  };
</script>

<div class="catalogue">
  <section class="catalogue-section">
    <h3 class="catalogue-section-heading">Characters</h3>
    {#if characters.length === 0}
      <p class="empty-hint">No characters in catalogue.</p>
    {:else}
      <ul class="catalogue-list">
        {#each characters as entry (entry.id)}
          {@const expanded = selectedCharacterId === entry.id}
          <li class="character-item" class:expanded>
            <button
              class="catalogue-item catalogue-item--character"
              class:active={expanded}
              draggable="true"
              ondragstart={(e) => {
                e.dataTransfer?.setData(
                  'application/directionally-catalogue',
                  JSON.stringify({ kind: 'character', id: entry.id }),
                );
              }}
              onclick={() => toggleCharacter(entry.id)}
              aria-expanded={expanded}
            >
              <span class="item-icon" aria-hidden="true">🤖</span>
              <span class="item-label">{entry.label}</span>
              <span class="expand-arrow" aria-hidden="true">{expanded ? '▲' : '▼'}</span>
            </button>
            {#if expanded}
              <div class="character-preview">
                <PreviewRenderer
                  gltfPath={entry.gltfPath}
                />
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>

  <section class="catalogue-section">
    <h3 class="catalogue-section-heading">Set Pieces</h3>
    {#if setPieces.length === 0}
      <p class="empty-hint">No set pieces in catalogue.</p>
    {:else}
      <ul class="catalogue-list">
        {#each setPieces as entry (entry.id)}
          <li>
            <button
              type="button"
              class="catalogue-item catalogue-item--setpiece"
              title={entry.label}
              draggable="true"
              ondragstart={(e) => {
                e.dataTransfer?.setData(
                  'application/directionally-catalogue',
                  JSON.stringify({ kind: 'setpiece', id: entry.id }),
                );
              }}
            >
              <span class="item-icon" aria-hidden="true">◻</span>
              <span class="item-label">{entry.label}</span>
              <span class="item-meta">{GEOMETRY_LABELS[entry.geometry.type] ?? entry.geometry.type}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .catalogue {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow-y: auto;
  }

  .catalogue-section {
    flex-shrink: 0;
    border-bottom: 1px solid #2a2a2a;
  }

  .catalogue-section:last-child {
    border-bottom: none;
  }

  .catalogue-section-heading {
    margin: 0;
    padding: 8px 12px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    border-bottom: 1px solid #2a2a2a;
    user-select: none;
  }

  .catalogue-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
  }

  .catalogue-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 12px;
    color: #bbb;
    font-size: 13px;
    text-align: left;
  }

  .catalogue-item--character {
    background: none;
    border: none;
    border-left: 2px solid transparent;
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
  }

  .catalogue-item--character:hover {
    background: #252525;
    color: #fff;
    border-left-color: #4a9eff;
  }

  .catalogue-item[draggable='true'] {
    cursor: grab;
  }

  .catalogue-item[draggable='true']:active {
    cursor: grabbing;
  }

  .catalogue-item--character.active {
    background: #1e2d3d22;
    border-left-color: #4a9eff;
    color: #e0e0e0;
  }

  .catalogue-item--setpiece {
    border-left: 2px solid transparent;
    background: none;
    border-right: none;
    border-top: none;
    border-bottom: none;
    text-align: left;
    color: #888;
  }

  .item-icon {
    font-size: 14px;
    flex-shrink: 0;
    width: 18px;
    text-align: center;
  }

  .item-label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    font-size: 11px;
    color: #555;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .expand-arrow {
    font-size: 8px;
    color: #555;
    flex-shrink: 0;
    transition: color 0.1s;
  }

  .catalogue-item--character:hover .expand-arrow,
  .catalogue-item--character.active .expand-arrow {
    color: #4a9eff;
  }

  .character-preview {
    border-top: 1px solid #2a2a2a;
    border-bottom: 1px solid #2a2a2a;
  }

  .empty-hint {
    padding: 8px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }
</style>
