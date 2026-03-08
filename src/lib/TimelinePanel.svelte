<script lang="ts">
  import type { StoredActor } from '../core/storage/types.js';
  import type { ActorBlock, Vec3 } from '../core/domain/types.js';

  interface Props {
    actors: StoredActor[];
    actorBlocks: { block: ActorBlock; index: number }[];
    sceneDuration: number;
    currentPosition: number;
    discoveredClips?: Record<string, string[]>;
    onupdateblock?: (index: number, patch: Partial<Omit<ActorBlock, 'type'>>) => void;
    onremoveblock?: (index: number) => void;
  }

  let {
    actors,
    actorBlocks,
    sceneDuration,
    currentPosition,
    discoveredClips = {},
    onupdateblock,
    onremoveblock,
  }: Props = $props();

  const LABEL_W = 72;

  // Display time range: scene duration + 2s padding, minimum 12s
  const viewDuration = $derived(Math.max(sceneDuration > 0 ? sceneDuration + 2 : 12, 2));

  // Track area pixel width — measured from the ruler track element
  let rulerTrackEl = $state<HTMLElement | undefined>(undefined);
  let trackW = $state(300);

  $effect(() => {
    if (!rulerTrackEl) return;
    const ro = new ResizeObserver((es) => { trackW = Math.max(es[0].contentRect.width, 1); });
    ro.observe(rulerTrackEl);
    return () => ro.disconnect();
  });

  function tx(t: number) { return (t / viewDuration) * trackW; }
  function xt(x: number) { return (x / Math.max(trackW, 1)) * viewDuration; }

  // Ruler tick generation — picks a nice interval so there are at most ~18 ticks
  function computeTicks(dur: number): number[] {
    const NICE = [0.5, 1, 2, 5, 10, 30, 60];
    const iv = NICE.find((n) => dur / n <= 18) ?? 60;
    const out: number[] = [];
    for (let t = 0; t <= dur + iv * 0.001; t += iv) out.push(parseFloat(t.toFixed(3)));
    return out;
  }
  const ticks = $derived(computeTicks(viewDuration));

  // Per-actor block colours
  const COLORS = ['#4a9eff', '#ff7a5c', '#56b87a', '#c07fff', '#ffd060', '#60d0ff'];
  function actorColor(ai: number) { return COLORS[ai % COLORS.length]; }

  // ── Drag ────────────────────────────────────────────────────────────────────

  interface DragState {
    blockIndex: number;
    mode: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    origStart: number;
    origEnd: number;
  }

  let drag = $state<DragState | null>(null);
  let previewTimes = $state<{ startTime: number; endTime: number } | null>(null);

  function blockEffective(entry: { block: ActorBlock; index: number }) {
    if (drag?.blockIndex === entry.index && previewTimes) return previewTimes;
    return entry.block;
  }

  function startDrag(
    e: PointerEvent,
    entry: { block: ActorBlock; index: number },
    mode: DragState['mode'],
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag = {
      blockIndex: entry.index,
      mode,
      startX: e.clientX,
      origStart: entry.block.startTime,
      origEnd: entry.block.endTime,
    };
    previewTimes = { startTime: entry.block.startTime, endTime: entry.block.endTime };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    if (!drag) return;
    const dt = xt(e.clientX - drag.startX);
    const dur = drag.origEnd - drag.origStart;
    if (drag.mode === 'move') {
      const s = Math.max(0, drag.origStart + dt);
      previewTimes = { startTime: s, endTime: s + dur };
    } else if (drag.mode === 'resize-right') {
      previewTimes = {
        startTime: drag.origStart,
        endTime: Math.max(drag.origStart + 0.1, drag.origEnd + dt),
      };
    } else {
      const s = Math.min(drag.origEnd - 0.1, Math.max(0, drag.origStart + dt));
      previewTimes = { startTime: s, endTime: drag.origEnd };
    }
  }

  function onpointerup(e: PointerEvent) {
    if (!drag) return;
    const moved = Math.abs(e.clientX - drag.startX) > 4;
    if (moved && previewTimes) {
      onupdateblock?.(drag.blockIndex, {
        startTime: parseFloat(previewTimes.startTime.toFixed(2)),
        endTime: parseFloat(previewTimes.endTime.toFixed(2)),
      });
      selIdx = null;
    } else {
      selIdx = selIdx === drag.blockIndex ? null : drag.blockIndex;
    }
    drag = null;
    previewTimes = null;
  }

  // ── Selected block edit panel ────────────────────────────────────────────────

  let selIdx = $state<number | null>(null);
  const selEntry = $derived(
    selIdx !== null ? (actorBlocks.find((e) => e.index === selIdx) ?? null) : null,
  );

  // Edit form state — reset when selection changes
  let popClip = $state('');
  let popStart = $state(0);
  let popEnd = $state(0);
  let popShowPos = $state(false);
  let popSPx = $state(''); let popSPy = $state(''); let popSPz = $state('');
  let popEPx = $state(''); let popEPy = $state(''); let popEPz = $state('');
  let popSFx = $state(''); let popSFy = $state(''); let popSFz = $state('');
  let popEFx = $state(''); let popEFy = $state(''); let popEFz = $state('');

  $effect(() => {
    if (!selEntry) return;
    const b = selEntry.block;
    popClip = b.clip ?? '';
    popStart = b.startTime;
    popEnd = b.endTime;
    popShowPos = !!(b.startPosition || b.endPosition || b.startFacing || b.endFacing);
    function v(p: Vec3 | undefined): [string, string, string] {
      return p ? [String(p[0]), String(p[1]), String(p[2])] : ['', '', ''];
    }
    const sp = v(b.startPosition); popSPx = sp[0]; popSPy = sp[1]; popSPz = sp[2];
    const ep = v(b.endPosition);   popEPx = ep[0]; popEPy = ep[1]; popEPz = ep[2];
    const sf = v(b.startFacing);   popSFx = sf[0]; popSFy = sf[1]; popSFz = sf[2];
    const ef = v(b.endFacing);     popEFx = ef[0]; popEFy = ef[1]; popEFz = ef[2];
  });

  // Returns a Vec3 if any component is filled, undefined if all are empty
  function parseVec(x: string, y: string, z: string): Vec3 | undefined {
    if (!x && !y && !z) return undefined;
    return [parseFloat(x) || 0, parseFloat(y) || 0, parseFloat(z) || 0];
  }

  function commitPop() {
    if (selIdx === null) return;
    onupdateblock?.(selIdx, {
      startTime: popStart,
      endTime: popEnd,
      clip: popClip.trim() || undefined,
      startPosition: parseVec(popSPx, popSPy, popSPz),
      endPosition:   parseVec(popEPx, popEPy, popEPz),
      startFacing:   parseVec(popSFx, popSFy, popSFz),
      endFacing:     parseVec(popEFx, popEFy, popEFz),
    });
    selIdx = null;
  }

  function removeSel() {
    if (selIdx === null) return;
    onremoveblock?.(selIdx);
    selIdx = null;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tl-root" {onpointermove} {onpointerup}>
  {#if actors.length === 0}
    <p class="tl-empty">No cast. Add actors in the Stage tab to use the timeline.</p>
  {:else}
    <!-- Ruler row -->
    <div class="tl-row tl-ruler-row">
      <div class="tl-label" style:width="{LABEL_W}px"></div>
      <div class="tl-track" bind:this={rulerTrackEl}>
        {#each ticks as t}
          <div class="tl-tick" style:left="{tx(t)}px">
            <span class="tl-tick-label">{t}s</span>
          </div>
        {/each}
      </div>
    </div>

    <!-- Per-actor block rows -->
    {#each actors as actor, ai}
      {@const aBlocks = actorBlocks.filter((e) => e.block.actorId === actor.id)}
      {@const c = actorColor(ai)}
      <div class="tl-row tl-actor-row">
        <div class="tl-label" style:width="{LABEL_W}px">
          <span class="tl-label-text">{actor.role}</span>
        </div>
        <div class="tl-track">
          <!-- Playhead needle -->
          <div class="tl-playhead" style:left="{tx(currentPosition)}px"></div>
          <!-- Blocks -->
          {#each aBlocks as entry}
            {@const eff = blockEffective(entry)}
            {@const left = tx(eff.startTime)}
            {@const w = Math.max(tx(eff.endTime) - tx(eff.startTime), 4)}
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              class="tl-block"
              class:tl-block-sel={selIdx === entry.index}
              style:left="{left}px"
              style:width="{w}px"
              style:background={c}
              role="button"
              tabindex="0"
              onpointerdown={(e) => startDrag(e, entry, 'move')}
              onkeydown={(e) => {
                if (e.key === 'Enter') selIdx = selIdx === entry.index ? null : entry.index;
                if (e.key === 'Delete' || e.key === 'Backspace') removeSel();
              }}
            >
              <div
                class="tl-resize tl-resize-l"
                onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'resize-left'); }}
              ></div>
              <span class="tl-block-label">{entry.block.clip ?? '—'}</span>
              <div
                class="tl-resize tl-resize-r"
                onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'resize-right'); }}
              ></div>
            </div>
          {/each}
        </div>
      </div>
    {/each}

    <!-- Edit panel — appears below the rows when a block is selected -->
    {#if selEntry}
      {@const selActor = actors.find((a) => a.id === selEntry.block.actorId)}
      {@const clips = discoveredClips[selEntry.block.actorId] ?? []}
      <div class="tl-edit">
        <div class="tl-edit-header">
          <span class="tl-edit-title">{selActor?.role ?? selEntry.block.actorId}</span>
          <button class="tl-edit-close" onclick={() => (selIdx = null)} aria-label="Close">✕</button>
        </div>
        <div class="tl-edit-body">
          <!-- Clip + timing -->
          <div class="tl-edit-row">
            <label class="tl-edit-lbl" for="tl-pop-clip">Clip</label>
            {#if clips.length > 0}
              <select id="tl-pop-clip" class="tl-edit-sel" bind:value={popClip}>
                <option value="">— idle —</option>
                {#each clips as cl}
                  <option>{cl}</option>
                {/each}
              </select>
            {:else}
              <input id="tl-pop-clip" class="tl-edit-input" placeholder="clip name" bind:value={popClip} />
            {/if}
            <label class="tl-edit-lbl tl-ml" for="tl-pop-start">Start</label>
            <input id="tl-pop-start" class="tl-edit-num" type="number" step="0.1" min="0" bind:value={popStart} />
            <label class="tl-edit-lbl tl-ml" for="tl-pop-end">End</label>
            <input id="tl-pop-end" class="tl-edit-num" type="number" step="0.1" min="0" bind:value={popEnd} />
          </div>
          <!-- Position + facing (collapsible) -->
          <details bind:open={popShowPos}>
            <summary class="tl-edit-summary">Position &amp; facing</summary>
            <div class="tl-edit-pos-grid">
              <span class="tl-edit-lbl">Start pos</span>
              <input class="tl-edit-xyz" placeholder="x" bind:value={popSPx} />
              <input class="tl-edit-xyz" placeholder="y" bind:value={popSPy} />
              <input class="tl-edit-xyz" placeholder="z" bind:value={popSPz} />
              <span class="tl-edit-lbl">End pos</span>
              <input class="tl-edit-xyz" placeholder="x" bind:value={popEPx} />
              <input class="tl-edit-xyz" placeholder="y" bind:value={popEPy} />
              <input class="tl-edit-xyz" placeholder="z" bind:value={popEPz} />
              <span class="tl-edit-lbl">Start dir</span>
              <input class="tl-edit-xyz" placeholder="x" bind:value={popSFx} />
              <input class="tl-edit-xyz" placeholder="y" bind:value={popSFy} />
              <input class="tl-edit-xyz" placeholder="z" bind:value={popSFz} />
              <span class="tl-edit-lbl">End dir</span>
              <input class="tl-edit-xyz" placeholder="x" bind:value={popEFx} />
              <input class="tl-edit-xyz" placeholder="y" bind:value={popEFy} />
              <input class="tl-edit-xyz" placeholder="z" bind:value={popEFz} />
            </div>
          </details>
          <div class="tl-edit-btns">
            <button class="tl-btn-apply" onclick={commitPop}>Apply</button>
            <button class="tl-btn-remove" onclick={removeSel}>Remove</button>
            <button class="tl-btn-cancel" onclick={() => (selIdx = null)}>Cancel</button>
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .tl-root {
    display: flex;
    flex-direction: column;
    background: #141414;
    user-select: none;
    overflow-x: auto;
    overflow-y: hidden;
    flex-shrink: 0;
  }

  .tl-empty {
    padding: 8px 12px;
    font-size: 11px;
    color: #555;
    font-style: italic;
    margin: 0;
  }

  /* ── Rows ─────────────────────────────────────────── */

  .tl-row {
    display: flex;
    align-items: stretch;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
  }

  .tl-label {
    display: flex;
    align-items: center;
    padding: 0 6px;
    border-right: 1px solid #2a2a2a;
    flex-shrink: 0;
    background: #1a1a1a;
    min-width: 0;
  }

  .tl-label-text {
    font-size: 11px;
    color: #888;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  .tl-track {
    flex: 1;
    position: relative;
    min-width: 0;
  }

  .tl-ruler-row .tl-track {
    height: 20px;
  }

  .tl-actor-row .tl-track {
    height: 30px;
  }

  /* ── Ruler ticks ──────────────────────────────────── */

  .tl-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #2a2a2a;
    pointer-events: none;
  }

  .tl-tick-label {
    position: absolute;
    top: 3px;
    left: 3px;
    font-size: 9px;
    color: #555;
    white-space: nowrap;
    pointer-events: none;
  }

  /* ── Playhead ─────────────────────────────────────── */

  .tl-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: #e05555;
    z-index: 3;
    pointer-events: none;
  }

  /* ── Blocks ───────────────────────────────────────── */

  .tl-block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    border-radius: 3px;
    cursor: grab;
    display: flex;
    align-items: center;
    overflow: hidden;
    opacity: 0.82;
    z-index: 2;
    transition: opacity 0.1s, outline 0.05s;
    min-width: 4px;
  }

  .tl-block:hover {
    opacity: 1;
    z-index: 4;
    outline: 1px solid rgba(255, 255, 255, 0.5);
  }

  .tl-block-sel {
    opacity: 1;
    z-index: 5;
    outline: 2px solid #fff;
  }

  .tl-block-label {
    font-size: 10px;
    color: rgba(0, 0, 0, 0.75);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    padding: 0 5px;
    pointer-events: none;
  }

  /* ── Resize handles ───────────────────────────────── */

  .tl-resize {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 6;
    flex-shrink: 0;
  }

  .tl-resize-l { left: 0; }
  .tl-resize-r { right: 0; }

  /* ── Edit panel ───────────────────────────────────── */

  .tl-edit {
    border-top: 1px solid #333;
    background: #1a1a1a;
    flex-shrink: 0;
  }

  .tl-edit-header {
    display: flex;
    align-items: center;
    padding: 4px 8px 3px;
    border-bottom: 1px solid #2a2a2a;
  }

  .tl-edit-title {
    font-size: 11px;
    font-weight: 600;
    color: #aaa;
    flex: 1;
  }

  .tl-edit-close {
    background: none;
    border: none;
    color: #555;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 5px;
    line-height: 1;
    border-radius: 3px;
  }

  .tl-edit-close:hover { color: #ccc; background: #2a2a2a; }

  .tl-edit-body {
    padding: 5px 8px 7px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .tl-edit-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
  }

  .tl-edit-lbl {
    font-size: 10px;
    color: #666;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .tl-ml { margin-left: 6px; }

  .tl-edit-sel,
  .tl-edit-input {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    color: #ccc;
    font-size: 11px;
    padding: 2px 5px;
    flex: 1;
    min-width: 0;
  }

  .tl-edit-num {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    color: #ccc;
    font-size: 11px;
    padding: 2px 4px;
    width: 52px;
    flex-shrink: 0;
  }

  .tl-edit-summary {
    font-size: 10px;
    color: #666;
    cursor: pointer;
    user-select: none;
    padding: 1px 0;
  }

  .tl-edit-pos-grid {
    display: grid;
    grid-template-columns: 52px repeat(3, 44px);
    gap: 3px;
    margin-top: 4px;
  }

  .tl-edit-xyz {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    color: #ccc;
    font-size: 11px;
    padding: 2px 3px;
    width: 44px;
    min-width: 0;
  }

  .tl-edit-btns {
    display: flex;
    gap: 6px;
    align-items: center;
    margin-top: 1px;
  }

  .tl-btn-apply {
    background: none;
    border: 1px solid #333;
    border-radius: 3px;
    color: #4a9eff;
    font-size: 11px;
    padding: 2px 10px;
    cursor: pointer;
  }

  .tl-btn-apply:hover { background: #1e2d3d; border-color: #4a9eff; }

  .tl-btn-remove {
    background: none;
    border: 1px solid #333;
    border-radius: 3px;
    color: #e06c75;
    font-size: 11px;
    padding: 2px 10px;
    cursor: pointer;
  }

  .tl-btn-remove:hover { background: #2a1a1a; border-color: #e06c75; }

  .tl-btn-cancel {
    background: none;
    border: none;
    color: #666;
    font-size: 11px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .tl-btn-cancel:hover { color: #bbb; }
</style>
