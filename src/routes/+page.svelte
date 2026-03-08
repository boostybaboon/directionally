<script lang="ts">
  import { onMount } from 'svelte';
  import Presenter from '$lib/Presenter.svelte';
  import TransportBar from '$lib/TransportBar.svelte';
  import TimelinePanel from '$lib/TimelinePanel.svelte';
  import CataloguePanel from '$lib/CataloguePanel.svelte';
  import type { VoiceMode, VoiceBackend } from '$lib/types.js';
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
  import { storedSceneToModel } from '../core/storage/storedSceneToModel.js';
  import { defaultSceneShell } from '../core/storage/sceneBuilder.js';
  import type { ScriptLine } from '$lib/sandbox/types';
  import { ProductionStore } from '../core/storage/ProductionStore.js';
  import type { StoredProduction } from '../core/storage/types.js';
  import { ProductionDocument } from '../core/document/ProductionDocument.js';
  import { RenameProductionCommand, SetScriptCommand, SetSpeakLinesCommand, AddActorCommand, RemoveActorCommand, RenameActorCommand, AddSetPieceCommand, RemoveSetPieceCommand, MoveStagedActorCommand, MoveSetPieceCommand, AddCameraKeyframeCommand, RemoveCameraKeyframeCommand, SetSceneDurationCommand, AddAnimateSegmentCommand, RemoveAnimateSegmentCommand, UpdateAnimateSegmentCommand, CapturePositionKeyframeCommand, RemoveTransformKeyframeCommand, CaptureLightIntensityKeyframeCommand, RemoveLightKeyframeCommand, SetActorIdleAnimationCommand, SetActorScaleCommand, AddActorBlockCommand, RemoveActorBlockCommand, UpdateActorBlockCommand } from '../core/document/commands.js';
  import type { StoredActor } from '../core/storage/types.js';
  import type { SpeakAction, PathKeyframe, ClipTrack, TransformTrack, LightingTrack, LoopStyle, ActorBlock } from '../core/domain/types.js';
  import { getCharacters, getSetPieces } from '../core/catalogue/catalogue.js';
  import { CATALOGUE_ENTRIES } from '../core/catalogue/entries.js';
  import type { SetPiece } from '../core/domain/types.js';

  const CATALOGUE_CHARACTERS = getCharacters(CATALOGUE_ENTRIES);
  const CATALOGUE_SET_PIECES = getSetPieces(CATALOGUE_ENTRIES);

  function modelFromProduction(prod: StoredProduction) {
    return storedSceneToModel(prod.scene ?? defaultSceneShell(), prod.actors ?? []);
  }

  let presenter: Presenter | undefined = $state();
  let isMobile = $state(false);
  let sidebarOpen = $state(false);

  // Transport state — owned here, bound to Presenter and TransportBar
  const VOICE_MODE_KEY = 'directionally_voice_mode';
  const BUBBLE_SCALE_KEY = 'directionally_bubble_scale';
  let voiceMode = $state<VoiceMode>((localStorage.getItem(VOICE_MODE_KEY) as VoiceMode | null) ?? 'espeak');
  let bubbleScale = $state<number>(parseFloat(localStorage.getItem(BUBBLE_SCALE_KEY) ?? '1'));
  $effect(() => { localStorage.setItem(VOICE_MODE_KEY, voiceMode); });
  $effect(() => { localStorage.setItem(BUBBLE_SCALE_KEY, String(bubbleScale)); });
  let isPlaying = $state(false);
  let isToneSetup = $state(false);
  let currentPosition = $state(0);
  let sceneDuration = $state(0);
  let voiceBackend = $state<VoiceBackend>('idle');
  let sliderValue = $state(0);
  let isSliderDragging = $state(false);

  // Layout state
  let leftTab = $state<'productions' | 'catalogue'>('productions');
  const BOTTOM_PANEL_KEY = 'directionally_bottom_panel_open';
  let bottomPanelOpen = $state((localStorage.getItem(BOTTOM_PANEL_KEY) ?? 'true') === 'true');
  $effect(() => { localStorage.setItem(BOTTOM_PANEL_KEY, String(bottomPanelOpen)); });
  let bottomTab = $state<'transport' | 'timeline'>('transport');
  const RIGHT_PANEL_KEY = 'directionally_right_panel_open';
  let rightPanelOpen = $state((localStorage.getItem(RIGHT_PANEL_KEY) ?? 'true') === 'true');
  $effect(() => { localStorage.setItem(RIGHT_PANEL_KEY, String(rightPanelOpen)); });
  let rightTab = $state<'stage' | 'script'>('stage');
  let designMode = $state(false);

  // Productions
  let productions = $state<StoredProduction[]>(ProductionStore.list());
  let activeProductionId = $state<string | null>(null);
  /** Active document — owns undo/redo history and command execution. */
  let activeDoc = $state<ProductionDocument | null>(null);
  /**
   * Reactive snapshot of the active document's current state.
   * ProductionDocument.current is a class getter (not $state), so Svelte can't
   * track it directly. This is updated in the document's onChange callback so
   * all $derived expressions stay in sync when commands execute.
   */
  let docSnapshot = $state<StoredProduction | null>(null);
  /** Cast list from the active document; updates automatically on command execution. */
  const actors = $derived(docSnapshot?.actors ?? []);
  /** Dialogue lines for the ScriptEditor, derived from the scene's speak actions. */
  const speakLines = $derived<ScriptLine[]>(
    (docSnapshot?.scene?.actions ?? [])
      .filter((a): a is SpeakAction => a.type === 'speak')
      .map((a) => ({ actorId: a.actorId, text: a.text, pauseAfter: a.pauseAfter ?? 0 }))
  );

  // Cast management UI state
  let addingActor = $state(false);
  let newActorRole = $state('');
  let newActorCatalogueId = $state(CATALOGUE_CHARACTERS[0]?.id ?? '');
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let renamingActorId = $state<string | null>(null);
  let renameActorValue = $state('');

  // Set-piece management UI state
  let addingSetPiece = $state(false);
  let newSetPieceCatalogueId = $state(CATALOGUE_SET_PIECES[0]?.id ?? '');
  const scenePieces = $derived(docSnapshot?.scene?.set ?? []);
  const sceneLights = $derived(docSnapshot?.scene?.lights ?? []);
  const cameraKeyframes = $derived(
    (docSnapshot?.scene?.actions.find((a) => a.type === 'cameraTrack') as { keyframes: PathKeyframe[] } | undefined)
      ?.keyframes ?? []
  );

  // Contextual label for the gizmo toolbar: communicates what a drag will do.
  // For actors: t≈0 sets the base start position; any other time captures a keyframe.
  // Set pieces always set position (no keyframe support yet).
  const clipTracks = $derived(
    (docSnapshot?.scene?.actions ?? []).flatMap((a, i) => a.type === 'animate' ? [{ action: a as ClipTrack, index: i }] : [])
  );
  const transformTracks = $derived(
    (docSnapshot?.scene?.actions ?? []).flatMap((a, i) => a.type === 'move' ? [{ action: a as TransformTrack, index: i }] : [])
  );
  const lightingTracks = $derived(
    (docSnapshot?.scene?.actions ?? []).flatMap((a, i) => a.type === 'lighting' ? [{ action: a as LightingTrack, index: i }] : [])
  );
  const actorBlocks = $derived(
    (docSnapshot?.scene?.blocks ?? []).flatMap((b, i) => b.type === 'actorBlock' ? [{ block: b as ActorBlock, index: i }] : [])
  );

  // Per-actor and per-light expand state
  let expandedActorAnim = $state(new Set<string>());
  let expandedActorSettings = $state(new Set<string>());
  let expandedLightAnim = $state(new Set<string>());

  // New-clip-segment form — one active form per actor at a time
  let clipFormActorId = $state<string | null>(null);
  let clipFormName = $state('');
  let clipFormStart = $state(0);
  let clipFormEnd = $state<number | ''>('');   // empty string → undefined end
  let clipFormLoop = $state<LoopStyle>('once');

  // New-block form — one active form per actor at a time
  let blockFormActorId = $state<string | null>(null);
  let blockFormStart = $state(0);
  let blockFormEnd = $state(2);
  let blockFormClip = $state('');

  // Per-light intensity input values (light.id → string)
  let lightIntensityValues = $state<Record<string, string>>({});

  // Clip names discovered from loaded GLTFs at runtime, keyed by actor ID.
  let discoveredClips = $state<Record<string, string[]>>({});

  // Per-actor scale input values (actor.id → string) for the settings panel.
  let actorScaleValues = $state<Record<string, string>>({}); 

  // Selected scene object (actor ID or set-piece name); driven by Presenter raycasting.
  let selectedObjectId = $state<string | null>(null);

  const dragHint = $derived(
    selectedObjectId && designMode
      ? (actors.some((a) => a.id === selectedObjectId)
          ? currentPosition < 0.05
            ? 'drag → start position'
            : 'drag to preview · ⊕ Capture to lock'
          : '')
      : ''
  );

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

  // Auto-save handled by ProductionDocument.execute() — no $effect needed.

  /**
   * One-time migration: productions that carry a flat `script` array but no `scene`
   * (created before Phase 5b) are converted to the scene-based path.
   *
   * Actor IDs used in the script are materialised as StoredActors so speak actions
   * can reference them. Legacy productions used 'alpha' / 'beta' literals; those
   * map to Robot characters with matching IDs so existing script lines stay valid.
   */
  function migrateLegacyProduction(prod: StoredProduction): StoredProduction {
    if (prod.scene || !prod.script || prod.script.length === 0) return prod;

    let working: StoredProduction = { ...prod, scene: defaultSceneShell(), actors: prod.actors ?? [] };

    const existingIds = new Set((prod.actors ?? []).map((a) => a.id));
    const referencedIds = [...new Set(prod.script.map((l) => l.actorId))];
    for (const id of referencedIds) {
      if (!existingIds.has(id)) {
        const role = id === 'alpha' ? 'Alpha' : id === 'beta' ? 'Beta' : id;
        working = new AddActorCommand({ id, role, catalogueId: 'robot-expressive' }).execute(working);
      }
    }

    working = new SetSpeakLinesCommand(prod.script).execute(working);
    return { ...working, script: undefined };
  }

  function newProduction() {
    const prod = ProductionStore.create('Untitled Production');
    productions = ProductionStore.list();
    loadProduction(prod);
  }

  function loadProduction(rawProd: StoredProduction) {
    const prod = migrateLegacyProduction(rawProd);
    if (prod !== rawProd) {
      ProductionStore.save(prod);
      productions = ProductionStore.list();
    }
    activeDoc = new ProductionDocument(
      prod,
      (updated) => {
        productions = ProductionStore.list();
        presenter?.loadModel(modelFromProduction(updated));
        docSnapshot = updated;
      },
      (updated) => ProductionStore.save(updated),
    );
    docSnapshot = prod;
    activeProductionId = prod.id;
    activeExampleId = null;
    presenter?.loadModel(modelFromProduction(prod), 0);
    sidebarOpen = false;
  }

  function reloadSandbox() {
    const current = activeDoc?.current;
    if (current) presenter?.loadModel(modelFromProduction(current));
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
    ProductionStore.save({
      ...copy,
      actors: prod.actors ? [...prod.actors] : undefined,
      scene:  prod.scene,
      script: prod.script ? [...prod.script] : undefined,
      modifiedAt: Date.now(),
    });
    productions = ProductionStore.list();
  }

  function startRename(id: string) {
    renameValue = productions.find((p) => p.id === id)?.name ?? '';
    renamingId = id;
  }

  function addActor() {
    if (!activeDoc || !newActorRole.trim() || !newActorCatalogueId) return;
    const actor: StoredActor = {
      id: crypto.randomUUID(),
      role: newActorRole.trim(),
      catalogueId: newActorCatalogueId,
    };
    activeDoc.execute(new AddActorCommand(actor));
    newActorRole = '';
    newActorCatalogueId = CATALOGUE_CHARACTERS[0]?.id ?? '';
    addingActor = false;
  }

  function removeActor(actorId: string) {
    activeDoc?.execute(new RemoveActorCommand(actorId));
  }

  function addSetPiece() {
    if (!activeDoc || !newSetPieceCatalogueId) return;
    const entry = CATALOGUE_SET_PIECES.find((p) => p.id === newSetPieceCatalogueId);
    if (!entry) return;
    const existing = activeDoc.current.scene?.set ?? [];
    const base = entry.id;
    const count = existing.filter((p) => p.name === base || p.name.startsWith(base + '-')).length;
    const name = count === 0 ? base : `${base}-${count + 1}`;
    const piece: SetPiece = { name, geometry: entry.geometry, material: entry.material };
    activeDoc.execute(new AddSetPieceCommand(piece));
    addingSetPiece = false;
  }

  function removeSetPiece(name: string) {
    activeDoc?.execute(new RemoveSetPieceCommand(name));
  }

  function captureCameraKeyframe() {
    if (!activeDoc || !designMode) return;
    const state = presenter?.getDesignCameraState();
    if (!state) return;
    const time = parseFloat(currentPosition.toFixed(2));
    activeDoc.execute(new AddCameraKeyframeCommand(time, state.position, state.lookAt));
  }

  function removeCameraKeyframe(index: number) {
    activeDoc?.execute(new RemoveCameraKeyframeCommand(index));
  }

  // ── Animation authoring handlers ───────────────────────────────────────────

  function setSceneDuration(value: string) {
    if (!activeDoc) return;
    const n = parseFloat(value);
    activeDoc.execute(new SetSceneDurationCommand(isNaN(n) || value.trim() === '' ? undefined : n));
  }

  function openClipForm(actorId: string, defaultClip: string) {
    clipFormActorId = actorId;
    clipFormName = defaultClip;
    clipFormStart = parseFloat(currentPosition.toFixed(2));
    clipFormEnd = '';
    clipFormLoop = 'once';
  }

  function commitAddClip() {
    if (!activeDoc || !clipFormActorId) return;
    const seg: ClipTrack = {
      type: 'animate',
      actorId: clipFormActorId,
      startTime: clipFormStart,
      animationName: clipFormName,
      loop: clipFormLoop,
      ...(clipFormEnd !== '' ? { endTime: Number(clipFormEnd) } : {}),
    };
    activeDoc.execute(new AddAnimateSegmentCommand(seg));
    clipFormActorId = null;
  }

  function removeClipSegment(globalIndex: number) {
    activeDoc?.execute(new RemoveAnimateSegmentCommand(globalIndex));
  }

  function updateClipLoop(globalIndex: number, loop: LoopStyle) {
    activeDoc?.execute(new UpdateAnimateSegmentCommand(globalIndex, { loop }));
  }

  function capturePositionKeyframe(targetId: string) {
    if (!activeDoc) return;
    const transform = presenter?.getObjectTransform(targetId);
    if (!transform) return;
    const time = parseFloat(currentPosition.toFixed(2));
    activeDoc.execute(new CapturePositionKeyframeCommand(targetId, time, transform.position));
  }

  function removePositionKeyframe(targetId: string, kfIndex: number) {
    activeDoc?.execute(new RemoveTransformKeyframeCommand(targetId, '.position', kfIndex));
  }

  function captureLightIntensity(lightId: string, intensityStr: string) {
    if (!activeDoc) return;
    const intensity = parseFloat(intensityStr);
    if (isNaN(intensity)) return;
    const time = parseFloat(currentPosition.toFixed(2));
    activeDoc.execute(new CaptureLightIntensityKeyframeCommand(lightId, time, intensity));
  }

  function removeLightIntensityKeyframe(lightId: string, kfIndex: number) {
    activeDoc?.execute(new RemoveLightKeyframeCommand(lightId, '.intensity', kfIndex));
  }

  function openBlockForm(actorId: string) {
    blockFormActorId = actorId;
    blockFormStart = parseFloat(currentPosition.toFixed(2));
    blockFormEnd = parseFloat((currentPosition + 2).toFixed(2));
    blockFormClip = '';
  }

  function commitAddBlock() {
    if (!activeDoc || !blockFormActorId) return;
    const block: ActorBlock = {
      type: 'actorBlock',
      actorId: blockFormActorId,
      startTime: blockFormStart,
      endTime: blockFormEnd,
      ...(blockFormClip.trim() ? { clip: blockFormClip.trim() } : {}),
    };
    activeDoc.execute(new AddActorBlockCommand(block));
    blockFormActorId = null;
  }

  function removeBlock(index: number) {
    activeDoc?.execute(new RemoveActorBlockCommand(index));
  }

  /**
   * Called by Presenter when a catalogue item is dropped onto the design viewport.
   * Adds the character/set-piece at the drop world-position and selects it.
   */
  function handleCatalogueDrop(
    kind: 'character' | 'setpiece',
    id: string,
    position: [number, number, number],
  ) {
    if (!activeDoc) return;
    if (kind === 'character') {
      const entry = CATALOGUE_CHARACTERS.find((c) => c.id === id);
      if (!entry) return;
      const actors = activeDoc.current.actors ?? [];
      const base = entry.label;
      const sameLabel = actors.filter((a) => a.role === base || a.role.startsWith(base + ' '));
      const role = sameLabel.length === 0 ? base : `${base} ${sameLabel.length + 1}`;
      const actor: StoredActor = { id: crypto.randomUUID(), role, catalogueId: id };
      activeDoc.execute(new AddActorCommand(actor));
      // Set selectedObjectId now so the next loadModel (triggered by MoveStagedActorCommand)
      // finds it in prevSelectedId and auto-selects the newly placed actor.
      selectedObjectId = actor.id;
      activeDoc.execute(new MoveStagedActorCommand(actor.id, position));
    } else {
      const entry = CATALOGUE_SET_PIECES.find((p) => p.id === id);
      if (!entry) return;
      const existing = activeDoc.current.scene?.set ?? [];
      const base = entry.id;
      const count = existing.filter((p) => p.name === base || p.name.startsWith(base + '-')).length;
      const name = count === 0 ? base : `${base}-${count + 1}`;
      const piece: SetPiece = { name, geometry: entry.geometry, material: entry.material };
      activeDoc.execute(new AddSetPieceCommand(piece));
      selectedObjectId = name;
      activeDoc.execute(new MoveSetPieceCommand(name, position));
    }
  }

  /**
   * Called by Presenter when a TransformControls drag ends.
   * Fires MoveStagedActorCommand or MoveSetPieceCommand depending on whether
   * the selected id belongs to an actor or a set piece.
   */
  function handleTransformEnd(
    id: string,
    position: [number, number, number],
    rotation: [number, number, number],
  ) {
    if (!activeDoc) return;
    const isActor = (activeDoc.current.actors ?? []).some((a) => a.id === id);
    if (isActor) {
      // t≈0: drag sets the actor's base spawn position.
      // t>0: drag is a visual preview only — press ⊕ Capture to lock as a keyframe.
      if (currentPosition < 0.05) {
        activeDoc.execute(new MoveStagedActorCommand(id, position, rotation));
      }
    } else {
      activeDoc.execute(new MoveSetPieceCommand(id, position, rotation));
    }
  }

  /** Svelte action: focus an input and select all text when it mounts. */
  function focusAndSelect(el: HTMLInputElement) {
    el.focus();
    el.select();
  }

  function startActorRename(id: string) {
    renameActorValue = actors.find((a) => a.id === id)?.role ?? '';
    renamingActorId = id;
  }

  function commitActorRename(id: string) {
    const trimmed = renameActorValue.trim();
    if (trimmed && activeDoc) {
      activeDoc.execute(new RenameActorCommand(id, trimmed));
    }
    renamingActorId = null;
  }

  function commitRename(id: string) {
    const trimmed = renameValue.trim();
    if (trimmed) {
      if (id === activeProductionId && activeDoc) {
        activeDoc.execute(new RenameProductionCommand(trimmed));
        productions = ProductionStore.list();
      } else {
        const prod = productions.find((p) => p.id === id);
        if (prod) {
          ProductionStore.save({ ...prod, name: trimmed, modifiedAt: Date.now() });
          productions = ProductionStore.list();
        }
      }
    }
    renamingId = null;
  }

  function loadExample(id: string, model: Model) {
    presenter?.loadModel(model, 0);
    activeExampleId = id;
    activeProductionId = null;
    activeDoc = null;
    docSnapshot = null;
    sidebarOpen = false;
  }

  onMount(() => {
    const mq = window.matchMedia('(max-width: 640px)');
    isMobile = mq.matches;
    // Right panel takes up too much space on phone; default it closed.
    if (isMobile) rightPanelOpen = false;
    const onChange = (e: MediaQueryListEvent) => {
      isMobile = e.matches;
      if (e.matches) rightPanelOpen = false;
    };
    mq.addEventListener('change', onChange);

    function handleKeyDown(e: KeyboardEvent) {
      if (!activeDoc) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); activeDoc.undo(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); activeDoc.redo(); }
    }
    window.addEventListener('keydown', handleKeyDown);

    // Migrate legacy single-script localStorage key from pre-Phase-1
    const LEGACY_KEY = 'directionally_sandbox_script';
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy && productions.length === 0) {
      try {
        const legacyScript: ScriptLine[] = JSON.parse(legacy);
        if (legacyScript.length > 0) {
          const base = ProductionStore.create('My Production');
          const migrated = migrateLegacyProduction({ ...base, script: legacyScript });
          ProductionStore.save({ ...migrated, modifiedAt: Date.now() });
          productions = ProductionStore.list();
        }
      } catch { /* ignore malformed data */ }
      localStorage.removeItem(LEGACY_KEY);
    }

    return () => {
      mq.removeEventListener('change', onChange);
      window.removeEventListener('keydown', handleKeyDown);
    };
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

  <div class="workspace">
    <Splitpanes theme="directionally">
      <!-- Left pane: collapsed to 0 on mobile, normal sidebar on desktop -->
      <Pane
        size={isMobile ? 0 : 18}
        minSize={isMobile ? 0 : 10}
        maxSize={isMobile ? 0 : 40}
      >
        {#if !isMobile}
          <div class="left-panel">
            <div class="tab-bar">
              <button
                class="tab-btn"
                class:active={leftTab === 'productions'}
                onclick={() => (leftTab = 'productions')}
              >Productions</button>
              <button
                class="tab-btn"
                class:active={leftTab === 'catalogue'}
                onclick={() => (leftTab = 'catalogue')}
              >Catalogue</button>
            </div>
            <div class="tab-content">
              {#if leftTab === 'productions'}
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

                </aside>
              {:else}
                <CataloguePanel onadd={(kind, id) => handleCatalogueDrop(kind, id, [0, 0, 0])} />
              {/if}
            </div>
          </div>
        {/if}
      </Pane>

      <!-- Main pane: Presenter is always mounted here, never destroyed -->
      <Pane minSize={30}>
        <div class="main-pane">
          {#if !rightPanelOpen}
            <button
              class="right-panel-open-btn"
              onclick={() => (rightPanelOpen = true)}
              title="Open properties panel"
              aria-label="Open properties panel"
            >‹</button>
          {/if}
          <Presenter
            bind:this={presenter}
            bind:voiceMode={voiceMode}
            bind:bubbleScale={bubbleScale}
            bind:isPlaying={isPlaying}
            bind:isToneSetup={isToneSetup}
            bind:currentPosition={currentPosition}
            bind:sceneDuration={sceneDuration}
            bind:voiceBackend={voiceBackend}
            bind:sliderValue={sliderValue}
            bind:isSliderDragging={isSliderDragging}
            bind:designMode={designMode}
            bind:selectedObjectId={selectedObjectId}
            ontransformend={handleTransformEnd}
            oncataloguedrop={handleCatalogueDrop}
            ondiscoverclips={(clips) => { discoveredClips = clips; }}
            {dragHint}
          />
        </div>
      </Pane>

      <!-- Right panel -->
      <Pane
        size={rightPanelOpen ? 22 : 0}
        minSize={rightPanelOpen ? 12 : 0}
        maxSize={rightPanelOpen ? 40 : 0}
      >
        {#if rightPanelOpen}
          <div class="right-panel">
            <div class="tab-bar right-panel-tab-bar">
              <button
                class="tab-btn"
                class:active={rightTab === 'stage'}
                onclick={() => (rightTab = 'stage')}
              >Stage</button>
              <button
                class="tab-btn"
                class:active={rightTab === 'script'}
                onclick={() => (rightTab = 'script')}
              >Script</button>
              <button
                class="right-panel-close-btn"
                onclick={() => (rightPanelOpen = false)}
                title="Close panel"
                aria-label="Close properties panel"
              >›</button>
            </div>
            <div class="tab-content stage-tab-content">
              {#if rightTab === 'stage'}
                {#if activeDoc}
                  <!-- Scene duration override -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Scene</span>
                    </div>
                    <div class="anim-row">
                      <label class="anim-label" for="scene-duration">Duration (s)</label>
                      <input
                        id="scene-duration"
                        class="anim-number"
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="auto"
                        value={docSnapshot?.scene?.duration ?? ''}
                        onchange={(e) => setSceneDuration(e.currentTarget.value)}
                      />
                    </div>
                  </div>

                  <!-- Cast -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Cast</span>
                      <button class="new-btn" onclick={() => { addingActor = !addingActor; }} title="Add character">+ Add</button>
                    </div>
                    {#if actors.length === 0 && !addingActor}
                      <p class="stage-empty">No cast — using default robots.</p>
                    {:else}
                      <ul class="cast-list">
                        {#each actors as actor}
                          <li class="cast-row" class:selected={selectedObjectId === actor.id}>
                            {#if renamingActorId === actor.id}
                              <input
                                class="cast-role-input"
                                type="text"
                                bind:value={renameActorValue}
                                onblur={() => commitActorRename(actor.id)}
                                onkeydown={(e) => { if (e.key === 'Enter') commitActorRename(actor.id); if (e.key === 'Escape') renamingActorId = null; }}
                                use:focusAndSelect
                              />
                            {:else}
                              <button class="cast-role-btn" title="Click to rename" onclick={() => startActorRename(actor.id)}>{actor.role}</button>
                            {/if}
                            <span class="cast-char">{CATALOGUE_CHARACTERS.find(c => c.id === actor.catalogueId)?.label ?? actor.catalogueId}</span>
                            <button
                              class="icon-btn"
                              class:active={expandedActorSettings.has(actor.id)}
                              title="Actor settings (idle clip, scale)"
                              onclick={() => {
                                const next = new Set(expandedActorSettings);
                                next.has(actor.id) ? next.delete(actor.id) : next.add(actor.id);
                                expandedActorSettings = next;
                                if (!actorScaleValues[actor.id]) {
                                  actorScaleValues = { ...actorScaleValues, [actor.id]: String(actor.scale ?? '') };
                                }
                              }}
                            >⚙</button>
                            <button class="icon-btn danger" onclick={() => removeActor(actor.id)} title="Remove actor">✕</button>
                          </li>
                          {#if expandedActorSettings.has(actor.id)}
                            {@const clips = discoveredClips[actor.id] ?? []}
                            <li class="anim-light-expand">
                              <div class="anim-subsection">
                                <div class="anim-row">
                                  <label class="anim-label" for="idle-{actor.id}">Idle clip</label>
                                  {#if clips.length > 0}
                                    <select
                                      id="idle-{actor.id}"
                                      class="actor-char-select"
                                      value={actor.idleAnimation ?? ''}
                                      onchange={(e) => activeDoc?.execute(new SetActorIdleAnimationCommand(actor.id, e.currentTarget.value || undefined))}
                                    >
                                      <option value="">(catalogue default)</option>
                                      {#each clips as clip}
                                        <option>{clip}</option>
                                      {/each}
                                    </select>
                                  {:else}
                                    <input
                                      id="idle-{actor.id}"
                                      class="rename-input"
                                      type="text"
                                      placeholder="clip name (load scene first)"
                                      value={actor.idleAnimation ?? ''}
                                      onchange={(e) => activeDoc?.execute(new SetActorIdleAnimationCommand(actor.id, e.currentTarget.value.trim() || undefined))}
                                    />
                                  {/if}
                                </div>
                                <div class="anim-row">
                                  <label class="anim-label" for="scale-{actor.id}">Scale</label>
                                  <input
                                    id="scale-{actor.id}"
                                    class="anim-number"
                                    type="number"
                                    step="0.1"
                                    min="0.01"
                                    placeholder="default"
                                    value={actorScaleValues[actor.id] ?? (actor.scale ?? '')}
                                    oninput={(e) => { actorScaleValues = { ...actorScaleValues, [actor.id]: e.currentTarget.value }; }}
                                    onchange={(e) => {
                                      const n = parseFloat(e.currentTarget.value);
                                      activeDoc?.execute(new SetActorScaleCommand(actor.id, isNaN(n) || e.currentTarget.value.trim() === '' ? undefined : n));
                                    }}
                                  />
                                </div>
                              </div>
                            </li>
                          {/if}
                        {/each}
                      </ul>
                    {/if}
                    {#if addingActor}
                      <form class="add-actor-form" onsubmit={(e) => { e.preventDefault(); addActor(); }}>
                        <input
                          class="rename-input"
                          placeholder="Role name"
                          bind:value={newActorRole}
                          aria-label="Role name"
                        />
                        <select class="actor-char-select" bind:value={newActorCatalogueId} aria-label="Character">
                          {#each CATALOGUE_CHARACTERS as char}
                            <option value={char.id}>{char.label}</option>
                          {/each}
                        </select>
                        <div class="add-actor-btns">
                          <button class="new-btn" type="submit">Add</button>
                          <button class="icon-btn" type="button" onclick={() => { addingActor = false; newActorRole = ''; }}>Cancel</button>
                        </div>
                      </form>
                    {/if}
                  </div>

                  <!-- Animations (Surface A — clip sequencer, Surface B — position keyframes) -->
                  {#if actors.length > 0}
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Animations</span>
                    </div>
                    {#each actors as actor}
                      {@const actorClips = clipTracks.filter(e => e.action.actorId === actor.id)}
                      {@const actorMoveTrack = transformTracks.find(e => e.action.targetId === actor.id && e.action.keyframes.property === '.position')}
                      {@const availableClips = discoveredClips[actor.id] ?? []}
                      <div class="anim-actor-group">
                        <button
                          class="anim-actor-header"
                          onclick={() => {
                            const next = new Set(expandedActorAnim);
                            next.has(actor.id) ? next.delete(actor.id) : next.add(actor.id);
                            expandedActorAnim = next;
                          }}
                        >
                          <span class="anim-actor-toggle">{expandedActorAnim.has(actor.id) ? '▾' : '▸'}</span>
                          <span class="anim-actor-name">{actor.role}</span>
                        </button>
                        {#if expandedActorAnim.has(actor.id)}
                          <!-- Clips sub-section -->
                          <div class="anim-subsection">
                            <span class="anim-sublabel">Clips</span>
                            {#if actorClips.length > 0}
                              <ul class="cast-list">
                                {#each actorClips as { action, index }}
                                  <li class="cast-row">
                                    <span class="cast-role anim-clip-name">{action.animationName}</span>
                                    <span class="cast-char">{action.startTime.toFixed(1)}s{action.endTime !== undefined ? `–${action.endTime.toFixed(1)}s` : ''}</span>
                                    <select
                                      class="anim-loop-sel"
                                      value={action.loop ?? 'once'}
                                      onchange={(e) => updateClipLoop(index, e.currentTarget.value as LoopStyle)}
                                    >
                                      <option value="once">×1</option>
                                      <option value="repeat">loop</option>
                                    </select>
                                    <button class="icon-btn danger" onclick={() => removeClipSegment(index)} title="Remove clip">✕</button>
                                  </li>
                                {/each}
                              </ul>
                            {/if}
                            {#if clipFormActorId === actor.id}
                              <form class="add-actor-form" onsubmit={(e) => { e.preventDefault(); commitAddClip(); }}>
                                {#if availableClips.length > 0}
                                  <select class="actor-char-select" bind:value={clipFormName}>
                                    {#each availableClips as clip}
                                      <option>{clip}</option>
                                    {/each}
                                  </select>
                                {:else}
                                  <input class="rename-input" placeholder="Clip name" bind:value={clipFormName} />
                                {/if}
                                <input class="anim-number" type="number" step="0.1" min="0" placeholder="Start (s)" bind:value={clipFormStart} />
                                <input class="anim-number" type="number" step="0.1" min="0" placeholder="End (opt)" bind:value={clipFormEnd} />
                                <select class="anim-loop-sel" bind:value={clipFormLoop}>
                                  <option value="once">×1</option>
                                  <option value="repeat">loop</option>
                                </select>
                                <div class="add-actor-btns">
                                  <button class="new-btn" type="submit">Add</button>
                                  <button class="icon-btn" type="button" onclick={() => (clipFormActorId = null)}>Cancel</button>
                                </div>
                              </form>
                            {:else}
                              <button class="new-btn anim-add-btn" onclick={() => openClipForm(actor.id, availableClips[0] ?? '')}>+ Clip</button>
                            {/if}
                          </div>
                          <!-- Blocks sub-section (high-level authored) -->
                          {@const thisActorBlocks = actorBlocks.filter(e => e.block.actorId === actor.id)}
                          <div class="anim-subsection">
                            <span class="anim-sublabel">Blocks</span>
                            {#if thisActorBlocks.length > 0}
                              <ul class="cast-list">
                                {#each thisActorBlocks as { block, index }}
                                  <li class="cast-row">
                                    <span class="cast-role anim-clip-name">{block.clip ?? '— idle —'}</span>
                                    <span class="cast-char">{block.startTime.toFixed(1)}s–{block.endTime.toFixed(1)}s</span>
                                    <button class="icon-btn danger" onclick={() => removeBlock(index)} title="Remove block">✕</button>
                                  </li>
                                {/each}
                              </ul>
                            {/if}
                            {#if blockFormActorId === actor.id}
                              <form class="add-actor-form" onsubmit={(e) => { e.preventDefault(); commitAddBlock(); }}>
                                <input class="anim-number" type="number" step="0.1" min="0" placeholder="Start (s)" bind:value={blockFormStart} />
                                <input class="anim-number" type="number" step="0.1" min="0" placeholder="End (s)" bind:value={blockFormEnd} />
                                {#if availableClips.length > 0}
                                  <select class="actor-char-select" bind:value={blockFormClip}>
                                    <option value="">— idle —</option>
                                    {#each availableClips as clip}
                                      <option>{clip}</option>
                                    {/each}
                                  </select>
                                {:else}
                                  <input class="rename-input" placeholder="Clip (optional)" bind:value={blockFormClip} />
                                {/if}
                                <div class="add-actor-btns">
                                  <button class="new-btn" type="submit">Add</button>
                                  <button class="icon-btn" type="button" onclick={() => (blockFormActorId = null)}>Cancel</button>
                                </div>
                              </form>
                            {:else}
                              <button class="new-btn anim-add-btn" onclick={() => openBlockForm(actor.id)}>+ Block</button>
                            {/if}
                          </div>
                          <!-- Position track sub-section -->
                          <div class="anim-subsection">
                            <span class="anim-sublabel">Position track</span>
                            {#if actorMoveTrack}
                              <ul class="cast-list">
                                {#each actorMoveTrack.action.keyframes.times as t, ki}
                                  <li class="cast-row">
                                    <span class="cast-role kf-time">{t.toFixed(2)}s</span>
                                    <span class="cast-char kf-pos">{actorMoveTrack.action.keyframes.values.slice(ki * 3, ki * 3 + 3).map(v => v.toFixed(2)).join(', ')}</span>
                                    <button class="icon-btn danger" onclick={() => removePositionKeyframe(actor.id, ki)} title="Remove keyframe">✕</button>
                                  </li>
                                {/each}
                              </ul>
                            {:else}
                              <p class="stage-empty">No position keyframes.</p>
                            {/if}
                            <button class="new-btn anim-add-btn" onclick={() => capturePositionKeyframe(actor.id)} title="Capture current world position at playhead time">⊕ Capture at ▶ {currentPosition.toFixed(1)}s</button>
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                  {/if}

                  <!-- Set Pieces -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Set Pieces</span>
                      <button class="new-btn" onclick={() => { addingSetPiece = !addingSetPiece; }} title="Add set piece">+ Add</button>
                    </div>
                    {#if scenePieces.length === 0 && !addingSetPiece}
                      <p class="stage-empty">No set pieces.</p>
                    {:else}
                      <ul class="cast-list">
                        {#each scenePieces as piece}
                          <li class="cast-row" class:selected={selectedObjectId === piece.name}>
                            <span class="cast-role">{piece.name}</span>
                            <button class="icon-btn danger" onclick={() => removeSetPiece(piece.name)} title="Remove set piece">✕</button>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                    {#if addingSetPiece}
                      <form class="add-actor-form" onsubmit={(e) => { e.preventDefault(); addSetPiece(); }}>
                        <select class="actor-char-select" bind:value={newSetPieceCatalogueId} aria-label="Set piece">
                          {#each CATALOGUE_SET_PIECES as piece}
                            <option value={piece.id}>{piece.label}</option>
                          {/each}
                        </select>
                        <div class="add-actor-btns">
                          <button class="new-btn" type="submit">Add</button>
                          <button class="icon-btn" type="button" onclick={() => { addingSetPiece = false; }}>Cancel</button>
                        </div>
                      </form>
                    {/if}
                  </div>

                  <!-- Lights -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Lights</span>
                    </div>
                    {#if sceneLights.length === 0}
                      <p class="stage-empty">No lights.</p>
                    {:else}
                      <ul class="cast-list">
                        {#each sceneLights as light}
                          {@const lightIntTrack = lightingTracks.find(e => e.action.lightId === light.id && e.action.keyframes.property === '.intensity')}
                          <li class="cast-row">
                            <span class="cast-role">{light.id}</span>
                            <span class="cast-char">{light.type}</span>
                            <button
                              class="icon-btn"
                              class:active={expandedLightAnim.has(light.id)}
                              title="Animate intensity"
                              onclick={() => {
                                const next = new Set(expandedLightAnim);
                                next.has(light.id) ? next.delete(light.id) : next.add(light.id);
                                expandedLightAnim = next;
                                if (!lightIntensityValues[light.id]) {
                                  lightIntensityValues = { ...lightIntensityValues, [light.id]: String(light.intensity) };
                                }
                              }}
                            >✦</button>
                          </li>
                          {#if expandedLightAnim.has(light.id)}
                            <li class="anim-light-expand">
                              <div class="anim-subsection">
                                <span class="anim-sublabel">Intensity track</span>
                                {#if lightIntTrack}
                                  <ul class="cast-list">
                                    {#each lightIntTrack.action.keyframes.times as t, ki}
                                      <li class="cast-row">
                                        <span class="cast-role kf-time">{t.toFixed(2)}s</span>
                                        <span class="cast-char">{lightIntTrack.action.keyframes.values[ki].toFixed(2)}</span>
                                        <button class="icon-btn danger" onclick={() => removeLightIntensityKeyframe(light.id, ki)} title="Remove">✕</button>
                                      </li>
                                    {/each}
                                  </ul>
                                {:else}
                                  <p class="stage-empty">No intensity keyframes.</p>
                                {/if}
                                <div class="anim-row">
                                  <input
                                    class="anim-number"
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    placeholder="Intensity"
                                    value={lightIntensityValues[light.id] ?? light.intensity}
                                    oninput={(e) => { lightIntensityValues = { ...lightIntensityValues, [light.id]: e.currentTarget.value }; }}
                                  />
                                  <button class="new-btn anim-add-btn" onclick={() => captureLightIntensity(light.id, lightIntensityValues[light.id] ?? String(light.intensity))}>⊕ {currentPosition.toFixed(1)}s</button>
                                </div>
                              </div>
                            </li>
                          {/if}
                        {/each}
                      </ul>
                    {/if}
                  </div>

                  <!-- Camera -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Camera</span>
                      {#if designMode}
                        <button class="new-btn" onclick={captureCameraKeyframe} title="Capture keyframe at current time">
                          + Keyframe
                        </button>
                      {/if}
                    </div>
                    {#if cameraKeyframes.length === 0}
                      <p class="stage-empty">{designMode ? 'No keyframes — orbit the design camera and click + Keyframe.' : 'No camera keyframes. Enable design mode to add.'}</p>
                    {:else}
                      <ul class="cast-list">
                        {#each cameraKeyframes as kf, i}
                          <li class="cast-row">
                            <span class="cast-role kf-time">{kf.time.toFixed(2)}s</span>
                            <span class="cast-char kf-pos">{kf.position.map((v) => v.toFixed(1)).join(', ')}</span>
                            <button class="icon-btn danger" onclick={() => removeCameraKeyframe(i)} title="Remove keyframe">✕</button>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </div>
                {:else}
                  <p class="panel-placeholder">Select or create a production.</p>
                {/if}
              {:else}
                {#if activeDoc}
                  <ScriptEditor
                    script={speakLines}
                    actors={actors.map(a => ({ id: a.id, label: a.role }))}
                    onchange={(s) => activeDoc?.execute(new SetSpeakLinesCommand(s))}
                  />
                {:else}
                  <p class="panel-placeholder">Select or create a production.</p>
                {/if}
              {/if}
            </div>
          </div>
        {/if}
      </Pane>
    </Splitpanes>
  </div>
  <div class="bottom-panel">
    <div class="bottom-panel-header">
      <button
        class="panel-tab"
        class:active={bottomTab === 'transport'}
        onclick={() => { bottomTab = 'transport'; bottomPanelOpen = true; }}
      >Transport</button>
      <button
        class="panel-tab"
        class:active={bottomTab === 'timeline'}
        onclick={() => { bottomTab = 'timeline'; bottomPanelOpen = true; }}
      >Timeline</button>
      <button
        class="panel-toggle"
        onclick={() => (bottomPanelOpen = !bottomPanelOpen)}
        aria-label="Toggle bottom panel"
      >{bottomPanelOpen ? '▼' : '▲'}</button>
    </div>
    {#if bottomPanelOpen}
      <div class="bottom-panel-body">
        {#if bottomTab === 'transport'}
          <TransportBar
            {isPlaying}
            {isToneSetup}
            {currentPosition}
            {sceneDuration}
            {voiceBackend}
            bind:voiceMode={voiceMode}
            bind:bubbleScale={bubbleScale}
            bind:sliderValue={sliderValue}
            bind:isSliderDragging={isSliderDragging}
            onplaypause={() => presenter?.handlePlayPauseClick()}
            onrewind={() => presenter?.handleRewindClick()}
            onsliderinput={(t) => presenter?.handleSliderInput(t)}
            onsliderpointerdown={() => presenter?.handleSliderPointerDown()}
            onsliderpointerup={() => presenter?.handleSliderPointerUp()}
          />
        {:else}
          <TimelinePanel
            {actors}
            {actorBlocks}
            {sceneDuration}
            {currentPosition}
            {discoveredClips}
            onupdateblock={(i, patch) => activeDoc?.execute(new UpdateActorBlockCommand(i, patch))}
            onremoveblock={(i) => activeDoc?.execute(new RemoveActorBlockCommand(i))}
          />
        {/if}
      </div>
    {/if}
  </div>
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
    flex: 1;
    min-height: 0;
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

  .examples-section {
    flex: 0 0 auto;
    border-top: 1px solid #2a2a2a;
  }

  /* ── Stage tab (right panel) ───────────────────── */

  .stage-tab-content {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .stage-tab-content :global(.screenplay) {
    flex: 1;
    min-height: 0;
  }

  .stage-section {
    border-bottom: 1px solid #2a2a2a;
    padding: 6px 10px 8px;
    flex-shrink: 0;
  }

  .stage-section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  .stage-section-label {
    font-size: 11px;
    font-weight: 600;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .stage-empty {
    font-size: 11px;
    color: #555;
    margin: 0;
  }

  .cast-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cast-row {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #222;
    border-radius: 3px;
    padding: 3px 6px;
    font-size: 12px;
  }

  .cast-row.selected {
    background: #1e2d3d;
    outline: 1px solid #4a9eff;
  }

  .cast-role {
    font-weight: 600;
    color: #ccc;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cast-role-btn {
    font-weight: 600;
    color: #ccc;
    font-size: 12px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    text-align: left;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cast-role-btn:hover {
    color: #fff;
    text-decoration: underline;
  }

  .cast-role-input {
    font-weight: 600;
    font-size: 12px;
    background: #1a1a2a;
    border: 1px solid #4a9eff;
    border-radius: 2px;
    color: #fff;
    padding: 1px 4px;
    flex: 1;
    min-width: 0;
  }

  .cast-char {
    color: #777;
    font-size: 11px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .add-actor-form {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-top: 6px;
  }

  .actor-char-select {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    color: #ccc;
    font-size: 12px;
    padding: 3px 6px;
    width: 100%;
  }

  .add-actor-btns {
    display: flex;
    gap: 6px;
  }

  .main-pane {
    position: relative;
    height: 100%;
    width: 100%;
  }

  .right-panel-open-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 10;
    background: rgba(26, 26, 26, 0.85);
    color: #666;
    border: 1px solid #333;
    border-radius: 3px;
    padding: 2px 7px;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .right-panel-open-btn:hover {
    color: #ccc;
    border-color: #555;
  }

  /* ── Right panel ───────────────────────────────── */

  .right-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    border-left: 1px solid #2a2a2a;
    overflow: hidden;
  }

  .right-panel-tab-bar {
    justify-content: flex-start;
  }

  .right-panel-close-btn {
    margin-left: auto;
    background: none;
    border: none;
    color: #555;
    font-size: 16px;
    line-height: 1;
    padding: 4px 8px;
    cursor: pointer;
    transition: color 0.1s;
  }

  .right-panel-close-btn:hover {
    color: #ccc;
  }

  .panel-placeholder {
    padding: 12px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }

  /* ── Layout: workspace + bottom panel ─────────── */

  .workspace {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* ── Left panel with tabs ──────────────────────── */

  .left-panel {
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #1a1a1a;
    overflow: hidden;
  }

  .tab-bar {
    display: flex;
    background: #1a1a1a;
    border-bottom: 1px solid #2a2a2a;
    flex-shrink: 0;
  }

  .tab-btn {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #666;
    padding: 6px 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .tab-btn:hover {
    color: #bbb;
  }

  .tab-btn.active {
    color: #4a9eff;
    border-bottom-color: #4a9eff;
  }

  .tab-content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }


  /* ── Bottom transport panel ────────────────────── */

  .bottom-panel {
    flex: 0 0 auto;
    background: #1a1a1a;
    border-top: 1px solid #333;
  }

  .bottom-panel-header {
    display: flex;
    align-items: center;
  }

  .panel-tab {
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: #666;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 4px 10px;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
  }

  .panel-tab:hover { color: #bbb; }
  .panel-tab.active { color: #4a9eff; border-bottom-color: #4a9eff; }

  .panel-toggle {
    margin-left: auto;
    background: none;
    border: none;
    color: #555;
    font-size: 11px;
    padding: 4px 8px;
    cursor: pointer;
    transition: color 0.1s;
  }

  .panel-toggle:hover {
    color: #ccc;
  }

  /* ── Animation authoring UI ────────────────────── */

  .anim-actor-group {
    border-left: 2px solid #2a2a2a;
    margin-bottom: 4px;
  }

  .anim-actor-header {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    background: none;
    border: none;
    color: #bbb;
    font-size: 12px;
    font-weight: 600;
    padding: 4px 6px;
    cursor: pointer;
    text-align: left;
    border-radius: 3px;
  }

  .anim-actor-header:hover {
    background: #222;
    color: #fff;
  }

  .anim-actor-toggle {
    color: #666;
    font-size: 10px;
    flex-shrink: 0;
  }

  .anim-actor-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .anim-subsection {
    padding: 4px 8px 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .anim-sublabel {
    font-size: 10px;
    font-weight: 600;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .anim-clip-name {
    flex: 1;
  }

  .anim-loop-sel {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    color: #aaa;
    font-size: 11px;
    padding: 1px 4px;
    flex-shrink: 0;
  }

  .anim-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .anim-label {
    font-size: 11px;
    color: #888;
    flex-shrink: 0;
  }

  .anim-number {
    background: #2a2a2a;
    border: 1px solid #3a3a3a;
    border-radius: 3px;
    color: #ccc;
    font-size: 12px;
    padding: 2px 6px;
    width: 70px;
    flex-shrink: 0;
  }

  .anim-add-btn {
    margin-top: 2px;
    align-self: flex-start;
  }

  .anim-light-expand {
    background: none;
    padding: 0;
    list-style: none;
  }

  .kf-time {
    color: #4a9eff;
    font-variant-numeric: tabular-nums;
    min-width: 52px;
    flex-shrink: 0;
  }

  .kf-pos {
    color: #aaa;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .icon-btn.active {
    color: #4a9eff;
  }
</style>
