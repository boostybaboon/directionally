<script lang="ts">
  import type { ScriptLine } from './types.js';
  import { SANDBOX_ACTORS } from './types.js';

  interface Props {
    script:   ScriptLine[];
    onchange: (script: ScriptLine[]) => void;
    /** Cast to populate the actor dropdown. Falls back to SANDBOX_ACTORS when absent. */
    actors?:  { id: string; label: string }[];
  }

  let { script, onchange, actors }: Props = $props();

  const castActors = $derived(actors?.length ? actors : SANDBOX_ACTORS);

  // Local copy for smooth in-progress editing. Synced from prop on undo/redo.
  let localScript = $state<ScriptLine[]>([...script]);
  $effect(() => { localScript = [...script]; });

  // Index of the line currently open for editing (-1 = none).
  let editingIdx = $state<number>(-1);

  function actorLabel(id: string): string {
    return castActors.find((a) => a.id === id)?.label ?? id;
  }

  function addLine() {
    const lastActorId = localScript.at(-1)?.actorId ?? castActors[0].id;
    const lastIdx     = castActors.findIndex((a) => a.id === lastActorId);
    const nextActorId = castActors[(lastIdx + 1) % castActors.length].id;
    localScript = [...localScript, { actorId: nextActorId, text: '', pauseAfter: 0 }];
    editingIdx  = localScript.length - 1;
    // Don't call onchange here — empty lines are filtered by SetSpeakLinesCommand and
    // would cause the $effect to reset localScript before the user can type anything.
    // onchange fires from commitLine() once the user has finished editing.
  }

  function deleteLine(i: number) {
    localScript = localScript.filter((_, idx) => idx !== i);
    if (editingIdx === i) editingIdx = -1;
    else if (editingIdx > i) editingIdx -= 1;
    onchange([...localScript]);
  }

  function updateLine(i: number, patch: Partial<ScriptLine>) {
    localScript = localScript.map((line, idx) => idx === i ? { ...line, ...patch } : line);
  }

  function commitLine(i: number) {
    editingIdx = -1;
    onchange([...localScript]);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="screenplay"
  onclick={(e) => {
    if (editingIdx >= 0 && !(e.target as HTMLElement).closest('.beat')) {
      commitLine(editingIdx);
    }
  }}
>
  {#if localScript.length === 0}
    <p class="empty-hint">No dialogue yet — add a line to begin.</p>
  {:else}
    <ol class="beats">
      {#each localScript as line, i (i)}
        <li class="beat" class:editing={editingIdx === i}>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="beat-inner"
            onclick={(e) => {
              const tag = (e.target as HTMLElement).tagName.toLowerCase();
              if (['textarea', 'select', 'input', 'button'].includes(tag)) return;
              editingIdx = editingIdx === i ? -1 : i;
              if (editingIdx === -1) onchange([...localScript]);
            }}
            onkeydown={(e) => { if (e.key === 'Escape') commitLine(i); }}
          >
          {#if editingIdx === i}
            <!-- Editing mode -->
            <div class="beat-edit">
              <div class="edit-top">
                <select
                  class="actor-select"
                  value={line.actorId}
                  onchange={(e) => { updateLine(i, { actorId: (e.currentTarget as HTMLSelectElement).value }); onchange([...localScript]); }}
                  aria-label="Actor"
                >
                  {#each castActors as actor}
                    <option value={actor.id}>{actor.label.toUpperCase()}</option>
                  {/each}
                </select>
                <button
                  class="delete-btn"
                  onclick={(e) => { e.stopPropagation(); deleteLine(i); }}
                  title="Delete line"
                  aria-label="Delete line"
                >✕</button>
              </div>
              <textarea
                class="dialogue-input"
                rows="3"
                placeholder="Dialogue…"
                value={line.text}
                oninput={(e) => updateLine(i, { text: (e.currentTarget as HTMLTextAreaElement).value })}
                onblur={() => commitLine(i)}
                onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); commitLine(i); } }}
              ></textarea>
              <label class="pause-row">
                <span class="pause-label">pause after</span>
                <input
                  type="number"
                  class="pause-input"
                  min="-2"
                  max="30"
                  step="0.1"
                  value={line.pauseAfter}
                  oninput={(e) => updateLine(i, { pauseAfter: parseFloat((e.currentTarget as HTMLInputElement).value) || 0 })}
                  onblur={() => commitLine(i)}
                  aria-label="Pause after line in seconds"
                />
                <span class="pause-unit">s</span>
              </label>
            </div>
          {:else}
            <!-- Read mode -->
            <div class="beat-read">
              <span class="character-name">{actorLabel(line.actorId).toUpperCase()}</span>
              <p class="dialogue-text">{line.text || '…'}</p>
              {#if line.pauseAfter !== 0}
                <span class="pause-tag">{line.pauseAfter > 0 ? '+' : ''}{line.pauseAfter}s</span>
              {/if}
            </div>
          {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="toolbar">
    <button class="add-btn" onclick={(e) => { e.stopPropagation(); addLine(); }}>+ Add line</button>
    <button class="print-btn" onclick={(e) => { e.stopPropagation(); window.print(); }} title="Print screenplay">⎙ Print</button>
  </div>
</div>

<style>
  .screenplay {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    font-family: 'Courier New', 'Courier', monospace;
  }

  .empty-hint {
    padding: 16px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
    font-family: inherit;
  }

  .beats {
    list-style: none;
    margin: 0;
    padding: 8px 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .beat {
    padding: 10px 16px;
    border-bottom: 1px solid #1e1e1e;
    cursor: pointer;
    transition: background 0.1s;
  }

  .beat:last-child {
    border-bottom: none;
  }

  .beat:hover:not(.editing) {
    background: #1e1e1e;
  }

  .beat.editing {
    background: #1a1a24;
    cursor: default;
  }

  /* Read mode */

  .beat-read {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .character-name {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #4a9eff;
    user-select: none;
  }

  .dialogue-text {
    margin: 0;
    padding: 0 0 0 16px;
    font-size: 12px;
    color: #ccc;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .pause-tag {
    display: block;
    padding-left: 16px;
    font-size: 10px;
    color: #555;
    font-style: italic;
    margin-top: 2px;
  }

  /* Edit mode */

  .beat-edit {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .edit-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .actor-select {
    background: #252535;
    color: #4a9eff;
    border: 1px solid #3a3a4a;
    border-radius: 2px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 700;
    font-family: inherit;
    letter-spacing: 0.1em;
    cursor: pointer;
  }

  .actor-select:focus {
    outline: 1px solid #4a9eff;
  }

  .dialogue-input {
    resize: vertical;
    background: #141418;
    color: #d4d4d4;
    border: 1px solid #3a3a4a;
    border-radius: 2px;
    padding: 6px 8px;
    font-size: 12px;
    font-family: inherit;
    line-height: 1.5;
    min-height: 48px;
    margin-left: 16px;
  }

  .dialogue-input:focus {
    outline: 1px solid #4a9eff;
    border-color: #4a9eff;
  }

  .pause-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: 16px;
  }

  .pause-label {
    font-size: 10px;
    color: #555;
    font-style: italic;
    user-select: none;
  }

  .pause-input {
    width: 44px;
    background: #141418;
    color: #d4d4d4;
    border: 1px solid #3a3a4a;
    border-radius: 2px;
    padding: 2px 4px;
    font-size: 11px;
    font-family: inherit;
    text-align: right;
  }

  .pause-input:focus {
    outline: 1px solid #4a9eff;
  }

  .pause-unit {
    font-size: 10px;
    color: #555;
  }

  .delete-btn {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 2px;
    line-height: 1;
    transition: color 0.1s, background 0.1s;
  }

  .delete-btn:hover {
    color: #e06c75;
    background: #2a1a1a;
  }

  .toolbar {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    border-top: 1px solid #222;
    flex-shrink: 0;
  }

  .add-btn {
    flex: 1;
    background: #252525;
    color: #bbb;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 5px 8px;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .add-btn:hover {
    background: #1e2d3d;
    color: #4a9eff;
    border-color: #4a9eff;
  }

  .print-btn {
    background: #252525;
    color: #888;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 5px 10px;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s, color 0.1s;
  }

  .print-btn:hover {
    background: #1e2d3d;
    color: #4a9eff;
    border-color: #4a9eff;
  }

  /* Print styles */

  @media print {
    .screenplay {
      font-family: 'Courier New', monospace;
      color: #000;
      background: #fff;
      font-size: 12pt;
      overflow: visible;
      height: auto;
    }

    .beats {
      overflow: visible;
    }

    .beat {
      padding: 8pt 0;
      border-bottom: none;
      cursor: default;
      page-break-inside: avoid;
    }

    .character-name {
      color: #000;
      font-weight: bold;
    }

    .dialogue-text {
      color: #000;
    }

    .pause-tag {
      color: #666;
    }

    .toolbar { display: none; }
  }
</style>
