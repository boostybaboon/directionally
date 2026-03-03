<script lang="ts">
  import type { ScriptLine } from './types.js';
  import { SANDBOX_ACTORS } from './types.js';

  interface Props {
    script:   ScriptLine[];
    onreload: () => void;
  }

  let { script = $bindable(), onreload }: Props = $props();

  function addLine() {
    const lastActorId = script.at(-1)?.actorId ?? 'alpha';
    const nextActorId = lastActorId === 'alpha' ? 'beta' : 'alpha';
    script = [...script, { actorId: nextActorId, text: '', pauseAfter: 0 }];
    // No reload — empty text produces no speech output.
  }

  function deleteLine(i: number) {
    script = script.filter((_, idx) => idx !== i);
    onreload();
  }

  function updateLine(i: number, patch: Partial<ScriptLine>) {
    script = script.map((line, idx) => idx === i ? { ...line, ...patch } : line);
  }
</script>

<div class="script-editor">
  {#if script.length === 0}
    <p class="empty-hint">Add lines to build a scene.</p>
  {:else}
    <ol class="line-list">
      {#each script as line, i (i)}
        <li class="line-row">
          <select
            class="actor-select"
            value={line.actorId}
            onchange={(e) => { updateLine(i, { actorId: (e.currentTarget as HTMLSelectElement).value as ScriptLine['actorId'] }); onreload(); }}
            aria-label="Actor"
          >
            {#each SANDBOX_ACTORS as actor}
              <option value={actor.id}>{actor.label}</option>
            {/each}
          </select>

          <textarea
            class="line-text"
            rows="2"
            placeholder="Dialogue…"
            value={line.text}
            oninput={(e)  => updateLine(i, { text: (e.currentTarget as HTMLTextAreaElement).value })}
            onblur={onreload}
            aria-label="Dialogue line"
          ></textarea>

          <div class="line-meta">
            <label class="pause-label">
              pause
              <input
                type="number"
                class="pause-input"
                min="0"
                max="30"
                step="0.5"
                value={line.pauseAfter}
                oninput={(e)  => updateLine(i, { pauseAfter: parseFloat((e.currentTarget as HTMLInputElement).value) || 0 })}
                onblur={onreload}
                aria-label="Pause after line in seconds"
              />s
            </label>

            <button
              class="delete-btn"
              onclick={() => deleteLine(i)}
              aria-label="Delete line"
              title="Delete line"
            >✕</button>
          </div>
        </li>
      {/each}
    </ol>
  {/if}

  <div class="toolbar">
    <button class="add-btn" onclick={addLine}>+ Add line</button>
    <button class="reload-btn" onclick={onreload} title="Recompile and reload the scene now">↺ Reload</button>
  </div>
</div>

<style>
  .script-editor {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .empty-hint {
    padding: 12px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }

  .line-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .line-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 6px 10px;
    border-bottom: 1px solid #222;
  }

  .line-row:last-child {
    border-bottom: none;
  }

  .actor-select {
    background: #252525;
    color: #4a9eff;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 2px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    cursor: pointer;
    align-self: flex-start;
  }

  .actor-select:focus {
    outline: 1px solid #4a9eff;
  }

  .line-text {
    resize: vertical;
    background: #1e1e1e;
    color: #d4d4d4;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 5px 7px;
    font-size: 12px;
    font-family: inherit;
    line-height: 1.4;
    min-height: 38px;
  }

  .line-text:focus {
    outline: 1px solid #4a9eff;
    border-color: #4a9eff;
  }

  .line-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .pause-label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #666;
    user-select: none;
  }

  .pause-input {
    width: 44px;
    background: #1e1e1e;
    color: #d4d4d4;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 2px 4px;
    font-size: 11px;
    text-align: right;
  }

  .pause-input:focus {
    outline: 1px solid #4a9eff;
  }

  .delete-btn {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    font-size: 12px;
    padding: 2px 4px;
    border-radius: 3px;
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
    border-top: 1px solid #2a2a2a;
    flex-shrink: 0;
  }

  .add-btn,
  .reload-btn {
    flex: 1;
    background: #252525;
    color: #bbb;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 5px 8px;
    font-size: 11px;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
  }

  .add-btn:hover,
  .reload-btn:hover {
    background: #1e2d3d;
    color: #4a9eff;
    border-color: #4a9eff;
  }
</style>
