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

  let presenter: Presenter | undefined = $state();
  let activeModel = $state('');
  let isMobile = $state(false);
  let sidebarOpen = $state(false);

  onMount(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isMobile = mq.matches;
    const onChange = (e: MediaQueryListEvent) => { isMobile = e.matches; };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  });

  const scenes = [
    { id: 'model1', label: 'Camera rot',    model: exampleModel1 },
    { id: 'model2', label: 'Ball pos',      model: exampleModel2 },
    { id: 'model3', label: 'Robot rot',     model: exampleModel3 },
    { id: 'model4', label: 'Robot quat',    model: exampleModel4 },
    { id: 'fly',    label: 'Fly Into Room', model: flyIntoRoomExample },
    { id: 'prod1',  label: 'Ball (domain)', model: exampleProduction1Scene },
    { id: 'robots', label: 'Two Robots',    model: twoRobotsScene },
  ];

  function loadScene(id: string, model: typeof exampleModel1) {
    presenter?.loadModel(model);
    activeModel = id;
    sidebarOpen = false;
  }
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
        {#each scenes as scene}
          <button
            class="scene-btn"
            class:active={activeModel === scene.id}
            onclick={() => loadScene(scene.id, scene.model)}
          >{scene.label}</button>
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
          <section class="sidebar-section">
            <h2 class="section-heading">Scenes</h2>
            <ul class="scene-list">
              {#each scenes as scene}
                <li>
                  <button
                    class="scene-btn"
                    class:active={activeModel === scene.id}
                    onclick={() => loadScene(scene.id, scene.model)}
                  >{scene.label}</button>
                </li>
              {/each}
            </ul>
          </section>

          <section class="sidebar-section inspector-section">
            <details>
              <summary class="section-heading">Inspector</summary>
              <p class="inspector-placeholder">No scene loaded.</p>
            </details>
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

  details > summary.section-heading {
    list-style: none;
    cursor: pointer;
  }

  details > summary.section-heading::-webkit-details-marker {
    display: none;
  }

  details > summary.section-heading::before {
    content: '▶';
    font-size: 8px;
    margin-right: 6px;
    display: inline-block;
    transition: transform 0.15s;
  }

  details[open] > summary.section-heading::before {
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
    margin-top: auto;
    border-top: 1px solid #2a2a2a;
  }

  .inspector-placeholder {
    padding: 8px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }

  .main-pane {
    height: 100%;
    width: 100%;
  }
</style>
