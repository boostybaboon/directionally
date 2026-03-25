<script lang="ts">
  import type { VoiceBackend } from './types.js';

  interface Props {
    isPlaying: boolean;
    isToneSetup: boolean;
    currentPosition: number;
    sceneDuration: number;
    voiceBackend: VoiceBackend;
    sliderValue?: number;
    isSliderDragging?: boolean;
    onplaypause: () => void;
    onrewind: () => void;
    onsliderinput: (time: number) => void;
    onsliderpointerdown: () => void;
    onsliderpointerup: () => void;
    onupdateduration?: (value: string) => void;
  }

  let {
    isPlaying,
    isToneSetup,
    currentPosition,
    sceneDuration,
    voiceBackend,
    sliderValue = $bindable(0),
    isSliderDragging = $bindable(false),
    onplaypause,
    onrewind,
    onsliderinput,
    onsliderpointerdown,
    onsliderpointerup,
    onupdateduration,
  }: Props = $props();

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
  }

  /** Parse "M:SS.S" or a plain number string → seconds, or null on failure. */
  function parseFormattedTime(s: string): number | null {
    const trimmed = s.trim();
    if (trimmed === '') return null;
    if (!trimmed.includes(':')) {
      const n = parseFloat(trimmed);
      return isNaN(n) ? null : n;
    }
    const colon = trimmed.indexOf(':');
    const m = parseFloat(trimmed.slice(0, colon));
    const sec = parseFloat(trimmed.slice(colon + 1));
    if (isNaN(m) || isNaN(sec)) return null;
    return m * 60 + sec;
  }
</script>

<div id="transport">
  <button class="transport-btn" onclick={onrewind} disabled={!isToneSetup} title="Rewind to start">⏮</button>
  <button class="transport-btn" onclick={onplaypause} disabled={!isToneSetup} title={isPlaying ? 'Pause' : 'Play'}>
    {isPlaying ? '⏸' : '▶'}
  </button>
  <span id="timecode">
    {formatTime(currentPosition)} /
    {#if onupdateduration}
      <input
        class="timecode-dur-input"
        type="text"
        size={Math.max(6, formatTime(sceneDuration || 16).length)}
        value={formatTime(sceneDuration || 16)}
        onchange={(e) => {
          const secs = parseFormattedTime(e.currentTarget.value);
          if (secs !== null) {
            onupdateduration(String(secs));
          } else {
            e.currentTarget.value = formatTime(sceneDuration || 16);
          }
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') { e.currentTarget.value = formatTime(sceneDuration || 16); e.currentTarget.blur(); }
        }}
        aria-label="Scene duration"
        title="Click to edit scene duration"
      />
    {:else}
      {formatTime(sceneDuration || 16)}
    {/if}
  </span>
  {#if voiceBackend !== 'idle'}
    <span
      id="voices-status"
      class="voices-{voiceBackend}"
      title={voiceBackend === 'browser' ? 'Kokoro unavailable on this CPU/browser. Using browser voices.' : undefined}
    >{voiceBackend === 'loading'
        ? 'Synthesising…'
        : voiceBackend === 'espeak'
        ? '🔊 eSpeak'
        : voiceBackend === 'kokoro'
        ? '🔊 Kokoro'
        : '🔊 Browser voices'}</span>
  {/if}
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

  .timecode-dur-input {
    font-family: monospace;
    font-size: 13px;
    color: #ccc;
    background: transparent;
    border: none;
    border-bottom: 1px solid #444;
    outline: none;
    padding: 0;
    cursor: text;
  }

  .timecode-dur-input:hover {
    border-bottom-color: #888;
  }

  .timecode-dur-input:focus {
    color: #fff;
    border-bottom-color: #4a9eff;
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

  }
</style>
