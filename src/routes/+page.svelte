<script lang="ts">
  import { onMount } from 'svelte';
  import Presenter from '$lib/Presenter.svelte';
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import { exampleModel1 } from '$lib/exampleModel1';
  import { exampleModel2 } from '$lib/exampleModel2';
  import { exampleModel3 } from '$lib/exampleModel3';
  import { exampleModel4 } from '$lib/exampleModel4';
  import { flyIntoRoomExample } from '$lib/FlyIntoRoomExample';
  import { exampleProduction1Scene } from '$lib/exampleProduction1';
  import { twoRobotsScene } from '$lib/twoRobotsScene';
  import type { Model } from '$lib/Model';
  import ScriptEditor from '$lib/sandbox/ScriptEditor.svelte';
  import { scriptToModel } from '$lib/sandbox/scriptToModel';
  import type { ScriptLine } from '$lib/sandbox/types';
  import { ProductionStore } from '../core/storage/ProductionStore.js';
  import type { StoredProduction } from '../core/storage/types.js';

  let presenter: Presenter | undefined = $state();
  let isMobile = $state(false);
  let sidebarOpen = $state(false);

  // Productions
  let productions = $state<StoredProduction[]>(ProductionStore.list());
  let activeProductionId = $state<string | null>(null);
  let script = $state<ScriptLine[]>([]);
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');

  // Examples (read-only, no persistence)
  const examples: { id: string; label: string; model: Model }[] = [
    { id: 'model1',  label: 'Camera rotation',  model: exampleModel1 },
    { id: 'model2',  label: 'Ball position',     model: exampleModel2 },
    { id: 'model3',  label: 'Robot rotation',    model: exampleModel3 },
    { id: 'model4',  label: 'Robot quaternion',  model: exampleModel4 },
    { id: 'fly',     label: 'Fly into room',     model: flyIntoRoomExample },
    { id: 'prod1',   label: 'Bouncing ball',     model: exampleProduction1Scene },
    { id: 'robots',  label: 'Two robots',        model: twoRobotsScene },
  ];
  let activeExampleId = $state<string | null>(null);

  // Auto-save: whenever script changes while a production is active, persist it.
  $effect(() => {
    if (activeProductionId !== null) {
      const current = ProductionStore.get(activeProductionId);
      if (current) {
        ProductionStore.save({ ...current, script, modifiedAt: Date.now() });
      }
    }
  });

  function newProduction() {
    const prod = ProductionStore.create('Untitled Production');
    productions = ProductionStore.list();
    loadProduction(prod);
  }

  function loadProduction(prod: StoredProduction) {
    script = [...prod.script];
    activeProductionId = prod.id;
    activeExampleId = null;
    presenter?.loadModel(scriptToModel(script));
    sidebarOpen = false;
  }

  function reloadSandbox() {
    presenter?.loadModel(scriptToModel(script));
  }

  function deleteProduction(id: string) {
    ProductionStore.delete(id);
    productions = ProductionStore.list();
    if (activeProductionId === id) {
      activeProductionId = null;
    }
  }

  function duplicateProduction(prod: StoredProduction) {
    const copy = ProductionStore.create(`${prod.name} (copy)`);
    ProductionStore.save({ ...copy, script: [...prod.script], modifiedAt: Date.now() });
    productions = ProductionStore.list();
  }

  function startRename(id: string) {
    renameValue = productions.find((p) => p.id === id)?.name ?? '';
    renamingId = id;
  }

  /** Svelte action: focus an input and select all text when it mounts. */
  function focusAndSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  function commitRename(id: string) {
    const prod = productions.find((p) => p.id === id);
    if (prod && renameValue.trim()) {
      ProductionStore.save({ ...prod, name: renameValue.trim(), modifiedAt: Date.now() });
      productions = ProductionStore.list();
    }
    renamingId = null;
  }

  function loadExample(id: string, model: Model) {
    presenter?.loadModel(model);
    activeExampleId = id;
    activeProductionId = null;
    sidebarOpen = false;
  }

  onMount(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isMobile = mq.matches;
    const onChange = (e: MediaQueryListEvent) => { isMobile = e.matches; };
    mq.addEventListener('change', onChange);

    // Migrate legacy single-script localStorage key from pre-Phase-1
    const LEGACY_KEY = 'directionally_sandbox_script';
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && productions.length === 0) {
      try {
        const legacyScript: ScriptLine[] = JSON.parse(legacy);
        if (legacyScript.length > 0) {
          const migrated = ProductionStore.create('My Production');
          ProductionStore.save({ ...migrated, script: legacyScript, modifiedAt: Date.now() });
          productions = ProductionStore.list();
        }
      } catch { /* ignore malformed data */ }
      localStorage.removeItem(LEGACY_KEY);
    }

    return () => mq.removeEventListener('change', onChange);
  });
</script>

<!-- Single layout: Splitpanes always present; left pane collapses to 0 on mobile.
     Presenter lives only in the right pane so it is never destroyed at the breakpoint. -->
<div class="app">
  {#if isMobile}
    <button
      class="hamburger"
      onclick={() => (sidebarOpen = !sidebarOpen)}
      aria-label="Toggle scenes panel"
      aria-expanded={sidebarOpen}
    >☰</button>

    {#if sidebarOpen}
      <button class="drawer-backdrop" onclick={() => (sidebarOpen = false)} aria-label="Close scenes panel" tabindex="-1"></button>
    {/if}

    <div class="drawer" class:open={sidebarOpen} aria-hidden={!sidebarOpen}>
      <aside class="sidebar">
        {#each productions as prod}
          <button
            class="scene-btn"
            class:active={activeProductionId === prod.id}
            onclick={() => loadProduction(prod)}
          >{prod.name}</button>
        {/each}
        {#each examples as ex}
          <button
            class="scene-btn"
            class:active={activeExampleId === ex.id}
            onclick={() => loadExample(ex.id, ex.model)}
          >{ex.label}</button>
        {/each}
      </aside>
    </div>
  {/if}

  <Splitpanes theme="directionally">
    <!-- Left pane: collapsed to 0 on mobile, normal sidebar on desktop -->
    <Pane
      size={isMobile ? 0 : 18}
      minSize={isMobile ? 0 : 10}
      maxSize={isMobile ? 0 : 40}
    >
      {#if !isMobile}
        <aside class="sidebar">
          <!-- Productions -->
          <section class="sidebar-section">
            <div class="section-heading-row">
              <h2 class="section-heading borderless">Productions</h2>
              <button class="new-btn" onclick={newProduction} title="New production">+ New</button>
            </div>
            {#if productions.length === 0}
              <p class="empty-hint">No productions yet.</p>
            {:else}
              <ul class="scene-list">
                {#each productions as prod}
                  <li class="production-row">
                    {#if renamingId === prod.id}
                      <form
                        class="rename-form"
                        onsubmit={(e) => { e.preventDefault(); commitRename(prod.id); }}
                      >
                        <input
                          class="rename-input"
                          bind:value={renameValue}
                          onblur={() => commitRename(prod.id)}
                          onkeydown={(e) => e.key === 'Escape' && (renamingId = null)}
                          use:focusAndSelect
                          aria-label="Production name"
                        />
                      </form>
                    {:else}
                      <button
                        class="scene-btn"
                        class:active={activeProductionId === prod.id}
                        onclick={() => loadProduction(prod)}
                      >{prod.name}</button>
                      <div class="prod-actions">
                        <button class="icon-btn" onclick={() => startRename(prod.id)} title="Rename">✎</button>
                        <button class="icon-btn" onclick={() => duplicateProduction(prod)} title="Duplicate">⎘</button>
                        <button class="icon-btn danger" onclick={() => deleteProduction(prod.id)} title="Delete">✕</button>
                      </div>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </section>

          <!-- Examples (collapsible, read-only) -->
          <section class="sidebar-section examples-section">
            <details>
              <summary class="section-heading">Examples</summary>
              <ul class="scene-list">
                {#each examples as ex}
                  <li>
                    <button
                      class="scene-btn"
                      class:active={activeExampleId === ex.id}
                      onclick={() => loadExample(ex.id, ex.model)}
                    >{ex.label}</button>
                  </li>
                {/each}
              </ul>
            </details>
          </section>

          <!-- Inspector: expands with script editor when a production is active -->
          <section class="sidebar-section inspector-section" class:expanded={activeProductionId !== null}>
            <h2 class="section-heading">Inspector</h2>
            <div class="inspector-content">
              {#if activeProductionId !== null}
                <ScriptEditor bind:script onreload={reloadSandbox} />
              {:else}
                <p class="inspector-placeholder">Select or create a production.</p>
              {/if}
            </div>
          </section>
        </aside>
      {/if}
    </Pane>

    <!-- Right pane: Presenter is always mounted here, never destroyed -->
    <Pane minSize={30}>
      <div class="main-pane">
        <Presenter bind:this={presenter} />
      </div>
    </Pane>
  </Splitpanes>
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative; /* anchor for mobile overlay: hamburger, drawer, backdrop */
  }

  .hamburger {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 100;
    background: rgba(26, 26, 26, 0.85);
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    padding: 6px 10px;
    font-size: 18px;
    cursor: pointer;
    line-height: 1;
    min-width: 44px;
    min-height: 44px;
  }

  .drawer-backdrop {
    position: absolute;
    inset: 0;
    z-index: 90;
    background: rgba(0, 0, 0, 0.5);
    border: none;
    padding: 0;
    cursor: default;
  }

  .drawer {
    position: absolute;
    top: 0;
    left: 0;
    height: 100%;
    width: 75%;
    max-width: 280px;
    z-index: 95;
    transform: translateX(-100%);
    transition: transform 0.2s ease;
  }

  .drawer.open {
    transform: translateX(0);
  }

  /* ── Splitpanes ────────────────────────────────── */

  :global(.splitpanes.directionally) {
    flex: 1;
    height: 100%;
  }

  :global(.splitpanes.directionally .splitpanes__pane) {
    overflow: hidden;
  }

  :global(.splitpanes.directionally .splitpanes__splitter) {
    width: 4px;
    background: #2a2a2a;
    transition: background 0.15s;
  }

  :global(.splitpanes.directionally .splitpanes__splitter:hover),
  :global(.splitpanes.directionally .splitpanes__splitter:active) {
    background: #4a9eff;
  }

  /* ── Shared sidebar ──────────────────────────── */

  .sidebar {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    overflow: hidden;
  }

  .sidebar-section {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .section-heading {
    margin: 0;
    padding: 8px 12px 6px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    border-bottom: 1px solid #2a2a2a;
    user-select: none;
  }

  .section-heading.borderless {
    border-bottom: none;
    padding-bottom: 0;
  }

  .section-heading-row {
    display: flex;
    align-items: center;
    padding: 8px 12px 6px;
    border-bottom: 1px solid #2a2a2a;
    gap: 6px;
  }

  .section-heading-row .section-heading {
    flex: 1;
    padding: 0;
    border: none;
  }

  .new-btn {
    background: none;
    border: 1px solid #333;
    border-radius: 3px;
    color: #4a9eff;
    font-size: 11px;
    padding: 2px 7px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.1s, border-color 0.1s;
  }

  .new-btn:hover {
    background: #1e2d3d;
    border-color: #4a9eff;
  }

  .production-row {
    display: flex;
    align-items: center;
  }

  .production-row .scene-btn {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prod-actions {
    display: flex;
    opacity: 0;
    transition: opacity 0.1s;
    flex-shrink: 0;
  }

  .production-row:hover .prod-actions,
  .production-row:focus-within .prod-actions {
    opacity: 1;
  }

  .icon-btn {
    background: none;
    border: none;
    color: #555;
    cursor: pointer;
    padding: 4px 5px;
    font-size: 12px;
    border-radius: 3px;
    line-height: 1;
    transition: color 0.1s, background 0.1s;
  }

  .icon-btn:hover {
    color: #bbb;
    background: #2a2a2a;
  }

  .icon-btn.danger:hover {
    color: #e06c75;
    background: #2a1a1a;
  }

  .rename-form {
    flex: 1;
    display: flex;
    padding: 2px 6px;
  }

  .rename-input {
    flex: 1;
    background: #1e1e1e;
    color: #d4d4d4;
    border: 1px solid #4a9eff;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 13px;
    outline: none;
  }

  .empty-hint {
    padding: 10px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }

  .examples-section details > summary.section-heading {
    list-style: none;
    cursor: pointer;
  }

  .examples-section details > summary.section-heading::-webkit-details-marker {
    display: none;
  }

  .examples-section details > summary.section-heading::before {
    content: '▶';
    font-size: 8px;
    margin-right: 6px;
    display: inline-block;
    transition: transform 0.15s;
  }

  .examples-section details[open] > summary.section-heading::before {
    transform: rotate(90deg);
  }

  .scene-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
    flex: 1;
  }

  .scene-btn {
    width: 100%;
    text-align: left;
    padding: 6px 14px;
    background: none;
    color: #bbb;
    border: none;
    border-left: 2px solid transparent;
    cursor: pointer;
    font-size: 13px;
    transition: background 0.1s, color 0.1s;
  }

  .scene-btn:hover {
    background: #252525;
    color: #fff;
  }

  .scene-btn.active {
    color: #4a9eff;
    border-left-color: #4a9eff;
    background: #1e2d3d;
  }

  .inspector-section {
    flex: 0 0 auto;
    border-top: 1px solid #2a2a2a;
    display: flex;
    flex-direction: column;
  }

  .examples-section {
    flex: 0 0 auto;
    border-top: 1px solid #2a2a2a;
  }

  .inspector-placeholder {
    padding: 8px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }

  .inspector-content {
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  .inspector-section.expanded {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .inspector-section.expanded .inspector-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .inspector-section.expanded :global(.script-editor) {
    flex: 1;
    min-height: 0;
  }

  .main-pane {
    height: 100%;
    width: 100%;
  }
</style>
