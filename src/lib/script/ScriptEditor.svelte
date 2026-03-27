<script lang="ts">
  import type { ScriptLine, DialogueLine } from './types.js';
  import { isDialogueLine, isDirectionLine } from './types.js';

  interface Props {
    script:   ScriptLine[];
    onchange: (script: ScriptLine[]) => void;
    /** Optional scene-ending note, e.g. "LIGHTS FADE TO BLACK.". */
    transition?: string;
    ontransitionchange?: (transition: string) => void;
    /** Cast members to populate the actor dropdown. Empty when no actors have been added. */
    actors?:  { id: string; label: string }[];
    /** Current playhead position, used for the "@ now" button. */
    currentPosition?: number;
  }

  let { script, onchange, transition, ontransitionchange, actors, currentPosition = 0 }: Props = $props();

  const castActors = $derived(actors ?? []);

  // Local copy for smooth in-progress editing. Synced from prop on undo/redo.
  let localScript = $state<ScriptLine[]>([...script]);
  $effect(() => { localScript = [...script]; });

  let localTransition = $state(transition ?? '');
  $effect(() => { localTransition = transition ?? ''; });

  // Index of the line currently open for editing (-1 = none).
  let editingIdx = $state<number>(-1);

  // Resolve the last dialogue actor id for next-actor cycling.
  function lastDialogueActorId(): string {
    for (let i = localScript.length - 1; i >= 0; i--) {
      const l = localScript[i];
      if (isDialogueLine(l)) return l.actorId;
    }
    return castActors[0]?.id ?? '';
  }

  function actorLabel(id: string): string {
    return castActors.find((a) => a.id === id)?.label ?? id;
  }

  function addLine() {
    if (castActors.length === 0) return;
    const lastId  = lastDialogueActorId();
    const lastIdx = castActors.findIndex((a) => a.id === lastId);
    const nextActorId = castActors[(lastIdx + 1) % castActors.length].id;
    localScript = [...localScript, { actorId: nextActorId, text: '', pauseAfter: 0 }];
    editingIdx  = localScript.length - 1;
    // Don't call onchange here — empty dialogue lines would be stripped by SetSceneScriptCommand
    // and would cause the $effect to reset localScript before the user can type.
    // onchange fires from commitLine() once the user has finished editing.
  }

  function addDirection() {
    localScript = [...localScript, { type: 'direction', text: '' }];
    editingIdx  = localScript.length - 1;
    // Same deferred-commit reasoning as addLine().
  }

  function insertDirectionAfter(afterIndex: number) {
    const newLine: ScriptLine = { type: 'direction', text: '' };
    localScript = [...localScript.slice(0, afterIndex + 1), newLine, ...localScript.slice(afterIndex + 1)];
    editingIdx = afterIndex + 1;
    // Deferred commit — fires from commitLine() when the user finishes typing.
  }

  function deleteLine(i: number) {
    localScript = localScript.filter((_, idx) => idx !== i);
    if (editingIdx === i) editingIdx = -1;
    else if (editingIdx > i) editingIdx -= 1;
    onchange([...localScript]);
  }

  function updateLine(i: number, patch: Partial<DialogueLine> | { text: string }) {
    localScript = localScript.map((line, idx) => idx === i ? { ...line, ...patch } : line);
  }

  function commitLine(i: number) {
    editingIdx = -1;
    onchange([...localScript]);
  }

  function commitTransition() {
    ontransitionchange?.(localTransition);
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
    <p class="empty-hint">
      {#if castActors.length === 0}
        Add actors to the cast first, then add dialogue lines.
      {:else}
        No dialogue yet — add a line to begin.
      {/if}
    </p>
  {:else}
    <ol class="beats">
      {#each localScript as line, i (i)}
        {#if isDirectionLine(line)}
          <li class="beat direction-beat" class:editing={editingIdx === i}>
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="beat-inner"
              onclick={(e) => {
                const tag = (e.target as HTMLElement).tagName.toLowerCase();
                if (['textarea', 'button'].includes(tag)) return;
                editingIdx = editingIdx === i ? -1 : i;
                if (editingIdx === -1) onchange([...localScript]);
              }}
              onkeydown={(e) => { if (e.key === 'Escape') commitLine(i); }}
            >
            {#if editingIdx === i}
              <div class="beat-edit">
                <div class="edit-top">
                  <span class="direction-label">Stage direction</span>
                  <button
                    class="delete-btn"
                    onclick={(e) => { e.stopPropagation(); deleteLine(i); }}
                    title="Delete direction"
                    aria-label="Delete direction"
                  >✕</button>
                </div>
                <!-- svelte-ignore a11y_autofocus -->
                <textarea
                  class="dialogue-input direction-input"
                  rows="2"
                  placeholder="Stage direction…"
                  autofocus
                  value={line.text}
                  oninput={(e) => updateLine(i, { text: (e.currentTarget as HTMLTextAreaElement).value })}
                  onblur={() => commitLine(i)}
                  onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); commitLine(i); } }}
                ></textarea>
              </div>
            {:else}
              <div class="beat-read direction-read">
                <p class="direction-text">{line.text || '(stage direction…)'}</p>
              </div>
            {/if}
            </div>
          </li>
        {:else}
          {@const dl = line as DialogueLine}
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
                    value={dl.actorId}
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
                <input
                  class="parenthetical-input"
                  type="text"
                  placeholder="(parenthetical)…"
                  value={dl.parenthetical ?? ''}
                  oninput={(e) => updateLine(i, { parenthetical: (e.currentTarget as HTMLInputElement).value || undefined })}
                  onblur={() => commitLine(i)}
                  onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); commitLine(i); } }}
                  aria-label="Parenthetical (speech direction)"
                />
                <textarea
                  class="dialogue-input"
                  rows="3"
                  placeholder="Dialogue…"
                  value={dl.text}
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
                    value={dl.pauseAfter}
                    oninput={(e) => updateLine(i, { pauseAfter: parseFloat((e.currentTarget as HTMLInputElement).value) || 0 })}
                    onblur={() => commitLine(i)}
                    aria-label="Pause after line in seconds"
                  />
                  <span class="pause-unit">s</span>
                </label>
                <label class="pause-row">
                  <span class="pause-label">@ time</span>
                  <input
                    type="number"
                    class="pause-input"
                    min="0"
                    step="0.1"
                    placeholder="auto"
                    value={dl.startTime ?? ''}
                    oninput={(e) => {
                      const v = (e.currentTarget as HTMLInputElement).value;
                      updateLine(i, { startTime: v === '' ? undefined : (parseFloat(v) || 0) });
                    }}
                    onblur={() => commitLine(i)}
                    aria-label="Start time in seconds (leave blank for auto)"
                  />
                  <span class="pause-unit">s</span>
                  <button
                    class="now-btn"
                    onclick={(e) => { e.stopPropagation(); updateLine(i, { startTime: parseFloat(currentPosition.toFixed(2)) }); commitLine(i); }}
                    title="Set to current playhead position"
                  >★ now</button>
                </label>
                <button
                  class="insert-direction-btn"
                  onclick={(e) => { e.stopPropagation(); insertDirectionAfter(i); }}
                  title="Insert stage direction after this line"
                >↓ direction after</button>
              </div>
            {:else}
              <!-- Read mode -->
              <div class="beat-read">
                <span class="character-name">{actorLabel(dl.actorId).toUpperCase()}</span>
                {#if dl.parenthetical}
                  <p class="parenthetical-text">({dl.parenthetical})</p>
                {/if}
                <p class="dialogue-text">{dl.text || '…'}</p>
                <div class="beat-meta">
                  {#if dl.startTime !== undefined}
                    <span class="pause-tag">@ {dl.startTime}s</span>
                  {:else}
                    <span class="pause-tag auto-tag">@ auto</span>
                  {/if}
                  {#if dl.pauseAfter !== 0}
                    <span class="pause-tag">{dl.pauseAfter > 0 ? '+' : ''}{dl.pauseAfter}s</span>
                  {/if}
                </div>
              </div>
            {/if}
            </div>
          </li>
        {/if}
      {/each}
    </ol>
  {/if}

  <div class="toolbar">
    <button class="add-btn" disabled={castActors.length === 0} onclick={(e) => { e.stopPropagation(); addLine(); }}>+ Add line</button>
    <button class="add-btn dir-btn" onclick={(e) => { e.stopPropagation(); addDirection(); }}>+ Direction</button>
    <button class="print-btn" onclick={(e) => { e.stopPropagation(); window.print(); }} title="Print screenplay">⎙ Print</button>
  </div>

  {#if ontransitionchange !== undefined || transition}
    <div class="transition-field">
      <label class="transition-label" for="scene-transition-input">Scene transition</label>
      <input
        id="scene-transition-input"
        class="transition-input"
        type="text"
        placeholder="e.g. LIGHTS FADE TO BLACK."
        value={localTransition}
        oninput={(e) => { localTransition = (e.currentTarget as HTMLInputElement).value; }}
        onblur={commitTransition}
        onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); (e.currentTarget as HTMLInputElement).blur(); } }}
      />
    </div>
  {/if}
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
    font-size: 10px;
    color: #555;
    font-style: italic;
    margin-top: 2px;
  }

  .auto-tag {
    color: #3a3a3a;
  }

  .beat-meta {
    display: flex;
    gap: 8px;
    padding-left: 16px;
    flex-wrap: wrap;
  }

  .now-btn {
    background: #252535;
    color: #9b7fcc;
    border: 1px solid #3a3a4a;
    border-radius: 2px;
    padding: 1px 6px;
    font-size: 10px;
    font-family: inherit;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s, color 0.1s;
  }

  .now-btn:hover {
    background: #2a1e40;
    color: #c4a0ff;
    border-color: #9b7fcc;
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

  .parenthetical-input {
    background: #141418;
    color: #aaa;
    border: 1px solid #2a2a3a;
    border-radius: 2px;
    padding: 3px 8px;
    font-size: 11px;
    font-family: inherit;
    font-style: italic;
    margin-left: 16px;
    width: calc(100% - 16px);
    box-sizing: border-box;
  }

  .parenthetical-input:focus {
    outline: 1px solid #4a9eff;
    border-color: #4a9eff;
  }

  .parenthetical-text {
    margin: 0;
    padding: 0 0 0 16px;
    font-size: 11px;
    font-style: italic;
    color: #777;
    line-height: 1.4;
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

  /* Direction line (read mode) */

  .direction-beat {
    cursor: pointer;
  }

  .direction-read {
    padding: 2px 0;
  }

  .direction-text {
    margin: 0;
    font-size: 12px;
    font-style: italic;
    color: #888;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
    text-align: center;
    padding: 0 24px;
  }

  .direction-label {
    font-size: 10px;
    font-style: italic;
    color: #666;
    user-select: none;
  }

  .direction-input {
    /* inherits .dialogue-input styling */
    font-style: italic;
    color: #aaa;
  }

  .dir-btn {
    /* secondary shade so it's visually distinct from the primary + Add line button */
    color: #888;
  }

  .insert-direction-btn {
    align-self: flex-start;
    background: transparent;
    border: 1px dashed #333;
    color: #555;
    font-size: 10px;
    font-family: inherit;
    font-style: italic;
    padding: 2px 8px;
    border-radius: 2px;
    cursor: pointer;
    margin-left: 16px;
    margin-top: 2px;
    transition: color 0.1s, border-color 0.1s;
  }

  .insert-direction-btn:hover {
    color: #9b7fcc;
    border-color: #9b7fcc;
  }

/* Scene transition field */

  .transition-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px 12px;
    border-top: 1px solid #222;
    flex-shrink: 0;
  }

  .transition-label {
    font-size: 10px;
    font-style: italic;
    color: #555;
    user-select: none;
  }

  .transition-input {
    background: #141418;
    color: #d4d4d4;
    border: 1px solid #2a2a2a;
    border-radius: 2px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: inherit;
    font-style: italic;
  }

  .transition-input:focus {
    outline: 1px solid #4a9eff;
    border-color: #4a9eff;
  }

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

    .parenthetical-text {
      color: #333;
    }

    .dialogue-text {
      color: #000;
    }

    .direction-text {
      color: #333;
    }

    .pause-tag {
      color: #666;
    }

    .toolbar { display: none; }
    .transition-field { display: none; }
  }
</style>
