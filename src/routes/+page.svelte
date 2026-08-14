<script lang="ts">
  import { onMount } from 'svelte';
  import Presenter from '$lib/Presenter.svelte';
  import TransportBar from '$lib/TransportBar.svelte';
  import TimelinePanel from '$lib/TimelinePanel.svelte';
  import type { VoiceBackend } from '$lib/types.js';
  import { storedSceneToModel } from '../core/storage/storedSceneToModel.js';
  import { starterSceneShell } from '../core/storage/sceneBuilder.js';
  import { ProductionStore } from '../core/storage/ProductionStore.js';
  import { getScenes } from '../core/storage/types.js';
  import type { StoredProduction, NamedScene } from '../core/storage/types.js';
  import type { ActorBlock } from '../core/domain/types.js';
  import { renderFountain, createDefaultScriptDocument } from '../core/treatment/fountain.js';
  import type { Diagnostic, ScriptDocument, ActionVerb, StageSide, StageMark, ActionBeat, Beat } from '../core/treatment/fountain.js';
  import { compileScriptDocument } from '../core/treatment/fountainCompiler.js';
  import Combobox from '$lib/Combobox.svelte';

  /**
   * Script-first, single-view authoring shell (treatment-driven-workflow branch).
   *
   * ScriptDocument is the source of truth, built programmatically.
   * Fountain text in the editor is a render of the ScriptDocument.
   * Free-text edits re-parse via parseFountain (best-effort) and recompile.
   * See ROADMAP.md "Data Contract" for the layer model.
   */

  const DEFAULT_DOC = createDefaultScriptDocument();

  let presenter: Presenter | undefined = $state();

  let productions = $state<StoredProduction[]>([]);
  let currentProduction = $state<StoredProduction | null>(null);
  let currentSceneId = $state('');
  let productionNameInput = $state('Untitled Production');
  let showProductionPicker = $state(false);

  let scriptDoc = $state<ScriptDocument>({ scenes: [], cast: [], diagnostics: [] });
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

  // Derived blocks for timeline / compiled inspector — read-only
  const compiledActors = $derived(currentProduction?.actors ?? []);
  const compiledScene = $derived(
    getScenes(currentProduction?.tree ?? [])[0]?.scene ?? null
  );
  const compiledActorBlocks = $derived<{ block: ActorBlock; index: number }[]>(
    (compiledScene?.blocks ?? [])
      .map((b, i) => ({ block: b, index: i }))
      .filter((e): e is { block: ActorBlock; index: number } => e.block.type === 'actorBlock')
  );

  onMount(async () => {
    await ProductionStore.init();
    productions = ProductionStore.list();
    if (productions.length > 0) {
      openProduction(productions[0]);
    } else {
      await newProduction();
    }
  });

  function openProduction(prod: StoredProduction) {
    currentProduction = prod;
    productionNameInput = prod.name;
    const ns = getScenes(prod.tree ?? [])[0];
    currentSceneId = ns?.id ?? crypto.randomUUID();
    // Restore scriptDoc from the stored scene if possible; fall back to blank
    scriptDoc = { scenes: [{ heading: '', interior: undefined, setting: '', timeOfDay: '', beats: [] }], cast: prod.actors?.map((a) => a.role) ?? [], diagnostics: [] };
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
    scriptDoc = { scenes: [{ heading: '', interior: undefined, setting: '', timeOfDay: '', beats: [] }], cast: [], diagnostics: [] };
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
    scriptDoc = DEFAULT_DOC;
    diagnostics = [];
    statusMessage = '';
    showProductionPicker = false;
    await compileAndApply(true);
    productions = ProductionStore.list();
  }

  async function compileAndApply(seekToStart: boolean) {
    if (!currentProduction) return;

    // Compile current ScriptDocument → NamedScene[]
    const compiled = compileScriptDocument(scriptDoc);

    diagnostics = compiled.diagnostics;

    if (compiled.scenes.length === 0) {
      statusMessage = 'No scenes found in script.';
      return;
    }

    const firstScene = compiled.scenes[0];
    const sceneId = firstScene.id;

    const updated: StoredProduction = {
      ...currentProduction,
      name: productionNameInput,
      actors: compiled.actors,
      tree: compiled.scenes,
      activeSceneId: sceneId,
      modifiedAt: Date.now(),
    };
    currentProduction = updated;
    currentSceneId = sceneId;
    await ProductionStore.save(updated);
    productions = ProductionStore.list();
    presenter?.loadModel(storedSceneToModel(firstScene.scene, compiled.actors), seekToStart ? 0 : undefined);
    statusMessage = compiled.diagnostics.length > 0 ? 'Updated (with warnings).' : 'Updated.';
  }

  function scheduleCompile() {
    if (compileTimer !== null) clearTimeout(compileTimer);
    compileTimer = setTimeout(() => {
      compileAndApply(false);
      compileTimer = null;
    }, 500);
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
      scriptDoc = { scenes: [], cast: [], diagnostics: [] };
      presenter?.loadModel(storedSceneToModel(starterSceneShell(), []), 0);
    }
  }

  // ── Beat mutation helpers ────────────────────────────────────────────────

  const VERBS: string[] = ['enter', 'exit', 'move', 'hold'];
  const SIDES: string[] = ['left', 'right'];
  const MARKS: string[] = ['left', 'center', 'right'];
  const TIMES: string[] = ['DAY', 'NIGHT', 'DAWN', 'DUSK', 'MORNING', 'AFTERNOON', 'EVENING', 'LATER', 'CONTINUOUS'];
  const SETTINGS: string[] = ['STAGE', "JO'S FLAT", 'CORRIDOR', 'SERVER ROOM'];
  const INTERIORS: string[] = ['INT.', 'EXT.'];

  function cloneDoc(): ScriptDocument {
    return JSON.parse(JSON.stringify(scriptDoc));
  }

  function updateDoc(doc: ScriptDocument) {
    scriptDoc = doc;
    scheduleCompile();
  }

  function addBeat(type: 'dialogue' | 'action') {
    const doc = cloneDoc();
    if (doc.scenes.length === 0) doc.scenes = [{ heading: 'INT. STAGE - DAY', beats: [] }];
    const defChar = doc.cast[0] ?? 'CHAR';
    const beat: Beat = type === 'dialogue'
      ? { type: 'dialogue', character: defChar, text: '' }
      : { type: 'action', character: defChar, verb: 'enter' };
    doc.scenes[0].beats.push(beat);
    updateDoc(doc);
  }

  function removeBeat(i: number) {
    const doc = cloneDoc();
    doc.scenes[0].beats.splice(i, 1);
    updateDoc(doc);
  }

  function updateHeading(field: 'interior' | 'setting' | 'time', value: string | boolean) {
    const doc = cloneDoc();
    if (doc.scenes.length === 0) return;
    const h = doc.scenes[0];
    if (field === 'interior') h.interior = value as boolean;
    if (field === 'setting') h.setting = value as string;
    if (field === 'time') h.timeOfDay = value as string;
    const interior = h.interior;
    const setting = h.setting;
    const tod = h.timeOfDay;
    if (interior == null && !setting && !tod) {
      h.heading = 'UNTITLED';
    } else {
      const prefix = interior == null ? 'INT./EXT.' : (interior ? 'INT.' : 'EXT.');
      h.heading = `${prefix} ${setting || 'UNTITLED'} - ${tod || 'DAY'}`;
    }
    updateDoc(doc);
  }

  // ── Cast management ──────────────────────────────────────────────────────

  let addingCast = $state(false);
  let newCastName = $state('');
  let renamingCast = $state<string | null>(null);
  let renameCastValue = $state('');

  function addCastMember() {
    const name = newCastName.trim().toUpperCase();
    if (!name) return;
    const doc = cloneDoc();
    if (!doc.cast.includes(name)) doc.cast.push(name);
    updateDoc(doc);
    newCastName = '';
    addingCast = false;
  }

  function startRenameCast(name: string) {
    renamingCast = name;
    renameCastValue = name;
  }

  function commitRenameCast() {
    const oldName = renamingCast;
    const newName = renameCastValue.trim().toUpperCase();
    renamingCast = null;
    if (!oldName || !newName || oldName === newName) return;
    const doc = cloneDoc();
    const idx = doc.cast.indexOf(oldName);
    if (idx >= 0) doc.cast[idx] = newName;
    // Propagate rename to all beats
    for (const scene of doc.scenes) {
      for (const beat of scene.beats) {
        if (beat.type !== 'transition' && beat.character === oldName) {
          beat.character = newName;
        }
      }
    }
    updateDoc(doc);
  }

  function removeCastMember(name: string) {
    const doc = cloneDoc();
    // Remove from cast list
    doc.cast = doc.cast.filter((c) => c !== name);
    // Remove all beats referencing this character
    for (const scene of doc.scenes) {
      scene.beats = scene.beats.filter((b) => b.type === 'transition' || b.character !== name);
    }
    updateDoc(doc);
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
      {#if scriptDoc.scenes.length > 0}
        {@const s = scriptDoc.scenes[0]}
        <div class="beat-editor">
          <!-- Scene heading row -->
          <div class="beat-row beat-heading">
            <Combobox class="heading-interior" options={INTERIORS} value={s.interior == null ? '' : (s.interior ? 'INT.' : 'EXT.')} placeholder="INT./EXT." allowFreeform={false} style="width:55px"
              onchange={(v) => updateHeading('interior', v === 'INT.')} />
            <Combobox class="heading-setting" options={SETTINGS} value={s.setting ?? ''} placeholder="Setting" allowFreeform={true} style="width:160px"
              onchange={(v) => updateHeading('setting', v)} />
            <span class="heading-dash">-</span>
            <Combobox class="heading-time" options={TIMES} value={s.timeOfDay ?? ''} placeholder="TIME" allowFreeform={false} style="width:100px"
              onchange={(v) => updateHeading('time', v)} />
          </div>

          <!-- Beat rows -->
          {#each s.beats as b, i (i)}
            {#if b.type !== 'transition'}
              {@const beat = b as (ActionBeat | { type: 'dialogue'; character: string; text: string; parenthetical?: string })}
              <div class="beat-row">
                {#if beat.type === 'dialogue'}
                  <div class="beat-fields">
                    <Combobox class="bf-actor" options={scriptDoc.cast} value={beat.character} placeholder="actor" allowFreeform={false} style="width:90px"
                      onchange={(v) => { beat.character = v; scheduleCompile(); }} />
                    <input class="bf-dialogue" placeholder="dialogue" value={beat.text} spellcheck="false"
                      onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); scheduleCompile(); } }}
                      oninput={(e) => { beat.text = e.currentTarget.value; }} />
                  </div>
                {:else}
                  {@const abeat = beat as ActionBeat}
                  <div class="beat-fields">
                    <Combobox class="bf-actor" options={scriptDoc.cast} value={abeat.character} placeholder="actor" allowFreeform={false} style="width:90px"
                      onchange={(v) => { abeat.character = v; scheduleCompile(); }} />
                    <Combobox class="bf-verb" options={VERBS} value={abeat.verb} placeholder="verb" allowFreeform={false} style="width:55px"
                      onchange={(v) => { abeat.verb = v as ActionVerb; scheduleCompile(); }} />
                    {#if abeat.verb === 'enter' || abeat.verb === 'exit'}
                      <span class="beat-pretext">{abeat.verb === 'enter' ? 'from' : 'to'}</span>
                      <Combobox class="bf-side" options={SIDES} value={abeat.side ?? ''} placeholder="side" allowFreeform={false} style="width:60px"
                        onchange={(v) => { abeat.side = (v || undefined) as StageSide | undefined; scheduleCompile(); }} />
                    {/if}
                    {#if abeat.verb === 'move'}
                      <span class="beat-pretext">to</span>
                      <Combobox class="bf-target" options={MARKS} value={abeat.target ?? 'center'} placeholder="mark" allowFreeform={false} style="width:60px"
                        onchange={(v) => { abeat.target = v as StageMark; scheduleCompile(); }} />
                    {/if}
                    {#if abeat.verb === 'hold'}
                      <input class="bf-seconds" type="number" step="0.1" min="0.1" value={abeat.seconds ?? 1.0}
                        oninput={(e) => { abeat.seconds = parseFloat(e.currentTarget.value) || 1.0; }} />
                      <span class="beat-pretext">s</span>
                    {/if}
                  </div>
                {/if}
                <button class="beat-remove" onclick={() => removeBeat(i)} title="Remove beat">✕</button>
              </div>
            {/if}
          {/each}

          <div class="beat-add-row">
            <button class="beat-add-btn" onclick={() => addBeat('dialogue')}>+ dialogue</button>
            <button class="beat-add-btn" onclick={() => addBeat('action')}>+ action</button>
          </div>

          <!-- Cast management -->
          <div class="cast-panel">
            <span class="cast-label">Cast</span>
            <div class="cast-names">
              {#each scriptDoc.cast as name}
                <div class="cast-name-row">
                  {#if renamingCast === name}
                    <input class="cast-rename-input" bind:value={renameCastValue} onkeydown={(e) => {
                      if (e.key === 'Enter') commitRenameCast();
                      if (e.key === 'Escape') { renamingCast = null; }
                    }} onblur={commitRenameCast} />
                  {:else}
                    <span class="cast-name" role="button" tabindex="0" ondblclick={() => startRenameCast(name)} title="Double-click to rename">{name}</span>
                    <button class="cast-remove-btn" onclick={() => removeCastMember(name)} title="Remove {name} and all their beats">✕</button>
                  {/if}
                </div>
              {/each}
              {#if addingCast}
                <input class="cast-add-input" bind:value={newCastName} placeholder="Character name" onkeydown={(e) => {
                  if (e.key === 'Enter') addCastMember();
                  if (e.key === 'Escape') { addingCast = false; newCastName = ''; }
                }} onblur={() => { if (newCastName.trim()) addCastMember(); else addingCast = false; }} />
              {:else}
                <button class="cast-add-btn" onclick={() => (addingCast = true)}>+ add</button>
              {/if}
            </div>
          </div>
        </div>
      {/if}

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
              <div class="inspector-scene-heading">{si + 1}. {scene.heading}</div>
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
    flex: 0 0 30%;
    min-width: 280px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #2a2a2a;
    background: #141414;
  }

  .script-pane {
    flex: 0 0 36%;
    min-width: 320px;
    display: flex;
    flex-direction: column;
    border-right: 1px solid #2a2a2a;
    background: #141414;
    overflow-y: auto;
  }

  /* Beat editor */
  .beat-editor {
    flex: 1;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .beat-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 3px 0;
    border-radius: 4px;
    font-size: 13px;
    border-bottom: 1px solid transparent;
  }

  .beat-row:hover .beat-remove {
    opacity: 1;
  }

  .beat-heading {
    border-bottom: 1px solid #1e3a1e;
    margin-bottom: 4px;
    padding-bottom: 6px;
  }

  .heading-dash {
    color: #4a6a4a;
  }

  .beat-fields {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-wrap: wrap;
  }

  .bf-dialogue { flex: 1; min-width: 100px; font-style: italic; }
  .bf-seconds { width: 40px; }

  .beat-pretext {
    color: #666;
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  }

  .beat-remove {
    background: none;
    border: none;
    color: #430000;
    cursor: pointer;
    font-size: 10px;
    padding: 1px 3px;
    border-radius: 3px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .beat-remove:hover { color: #ff4444; background: rgba(255,0,0,0.15); opacity: 1; }

  .beat-add-row {
    display: flex;
    gap: 6px;
    padding: 8px;
  }

  .beat-add-btn {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 5px;
    color: #888;
    padding: 5px 12px;
    cursor: pointer;
    font-size: 11px;
  }
  .beat-add-btn:hover { color: #bbb; border-color: #555; }

  /* Cast panel */
  .cast-panel {
    border-top: 1px solid #2a2a2a;
    padding: 8px 4px;
    margin-top: 4px;
  }

  .cast-label {
    font-size: 10px;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 4px;
    display: block;
  }

  .cast-names {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }

  .cast-name-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .cast-name {
    color: #ccc;
    font-weight: 700;
    font-size: 12px;
    padding: 3px 6px;
    background: #1e1e1e;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
  }

  .cast-name:hover {
    background: #2a2a2a;
  }

  .cast-remove-btn {
    background: none;
    border: none;
    color: #430000;
    cursor: pointer;
    font-size: 10px;
    padding: 1px 3px;
    border-radius: 3px;
  }

  .cast-remove-btn:hover {
    color: #ff4444;
    background: rgba(255, 0, 0, 0.15);
  }

  .cast-add-btn, .cast-add-input, .cast-rename-input {
    background: transparent;
    border: 1px dashed #333;
    border-radius: 4px;
    color: #888;
    padding: 3px 8px;
    font-size: 11px;
    cursor: pointer;
  }

  .cast-add-btn:hover { color: #bbb; border-color: #555; }

  .cast-add-input, .cast-rename-input {
    cursor: text;
    color: #ddd;
    border-style: solid;
    min-width: 100px;
  }

  .fountain-preview {
    margin-top: auto;
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
    padding: 2px 10px;
    color: #aaa;
    font-weight: 600;
    font-size: 11px;
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
