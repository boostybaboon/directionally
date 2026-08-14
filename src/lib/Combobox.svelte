<script lang="ts">
  interface Props {
    options: string[];
    value?: string;
    placeholder?: string;
    allowFreeform?: boolean;
    class?: string;
    style?: string;
    onchange?: (value: string) => void;
  }

  let {
    options,
    value = $bindable(''),
    placeholder = '',
    allowFreeform = true,
    class: cls = '',
    style = '',
    onchange,
    ...restProps
  }: Props = $props();

  let open = $state(false);
  let activeIdx = $state(0);
  let committed = $state(value);

  const filtered = $derived(
    options.filter((o) => o.toLowerCase().includes(value.toLowerCase()))
  );

  $effect(() => { void filtered.length; activeIdx = 0; });

  function select(opt: string) {
    value = opt;
    committed = opt;
    open = false;
    activeIdx = 0;
    onchange?.(opt);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      open = true;
      return;
    }
    if (!open) return;

    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, filtered.length - 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) select(filtered[activeIdx]); }
    else if (e.key === 'Escape') { open = false; }
    else if (e.key === 'Tab') {
      if (filtered[activeIdx]) select(filtered[activeIdx]);
      else open = false;
    }
  }

  function handleBlur() {
    open = false;
    if (!allowFreeform && !options.includes(value)) {
      value = committed;
    }
  }

  function handleFocus() {
    committed = value;
    if (options.length > 0) open = true;
  }
</script>

<div class="combobox {cls}" style={style}>
  <input
    class="combobox-input"
    bind:value
    {placeholder}
    spellcheck="false"
    onfocus={handleFocus}
    onblur={handleBlur}
    onkeydown={handleKeydown}
    oninput={() => { open = true; activeIdx = 0; }}
  />
  {#if open && filtered.length > 0}
    <div class="combobox-popup">
      {#each filtered as opt, i}
        <button
          class="combobox-option"
          class:active={i === activeIdx}
          type="button"
          onmousedown={(e) => { e.preventDefault(); select(opt); }}
        >{opt}</button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .combobox {
    position: relative;
    display: inline-flex;
  }

  .combobox-input {
    background: transparent;
    border: none;
    border-bottom: 1px solid #2a2a2a;
    color: #ddd;
    padding: 1px 4px;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    outline: none;
    border-radius: 0;
  }

  .combobox-input:focus {
    border-bottom-color: #4a9eff;
  }

  .combobox-popup {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 50;
    min-width: 100%;
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

  .combobox-option {
    background: none;
    border: none;
    color: #ccc;
    text-align: left;
    padding: 4px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    white-space: nowrap;
  }

  .combobox-option:hover,
  .combobox-option.active {
    background: #2a4a6a;
    color: #eee;
  }
</style>
