<script lang="ts">
  import type { SelectedEntity } from './types.js';
  import type { StoredActor } from '../core/storage/types.js';
  import type { ActorBlock, LightBlock, CameraBlock, SetPieceBlock, LightConfig, SetPiece } from '../core/domain/types.js';
  import type { StoredScene } from '../core/storage/types.js';
  import type { Command } from '../core/document/Command.js';
  import { UpdateActorBlockCommand, RemoveActorBlockCommand, UpdateLightBlockCommand, RemoveLightBlockCommand, UpdateCameraBlockCommand, RemoveCameraBlockCommand, UpdateSetPieceBlockCommand, RemoveSetPieceBlockCommand, UpdateSceneLightCommand } from '../core/document/commands.js';

  interface Props {
    selectedEntity: SelectedEntity;
    actors: StoredActor[];
    actorBlocks: { block: ActorBlock; index: number }[];
    lightBlocks: { block: LightBlock; index: number }[];
    cameraBlocks: { block: CameraBlock; index: number }[];
    setPieceBlocks: { block: SetPieceBlock; index: number }[];
    lights: LightConfig[];
    setPieces: SetPiece[];
    activeScene: StoredScene | undefined | null;
    discoveredClips: Record<string, string[]>;
    designMode: boolean;
    execute: (cmd: Command) => void;
    oncapturecamerablock?: () => void;
    oncaptureinitialcamera?: () => void;
    onremoveblock?: (index: number) => void;
  }

  let {
    selectedEntity,
    actors,
    actorBlocks,
    lightBlocks,
    cameraBlocks,
    setPieceBlocks,
    lights,
    setPieces,
    activeScene,
    discoveredClips,
    designMode,
    execute,
    oncapturecamerablock,
    oncaptureinitialcamera,
    onremoveblock,
  }: Props = $props();

  // Convenience look-ups
  const entity = $derived(selectedEntity);

  const selActorBlock = $derived(
    entity?.kind === 'actor-block'
      ? (actorBlocks.find((e) => e.index === entity.blockIndex) ?? null)
      : null
  );
  const selLightBlock = $derived(
    entity?.kind === 'light-block'
      ? (lightBlocks.find((e) => e.index === entity.blockIndex) ?? null)
      : null
  );
  const selCameraBlock = $derived(
    entity?.kind === 'camera-block'
      ? (cameraBlocks.find((e) => e.index === entity.blockIndex) ?? null)
      : null
  );
  const selSetPieceBlock = $derived(
    entity?.kind === 'setpiece-block'
      ? (setPieceBlocks.find((e) => e.index === entity.blockIndex) ?? null)
      : null
  );

  const selLightInitial = $derived(
    entity?.kind === 'light-initial'
      ? (lights.find((l) => l.id === entity.lightId) ?? null)
      : null
  );

  const selActor = $derived(
    entity?.kind === 'actor-initial' || entity?.kind === 'actor-block'
      ? (actors.find((a) => a.id === (entity as { actorId: string }).actorId) ?? null)
      : null
  );
</script>

{#if entity === null}
  <p class="prop-placeholder">Select an item to edit its properties.</p>

{:else if entity.kind === 'actor-initial'}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Spawn — {selActor?.role ?? entity.actorId}</span>
    </div>
    <p class="prop-hint">Drag the actor in the viewport to set its starting position.</p>
  </div>

{:else if entity.kind === 'actor-block' && selActorBlock}
  {@const blkClips = discoveredClips[entity.actorId] ?? []}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Block — {selActor?.role ?? entity.actorId}</span>
      <button class="icon-btn danger" onclick={() => onremoveblock?.(entity.blockIndex)} title="Remove block">✕</button>
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-blk-clip">Clip</label>
      {#if blkClips.length > 0}
        <select
          id="pp-blk-clip"
          class="actor-char-select"
          value={selActorBlock.block.clip ?? ''}
          onchange={(e) => execute(new UpdateActorBlockCommand(entity.blockIndex, { clip: e.currentTarget.value || undefined }))}
        >
          <option value="">— idle —</option>
          {#each blkClips as cl}<option>{cl}</option>{/each}
        </select>
      {:else}
        <input
          id="pp-blk-clip"
          class="rename-input"
          placeholder="clip name"
          value={selActorBlock.block.clip ?? ''}
          onchange={(e) => execute(new UpdateActorBlockCommand(entity.blockIndex, { clip: e.currentTarget.value.trim() || undefined }))}
        />
      {/if}
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-blk-start">Start</label>
      <input id="pp-blk-start" class="anim-number" type="number" step="0.1" min="0"
        value={selActorBlock.block.startTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateActorBlockCommand(entity.blockIndex, { startTime: n })); }}
      />
      <label class="anim-label" for="pp-blk-end">End</label>
      <input id="pp-blk-end" class="anim-number" type="number" step="0.1" min="0"
        value={selActorBlock.block.endTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateActorBlockCommand(entity.blockIndex, { endTime: n })); }}
      />
    </div>
    <div class="anim-row">
      <span class="anim-label">End pos</span>
      {#if selActorBlock.block.endPosition}
        <span class="anim-label blk-pos">{selActorBlock.block.endPosition.map((v) => v.toFixed(1)).join(', ')}</span>
        <button class="icon-btn" onclick={() => execute(new UpdateActorBlockCommand(entity.blockIndex, { endPosition: undefined }))} title="Clear end position">✕</button>
      {:else}
        <span class="anim-label blk-pos blk-pos-none">stationary · drag to set</span>
      {/if}
    </div>
  </div>

{:else if entity.kind === 'setpiece-initial'}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Spawn — {entity.setPieceId}</span>
    </div>
    <p class="prop-hint">Drag the set piece in the viewport to set its starting position.</p>
  </div>

{:else if entity.kind === 'setpiece-block' && selSetPieceBlock}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Block — {entity.setPieceId}</span>
      <button class="icon-btn danger" onclick={() => onremoveblock?.(entity.blockIndex)} title="Remove block">✕</button>
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-spblk-start">Start</label>
      <input id="pp-spblk-start" class="anim-number" type="number" step="0.1" min="0"
        value={selSetPieceBlock.block.startTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateSetPieceBlockCommand(entity.blockIndex, { startTime: n })); }}
      />
      <label class="anim-label" for="pp-spblk-end">End</label>
      <input id="pp-spblk-end" class="anim-number" type="number" step="0.1" min="0"
        value={selSetPieceBlock.block.endTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateSetPieceBlockCommand(entity.blockIndex, { endTime: n })); }}
      />
    </div>
    <div class="anim-row">
      <span class="anim-label">End pos</span>
      {#if selSetPieceBlock.block.endPosition}
        <span class="anim-label blk-pos">{selSetPieceBlock.block.endPosition.map((v) => v.toFixed(1)).join(', ')}</span>
        <button class="icon-btn" onclick={() => execute(new UpdateSetPieceBlockCommand(entity.blockIndex, { endPosition: undefined }))} title="Clear end position">✕</button>
      {:else}
        <span class="anim-label blk-pos blk-pos-none">stationary · drag to set</span>
      {/if}
    </div>
    <div class="anim-row">
      <span class="anim-label">End rotation</span>
      {#if selSetPieceBlock.block.endRotation}
        <span class="anim-label blk-pos">{selSetPieceBlock.block.endRotation.map((v) => (v * 180 / Math.PI).toFixed(1)).join('°, ')}°</span>
        <button class="icon-btn" onclick={() => execute(new UpdateSetPieceBlockCommand(entity.blockIndex, { endRotation: undefined }))} title="Clear end rotation">✕</button>
      {:else}
        <span class="anim-label blk-pos blk-pos-none">no rotation · drag to set</span>
      {/if}
    </div>
  </div>

{:else if entity.kind === 'light-initial' && selLightInitial}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Light — {entity.lightId}</span>
      <span class="prop-type-badge">{selLightInitial.type}</span>
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-light-int">Intensity</label>
      <input
        id="pp-light-int"
        class="anim-number"
        type="number"
        step="0.1"
        min="0"
        value={selLightInitial.intensity}
        onchange={(e) => {
          const n = parseFloat(e.currentTarget.value);
          if (!isNaN(n)) execute(new UpdateSceneLightCommand(entity.lightId, { intensity: n }));
        }}
      />
    </div>
  </div>

{:else if entity.kind === 'light-block' && selLightBlock}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Block — {entity.lightId}</span>
      <button class="icon-btn danger" onclick={() => onremoveblock?.(entity.blockIndex)} title="Remove block">✕</button>
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-lblk-start">Start</label>
      <input id="pp-lblk-start" class="anim-number" type="number" step="0.1" min="0"
        value={selLightBlock.block.startTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateLightBlockCommand(entity.blockIndex, { startTime: n })); }}
      />
      <label class="anim-label" for="pp-lblk-end">End</label>
      <input id="pp-lblk-end" class="anim-number" type="number" step="0.1" min="0"
        value={selLightBlock.block.endTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateLightBlockCommand(entity.blockIndex, { endTime: n })); }}
      />
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-lblk-endint">End intensity</label>
      <input id="pp-lblk-endint" class="anim-number" type="number" step="0.1" min="0"
        placeholder="unchanged"
        value={selLightBlock.block.endIntensity ?? ''}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); execute(new UpdateLightBlockCommand(entity.blockIndex, { endIntensity: isNaN(n) ? undefined : n })); }}
      />
    </div>
  </div>

{:else if entity.kind === 'camera-initial'}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Camera — initial view</span>
    </div>
    {#if activeScene}
      <div class="anim-row">
        <span class="anim-label">Position</span>
        <span class="anim-label blk-pos">{(activeScene.camera.position ?? []).map((v: number) => v.toFixed(1)).join(', ')}</span>
      </div>
    {/if}
    {#if designMode}
      <div class="anim-row">
        <button class="new-btn" onclick={oncaptureinitialcamera} title="Capture current design camera as scene opening view">⊕ Capture view</button>
      </div>
    {:else}
      <p class="prop-hint">Enable design mode to capture the opening camera position.</p>
    {/if}
  </div>

{:else if entity.kind === 'camera-block' && selCameraBlock}
  <div class="prop-section">
    <div class="prop-header">
      <span class="prop-label">Block — Camera</span>
      <button class="icon-btn danger" onclick={() => onremoveblock?.(entity.blockIndex)} title="Remove block">✕</button>
    </div>
    <div class="anim-row">
      <label class="anim-label" for="pp-cblk-start">Start</label>
      <input id="pp-cblk-start" class="anim-number" type="number" step="0.1" min="0"
        value={selCameraBlock.block.startTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateCameraBlockCommand(entity.blockIndex, { startTime: n })); }}
      />
      <label class="anim-label" for="pp-cblk-end">End</label>
      <input id="pp-cblk-end" class="anim-number" type="number" step="0.1" min="0"
        value={selCameraBlock.block.endTime}
        onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) execute(new UpdateCameraBlockCommand(entity.blockIndex, { endTime: n })); }}
      />
    </div>
    <div class="anim-row">
      <span class="anim-label">End pos</span>
      {#if selCameraBlock.block.endPosition}
        <span class="anim-label blk-pos">{selCameraBlock.block.endPosition.map((v) => v.toFixed(1)).join(', ')}</span>
        <button class="icon-btn" onclick={() => execute(new UpdateCameraBlockCommand(entity.blockIndex, { endPosition: undefined }))} title="Clear">✕</button>
      {:else}
        <span class="anim-label blk-pos blk-pos-none">not set · orbit to capture</span>
      {/if}
    </div>
    <div class="anim-row">
      <span class="anim-label">End look-at</span>
      {#if selCameraBlock.block.endLookAt}
        <span class="anim-label blk-pos">{selCameraBlock.block.endLookAt.map((v) => v.toFixed(1)).join(', ')}</span>
        <button class="icon-btn" onclick={() => execute(new UpdateCameraBlockCommand(entity.blockIndex, { endLookAt: undefined }))} title="Clear">✕</button>
      {:else}
        <span class="anim-label blk-pos blk-pos-none">not set · orbit to capture</span>
      {/if}
    </div>
    {#if designMode}
      <div class="anim-row">
        <button class="new-btn" onclick={oncapturecamerablock} title="Capture current design camera as block end state">⊕ Capture end</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .prop-placeholder {
    padding: 8px 12px;
    font-size: 11px;
    color: #555;
    font-style: italic;
    margin: 0;
  }

  .prop-hint {
    padding: 4px 0 2px;
    font-size: 11px;
    color: #666;
    font-style: italic;
    margin: 0;
  }

  .prop-section {
    padding: 6px 10px 8px;
  }

  .prop-header {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 6px;
  }

  .prop-label {
    font-size: 11px;
    font-weight: 600;
    color: #bbb;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prop-type-badge {
    font-size: 10px;
    color: #777;
    background: #2a2a2a;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 1px 5px;
  }

  /* Reuse the same row / label / number styles from the parent page */
  .anim-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 5px;
    flex-wrap: wrap;
  }

  .anim-label {
    font-size: 11px;
    color: #888;
    white-space: nowrap;
  }

  .anim-number {
    width: 54px;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 3px;
    color: #ddd;
    font-size: 11px;
    padding: 2px 4px;
    text-align: right;
  }

  .blk-pos {
    font-family: monospace;
    font-size: 10px;
  }

  .blk-pos-none {
    color: #555;
    font-style: italic;
  }

  .new-btn {
    font-size: 11px;
    padding: 3px 8px;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 3px;
    color: #ccc;
    cursor: pointer;
  }

  .new-btn:hover {
    background: #333;
    color: #fff;
  }

  .icon-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 11px;
    color: #777;
    padding: 2px 4px;
    border-radius: 3px;
  }

  .icon-btn:hover { color: #ccc; background: #2a2a2a; }
  .icon-btn.danger:hover { color: #ff6b6b; }

  .actor-char-select {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 3px;
    color: #ddd;
    font-size: 11px;
    padding: 2px 4px;
    min-width: 0;
  }

  .rename-input {
    flex: 1;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 3px;
    color: #ddd;
    font-size: 11px;
    padding: 2px 6px;
    min-width: 0;
  }
</style>
