<script lang="ts">
  import type { VoiceMode, VoiceBackend } from './types.js';

  interface Props {
    isPlaying: boolean;
    isToneSetup: boolean;
    currentPosition: number;
    sceneDuration: number;
    voiceBackend: VoiceBackend;
    voiceMode?: VoiceMode;
    bubbleScale?: number;
    sliderValue?: number;
    isSliderDragging?: boolean;
    onplaypause: () => void;
    onrewind: () => void;
    onsliderinput: (time: number) => void;
    onsliderpointerdown: () => void;
    onsliderpointerup: () => void;
  }

  let {
    isPlaying,
    isToneSetup,
    currentPosition,
    sceneDuration,
    voiceBackend,
    voiceMode = $bindable('espeak' as VoiceMode),
    bubbleScale = $bindable(1),
    sliderValue = $bindable(0),
    isSliderDragging = $bindable(false),
    onplaypause,
    onrewind,
    onsliderinput,
    onsliderpointerdown,
    onsliderpointerup,
  }: Props = $props();

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
  }
</script>

<div id="transport">
  <button class="transport-btn" onclick={onrewind} disabled={!isToneSetup} title="Rewind to start">⏮</button>
  <button class="transport-btn" onclick={onplaypause} disabled={!isToneSetup} title={isPlaying ? 'Pause' : 'Play'}>
    {isPlaying ? '⏸' : '▶'}
  </button>
  <span id="timecode">{formatTime(currentPosition)} / {formatTime(sceneDuration || 16)}</span>
  {#if voiceBackend !== 'idle'}
    <span
      id="voices-status"
      class="voices-{voiceBackend}"
      title={voiceBackend === 'browser' && voiceMode === 'kokoro' ? 'Kokoro unavailable on this CPU/browser. Using browser voices.' : undefined}
    >{voiceBackend === 'loading'
        ? 'Synthesising…'
        : voiceBackend === 'espeak'
        ? '🔊 eSpeak'
        : voiceBackend === 'kokoro'
        ? '🔊 Kokoro'
        : '🔊 Browser voices'}</span>
  {/if}
  <select
    id="voice-mode"
    bind:value={voiceMode}
    title="Voice synthesis mode"
    disabled={!isToneSetup}
  >
    <option value="espeak">eSpeak (fast)</option>
    <option value="web-speech">Browser voices</option>
    <option value="kokoro">Kokoro (~92 MB)</option>
  </select>
  <label id="bubble-scale-label" title="Speech bubble size">
    💬
    <input
      id="bubble-scale-input"
      type="range"
      min="0.1"
      max="1.5"
      step="0.05"
      bind:value={bubbleScale}
    />
    <span class="bubble-scale-value">{bubbleScale.toFixed(1)}</span>
  </label>
  <input
    id="transport-slider"
    type="range"
    min="0"
    max={sceneDuration || 16}
    step="0.01"
    bind:value={sliderValue}
    oninput={(e) => onsliderinput(parseFloat((e.target as HTMLInputElement).value))}
    onpointerdown={onsliderpointerdown}
    onpointerup={onsliderpointerup}
    disabled={!isToneSetup}
  />
</div>

<style>
  #transport {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #1a1a1a;
    user-select: none;
  }

  .transport-btn {
    font-size: 16px;
    padding: 4px 10px;
    background: #2a2a2a;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
  }

  .transport-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .transport-btn:not(:disabled):hover {
    background: #3a3a3a;
  }

  #timecode {
    font-family: monospace;
    font-size: 13px;
    color: #aaa;
    white-space: nowrap;
    min-width: 12ch;
  }

  #transport-slider {
    flex: 1;
    min-width: 0;
    accent-color: #4a9eff;
  }

  #voices-status {
    font-size: 12px;
    white-space: nowrap;
    border-radius: 3px;
    padding: 2px 6px;
  }

  .voices-loading { color: #888; font-style: italic; }
  .voices-kokoro  { color: #4caf7d; background: #1a2e22; }
  .voices-browser { color: #c8a84b; background: #2a2318; cursor: help; }

  @media (max-width: 640px) {
    #transport {
      flex-wrap: wrap;
      gap: 8px;
    }

    .transport-btn {
      min-width: 44px;
      min-height: 44px;
      padding: 8px 14px;
      font-size: 18px;
    }

    #timecode {
      order: 2;
    }

    #transport-slider {
      flex-basis: 100%;
      order: 3;
    }

    #bubble-scale-label {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #888;
      font-size: 14px;
      white-space: nowrap;
      cursor: default;
      user-select: none;
    }

    #bubble-scale-input {
      width: 64px;
      accent-color: #4a9eff;
      cursor: pointer;
    }

    .bubble-scale-value {
      min-width: 2.2ch;
      text-align: right;
      font-size: 11px;
      color: #666;
      font-variant-numeric: tabular-nums;
    }
  }
</style>
