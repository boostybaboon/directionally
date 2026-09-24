<script lang="ts">
  /**
   * The dressing panel (production view, Track SCR): the venue a scene stands in, the nodes it
   * is made of, and what this scene does to each one.
   *
   * It reports changes rather than applying them, and its caller writes them as `##` lines in
   * the script — the source of truth a compiled scene's overrides are derived from. An edit made
   * anywhere else would be overwritten by the next compile; this way the panel is another way of
   * typing the grammar, and what it does is visible in the text.
   */
  import type { DressingBeat } from '../core/treatment/fountain.js';
  import type { DressingChange, DressingSlot } from '../core/treatment/sigilScript.js';

  interface Props {
    /** The venue the focused scene stands in, as the script names it. */
    setting?: string;
    /** Node paths inside that venue's document. Empty while the document is not in hand. */
    nodes: string[];
    /** What this scene says, in script order. */
    dressing: DressingBeat[];
    /** Why there is nothing to show, when the reason is worth saying. */
    unavailable?: string;
    onchange: (change: DressingChange) => void;
  }

  let { setting, nodes, dressing, unavailable, onchange }: Props = $props();

  let selected = $state<string | null>(null);
  let px = $state(0);
  let py = $state(0);
  let pz = $state(0);

  /** What the scene currently says about one node — the panel reads the script, never a copy. */
  function stateOf(node: string): { hidden: boolean; shown: boolean; removed: boolean; position?: [number, number, number] } {
    const forNode = dressing.filter((b) => b.node === node);
    const visibility = [...forNode].reverse().find((b) => b.op === 'hide' || b.op === 'show');
    return {
      hidden: visibility?.op === 'hide',
      shown: visibility?.op === 'show',
      removed: forNode.some((b) => b.op === 'remove'),
      position: [...forNode].reverse().find((b) => b.op === 'move')?.position,
    };
  }

  function select(node: string) {
    if (selected === node) {
      selected = null;
      return;
    }
    selected = node;
    const [x, y, z] = stateOf(node).position ?? [0, 0, 0];
    px = x;
    py = y;
    pz = z;
  }

  function clear(slot: DressingSlot, node: string) {
    onchange({ clear: slot, node });
  }

  function labelOf(node: string): string {
    return node.slice(node.lastIndexOf('/') + 1);
  }

  function depthOf(node: string): number {
    return node.split('/').length - 1;
  }
</script>

<aside class="dressing-panel">
  <header class="dressing-header">
    <span class="dressing-venue">{setting || 'No setting'}</span>
    {#if dressing.length > 0}
      <span class="dressing-count">{dressing.length} line{dressing.length === 1 ? '' : 's'}</span>
    {/if}
  </header>

  {#if nodes.length === 0}
    <p class="dressing-empty">
      {unavailable ?? (setting
        ? `No document for ${setting} yet.`
        : 'This scene has no setting to dress.')}
    </p>
  {:else}
    <ul class="dressing-nodes">
      {#each nodes as node (node)}
        {@const state = stateOf(node)}
        <li class="dressing-node" class:selected={selected === node} class:removed={state.removed}>
          <button
            class="dressing-name"
            onclick={() => select(node)}
            title={state.position ? `Placed at ${state.position.join(' ')}` : 'Place this node in this scene'}
          >
            <span class="dressing-indent" style="width: {depthOf(node) * 10}px"></span>
            <span class="dressing-leaf" class:muted={depthOf(node) > 0}>{labelOf(node)}</span>
            {#if state.removed}<span class="dressing-flag">removed</span>{/if}
            {#if state.hidden}<span class="dressing-flag">hidden</span>{/if}
            {#if state.shown}<span class="dressing-flag">shown</span>{/if}
          </button>
          <div class="dressing-actions">
            {#if state.hidden || state.shown}
              <button class="dressing-action active" onclick={() => clear('visibility', node)} title="Clear this scene's visibility line">✕</button>
            {:else}
              <button class="dressing-action" onclick={() => onchange({ op: 'hide', node })} title="Not in this scene">hide</button>
            {/if}
            {#if state.removed}
              <button class="dressing-action active" onclick={() => clear('gone', node)} title="Clear the removal">✕</button>
            {:else}
              <button class="dressing-action" onclick={() => onchange({ op: 'remove', node })} title="Take it out of this scene">remove</button>
            {/if}
          </div>
        </li>

        {#if selected === node}
          <li class="dressing-detail">
            <div class="dressing-row">
              <span class="dressing-label">At</span>
              <input class="dressing-num" type="number" step="0.1" bind:value={px} aria-label="x" />
              <input class="dressing-num" type="number" step="0.1" bind:value={py} aria-label="y" />
              <input class="dressing-num" type="number" step="0.1" bind:value={pz} aria-label="z" />
              <button class="dressing-action" onclick={() => onchange({ op: 'move', node, position: [px, py, pz] })} title="Place it here for this scene, in the venue's own space">place</button>
              {#if state.position}
                <button class="dressing-action" onclick={() => clear('position', node)} title="Clear the placement">✕</button>
              {/if}
            </div>
            <div class="dressing-row">
              <button
                class="dressing-action"
                class:active={state.shown}
                onclick={() => (state.shown ? clear('visibility', node) : onchange({ op: 'show', node }))}
                title="Say it is visible here, even if the venue's own document hides it"
              >show anyway</button>
            </div>
          </li>
        {/if}
      {/each}
    </ul>
  {/if}
</aside>

<style>
  .dressing-panel {
    display: flex;
    flex-direction: column;
    min-height: 0;
    height: 100%;
    background: #16162c;
  }

  .dressing-header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px;
    border-bottom: 1px solid #2a2a4a;
  }

  .dressing-venue {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #8888cc;
  }

  .dressing-count {
    font-size: 11px;
    color: #5555a0;
  }

  .dressing-empty {
    margin: 0;
    padding: 8px 12px;
    font-size: 12px;
    font-style: italic;
    color: #5555a0;
  }

  .dressing-nodes {
    list-style: none;
    margin: 0;
    padding: 4px 0 12px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .dressing-node {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 2px 10px 2px 6px;
  }
  .dressing-node.selected { background: #1e1e40; }
  .dressing-node.removed .dressing-leaf { text-decoration: line-through; }

  .dressing-name {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
    padding: 3px 4px;
    background: none;
    border: none;
    color: #c0c0e0;
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }
  .dressing-name:hover { color: #e8e8ff; }

  .dressing-indent { flex: none; }
  .dressing-leaf { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .dressing-leaf.muted { color: #8a8ac0; }

  .dressing-flag {
    flex: none;
    padding: 0 4px;
    border-radius: 3px;
    background: #2a2a4a;
    color: #9a9ad8;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .dressing-actions { display: flex; gap: 4px; flex: none; }

  .dressing-action {
    padding: 2px 6px;
    background: #1e1e40;
    border: 1px solid #3a3a6a;
    border-radius: 3px;
    color: #c0c0e0;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .dressing-action:hover { background: #28285a; }
  .dressing-action.active { border-color: #6a6aa8; color: #e8e8ff; }

  .dressing-detail {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 4px 10px 8px 24px;
    background: #1a1a38;
  }

  .dressing-row { display: flex; align-items: center; gap: 4px; }

  .dressing-label {
    font-size: 11px;
    color: #5555a0;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .dressing-num {
    width: 48px;
    padding: 2px 4px;
    background: #12122a;
    border: 1px solid #3a3a6a;
    border-radius: 3px;
    color: #c0c0e0;
    font-family: inherit;
    font-size: 11px;
  }
</style>

