<script lang="ts">
  /**
   * SCR-2: the primary authoring surface — a plain <textarea> over sigil-
   * tokenized script text (see sigilScript.ts), with inline caret-positioned
   * autocomplete for every closed-set field across all three sigils (`@`
   * actor, `>` actor/verb/side-or-mark, `#` INT/EXT). Open fields (dialogue
   * text, scene setting, time-of-day, hold duration) get no popup — they are
   * free text by design, never blocked.
   *
   * Caret position is computed via the "mirror div" technique: an offscreen
   * div replicates the textarea's font/padding/wrapping exactly, holds the
   * text up to the active token's start, and a trailing marker span's
   * bounding rect gives the pixel position to anchor the popup at.
   */
  import {
    findActiveSigilToken,
    applySigilCompletion,
    filterOptions,
    sigilFieldOptions,
    type ActiveSigilToken,
    type SigilChar,
  } from '../../core/treatment/sigilAutocomplete.js';

  interface Props {
    value?: string;
    cast: string[];
    placeholder?: string;
    onchange?: (value: string) => void;
  }

  let {
    value = $bindable(''),
    cast,
    placeholder = '',
    onchange,
  }: Props = $props();

  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let mirrorEl: HTMLDivElement | undefined = $state();
  let markerEl: HTMLSpanElement | undefined = $state();

  let popupOpen = $state(false);
  let popupOptions = $state<string[]>([]);
  let activeIdx = $state(0);
  let popupX = $state(0);
  let popupY = $state(0);

  // The token currently driving the popup — recomputed on every input/selection change.
  let currentToken = $state<ActiveSigilToken | null>(null);

  // Whether committing this field should append a trailing space so typing
  // continues straight into the next field on the line (e.g. actor -> verb).
  // The final field on a line (dialogue speaker cue, or the last action arg)
  // gets no trailing space — Enter naturally starts the next line instead.
  function appendSpaceAfter(sigil: SigilChar, tokenIndex: number): boolean {
    if (sigil === '>') return tokenIndex === 0 || tokenIndex === 1;
    if (sigil === '#') return tokenIndex === 0;
    return false;
  }

  function refreshToken() {
    if (!textareaEl) return;
    const cursor = textareaEl.selectionStart;
    const token = findActiveSigilToken(value, cursor);
    currentToken = token;

    if (token) {
      const field = sigilFieldOptions(token.sigil, token.tokenIndex, token.priorTokens, cast);
      if (field.kind === 'closed') {
        popupOptions = filterOptions(field.options, token.query);
        activeIdx = 0;
        if (popupOptions.length > 0) {
          popupOpen = true;
          positionPopup(token.queryStart);
          return;
        }
      }
    }
    popupOpen = false;
  }

  function positionPopup(offset: number) {
    if (!textareaEl || !mirrorEl || !markerEl) return;
    // Mirror the textarea's box exactly, then measure where the marker lands.
    const style = getComputedStyle(textareaEl);
    for (const prop of [
      'boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
      'letterSpacing', 'padding', 'border', 'whiteSpace', 'wordWrap', 'overflowWrap',
    ] as const) {
      mirrorEl.style.setProperty(cssPropName(prop), style.getPropertyValue(cssPropName(prop)));
    }
    mirrorEl.style.whiteSpace = 'pre-wrap';
    mirrorEl.style.wordWrap = 'break-word';

    const before = value.slice(0, offset);
    mirrorEl.textContent = '';
    mirrorEl.appendChild(document.createTextNode(before));
    markerEl.textContent = '\u200b'; // zero-width marker
    mirrorEl.appendChild(markerEl);
    mirrorEl.appendChild(document.createTextNode(value.slice(offset)));

    const taRect = textareaEl.getBoundingClientRect();
    const markerRect = markerEl.getBoundingClientRect();
    const mirrorRect = mirrorEl.getBoundingClientRect();

    popupX = taRect.left + (markerRect.left - mirrorRect.left) - textareaEl.scrollLeft;
    popupY = taRect.top + (markerRect.top - mirrorRect.top) - textareaEl.scrollTop
      + (markerRect.height || parseFloat(getComputedStyle(textareaEl).lineHeight) || 16);
  }

  function cssPropName(camel: string): string {
    return camel.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
  }

  function commit(completion: string) {
    if (!currentToken || !textareaEl) return;
    const suffix = appendSpaceAfter(currentToken.sigil, currentToken.tokenIndex) ? ' ' : '';
    const result = applySigilCompletion(value, currentToken, completion + suffix);
    value = result.text;
    onchange?.(value);
    popupOpen = false;
    // Restore focus + caret after Svelte updates the DOM value.
    queueMicrotask(() => {
      textareaEl?.focus();
      textareaEl?.setSelectionRange(result.cursor, result.cursor);
      refreshToken();
    });
  }

  function handleInput() {
    onchange?.(value);
    refreshToken();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!popupOpen) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, popupOptions.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter' || e.key === 'Tab') {
      if (popupOptions[activeIdx]) { e.preventDefault(); commit(popupOptions[activeIdx]); }
    } else if (e.key === 'Escape') {
      popupOpen = false;
    }
  }

  function handleSelectionChange() {
    refreshToken();
  }
</script>

<div class="sigil-textarea-wrap">
  <textarea
    bind:this={textareaEl}
    bind:value
    {placeholder}
    class="sigil-textarea"
    spellcheck="false"
    oninput={handleInput}
    onkeydown={handleKeydown}
    onclick={handleSelectionChange}
    onkeyup={handleSelectionChange}
    onblur={() => { popupOpen = false; }}
  ></textarea>

  <div bind:this={mirrorEl} class="sigil-mirror" aria-hidden="true">
    <span bind:this={markerEl}></span>
  </div>

  {#if popupOpen && popupOptions.length > 0}
    <div class="sigil-popup" style:left="{popupX}px" style:top="{popupY}px">
      {#each popupOptions as opt, i}
        <button
          type="button"
          class="sigil-popup-option"
          class:active={i === activeIdx}
          onmousedown={(e) => { e.preventDefault(); commit(opt); }}
        >{opt}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .sigil-textarea-wrap {
    position: relative;
    width: 100%;
    height: 100%;
  }

  .sigil-textarea {
    width: 100%;
    height: 100%;
    min-height: 200px;
    background: #0f0f0f;
    color: #ddd;
    border: 1px solid #2a2a2a;
    border-radius: 4px;
    padding: 8px 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 13px;
    line-height: 1.5;
    resize: none;
    outline: none;
  }

  .sigil-textarea:focus {
    border-color: #4a9eff;
  }

  /* Positioned off-screen; used purely for caret-position measurement. */
  .sigil-mirror {
    position: absolute;
    top: 0;
    left: 0;
    visibility: hidden;
    pointer-events: none;
    z-index: -1;
  }

  .sigil-popup {
    position: fixed;
    z-index: 100;
    min-width: 120px;
    max-height: 160px;
    overflow-y: auto;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 4px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    padding: 2px;
  }

  .sigil-popup-option {
    background: none;
    border: none;
    color: #ccc;
    text-align: left;
    padding: 4px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: nowrap;
  }

  .sigil-popup-option:hover,
  .sigil-popup-option.active {
    background: #2a4a6a;
    color: #eee;
  }
</style>
