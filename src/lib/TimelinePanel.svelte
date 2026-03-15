<script lang="ts">
  import type { StoredActor } from '../core/storage/types.js';
  import type { ActorBlock, LightBlock, CameraBlock, SetPieceBlock } from '../core/domain/types.js';
  import type { LightConfig, SetPiece } from '../core/domain/types.js';

  interface Props {
    actors: StoredActor[];
    actorBlocks: { block: ActorBlock; index: number }[];
    lightBlocks?: { block: LightBlock; index: number }[];
    cameraBlocks?: { block: CameraBlock; index: number }[];
    setPieceBlocks?: { block: SetPieceBlock; index: number }[];
    lights?: LightConfig[];
    setPieces?: SetPiece[];
    sceneDuration: number;
    currentPosition: number;
    discoveredClips?: Record<string, string[]>;
    selectedBlockIndex?: number | null;
    focusedActorId?: string | null;
    speechSegments?: { index: number; actorId: string; startTime: number; endTime: number; text: string }[];
    onspeechmove?: (segIndex: number, newStartTime: number) => void;
    onblockselect?: (index: number | null) => void;
    onaddblock?: (actorId: string, startTime: number, endTime: number) => void;
    onupdateblock?: (index: number, patch: Partial<Omit<ActorBlock, 'type'>>) => void;
    onremoveblock?: (index: number) => void;
    onaddlightblock?: (lightId: string, startTime: number, endTime: number) => void;
    onupdatelightblock?: (index: number, patch: Partial<Omit<LightBlock, 'type'>>) => void;
    onremovelightblock?: (index: number) => void;
    onaddcamerablock?: (startTime: number, endTime: number) => void;
    onupdatecamerablock?: (index: number, patch: Partial<Omit<CameraBlock, 'type'>>) => void;
    onremovecamerablock?: (index: number) => void;
    onaddsetpieceblock?: (targetId: string, startTime: number, endTime: number) => void;
    onupdatesetpieceblock?: (index: number, patch: Partial<Omit<SetPieceBlock, 'type'>>) => void;
    onremovesetpieceblock?: (index: number) => void;
  }

  let {
    actors,
    actorBlocks,
    lightBlocks       = [],
    cameraBlocks      = [],
    setPieceBlocks    = [],
    lights            = [],
    setPieces         = [],
    sceneDuration,
    currentPosition,
    discoveredClips   = {},
    selectedBlockIndex = null,
    focusedActorId    = null,
    speechSegments    = [],
    onspeechmove,
    onblockselect,
    onaddblock,
    onupdateblock,
    onremoveblock,
    onaddlightblock,
    onupdatelightblock,
    onremovelightblock,
    onaddcamerablock,
    onupdatecamerablock,
    onremovecamerablock,
    onaddsetpieceblock,
    onupdatesetpieceblock,
    onremovesetpieceblock,
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

  type BlockKind = 'actor' | 'light' | 'camera' | 'setPiece';

  interface DragState {
    blockIndex: number;
    kind: BlockKind;
    mode: 'move' | 'resize-left' | 'resize-right';
    startX: number;
    origStart: number;
    origEnd: number;
  }

  let drag = $state<DragState | null>(null);
  let previewTimes = $state<{ startTime: number; endTime: number } | null>(null);

  function blockEffective(blockIndex: number, block: { startTime: number; endTime: number }) {
    if (drag?.blockIndex === blockIndex && previewTimes) return previewTimes;
    return block;
  }

  function startDrag(
    e: PointerEvent,
    entry: { block: { startTime: number; endTime: number }; index: number },
    kind: BlockKind,
    mode: DragState['mode'],
  ) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    drag = {
      blockIndex: entry.index,
      kind,
      mode,
      startX: e.clientX,
      origStart: entry.block.startTime,
      origEnd: entry.block.endTime,
    };
    previewTimes = { startTime: entry.block.startTime, endTime: entry.block.endTime };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    if (speechDrag) {
      const dt = xt(e.clientX - speechDrag.startX);
      speechDrag.previewStart = Math.max(0, speechDrag.origStart + dt);
    } else if (drag) {
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
    } else if (drawState) {
      const rect = drawState.trackEl.getBoundingClientRect();
      drawState.currentTime = Math.max(0, xt(e.clientX - rect.left));
    }
  }

  function onpointerup(e: PointerEvent) {
    if (speechDrag) {
      if (Math.abs(e.clientX - speechDrag.startX) > 2) {
        onspeechmove?.(speechDrag.segIndex, parseFloat(speechDrag.previewStart.toFixed(2)));
      }
      speechDrag = null;
      return;
    }
    if (drag) {
      const moved = Math.abs(e.clientX - drag.startX) > 4;
      if (moved && previewTimes) {
        const patch = {
          startTime: parseFloat(previewTimes.startTime.toFixed(2)),
          endTime:   parseFloat(previewTimes.endTime.toFixed(2)),
        };
        if      (drag.kind === 'actor')    onupdateblock?.(drag.blockIndex, patch);
        else if (drag.kind === 'light')    onupdatelightblock?.(drag.blockIndex, patch);
        else if (drag.kind === 'camera')   onupdatecamerablock?.(drag.blockIndex, patch);
        else if (drag.kind === 'setPiece') onupdatesetpieceblock?.(drag.blockIndex, patch);
        // Keep the block selected so the Stage panel stays in sync and the
        // actor remains highlighted in the viewport after a move/resize.
        onblockselect?.(drag.blockIndex);
      } else {
        onblockselect?.(selectedBlockIndex === drag.blockIndex ? null : drag.blockIndex);
      }
      drag = null;
      previewTimes = null;
    } else if (drawState) {
      const rect = drawState.trackEl.getBoundingClientRect();
      const endT = Math.max(0, xt(e.clientX - rect.left));
      const minT = Math.min(drawState.startTime, endT);
      const maxT = Math.max(drawState.startTime, endT);
      if (maxT - minT > 0.05) {
        const s = parseFloat(minT.toFixed(2));
        const en = parseFloat(maxT.toFixed(2));
        if      (drawState.kind === 'actor')    onaddblock?.(drawState.trackId, s, en);
        else if (drawState.kind === 'light')    onaddlightblock?.(drawState.trackId, s, en);
        else if (drawState.kind === 'camera')   onaddcamerablock?.(s, en);
        else if (drawState.kind === 'setPiece') onaddsetpieceblock?.(drawState.trackId, s, en);
      }
      drawState = null;
    }
  }

  // ── Draw gesture (pointer-down on empty track → ghost block → release → onadd*block) ──

  interface DrawState {
    kind: BlockKind;
    trackId: string;  // actorId, lightId, SetPiece.name, or '' for camera
    trackEl: HTMLElement;
    startTime: number;
    currentTime: number;
  }
  let drawState = $state<DrawState | null>(null);

  // ── Speech block drag ───────────────────────────────────────────────────────

  interface SpeechDragState {
    segIndex: number;
    startX: number;
    origStart: number;
    previewStart: number;
    duration: number;
  }
  let speechDrag = $state<SpeechDragState | null>(null);

  function startSpeechDrag(e: PointerEvent, seg: { index: number; startTime: number; endTime: number }) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    speechDrag = {
      segIndex: seg.index,
      startX: e.clientX,
      origStart: seg.startTime,
      previewStart: seg.startTime,
      duration: seg.endTime - seg.startTime,
    };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }

  function startDraw(e: PointerEvent, kind: BlockKind, trackId: string) {
    if (e.button !== 0 || drag) return;
    const trackEl = e.currentTarget as HTMLElement;
    const rect = trackEl.getBoundingClientRect();
    const t = Math.max(0, xt(e.clientX - rect.left));
    drawState = { kind, trackId, trackEl, startTime: t, currentTime: t };
    trackEl.setPointerCapture(e.pointerId);
    e.preventDefault();
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
      <div class="tl-row tl-actor-row" class:tl-row-focused={focusedActorId === actor.id}>
        <div class="tl-label" style:width="{LABEL_W}px">
          <span class="tl-label-text">{actor.role}</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="tl-track" onpointerdown={(e) => startDraw(e, 'actor', actor.id)}>
          <!-- Playhead needle -->
          <div class="tl-playhead" style:left="{tx(currentPosition)}px"></div>
          <!-- Blocks -->
          {#each aBlocks as entry}
            {@const eff = blockEffective(entry.index, entry.block)}
            {@const left = tx(eff.startTime)}
            {@const w = Math.max(tx(eff.endTime) - tx(eff.startTime), 4)}
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              class="tl-block"
              class:tl-block-sel={selectedBlockIndex === entry.index}
              style:left="{left}px"
              style:width="{w}px"
              style:background={c}
              role="button"
              tabindex="0"
              onpointerdown={(e) => startDrag(e, entry, 'actor', 'move')}
              onkeydown={(e) => {
                if (e.key === 'Enter') onblockselect?.(selectedBlockIndex === entry.index ? null : entry.index);
                if (e.key === 'Delete' || e.key === 'Backspace') { onblockselect?.(null); onremoveblock?.(entry.index); }
              }}
            >
              <div
                class="tl-resize tl-resize-l"
                onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'actor', 'resize-left'); }}
              ></div>
              <span class="tl-block-label">{entry.block.clip ?? '—'}</span>
              <div
                class="tl-resize tl-resize-r"
                onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'actor', 'resize-right'); }}
              ></div>
            </div>
          {/each}
          <!-- Ghost block during draw gesture -->
          {#if drawState?.kind === 'actor' && drawState.trackId === actor.id}
            {@const gs = Math.min(drawState.startTime, drawState.currentTime)}
            {@const ge = Math.max(drawState.startTime, drawState.currentTime)}
            <div
              class="tl-ghost-block"
              style:left="{tx(gs)}px"
              style:width="{Math.max(tx(ge) - tx(gs), 2)}px"
            ></div>
          {/if}
        </div>
      </div>
      <!-- Speech segments row (shown when the actor has any dialogue) -->
      {@const aSegs = speechSegments.filter((s) => s.actorId === actor.id)}
      {#if aSegs.length > 0}
        <div class="tl-row tl-speech-row">
          <div class="tl-label" style:width="{LABEL_W}px">
            <span class="tl-label-text tl-speech-label">speech</span>
          </div>
          <div class="tl-track tl-speech-track">
            {#each aSegs as seg}
              {@const effStart = (speechDrag?.segIndex === seg.index) ? speechDrag.previewStart : seg.startTime}
              {@const dur = seg.endTime - seg.startTime}
              {@const left = tx(effStart)}
              {@const w = Math.max(tx(effStart + dur) - tx(effStart), 6)}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div
                class="tl-speech-block"
                class:tl-speech-block-dragging={speechDrag?.segIndex === seg.index}
                style:left="{left}px"
                style:width="{w}px"
                title="{seg.text}"
                role="button"
                tabindex="-1"
                onpointerdown={(e) => startSpeechDrag(e, seg)}
              >
                <span class="tl-speech-block-label">{seg.text}</span>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    {/each}

    <!-- Camera row (always present) -->
    {@const hasCamBlocks = cameraBlocks.length > 0}
    <div class="tl-row tl-camera-row" class:tl-row-stub={!hasCamBlocks}>
      <div class="tl-label" style:width="{LABEL_W}px">
        <span class="tl-label-text tl-camera-label">Camera</span>
      </div>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="tl-track" onpointerdown={(e) => startDraw(e, 'camera', '')}>
        <div class="tl-playhead" style:left="{tx(currentPosition)}px"></div>
        {#each cameraBlocks as entry}
          {@const eff = blockEffective(entry.index, entry.block)}
          {@const left = tx(eff.startTime)}
          {@const w = Math.max(tx(eff.endTime) - tx(eff.startTime), 4)}
          <!-- svelte-ignore a11y_interactive_supports_focus -->
          <div
            class="tl-block tl-block-camera"
            class:tl-block-sel={selectedBlockIndex === entry.index}
            style:left="{left}px"
            style:width="{w}px"
            role="button"
            tabindex="0"
            onpointerdown={(e) => startDrag(e, entry, 'camera', 'move')}
            onkeydown={(e) => {
              if (e.key === 'Enter') onblockselect?.(selectedBlockIndex === entry.index ? null : entry.index);
              if (e.key === 'Delete' || e.key === 'Backspace') { onblockselect?.(null); onremovecamerablock?.(entry.index); }
            }}
          >
            <div class="tl-resize tl-resize-l" onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'camera', 'resize-left'); }}></div>
            <span class="tl-block-label">move</span>
            <div class="tl-resize tl-resize-r" onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'camera', 'resize-right'); }}></div>
          </div>
        {/each}
        {#if drawState?.kind === 'camera'}
          {@const gs = Math.min(drawState.startTime, drawState.currentTime)}
          {@const ge = Math.max(drawState.startTime, drawState.currentTime)}
          <div class="tl-ghost-block" style:left="{tx(gs)}px" style:width="{Math.max(tx(ge) - tx(gs), 2)}px"></div>
        {/if}
      </div>
    </div>

    <!-- Per-light rows -->
    {#each lights as light}
      {@const lBlocks = lightBlocks.filter((e) => e.block.lightId === light.id)}
      {@const hasBlocks = lBlocks.length > 0}
      <div class="tl-row tl-light-row" class:tl-row-stub={!hasBlocks}>
        <div class="tl-label" style:width="{LABEL_W}px">
          <span class="tl-label-text tl-light-label">{light.id}</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="tl-track" onpointerdown={(e) => startDraw(e, 'light', light.id)}>
          <div class="tl-playhead" style:left="{tx(currentPosition)}px"></div>
          {#each lBlocks as entry}
            {@const eff = blockEffective(entry.index, entry.block)}
            {@const left = tx(eff.startTime)}
            {@const w = Math.max(tx(eff.endTime) - tx(eff.startTime), 4)}
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              class="tl-block tl-block-light"
              class:tl-block-sel={selectedBlockIndex === entry.index}
              style:left="{left}px"
              style:width="{w}px"
              role="button"
              tabindex="0"
              onpointerdown={(e) => startDrag(e, entry, 'light', 'move')}
              onkeydown={(e) => {
                if (e.key === 'Enter') onblockselect?.(selectedBlockIndex === entry.index ? null : entry.index);
                if (e.key === 'Delete' || e.key === 'Backspace') { onblockselect?.(null); onremovelightblock?.(entry.index); }
              }}
            >
              <div class="tl-resize tl-resize-l" onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'light', 'resize-left'); }}></div>
              <span class="tl-block-label">fade</span>
              <div class="tl-resize tl-resize-r" onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'light', 'resize-right'); }}></div>
            </div>
          {/each}
          {#if drawState?.kind === 'light' && drawState.trackId === light.id}
            {@const gs = Math.min(drawState.startTime, drawState.currentTime)}
            {@const ge = Math.max(drawState.startTime, drawState.currentTime)}
            <div class="tl-ghost-block" style:left="{tx(gs)}px" style:width="{Math.max(tx(ge) - tx(gs), 2)}px"></div>
          {/if}
        </div>
      </div>
    {/each}

    <!-- Per-set-piece rows -->
    {#each setPieces as piece}
      {@const pBlocks = setPieceBlocks.filter((e) => e.block.targetId === piece.name)}
      {@const hasBlocks = pBlocks.length > 0}
      <div class="tl-row tl-setpiece-row" class:tl-row-stub={!hasBlocks}>
        <div class="tl-label" style:width="{LABEL_W}px">
          <span class="tl-label-text tl-setpiece-label">{piece.name}</span>
        </div>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div class="tl-track" onpointerdown={(e) => startDraw(e, 'setPiece', piece.name)}>
          <div class="tl-playhead" style:left="{tx(currentPosition)}px"></div>
          {#each pBlocks as entry}
            {@const eff = blockEffective(entry.index, entry.block)}
            {@const left = tx(eff.startTime)}
            {@const w = Math.max(tx(eff.endTime) - tx(eff.startTime), 4)}
            <!-- svelte-ignore a11y_interactive_supports_focus -->
            <div
              class="tl-block tl-block-setpiece"
              class:tl-block-sel={selectedBlockIndex === entry.index}
              style:left="{left}px"
              style:width="{w}px"
              role="button"
              tabindex="0"
              onpointerdown={(e) => startDrag(e, entry, 'setPiece', 'move')}
              onkeydown={(e) => {
                if (e.key === 'Enter') onblockselect?.(selectedBlockIndex === entry.index ? null : entry.index);
                if (e.key === 'Delete' || e.key === 'Backspace') { onblockselect?.(null); onremovesetpieceblock?.(entry.index); }
              }}
            >
              <div class="tl-resize tl-resize-l" onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'setPiece', 'resize-left'); }}></div>
              <span class="tl-block-label">
                {entry.block.endPosition ? 'pos' : ''}{entry.block.endPosition && entry.block.endRotation ? '+' : ''}{entry.block.endRotation ? 'rot' : ''}{!entry.block.endPosition && !entry.block.endRotation ? 'move' : ''}
              </span>
              <div class="tl-resize tl-resize-r" onpointerdown={(e) => { e.stopPropagation(); startDrag(e, entry, 'setPiece', 'resize-right'); }}></div>
            </div>
          {/each}
          {#if drawState?.kind === 'setPiece' && drawState.trackId === piece.name}
            {@const gs = Math.min(drawState.startTime, drawState.currentTime)}
            {@const ge = Math.max(drawState.startTime, drawState.currentTime)}
            <div class="tl-ghost-block" style:left="{tx(gs)}px" style:width="{Math.max(tx(ge) - tx(gs), 2)}px"></div>
          {/if}
        </div>
      </div>
    {/each}
  {/if}
</div>

<style>
  .tl-root {
    display: flex;
    flex-direction: column;
    background: #141414;
    user-select: none;
    overflow-x: auto;
    overflow-y: auto;
    max-height: 210px;
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
    touch-action: none;
  }

  .tl-ruler-row .tl-track {
    height: 20px;
  }

  .tl-actor-row .tl-track {
    height: 30px;
    cursor: crosshair;
  }

  /* ── Focused actor row ────────────────────────────── */

  .tl-row-focused .tl-label {
    background: #1e2535;
  }

  .tl-row-focused .tl-track {
    background: rgba(74, 158, 255, 0.04);
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

  /* ── Ghost draw block ─────────────────────────────── */

  .tl-ghost-block {
    position: absolute;
    top: 3px;
    bottom: 3px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px dashed rgba(255, 255, 255, 0.35);
    border-radius: 3px;
    pointer-events: none;
    z-index: 1;
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

  /* ── Stub rows (no blocks yet) ───────────────────── */

  .tl-row-stub .tl-track {
    background: repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 4px,
      rgba(255,255,255,0.015) 4px,
      rgba(255,255,255,0.015) 8px
    );
    cursor: crosshair;
  }

  .tl-row-stub .tl-label-text {
    opacity: 0.45;
  }

  /* ── Camera / Light / Set-piece rows ─────────────── */

  .tl-camera-row .tl-track,
  .tl-light-row .tl-track,
  .tl-setpiece-row .tl-track {
    height: 28px;
    cursor: crosshair;
  }

  .tl-camera-label  { color: #d4a017; }
  .tl-light-label   { color: #e8973a; }
  .tl-setpiece-label { color: #3aacba; }

  .tl-block-camera   { background: #c9900e !important; }
  .tl-block-light    { background: #c07030 !important; }
  .tl-block-setpiece { background: #267a88 !important; }

  /* ── Speech rows ──────────────────────────────────── */

  .tl-speech-row .tl-track {
    height: 18px;
    cursor: default;
  }

  .tl-speech-label {
    color: #9b7fcc;
    font-style: italic;
  }

  .tl-speech-block {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border-radius: 2px;
    background: rgba(140, 90, 210, 0.55);
    border: 1px solid rgba(180, 130, 255, 0.35);
    overflow: hidden;
    cursor: grab;
    z-index: 2;
    min-width: 6px;
    transition: opacity 0.08s;
  }

  .tl-speech-block:hover {
    background: rgba(160, 110, 230, 0.7);
    border-color: rgba(200, 160, 255, 0.6);
  }

  .tl-speech-block-dragging {
    cursor: grabbing;
    opacity: 0.85;
    z-index: 10;
  }

  .tl-speech-block-label {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.8);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    padding: 0 3px;
    line-height: 14px;
    display: block;
  }
</style>
