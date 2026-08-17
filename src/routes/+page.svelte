<script lang="ts">
  import { onMount } from 'svelte';
  import Presenter from '$lib/Presenter.svelte';
  import TransportBar from '$lib/TransportBar.svelte';
  import TimelinePanel from '$lib/TimelinePanel.svelte';
  import type { VoiceBackend } from '$lib/types.js';
  import { storedSceneToModel } from '../core/storage/storedSceneToModel.js';
  import { starterSceneShell } from '../core/storage/sceneBuilder.js';
  import * as OPFSCatalogueStore from '../core/storage/OPFSCatalogueStore.js';

  import { ProductionStore } from '../core/storage/ProductionStore.js';
  import { getScenes } from '../core/storage/types.js';
  import type { StoredProduction, NamedScene } from '../core/storage/types.js';
  import type { ActorBlock } from '../core/domain/types.js';
  import { renderFountain, createDefaultScriptDocument } from '../core/treatment/fountain.js';
  import type { Diagnostic, ScriptDocument } from '../core/treatment/fountain.js';
  import { compileScriptDocument } from '../core/treatment/fountainCompiler.js';
  import { tokenizeScript, renderScript, sceneIndexForLine } from '../core/treatment/sigilScript.js';
  import SigilTextarea from '$lib/script/SigilTextarea.svelte';


  /**
   * Script-first, single-view authoring shell (treatment-driven-workflow branch).
   *
   * The sigil-tokenized text buffer (`sigilText`, Track SCR) is the authoring
   * source of truth. `tokenizeScript()` derives a `ScriptDocument` from it on
   * every edit; `compileScriptDocument()` turns that into a playable production.
   * See ROADMAP.md "Data Contract" for the layer model.
   */

  const DEFAULT_DOC = createDefaultScriptDocument();
  const DEFAULT_SIGIL_TEMPLATE = '#INT STAGE DAY\n\n';

  let presenter: Presenter | undefined = $state();

  let productions = $state<StoredProduction[]>([]);
  let currentProduction = $state<StoredProduction | null>(null);
  let currentSceneId = $state('');
  let productionNameInput = $state('Untitled Production');
  let showProductionPicker = $state(false);

  // Primary authoring surface (Track SCR, SCR-2): sigil-tokenized text buffer.
  // Persisted at production level as StoredProduction.scriptSource; ScriptDocument
  // is derived from it via tokenizeScript() on every edit — never the other way round.
  let sigilText = $state('');
  let scriptDoc = $state<ScriptDocument>({ scenes: [], cast: [], diagnostics: [] });
  let sceneStartLines = $state<number[]>([]);
  let caretLine = $state(1);
  let sigilEditor: SigilTextarea | undefined = $state();
  let fountainSource = $derived(renderFountain(scriptDoc));
  let diagnostics = $state<Diagnostic[]>([]);
  let statusMessage = $state('');
  let compileTimer: ReturnType<typeof setTimeout> | null = null;

  // Transport state — bound to Presenter and TransportBar
  let isPlaying = $state(false);
  let isToneSetup = $state(false);
  let currentPosition = $state(0);
  let sceneDuration = $state(0);
  let voiceBackend = $state<VoiceBackend>('idle');
  let sliderValue = $state(0);
  let isSliderDragging = $state(false);

  // Debug panels
  let showDebugPanels = $state(true);
  let discoveredClips = $state<Record<string, string[]>>({});

  // Track CAT: user-authored catalogue entries (Sketcher + Character creator exports),
  // merged with the bundled catalogue for cast/setting resolution during compile.
  let userCatalogueEntries = $state<Awaited<ReturnType<typeof OPFSCatalogueStore.list>>>([]);


  // Derived blocks for timeline / compiled inspector — read-only
  const compiledActors = $derived(currentProduction?.actors ?? []);
  const compiledScene = $derived(
    getScenes(currentProduction?.tree ?? []).find((ns) => ns.id === currentSceneId)?.scene ?? null
  );

  // The scene the caret is currently in — derived from its 1-based line.
  const focusedSceneIndex = $derived(sceneIndexForLine(sceneStartLines, caretLine));
  const compiledActorBlocks = $derived<{ block: ActorBlock; index: number }[]>(
    (compiledScene?.blocks ?? [])
      .map((b, i) => ({ block: b, index: i }))
      .filter((e): e is { block: ActorBlock; index: number } => e.block.type === 'actorBlock')
  );

  onMount(async () => {
    await ProductionStore.init();
    productions = ProductionStore.list();
    userCatalogueEntries = await OPFSCatalogueStore.list();
    if (productions.length > 0) {
      openProduction(productions[0]);
    } else {
      await newProduction();
    }
  });

  /** Sets the sigil buffer and re-derives scriptDoc from it. Does not compile. */
  function loadSigilText(text: string) {
    sigilText = text;
    const { doc, sceneStartLines: lines } = tokenizeScript(text);
    scriptDoc = doc;
    sceneStartLines = lines;
  }

  function openProduction(prod: StoredProduction) {
    currentProduction = prod;
    productionNameInput = prod.name;
    const ns = getScenes(prod.tree ?? [])[0];
    currentSceneId = ns?.id ?? crypto.randomUUID();
    const source = prod.scriptSource ?? ns?.dslSource ?? DEFAULT_SIGIL_TEMPLATE;
    caretLine = 1;
    loadSigilText(source);
    diagnostics = [];
    statusMessage = '';
    showProductionPicker = false;
    compileAndApply(true);
  }

  async function newProduction() {
    const created = await ProductionStore.create('Untitled Production');
    currentSceneId = crypto.randomUUID();
    currentProduction = created;
    productionNameInput = created.name;
    loadSigilText(DEFAULT_SIGIL_TEMPLATE);
    caretLine = 1;
    diagnostics = [];
    statusMessage = '';
    showProductionPicker = false;
    await compileAndApply(true);
    productions = ProductionStore.list();
  }

  async function newExampleProduction() {
    const created = await ProductionStore.create('Example Scene');
    currentSceneId = crypto.randomUUID();
    currentProduction = created;
    productionNameInput = created.name;
    loadSigilText(renderScript(DEFAULT_DOC));
    caretLine = 1;
    diagnostics = [];
    statusMessage = '';
    showProductionPicker = false;
    await compileAndApply(true);
    productions = ProductionStore.list();
  }

  async function compileAndApply(seekToStart: boolean) {
    if (!currentProduction) return;

    // Compile current ScriptDocument → NamedScene[]
    const compiled = compileScriptDocument(scriptDoc, userCatalogueEntries);

    diagnostics = compiled.diagnostics;

    if (compiled.scenes.length === 0) {
      statusMessage = 'No scenes found in script.';
      return;
    }

    const focusedId = compiled.scenes[Math.min(focusedSceneIndex, compiled.scenes.length - 1)].id;

    const updated: StoredProduction = {
      ...currentProduction,
      name: productionNameInput,
      actors: compiled.actors,
      tree: compiled.scenes,
      scriptSource: sigilText,
      activeSceneId: focusedId,
      modifiedAt: Date.now(),
    };
    currentProduction = updated;
    await ProductionStore.save(updated);
    productions = ProductionStore.list();

    renderFocusedScene({ seek: seekToStart, force: true });

    statusMessage = compiled.diagnostics.length > 0 ? 'Updated (with warnings).' : 'Updated.';
  }

  /**
   * Renders the scene the caret is currently in. `force` reloads even when the
   * caret hasn't changed scene (used after a compile); otherwise a same-scene
   * caret move is a no-op.
   */
  function renderFocusedScene(opts: { seek: boolean; force: boolean }) {
    if (!currentProduction) return;
    const scenes = getScenes(currentProduction.tree ?? []);
    if (scenes.length === 0) return;
    const idx = Math.min(focusedSceneIndex, scenes.length - 1);
    const scene = scenes[idx];
    if (!opts.force && scene.id === currentSceneId) return;
    currentSceneId = scene.id;
    presenter?.loadModel(
      storedSceneToModel(scene.scene, currentProduction.actors ?? [], userCatalogueEntries),
      opts.seek ? 0 : undefined,
    );
  }

  function handleCaretMove(line: number) {
    caretLine = line;
    // If a compile is pending it will render the focused scene when it lands;
    // otherwise re-render now so clicking between scenes switches immediately.
    if (compileTimer !== null) return;
    renderFocusedScene({ seek: false, force: false });
  }

  function focusScene(si: number) {
    const line = sceneStartLines[si] ?? 1;
    caretLine = line;
    sigilEditor?.focusLine(line);
    renderFocusedScene({ seek: false, force: true });
  }

  function scheduleCompile() {
    if (compileTimer !== null) clearTimeout(compileTimer);
    compileTimer = setTimeout(() => {
      compileAndApply(false);
      compileTimer = null;
    }, 500);
  }

  function handleSigilChange(text: string) {
    sigilText = text;
    const { doc, sceneStartLines: lines } = tokenizeScript(text);
    scriptDoc = doc;
    sceneStartLines = lines;
    scheduleCompile();
  }

  async function renameProduction() {
    if (!currentProduction) return;
    const trimmed = productionNameInput.trim() || 'Untitled Production';
    productionNameInput = trimmed;
    currentProduction = { ...currentProduction, name: trimmed, modifiedAt: Date.now() };
    await ProductionStore.save(currentProduction);
    productions = ProductionStore.list();
  }

  async function deleteProduction(id: string) {
    await ProductionStore.delete(id);
    productions = ProductionStore.list();
    if (currentProduction?.id === id) {
      currentProduction = null;
      currentSceneId = '';
      loadSigilText('');
      presenter?.loadModel(storedSceneToModel(starterSceneShell(), []), 0);
    }
  }
</script>

<div class="app">
  <header class="topbar">
    <div class="production-switcher">
      <button
        class="switcher-btn"
        onclick={() => (showProductionPicker = !showProductionPicker)}
        title="Switch production"
      >☰</button>
      {#if showProductionPicker}
        <div class="picker-dropdown">
          {#each productions as p (p.id)}
            <div class="picker-row-wrapper">
              <button
                class="picker-row"
                class:active={p.id === currentProduction?.id}
                onclick={() => openProduction(p)}
              >{p.name}</button>
              <button
                class="picker-delete"
                onclick={() => { deleteProduction(p.id); showProductionPicker = false; }}
                title="Delete production"
              >✕</button>
            </div>
          {/each}
          <button class="picker-row picker-new" onclick={newProduction}>+ New production</button>
          <button class="picker-row picker-example" onclick={newExampleProduction}>Example scene</button>
        </div>
      {/if}
    </div>
    <input
      class="name-input"
      bind:value={productionNameInput}
      onblur={renameProduction}
      onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      placeholder="Untitled Production"
    />
    {#if statusMessage}
      <span class="status-msg">{statusMessage}</span>
    {/if}
    <button
      class="debug-toggle"
      class:active={showDebugPanels}
      onclick={() => (showDebugPanels = !showDebugPanels)}
      title="Toggle timeline / compiled inspector"
    >⊞ debug</button>
  </header>

  <div class="workspace">
    <div class="script-pane">
      <div class="sigil-editor-wrap">
        <SigilTextarea
          bind:this={sigilEditor}
          value={sigilText}
          cast={scriptDoc.cast}
          placeholder={'Type a scene using #scene, >action, @actor sigils…'}
          onchange={handleSigilChange}
          oncaret={handleCaretMove}
        />
      </div>

      <!-- Read-only Fountain preview -->
      <details class="fountain-preview">
        <summary>Fountain render</summary>
        <pre class="fountain-pre">{fountainSource}</pre>
      </details>

      {#if diagnostics.length > 0}
        <ul class="diagnostics">
          {#each diagnostics as d}
            <li class:err={d.level === 'error'} class:warn={d.level === 'warning'} class:info={d.level === 'info'}>
              {d.line > 0 ? `L${d.line}: ` : ''}{d.message}
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <div class="viewport-pane">
      <Presenter
        bind:this={presenter}
        bind:isPlaying
        bind:isToneSetup
        bind:currentPosition
        bind:sceneDuration
        bind:voiceBackend
        bind:sliderValue
        bind:isSliderDragging
        ondiscoverclips={(clips) => { discoveredClips = { ...discoveredClips, ...clips }; }}
      />
    </div>

    {#if showDebugPanels}
      <div class="inspector-pane">
        <div class="inspector-header">Script document</div>
        {#if scriptDoc.scenes.length === 0}
          <p class="inspector-empty">No scenes parsed.</p>
        {:else}
          {#each scriptDoc.scenes as scene, si}
            <div class="inspector-scene">
              <button
                class="inspector-scene-heading"
                class:active={si === focusedSceneIndex}
                onclick={() => focusScene(si)}
                title="Jump to this scene"
              >{si + 1}. {scene.heading}</button>
              <div class="inspector-meta">Interior: {scene.interior ?? true ? 'INT.' : 'EXT.'}</div>
              {#if scene.setting}<div class="inspector-meta">Setting: {scene.setting}</div>{/if}
              {#if scene.timeOfDay}<div class="inspector-meta">Time: {scene.timeOfDay}</div>{/if}
              <div class="inspector-beats">{scene.beats.length} beats</div>
              {#each scene.beats as beat, bi}
                <div class="inspector-beat" class:inspector-beat-dialogue={beat.type === 'dialogue'} class:inspector-beat-action={beat.type === 'action'} class:inspector-beat-transition={beat.type === 'transition'}>
                  <span class="inspector-beat-kind">{beat.type}</span>
                  {#if beat.type === 'dialogue'}
                    <span class="inspector-beat-actor">{beat.character}</span>
                    {#if beat.parenthetical}
                      <span class="inspector-beat-paren">({beat.parenthetical})</span>
                    {/if}
                    <span class="inspector-beat-text">{beat.text}</span>
                  {:else if beat.type === 'action'}
                    <span class="inspector-beat-actor">{beat.character}</span>
                    <span class="inspector-beat-verb">{beat.verb}</span>
                    {#if beat.side}
                      <span class="inspector-beat-meta">side {beat.side}</span>
                    {/if}
                    {#if beat.target}
                      <span class="inspector-beat-meta">→ {beat.target}</span>
                    {/if}
                    {#if beat.seconds !== undefined}
                      <span class="inspector-beat-meta">{beat.seconds}s</span>
                    {/if}
                  {:else}
                    <span class="inspector-beat-text">{beat.text}</span>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        {/if}
        {#if scriptDoc.cast.length > 0}
          <div class="inspector-cast">
            <div class="inspector-section-label">Cast:</div>
            <div class="inspector-cast-names">
              {#each scriptDoc.cast as name}
                <span class="inspector-cast-name">{name}</span>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="transport">
    <TransportBar
      {isPlaying}
      {isToneSetup}
      {currentPosition}
      {sceneDuration}
      {voiceBackend}
      bind:sliderValue
      bind:isSliderDragging
      onplaypause={() => presenter?.handlePlayPauseClick()}
      onrewind={() => presenter?.handleRewindClick()}
      onsliderinput={(t) => presenter?.handleSliderInput(t)}
      onsliderpointerdown={() => presenter?.handleSliderPointerDown()}
      onsliderpointerup={() => presenter?.handleSliderPointerUp()}
    />
  </div>

  {#if showDebugPanels}
    <div class="timeline-pane">
      <TimelinePanel
        actors={compiledActors}
        actorBlocks={compiledActorBlocks}
        {sceneDuration}
        {currentPosition}
        {discoveredClips}
      />
    </div>
  {/if}
</div>

<style>
  .app {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #1a1a1a;
    border-bottom: 1px solid #2a2a2a;
    position: relative;
  }

  .production-switcher {
    position: relative;
  }

  .switcher-btn {
    background: none;
    border: 1px solid #333;
    border-radius: 6px;
    color: #bbb;
    padding: 5px 10px;
    cursor: pointer;
    font-size: 14px;
  }

  .switcher-btn:hover {
    background: #242424;
  }

  .picker-dropdown {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 20;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 6px;
    min-width: 220px;
    display: flex;
    flex-direction: column;
    padding: 4px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .picker-row-wrapper {
    display: flex;
    align-items: center;
  }

  .picker-row-wrapper .picker-row {
    flex: 1;
  }

  .picker-delete {
    background: none;
    border: none;
    color: #660000;
    padding: 2px 6px;
    cursor: pointer;
    font-size: 12px;
    border-radius: 3px;
    line-height: 1;
  }

  .picker-delete:hover {
    color: #ff4444;
    background: rgba(255, 0, 0, 0.15);
  }

  .picker-row {
    background: none;
    border: none;
    color: #ccc;
    text-align: left;
    padding: 6px 8px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
  }

  .picker-row:hover {
    background: #2a2a2a;
  }

  .picker-row.active {
    color: #4a9eff;
  }

  .picker-new {
    border-top: 1px solid #2a2a2a;
    margin-top: 4px;
    padding-top: 8px;
    color: #4a9eff;
  }

  .picker-example {
    color: #8ec88e;
  }

  .picker-example:hover {
    color: #a8e8a8;
  }

  .name-input {
    flex: 0 1 320px;
    background: #0f0f0f;
    border: 1px solid #333;
    border-radius: 6px;
    color: #eee;
    padding: 6px 10px;
    font-size: 13px;
  }

  .status-msg {
    font-size: 11px;
    color: #77a9ff;
    margin-left: auto;
  }

  .workspace {
    flex: 1;
    min-height: 0;
    display: flex;
  }

  .script-pane {
    flex: 0 0 36%;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #2a2a2a;
    background: #141414;
    min-height: 0;
  }

  .sigil-editor-wrap {
    flex: 1;
    min-height: 0;
    padding: 8px;
    display: flex;
  }

  .fountain-preview {
    flex: 0 0 auto;
    border-top: 1px solid #2a2a2a;
    padding: 6px 10px;
    font-size: 11px;
    color: #555;
  }

  .fountain-preview summary {
    cursor: pointer;
  }

  .fountain-pre {
    margin: 4px 0 0;
    padding: 6px;
    background: #0f0f0f;
    border-radius: 4px;
    font-size: 11px;
    color: #888;
    white-space: pre-wrap;
  }

  .diagnostics {
    flex: 0 0 auto;
    max-height: 30%;
    overflow-y: auto;
    margin: 0;
    padding: 8px 12px;
    font-size: 11px;
    line-height: 1.5;
    color: #bbb;
    border-top: 1px solid #2a2a2a;
    background: #111;
  }

  .diagnostics .err {
    color: #ff8c8c;
  }

  .diagnostics .warn {
    color: #ffd27a;
  }

  .diagnostics .info {
    color: #77a9ff;
  }

  .viewport-pane {
    flex: 1;
    min-width: 0;
    position: relative;
  }

  .inspector-pane {
    flex: 0 0 220px;
    min-width: 160px;
    border-left: 1px solid #2a2a2a;
    background: #121212;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    font-size: 11px;
  }

  .inspector-header {
    padding: 6px 10px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    border-bottom: 1px solid #222;
    flex: 0 0 auto;
  }

  .inspector-empty {
    padding: 8px 10px;
    color: #555;
    font-style: italic;
  }

  .inspector-scene {
    border-bottom: 1px solid #1e1e1e;
    padding: 4px 0;
  }

  .inspector-scene-heading {
    display: block;
    width: 100%;
    padding: 2px 10px;
    color: #aaa;
    font-weight: 600;
    font-size: 11px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    font-family: inherit;
  }

  .inspector-scene-heading:hover {
    color: #ccc;
    background: #1a1a1a;
  }

  .inspector-scene-heading.active {
    color: #77bfff;
    background: #0a1a2a;
  }

  .inspector-meta {
    padding: 0 10px 1px;
    color: #556;
    font-size: 10px;
  }

  .inspector-beats {
    padding: 0 10px 2px;
    color: #444;
    font-size: 10px;
  }

  .inspector-beat {
    display: flex;
    gap: 4px;
    align-items: baseline;
    padding: 1px 10px;
    font-size: 10px;
    line-height: 1.3;
  }

  .inspector-beat-kind {
    color: #555;
    min-width: 52px;
    font-size: 9px;
    text-transform: uppercase;
  }

  .inspector-beat-dialogue {
    color: #aac8ff;
  }

  .inspector-beat-action {
    color: #ccc;
  }

  .inspector-beat-transition {
    color: #999;
  }

  .inspector-beat-actor {
    color: #ccc;
    font-weight: 600;
  }

  .inspector-beat-paren {
    color: #88a;
    font-style: italic;
  }

  .inspector-beat-text {
    color: #bbb;
  }

  .inspector-beat-verb {
    color: #96d0a0;
    font-style: italic;
  }

  .inspector-beat-meta {
    color: #666;
    font-size: 10px;
  }

  .inspector-cast {
    padding: 6px 10px;
    border-top: 1px solid #1e1e1e;
  }

  .inspector-section-label {
    font-size: 10px;
    color: #555;
    margin-bottom: 3px;
  }

  .inspector-cast-names {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .inspector-cast-name {
    color: #ccc;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .transport {
    flex: 0 0 auto;
    background: #1a1a1a;
    border-top: 1px solid #2a2a2a;
  }

  .timeline-pane {
    flex: 0 0 160px;
    min-height: 100px;
    max-height: 200px;
    overflow-y: auto;
    border-top: 1px solid #2a2a2a;
    background: #101010;
  }

  .debug-toggle {
    margin-left: auto;
    background: none;
    border: 1px solid #333;
    border-radius: 5px;
    color: #666;
    padding: 4px 9px;
    font-size: 11px;
    cursor: pointer;
  }

  .debug-toggle:hover { color: #aaa; border-color: #555; }
  .debug-toggle.active { color: #77bfff; border-color: #3a6fa0; background: #0a1a2a; }
</style>
