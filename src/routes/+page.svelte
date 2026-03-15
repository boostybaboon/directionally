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
  import { defaultSceneShell, estimateDuration } from '../core/storage/sceneBuilder.js';
  import type { ScriptLine } from '$lib/sandbox/types';
  import { ProductionStore } from '../core/storage/ProductionStore.js';
  import type { StoredProduction } from '../core/storage/types.js';
  import { ProductionDocument } from '../core/document/ProductionDocument.js';
  import { RenameProductionCommand, SetSpeakLinesCommand, AddActorCommand, RemoveActorCommand, RenameActorCommand, AddSetPieceCommand, RemoveSetPieceCommand, MoveStagedActorCommand, MoveSetPieceCommand, SetSceneDurationCommand, CaptureLightIntensityKeyframeCommand, RemoveLightKeyframeCommand, SetActorIdleAnimationCommand, SetActorScaleCommand, AddActorBlockCommand, RemoveActorBlockCommand, UpdateActorBlockCommand, AddLightBlockCommand, RemoveLightBlockCommand, UpdateLightBlockCommand, AddCameraBlockCommand, RemoveCameraBlockCommand, UpdateCameraBlockCommand, UpdateCameraCommand, AddSetPieceBlockCommand, RemoveSetPieceBlockCommand, UpdateSetPieceBlockCommand } from '../core/document/commands.js';
  import type { StoredActor } from '../core/storage/types.js';
  import type { SpeakAction, TransformTrack, LightingTrack, ActorBlock, LightBlock, CameraBlock, SetPieceBlock } from '../core/domain/types.js';
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
  /** Dialogue lines for the ScriptEditor — derived from doc.script so explicit startTimes round-trip. */
  const speakLines = $derived<ScriptLine[]>(docSnapshot?.script ?? []);

  /** Speech segments derived from scheduled scene actions, used to display speech blocks on the timeline. */
  const speechSegments = $derived(
    (docSnapshot?.scene?.actions ?? [])
      .filter((a): a is SpeakAction => a.type === 'speak')
      .map((a, i) => ({
        index: i,
        actorId: a.actorId,
        startTime: a.startTime,
        endTime: a.startTime + estimateDuration(a.text),
        text: a.text,
      }))
  );

  /** Move a speech segment by adjusting timing while preserving the glue chain.
   * For the first line: set its startTime. For subsequent lines: adjust pauseAfter
   * of the previous line so the dragged line lands at newStartTime, then clear any
   * explicit startTime on the dragged line (timing flows from the chain). */
  function handleSpeechMove(segIndex: number, newStartTime: number) {
    if (!activeDoc) return;

    const activeLines = speakLines.filter((l) => l.text.trim().length > 0);

    if (segIndex === 0) {
      // First line has no predecessor — pin its startTime.
      let count = -1;
      const updated = speakLines.map((line) => {
        if (line.text.trim().length === 0) return line;
        count++;
        return count === 0 ? { ...line, startTime: parseFloat(newStartTime.toFixed(2)) } : line;
      });
      activeDoc.execute(new SetSpeakLinesCommand(updated));
      return;
    }

    // Simulate the chain up to the predecessor to find where its speech ends.
    let t = 1.0;
    for (let i = 0; i < segIndex - 1; i++) {
      const l = activeLines[i];
      const start = l.startTime ?? t;
      t = Math.max(start + 0.1, start + estimateDuration(l.text) + l.pauseAfter);
    }
    const prevLine = activeLines[segIndex - 1];
    const prevStart = prevLine.startTime ?? t;
    const prevSpeechEnd = prevStart + estimateDuration(prevLine.text);
    const newPauseAfter = parseFloat((newStartTime - prevSpeechEnd).toFixed(2));

    // Update pauseAfter on the predecessor; strip any explicit startTime from the
    // dragged line so it remains glued (timing flows from the chain).
    let count = -1;
    const updated = speakLines.map((line) => {
      if (line.text.trim().length === 0) return line;
      count++;
      if (count === segIndex - 1) return { ...line, pauseAfter: newPauseAfter };
      if (count === segIndex) {
        const { startTime: _pin, ...rest } = line;
        return rest as typeof line;
      }
      return line;
    });
    activeDoc.execute(new SetSpeakLinesCommand(updated));
  }

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

  // Contextual label for the gizmo toolbar: communicates what a drag will do.
  // For actors: t≈0 sets the base start position; any other time captures a keyframe.
  // Set pieces always set position (no keyframe support yet).
  const lightingTracks = $derived(
    (docSnapshot?.scene?.actions ?? []).flatMap((a, i) => a.type === 'lighting' ? [{ action: a as LightingTrack, index: i }] : [])
  );
  const actorBlocks = $derived(
    (docSnapshot?.scene?.blocks ?? []).flatMap((b, i) => b.type === 'actorBlock' ? [{ block: b as ActorBlock, index: i }] : [])
  );
  const lightBlocks = $derived(
    (docSnapshot?.scene?.blocks ?? []).flatMap((b, i) => b.type === 'lightBlock' ? [{ block: b as LightBlock, index: i }] : [])
  );
  const cameraBlocks = $derived(
    (docSnapshot?.scene?.blocks ?? []).flatMap((b, i) => b.type === 'cameraBlock' ? [{ block: b as CameraBlock, index: i }] : [])
  );
  const setPieceBlocks = $derived(
    (docSnapshot?.scene?.blocks ?? []).flatMap((b, i) => b.type === 'setPieceBlock' ? [{ block: b as SetPieceBlock, index: i }] : [])
  );

  // Selected block (for Stage tab Block section)
  let selBlockIdx = $state<number | null>(null);
  // Generic: any block type at the selected index
  const selBlockEntry = $derived(
    selBlockIdx !== null ? ((docSnapshot?.scene?.blocks ?? [])[selBlockIdx] ?? null) : null
  );
  const selBlock = $derived(
    selBlockEntry?.type === 'actorBlock'
      ? (actorBlocks.find((e) => e.index === selBlockIdx) ?? null)
      : null
  );
  const selBlockActor = $derived(
    selBlock ? (actors.find((a) => a.id === selBlock.block.actorId) ?? null) : null
  );
  const selLightBlock = $derived(
    selBlockEntry?.type === 'lightBlock'
      ? (lightBlocks.find((e) => e.index === selBlockIdx) ?? null)
      : null
  );
  const selCameraBlock = $derived(
    selBlockEntry?.type === 'cameraBlock'
      ? (cameraBlocks.find((e) => e.index === selBlockIdx) ?? null)
      : null
  );
  const selSetPieceBlock = $derived(
    selBlockEntry?.type === 'setPieceBlock'
      ? (setPieceBlocks.find((e) => e.index === selBlockIdx) ?? null)
      : null
  );

  // Re-computed after every command since docSnapshot changes when onChange fires.
  const canUndo = $derived(docSnapshot !== null && (activeDoc?.canUndo ?? false));
  const canRedo = $derived(docSnapshot !== null && (activeDoc?.canRedo ?? false));

  // If the user clicks a different actor in the viewport while an actor block is selected,
  // clear the block selection so the Stage panel doesn't show a stale block.
  // Non-actor block types (light/camera/setPiece) are not tied to viewport selection.
  $effect(() => {
    if (selectedObjectId !== null && selBlock !== null && selBlock.block.actorId !== selectedObjectId) {
      selBlockIdx = null;
      presenter?.selectSceneObject(null);
    }
  });

  // Per-actor and per-light expand state
  let expandedActorSettings = $state(new Set<string>());
  let expandedLightAnim = $state(new Set<string>());

  // Per-light intensity input values (light.id → string)
  let lightIntensityValues = $state<Record<string, string>>({});

  // Clip names discovered from loaded GLTFs at runtime, keyed by actor ID.
  let discoveredClips = $state<Record<string, string[]>>({});

  // Per-actor scale input values (actor.id → string) for the settings panel.
  let actorScaleValues = $state<Record<string, string>>({}); 

  // Selected scene object (actor ID or set-piece name); driven by Presenter raycasting.
  let selectedObjectId = $state<string | null>(null);

  const dragHint = $derived((() => {
    if (!designMode) return '';
    if (selectedObjectId && selBlockIdx !== null && selBlock?.block.actorId === selectedObjectId) {
      return 'drag actor → end position auto-captured';
    }
    if (selSetPieceBlock && selectedObjectId === selSetPieceBlock.block.targetId) {
      return 'drag set piece → end position auto-captured';
    }
    if (selCameraBlock && !selectedObjectId) {
      return 'orbit camera → end look-at auto-captured on drag end';
    }
    if (currentPosition < 0.05) {
      return selectedObjectId ? 'drag → sets spawn position' : 'click an item, then drag to set its start position';
    }
    return '';
  })());

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

  function newProduction() {
    const prod = ProductionStore.create('Untitled Production');
    productions = ProductionStore.list();
    loadProduction(prod);
  }

  function loadProduction(prod: StoredProduction) {
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
    activeDoc.execute(new MoveSetPieceCommand(name, [0, 0, 0], [0, 0, 0]));
    addingSetPiece = false;
  }

  function removeSetPiece(name: string) {
    activeDoc?.execute(new RemoveSetPieceCommand(name));
  }

  // ── Animation authoring handlers ───────────────────────────────────────────

  function setSceneDuration(value: string) {
    if (!activeDoc) return;
    const n = parseFloat(value);
    activeDoc.execute(new SetSceneDurationCommand(isNaN(n) || value.trim() === '' ? undefined : n));
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

  function removeBlock(index: number) {
    activeDoc?.execute(new RemoveActorBlockCommand(index));
  }

  function captureBlockPosition(end: boolean) {
    if (selBlockIdx === null || !activeDoc || !selBlock) return;
    if (!designMode) designMode = true;
    const transform = presenter?.getObjectTransform(selBlock.block.actorId);
    if (!transform) return;
    const pos = transform.position as [number, number, number];
    activeDoc.execute(new UpdateActorBlockCommand(selBlockIdx, {
      [end ? 'endPosition' : 'startPosition']: pos,
    }));
  }

  function captureDesignCameraForBlock() {
    if (selBlockIdx === null || !activeDoc || !selCameraBlock) return;
    if (!designMode) designMode = true;
    const state = presenter?.getDesignCameraState();
    if (!state) return;
    activeDoc.execute(new UpdateCameraBlockCommand(selBlockIdx, {
      endPosition: state.position,
      endLookAt: state.lookAt,
    }));
  }

  function captureInitialCamera() {
    if (!activeDoc || !designMode) return;
    const state = presenter?.getDesignCameraState();
    if (!state) return;
    const current = activeDoc.current.scene?.camera;
    if (!current) return;
    activeDoc.execute(new UpdateCameraCommand({ ...current, position: state.position, lookAt: state.lookAt }));
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
      if (selBlockIdx !== null && selBlock?.block.actorId === id) {
        // Block selected: drag auto-captures end position.
        activeDoc.execute(new UpdateActorBlockCommand(selBlockIdx, { endPosition: position }));
      } else if (currentPosition < 0.05 && selBlockIdx === null) {
        // t≈0, no block: drag sets the actor's base spawn position.
        activeDoc.execute(new MoveStagedActorCommand(id, position, rotation));
      }
    } else {
      if (selBlockIdx !== null && selSetPieceBlock?.block.targetId === id) {
        // Set piece block selected: drag auto-captures end position/rotation.
        activeDoc.execute(new UpdateSetPieceBlockCommand(selBlockIdx, { endPosition: position, endRotation: rotation }));
      } else {
        activeDoc.execute(new MoveSetPieceCommand(id, position, rotation));
      }
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
          {#if designMode && activeDoc}
            <div class="undo-redo-overlay">
              <button class="undo-redo-btn" disabled={!canUndo} onclick={() => activeDoc!.undo()} title="Undo (Ctrl+Z)" aria-label="Undo">↩</button>
              <button class="undo-redo-btn" disabled={!canRedo} onclick={() => activeDoc!.redo()} title="Redo (Ctrl+Y)" aria-label="Redo">↪</button>
            </div>
          {/if}
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
            rotationEnabled={!(selBlockIdx !== null && selBlock?.block.actorId === selectedObjectId)}
            objectSelectable={(id) => {
              const isActor = actors.some((a) => a.id === id);
              const isSetPiece = scenePieces.some((p) => p.name === id);
              if (isActor) {
                return currentPosition < 0.05 || (selBlockIdx !== null && selBlock?.block.actorId === id);
              }
              if (isSetPiece) {
                return currentPosition < 0.05 || (selBlockIdx !== null && selSetPieceBlock?.block.targetId === id);
              }
              return true;
            }}
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

                  <!-- Selected block properties -->
                  {#if selBlock}
                    {@const blkClips = discoveredClips[selBlock.block.actorId] ?? []}
                    <div class="stage-section">
                      <div class="stage-section-header">
                        <span class="stage-section-label">Block — {selBlockActor?.role ?? selBlock.block.actorId}</span>
                        <button class="icon-btn danger" onclick={() => { removeBlock(selBlockIdx!); selBlockIdx = null; presenter?.selectSceneObject(null); }} title="Remove block">✕</button>
                      </div>
                      <div class="anim-row">
                        <label class="anim-label" for="blk-clip">Clip</label>
                        {#if blkClips.length > 0}
                          <select
                            id="blk-clip"
                            class="actor-char-select"
                            value={selBlock.block.clip ?? ''}
                            onchange={(e) => activeDoc?.execute(new UpdateActorBlockCommand(selBlockIdx!, { clip: e.currentTarget.value || undefined }))}
                          >
                            <option value="">— idle —</option>
                            {#each blkClips as cl}<option>{cl}</option>{/each}
                          </select>
                        {:else}
                          <input
                            id="blk-clip"
                            class="rename-input"
                            placeholder="clip name"
                            value={selBlock.block.clip ?? ''}
                            onchange={(e) => activeDoc?.execute(new UpdateActorBlockCommand(selBlockIdx!, { clip: e.currentTarget.value.trim() || undefined }))}
                          />
                        {/if}
                      </div>
                      <div class="anim-row">
                        <label class="anim-label" for="blk-start">Start</label>
                        <input id="blk-start" class="anim-number" type="number" step="0.1" min="0"
                          value={selBlock.block.startTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateActorBlockCommand(selBlockIdx!, { startTime: n })); }}
                        />
                        <label class="anim-label" for="blk-end">End</label>
                        <input id="blk-end" class="anim-number" type="number" step="0.1" min="0"
                          value={selBlock.block.endTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateActorBlockCommand(selBlockIdx!, { endTime: n })); }}
                        />
                      </div>
                      <div class="anim-row">
                        <span class="anim-label">End pos</span>
                        {#if selBlock.block.endPosition}
                          <span class="anim-label blk-pos">{selBlock.block.endPosition.map((v) => v.toFixed(1)).join(', ')}</span>
                          <button class="icon-btn" onclick={() => activeDoc?.execute(new UpdateActorBlockCommand(selBlockIdx!, { endPosition: undefined }))} title="Clear end position (actor stays put)">✕</button>
                        {:else}
                          <span class="anim-label blk-pos blk-pos-none">stationary · drag to set</span>
                        {/if}
                      </div>
                    </div>
                  {/if}

                  <!-- Selected light block properties -->
                  {#if selLightBlock}
                    <div class="stage-section">
                      <div class="stage-section-header">
                        <span class="stage-section-label">Block — {selLightBlock.block.lightId}</span>
                        <button class="icon-btn danger" onclick={() => { activeDoc?.execute(new RemoveLightBlockCommand(selBlockIdx!)); selBlockIdx = null; }} title="Remove block">✕</button>
                      </div>
                      <div class="anim-row">
                        <label class="anim-label" for="lblk-start">Start</label>
                        <input id="lblk-start" class="anim-number" type="number" step="0.1" min="0"
                          value={selLightBlock.block.startTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateLightBlockCommand(selBlockIdx!, { startTime: n })); }}
                        />
                        <label class="anim-label" for="lblk-end">End</label>
                        <input id="lblk-end" class="anim-number" type="number" step="0.1" min="0"
                          value={selLightBlock.block.endTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateLightBlockCommand(selBlockIdx!, { endTime: n })); }}
                        />
                      </div>
                      <div class="anim-row">
                        <label class="anim-label" for="lblk-endint">End intensity</label>
                        <input id="lblk-endint" class="anim-number" type="number" step="0.1" min="0"
                          placeholder="unchanged"
                          value={selLightBlock.block.endIntensity ?? ''}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); activeDoc?.execute(new UpdateLightBlockCommand(selBlockIdx!, { endIntensity: isNaN(n) ? undefined : n })); }}
                        />
                      </div>
                    </div>
                  {/if}

                  <!-- Selected camera block properties -->
                  {#if selCameraBlock}
                    <div class="stage-section">
                      <div class="stage-section-header">
                        <span class="stage-section-label">Block — Camera</span>
                        <button class="icon-btn danger" onclick={() => { activeDoc?.execute(new RemoveCameraBlockCommand(selBlockIdx!)); selBlockIdx = null; }} title="Remove block">✕</button>
                      </div>
                      <div class="anim-row">
                        <label class="anim-label" for="cblk-start">Start</label>
                        <input id="cblk-start" class="anim-number" type="number" step="0.1" min="0"
                          value={selCameraBlock.block.startTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateCameraBlockCommand(selBlockIdx!, { startTime: n })); }}
                        />
                        <label class="anim-label" for="cblk-end">End</label>
                        <input id="cblk-end" class="anim-number" type="number" step="0.1" min="0"
                          value={selCameraBlock.block.endTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateCameraBlockCommand(selBlockIdx!, { endTime: n })); }}
                        />
                      </div>
                      <div class="anim-row">
                        <span class="anim-label">End pos</span>
                        {#if selCameraBlock.block.endPosition}
                          <span class="anim-label blk-pos">{selCameraBlock.block.endPosition.map((v) => v.toFixed(1)).join(', ')}</span>
                          <button class="icon-btn" onclick={() => activeDoc?.execute(new UpdateCameraBlockCommand(selBlockIdx!, { endPosition: undefined }))} title="Clear">✕</button>
                        {:else}
                          <span class="anim-label blk-pos blk-pos-none">not set · orbit to capture</span>
                        {/if}
                      </div>
                      <div class="anim-row">
                        <span class="anim-label">End look-at</span>
                        {#if selCameraBlock.block.endLookAt}
                          <span class="anim-label blk-pos">{selCameraBlock.block.endLookAt.map((v) => v.toFixed(1)).join(', ')}</span>
                          <button class="icon-btn" onclick={() => activeDoc?.execute(new UpdateCameraBlockCommand(selBlockIdx!, { endLookAt: undefined }))} title="Clear">✕</button>
                        {:else}
                          <span class="anim-label blk-pos blk-pos-none">not set · orbit to capture</span>
                        {/if}
                      </div>
                      {#if designMode}
                        <div class="anim-row">
                          <button class="new-btn" onclick={captureDesignCameraForBlock} title="Capture current design camera as block end state">⊕ Capture end</button>
                        </div>
                      {/if}
                    </div>
                  {/if}

                  <!-- Selected set piece block properties -->
                  {#if selSetPieceBlock}
                    <div class="stage-section">
                      <div class="stage-section-header">
                        <span class="stage-section-label">Block — {selSetPieceBlock.block.targetId}</span>
                        <button class="icon-btn danger" onclick={() => { activeDoc?.execute(new RemoveSetPieceBlockCommand(selBlockIdx!)); selBlockIdx = null; }} title="Remove block">✕</button>
                      </div>
                      <div class="anim-row">
                        <label class="anim-label" for="spblk-start">Start</label>
                        <input id="spblk-start" class="anim-number" type="number" step="0.1" min="0"
                          value={selSetPieceBlock.block.startTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateSetPieceBlockCommand(selBlockIdx!, { startTime: n })); }}
                        />
                        <label class="anim-label" for="spblk-end">End</label>
                        <input id="spblk-end" class="anim-number" type="number" step="0.1" min="0"
                          value={selSetPieceBlock.block.endTime}
                          onchange={(e) => { const n = parseFloat(e.currentTarget.value); if (!isNaN(n)) activeDoc?.execute(new UpdateSetPieceBlockCommand(selBlockIdx!, { endTime: n })); }}
                        />
                      </div>
                      <div class="anim-row">
                        <span class="anim-label">End pos</span>
                        {#if selSetPieceBlock.block.endPosition}
                          <span class="anim-label blk-pos">{selSetPieceBlock.block.endPosition.map((v) => v.toFixed(1)).join(', ')}</span>
                          <button class="icon-btn" onclick={() => activeDoc?.execute(new UpdateSetPieceBlockCommand(selBlockIdx!, { endPosition: undefined }))} title="Clear end position">✕</button>
                        {:else}
                          <span class="anim-label blk-pos blk-pos-none">stationary · drag to set</span>
                        {/if}
                      </div>
                      <div class="anim-row">
                        <span class="anim-label">End rotation</span>
                        {#if selSetPieceBlock.block.endRotation}
                          <span class="anim-label blk-pos">{selSetPieceBlock.block.endRotation.map((v) => (v * 180 / Math.PI).toFixed(1)).join('°, ')}°</span>
                          <button class="icon-btn" onclick={() => activeDoc?.execute(new UpdateSetPieceBlockCommand(selBlockIdx!, { endRotation: undefined }))} title="Clear end rotation">✕</button>
                        {:else}
                          <span class="anim-label blk-pos blk-pos-none">no rotation · drag to set</span>
                        {/if}
                      </div>
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
                        <button class="new-btn" onclick={captureInitialCamera} title="Capture design camera as the scene's starting position">⊕ Initial pos</button>
                        <button class="new-btn" onclick={() => presenter?.snapDesignCameraToPlayback()} title="Snap design view to match the playback camera (P)">⊙ Snap view</button>
                      {/if}
                    </div>
                    <div class="anim-row">
                      <span class="anim-label">Initial pos</span>
                      <span class="anim-label blk-pos">{(docSnapshot?.scene?.camera.position ?? []).map((v: number) => v.toFixed(1)).join(', ')}</span>
                    </div>
                    {#if !designMode}
                      <p class="stage-empty">Enable design mode to capture initial camera position.</p>
                    {/if}
                  </div>

                  <!-- Voice -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Voice</span>
                    </div>
                    <div class="anim-row">
                      <label class="anim-label" for="voice-mode-stage">Mode</label>
                      <select
                        id="voice-mode-stage"
                        class="actor-char-select"
                        bind:value={voiceMode}
                        disabled={!isToneSetup}
                      >
                        <option value="espeak">eSpeak (fast)</option>
                        <option value="web-speech">Browser voices</option>
                        <option value="kokoro">Kokoro (~92 MB)</option>
                      </select>
                    </div>
                    <div class="anim-row">
                      <label class="anim-label" for="bubble-scale-stage">Bubble</label>
                      <input
                        id="bubble-scale-stage"
                        type="range"
                        min="0.1"
                        max="1.5"
                        step="0.05"
                        bind:value={bubbleScale}
                        style="flex:1"
                      />
                      <span class="anim-label">{bubbleScale.toFixed(1)}</span>
                    </div>
                  </div>
                {:else}
                  <p class="panel-placeholder">Select or create a production.</p>
                {/if}
              {:else}
                {#if activeDoc}
                  <ScriptEditor
                    script={speakLines}
                    actors={actors.map(a => ({ id: a.id, label: a.role }))}
                    currentPosition={currentPosition}
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
      <span class="bottom-panel-label">Timeline</span>
      <button
        class="panel-toggle"
        onclick={() => (bottomPanelOpen = !bottomPanelOpen)}
        aria-label="Toggle bottom panel"
      >{bottomPanelOpen ? '▼' : '▲'}</button>
    </div>
    {#if bottomPanelOpen}
      <div class="bottom-panel-body">
        <TransportBar
          {isPlaying}
          {isToneSetup}
          {currentPosition}
          {sceneDuration}
          {voiceBackend}
          bind:sliderValue={sliderValue}
          bind:isSliderDragging={isSliderDragging}
          onplaypause={() => presenter?.handlePlayPauseClick()}
          onrewind={() => { selBlockIdx = null; presenter?.selectSceneObject(null); presenter?.handleRewindClick(); }}
          onsliderinput={(t) => { selBlockIdx = null; presenter?.selectSceneObject(null); presenter?.handleSliderInput(t); }}
          onsliderpointerdown={() => presenter?.handleSliderPointerDown()}
          onsliderpointerup={() => presenter?.handleSliderPointerUp()}
        />
        <TimelinePanel
          {actors}
          {actorBlocks}
          lightBlocks={lightBlocks}
          cameraBlocks={cameraBlocks}
          setPieceBlocks={setPieceBlocks}
          lights={sceneLights}
          setPieces={scenePieces}
          {sceneDuration}
          {currentPosition}
          {discoveredClips}
          {speechSegments}
          onspeechmove={handleSpeechMove}
          selectedBlockIndex={selBlockIdx}
          focusedActorId={selectedObjectId}
          onblockselect={(i) => {
            selBlockIdx = i;
            if (i !== null) {
              if (rightTab !== 'stage') rightTab = 'stage';
              const raw = (docSnapshot?.scene?.blocks ?? [])[i];
              if (raw) presenter?.handleSliderInput(raw.endTime);
              if (raw?.type === 'actorBlock') {
                presenter?.selectSceneObject(raw.actorId);
              } else if (raw?.type === 'setPieceBlock') {
                presenter?.selectSceneObject(raw.targetId);
              } else {
                presenter?.selectSceneObject(null);
              }
            } else {
              presenter?.selectSceneObject(null);
            }
          }}
          onaddblock={(actorId, startTime, endTime) => {
            if (!activeDoc) return;
            if (!designMode) designMode = true;
            const newBlock: ActorBlock = { type: 'actorBlock', actorId, startTime, endTime };
            activeDoc.execute(new AddActorBlockCommand(newBlock));
            const newIdx = (activeDoc.current.scene?.blocks?.length ?? 1) - 1;
            selBlockIdx = newIdx;
            if (rightTab !== 'stage') rightTab = 'stage';
            selectedObjectId = actorId;
            presenter?.selectSceneObject(actorId);
            presenter?.handleSliderInput(endTime);
          }}
          onupdateblock={(i, patch) => activeDoc?.execute(new UpdateActorBlockCommand(i, patch))}
          onremoveblock={(i) => { activeDoc?.execute(new RemoveActorBlockCommand(i)); if (selBlockIdx === i) { selBlockIdx = null; presenter?.selectSceneObject(null); } }}
          onaddlightblock={(lightId, startTime, endTime) => {
            if (!activeDoc) return;
            const newBlock: LightBlock = { type: 'lightBlock', lightId, startTime, endTime };
            activeDoc.execute(new AddLightBlockCommand(newBlock));
            selBlockIdx = (activeDoc.current.scene?.blocks?.length ?? 1) - 1;
            if (rightTab !== 'stage') rightTab = 'stage';
          }}
          onupdatelightblock={(i, patch) => activeDoc?.execute(new UpdateLightBlockCommand(i, patch))}
          onremovelightblock={(i) => { activeDoc?.execute(new RemoveLightBlockCommand(i)); if (selBlockIdx === i) selBlockIdx = null; }}
          onaddcamerablock={(startTime, endTime) => {
            if (!activeDoc) return;
            const newBlock: CameraBlock = { type: 'cameraBlock', startTime, endTime };
            activeDoc.execute(new AddCameraBlockCommand(newBlock));
            selBlockIdx = (activeDoc.current.scene?.blocks?.length ?? 1) - 1;
            if (rightTab !== 'stage') rightTab = 'stage';
          }}
          onupdatecamerablock={(i, patch) => activeDoc?.execute(new UpdateCameraBlockCommand(i, patch))}
          onremovecamerablock={(i) => { activeDoc?.execute(new RemoveCameraBlockCommand(i)); if (selBlockIdx === i) selBlockIdx = null; }}
          onaddsetpieceblock={(targetId, startTime, endTime) => {
            if (!activeDoc) return;
            const newBlock: SetPieceBlock = { type: 'setPieceBlock', targetId, startTime, endTime };
            activeDoc.execute(new AddSetPieceBlockCommand(newBlock));
            selBlockIdx = (activeDoc.current.scene?.blocks?.length ?? 1) - 1;
            if (rightTab !== 'stage') rightTab = 'stage';
            presenter?.selectSceneObject(targetId);
            presenter?.handleSliderInput(endTime);
          }}
          onupdatesetpieceblock={(i, patch) => activeDoc?.execute(new UpdateSetPieceBlockCommand(i, patch))}
          onremovesetpieceblock={(i) => { activeDoc?.execute(new RemoveSetPieceBlockCommand(i)); if (selBlockIdx === i) selBlockIdx = null; }}
        />
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

  .undo-redo-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 10;
    display: flex;
    gap: 4px;
  }

  .undo-redo-btn {
    width: 44px;
    height: 44px;
    background: rgba(28, 28, 32, 0.82);
    color: #aaa;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .undo-redo-btn:disabled {
    opacity: 0.3;
    cursor: default;
    pointer-events: none;
  }

  .undo-redo-btn:not(:disabled):hover {
    background: rgba(55, 55, 65, 0.90);
    color: #e0e0e0;
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

  .bottom-panel-label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
    padding: 4px 10px;
    user-select: none;
  }

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

  /* ── Block section position display ───────────── */

  .blk-pos {
    font-variant-numeric: tabular-nums;
    color: #888;
    font-size: 10px;
  }
  .blk-pos-none {
    font-style: italic;
    color: #555;
  }

  /* ── Shared animation/block authoring layout ───── */

  .anim-subsection {
    padding: 4px 8px 6px 12px;
    display: flex;
    flex-direction: column;
    gap: 4px;
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

  .icon-btn.active {
    color: #4a9eff;
  }
</style>
