<script lang="ts">
  import { onMount } from 'svelte';
  import Presenter from '$lib/Presenter.svelte';
  import TransportBar from '$lib/TransportBar.svelte';
  import TimelinePanel from '$lib/TimelinePanel.svelte';
  import CataloguePanel from '$lib/CataloguePanel.svelte';
  import type { VoiceMode, VoiceBackend, SelectedEntity } from '$lib/types.js';
  import { Splitpanes, Pane } from 'svelte-splitpanes';
  import { exampleModel1 } from '$lib/exampleModel1';
  import { exampleModel2 } from '$lib/exampleModel2';
  import { exampleModel3 } from '$lib/exampleModel3';
  import { exampleModel4 } from '$lib/exampleModel4';
  import { flyIntoRoomExample } from '$lib/FlyIntoRoomExample';
  import { exampleProduction1Scene } from '$lib/exampleProduction1';
  import { twoRobotsScene } from '$lib/twoRobotsScene';
  import type { Model } from '$lib/Model';
  import ScriptEditor from '$lib/script/ScriptEditor.svelte';
  import ProductionScriptView from '$lib/script/ProductionScriptView.svelte';
  import PropertiesPanel from '$lib/PropertiesPanel.svelte';
  import { storedSceneToModel } from '../core/storage/storedSceneToModel.js';
  import { starterSceneShell, defaultSceneShell, estimateDuration, getActiveScene } from '../core/storage/sceneBuilder.js';
  import type { ScriptLine } from '$lib/script/types';
  import { isDialogueLine } from '$lib/script/types';
  import { ProductionStore } from '../core/storage/ProductionStore.js';
  import type { StoredProduction, StoredActor, StoredGroup, NamedScene, ProductionSpeechSettings } from '../core/storage/types.js';
  import { getScenes } from '../core/storage/types.js';
  import { ProductionDocument } from '../core/document/ProductionDocument.js';
  import { RenameProductionCommand, SetSpeakLinesCommand, SetSceneScriptCommand, SetSceneTransitionCommand, SetGroupNotesCommand, AddActorCommand, RemoveActorCommand, RenameActorCommand, SetActorCatalogueIdCommand, AddSetPieceCommand, RemoveSetPieceCommand, StageActorCommand, UnstageActorCommand, MoveStagedActorCommand, MoveSetPieceCommand, SetSceneDurationCommand, CaptureLightIntensityKeyframeCommand, RemoveLightKeyframeCommand, SetActorIdleAnimationCommand, SetActorScaleCommand, SetActorVoiceCommand, SetActorTintCommand, AddActorBlockCommand, RemoveActorBlockCommand, UpdateActorBlockCommand, AddLightBlockCommand, RemoveLightBlockCommand, UpdateLightBlockCommand, AddCameraBlockCommand, RemoveCameraBlockCommand, UpdateCameraBlockCommand, UpdateCameraCommand, AddSetPieceBlockCommand, RemoveSetPieceBlockCommand, UpdateSetPieceBlockCommand, AddSceneCommand, RenameSceneCommand, RemoveSceneCommand, SwitchSceneCommand, AddGroupCommand, RenameGroupCommand, RemoveGroupCommand, SetProductionSpeechSettingsCommand, InsertSceneAtCommand, InsertGroupAtCommand, MoveNodeCommand, UpdateSceneLightCommand, AddSceneLightCommand, RemoveSceneLightCommand, AddDirectionLineCommand, RemoveDirectionLineCommand, UpdateDirectionLineCommand, SetSceneEnvironmentCommand } from '../core/document/commands.js';
  import { ACTOR_COLORS, hexToNum, numToHex } from '$lib/actorColors.js';
  import type { SpeakAction, TransformTrack, LightingTrack, ActorBlock, LightBlock, CameraBlock, SetPieceBlock, ActorVoice, KokoroVoice, LightConfig } from '../core/domain/types.js';
  import { getCharacters, getLights, getSetPieces } from '../core/catalogue/catalogue.js';
  import { CATALOGUE_ENTRIES } from '../core/catalogue/entries.js';
  import type { SetPiece } from '../core/domain/types.js';

  const CATALOGUE_CHARACTERS = getCharacters(CATALOGUE_ENTRIES);
  const CATALOGUE_SET_PIECES = getSetPieces(CATALOGUE_ENTRIES);
  const CATALOGUE_LIGHTS = getLights(CATALOGUE_ENTRIES);

  // Preset voice configurations covering the four main persona styles.
  const VOICE_PRESETS: { label: string; voice: ActorVoice }[] = [
    {
      label: 'Female (British)',
      voice: {
        persona: { gender: 'female', accent: 'british', pitch: 0.3, rate: 0 },
        espeak:  { voice: 'en-gb-x-rp+f1', pitch: 60, pitchRange: 63, rate: 160 },
        kokoro:  'af_heart',
      },
    },
    {
      label: 'Male (British)',
      voice: {
        persona: { gender: 'male', accent: 'british', pitch: -0.5, rate: -0.27 },
        espeak:  { voice: 'en-gb-x-rp+m3', pitch: 40, pitchRange: 58, rate: 150 },
        kokoro:  'am_echo',
      },
    },
    {
      label: 'Female (American)',
      voice: {
        persona: { gender: 'female', accent: 'american', pitch: 0.2, rate: 0 },
        espeak:  { voice: 'en-us+f1', pitch: 58, pitchRange: 60, rate: 165 },
        kokoro:  'af_sarah',
      },
    },
    {
      label: 'Male (American)',
      voice: {
        persona: { gender: 'male', accent: 'american', pitch: -0.3, rate: -0.2 },
        espeak:  { voice: 'en-us+m3', pitch: 42, pitchRange: 55, rate: 155 },
        kokoro:  'am_michael',
      },
    },
  ];

  const KOKORO_VOICES: KokoroVoice[] = [
    'af_heart', 'af_alloy', 'af_aoede', 'af_bella', 'af_jessica',
    'af_kore',  'af_nicole', 'af_nova', 'af_river', 'af_sarah', 'af_sky',
    'am_adam',  'am_echo',  'am_eric',  'am_fenrir', 'am_liam',
    'am_michael', 'am_onyx', 'am_puck', 'am_santa',
    'bf_alice', 'bf_emma',  'bf_isabella', 'bf_lily',
    'bm_daniel', 'bm_fable', 'bm_george', 'bm_lewis',
  ];

  function modelFromProduction(prod: StoredProduction) {
    return storedSceneToModel(getActiveScene(prod) ?? starterSceneShell(), prod.actors ?? []);
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
  const MAIN_VIEW_KEY = 'directionally_main_view';
  let mainView = $state<'3d' | 'script'>((localStorage.getItem(MAIN_VIEW_KEY) as '3d' | 'script' | null) ?? '3d');
  $effect(() => { localStorage.setItem(MAIN_VIEW_KEY, mainView); });
  let rightTab = $state<'staging' | 'script'>('staging');
  let designMode = $state(false);
  let seedWorkflow2Fn = $state<(() => void) | undefined>();

  // Presentation mode — plays all scenes in depth-first order, canvas fills the window.
  let presentationMode = $state(false);
  let presentationQueue = $state<string[]>([]);      // remaining scene IDs to play
  let prePresentationSceneId = $state<string | undefined>(undefined);
  let wakeLock = $state<WakeLockSentinel | null>(null);

  // Productions
  let productions = $state<StoredProduction[]>(ProductionStore.list());
  let activeProductionId = $state<string | null>(null);
  /** True after the currently-active scene is deleted — blanks 3D + all views until user selects another scene. */
  let sceneDeletedBlank = $state(false);
  /** Active document — owns undo/redo history and command execution. */
  let activeDoc = $state<ProductionDocument | null>(null);
  /**
   * Reactive snapshot of the active document's current state.
   * ProductionDocument.current is a class getter (not $state), so Svelte can't
   * track it directly. This is updated in the document's onChange callback so
   * all $derived expressions stay in sync when commands execute.
   */
  let docSnapshot = $state<StoredProduction | null>(null);
  // Effective TTS mode: active production override wins over global default.
  const effectiveVoiceMode = $derived<VoiceMode>(
    (docSnapshot?.speechSettings?.engine as VoiceMode | undefined) ?? voiceMode
  );
  const effectiveBubbleScale = $derived<number>(
    docSnapshot?.speechSettings?.bubbleScale ?? bubbleScale
  );
  /** Cast list from the active document; updates automatically on command execution. */
  const actors = $derived(docSnapshot?.actors ?? []);

  /** Active scene ID for the tree — falls back to first scene when none explicitly set. */
  const treeActiveSceneId = $derived(
    sceneDeletedBlank ? undefined : (docSnapshot?.activeSceneId ?? (docSnapshot ? getScenes(docSnapshot.tree ?? [])[0]?.id : undefined))
  );

  /** Active scene derived from the current snapshot. Updates whenever a command executes. */
  const activeScene = $derived(sceneDeletedBlank ? undefined : (docSnapshot ? getActiveScene(docSnapshot) : undefined));

  /** Stable string ID of the active scene — reads from the document primitive so $effects only fire on actual scene switches, not on every command. */
  const activeSceneId = $derived(docSnapshot?.activeSceneId);

  /** Active NamedScene node (includes metadata + script field). */
  const activeNamedScene = $derived(
    sceneDeletedBlank ? undefined : (docSnapshot ? getScenes(docSnapshot.tree ?? []).find((ns) => ns.id === (docSnapshot!.activeSceneId ?? getScenes(docSnapshot!.tree ?? [])[0]?.id)) : undefined)
  );

  /** Dialogue lines only — used by timeline speech segments and drag-to-retime (SetSpeakLinesCommand). */
  const speakLines = $derived(
    activeNamedScene?.script
      ? activeNamedScene.script.filter(isDialogueLine)
      : (activeScene?.actions ?? [])
          .filter((a): a is SpeakAction => a.type === 'speak')
          .map(a => ({ actorId: a.actorId, text: a.text, pauseAfter: a.pauseAfter ?? 0, startTime: a.startTime }))
  );

  /** Full ScriptLine[] (dialogue + directions) for the ScriptEditor. */
  const sceneScriptLines = $derived(
    activeNamedScene?.script
      ?? (activeScene?.actions ?? [])
          .filter((a): a is SpeakAction => a.type === 'speak')
          .map(a => ({ actorId: a.actorId, text: a.text, pauseAfter: a.pauseAfter ?? 0, startTime: a.startTime }))
  );

  /** Speech segments derived from scheduled scene actions, used to display speech blocks on the timeline. */
  const speechSegments = $derived(
    (activeScene?.actions ?? [])
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
  let renamingId = $state<string | null>(null);
  let renameValue = $state('');
  let renamingActorId = $state<string | null>(null);
  let renameActorValue = $state('');
  let renamingSceneId = $state<string | null>(null);
  let renameSceneValue = $state('');
  let renamingGroupId = $state<string | null>(null);
  let renameGroupValue = $state('');
  // Tree selection state (for contextual + Act / + Scene footer buttons)
  let treeSelectedId = $state<string | null>(null);
  // Context menu open state for the ⋯ per-row menu
  let openContextMenuId = $state<string | null>(null);
  // Drag-and-drop state
  let dragNodeId = $state<string | null>(null);
  let dragOverId = $state<string | null>(null);
  let dragOverHalf = $state<'before' | 'inside'>('before');

  const scenePieces = $derived(activeScene?.set ?? []);
  const sceneLights = $derived(activeScene?.lights ?? []);

  // Contextual label for the gizmo toolbar: communicates what a drag will do.
  // For actors: t≈0 sets the base start position; any other time captures a keyframe.
  // Set pieces always set position (no keyframe support yet).
  const lightingTracks = $derived(
    (activeScene?.actions ?? []).flatMap((a, i) => a.type === 'lighting' ? [{ action: a as LightingTrack, index: i }] : [])
  );
  const actorBlocks = $derived(
    (activeScene?.blocks ?? []).flatMap((b, i) => b.type === 'actorBlock' ? [{ block: b as ActorBlock, index: i }] : [])
  );
  const lightBlocks = $derived(
    (activeScene?.blocks ?? []).flatMap((b, i) => b.type === 'lightBlock' ? [{ block: b as LightBlock, index: i }] : [])
  );
  const cameraBlocks = $derived(
    (activeScene?.blocks ?? []).flatMap((b, i) => b.type === 'cameraBlock' ? [{ block: b as CameraBlock, index: i }] : [])
  );
  const setPieceBlocks = $derived(
    (activeScene?.blocks ?? []).flatMap((b, i) => b.type === 'setPieceBlock' ? [{ block: b as SetPieceBlock, index: i }] : [])
  );

  // ── Selection state ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

  // Primary selection state — single source of truth for what the user is currently editing.
  // All selection events (viewport clicks, block clicks, spawn buttons) produce a new value here.
  let selectionState = $state<SelectedEntity>(null);

  // Derived shortcuts used by timeline, right panel, and Presenter prop:
  const selBlockIdx = $derived(
    selectionState && 'blockIndex' in selectionState ? selectionState.blockIndex : null
  );
  const selectedObjectId = $derived(
    selectionState?.kind === 'actor-initial' ? selectionState.actorId :
    selectionState?.kind === 'actor-block' ? selectionState.actorId :
    selectionState?.kind === 'setpiece-initial' ? selectionState.setPieceId :
    selectionState?.kind === 'setpiece-block' ? selectionState.setPieceId :
    null
  );

  // Generic: any block type at the selected index
  const selBlockEntry = $derived(
    selBlockIdx !== null ? ((activeScene?.blocks ?? [])[selBlockIdx] ?? null) : null
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

  // selectedEntity is selectionState — used as prop to PropertiesPanel
  const selectedEntity = $derived(selectionState);

  // Re-computed after every command since docSnapshot changes when onChange fires.
  const canUndo = $derived(docSnapshot !== null && (activeDoc?.canUndo ?? false));
  const canRedo = $derived(docSnapshot !== null && (activeDoc?.canRedo ?? false));

  // Reset selection when the active scene changes.
  $effect(() => {
    void activeSceneId; // string primitive — only changes value when user switches scene
    selectionState = null;
  });

  // Per-actor and per-light expand state
  let expandedActorSettings = $state(new Set<string>());
  let expandedLightAnim = $state(new Set<string>());
  // Per-production cast expand state (left sidebar)
  let expandedProductionCast = $state(new Set<string>());

  // Per-light intensity input values (light.id → string)
  let lightIntensityValues = $state<Record<string, string>>({});

  // Clip names discovered from loaded GLTFs at runtime, keyed by actor ID.
  let discoveredClips = $state<Record<string, string[]>>({}); 
  // Per-actor scale input values (actor.id → string) for the settings panel.
  let actorScaleValues = $state<Record<string, string>>({});

  const dragHint = $derived((() => {
    if (!designMode || !selectionState) return '';
    const k = selectionState.kind;
    if (k === 'actor-initial' || k === 'actor-block' || k === 'setpiece-initial' || k === 'setpiece-block')
      return 'drag → set position';
    if (k === 'camera-initial' || k === 'camera-block')
      return 'orbit camera → capture to set playback camera position';
    if (k === 'light-initial' || k === 'light-block')
      return 'edit properties to set values';
    return '';
  })());

  const hudMode = $derived((() => {
    if (!designMode) return '';
    if (selectionState?.kind.endsWith('-block')) return 'Block End';
    if (currentPosition < 0.05) return 'Scene Start';
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
    const sceneId = crypto.randomUUID();
    const starter: NamedScene = { id: sceneId, name: 'Scene 1', scene: starterSceneShell() };
    let prod = ProductionStore.create();
    prod = { ...prod, tree: [starter], activeSceneId: sceneId };
    ProductionStore.save(prod);
    productions = ProductionStore.list();
    loadProduction(prod);
    renamingId = prod.id;
    renameValue = prod.name;
  }

  function loadProduction(prod: StoredProduction) {
    sceneDeletedBlank = false;
    let prevSceneId = prod.activeSceneId;
    activeDoc = new ProductionDocument(
      prod,
      (updated) => {
        const prevId = prevSceneId;
        prevSceneId = updated.activeSceneId;
        const sceneChanged = updated.activeSceneId !== prevId;
        // Detect deletion of the active scene: the previous active scene ID no longer
        // exists in the updated tree (RemoveSceneCommand auto-switched activeSceneId).
        const activeSceneWasDeleted = sceneChanged && prevId !== undefined
          && !getScenes(updated.tree ?? []).some(ns => ns.id === prevId);
        docSnapshot = updated;
        productions = ProductionStore.list();
        if (activeSceneWasDeleted) {
          sceneDeletedBlank = true;
          presenter?.loadModel(storedSceneToModel(defaultSceneShell(), []), 0);
        } else {
          const wasBlank = sceneDeletedBlank;
          if (wasBlank) sceneDeletedBlank = false;
          presenter?.loadModel(modelFromProduction(updated), (sceneChanged || wasBlank) ? 0 : undefined);
        }
      },
      (updated) => ProductionStore.save(updated),
    );
    docSnapshot = prod;
    activeProductionId = prod.id;
    activeExampleId = null;
    presenter?.loadModel(modelFromProduction(prod), 0);
    sidebarOpen = false;
    // Switch to Script tab for brand-new productions so the author sees the script surface first.
    const isEmpty = !prod.actors?.length && !getScenes(prod.tree ?? []).length;
    if (isEmpty) rightTab = 'script';
    // Auto-expand the loaded production's cast in the sidebar.
    expandedProductionCast = new Set([prod.id]);
  }

  function deleteProduction(id: string) {
    ProductionStore.delete(id);
    productions = ProductionStore.list();
    if (activeProductionId === id) {
      activeProductionId = null;
      activeDoc = null;
      docSnapshot = null;
      sceneDeletedBlank = false;
      presenter?.loadModel(storedSceneToModel(defaultSceneShell(), []), 0);
    }
  }

  function startPresentation() {
    if (!docSnapshot || !activeDoc) return;
    const scenes = getScenes(docSnapshot.tree ?? []);
    if (scenes.length === 0) return;
    prePresentationSceneId = docSnapshot.activeSceneId;
    presentationQueue = scenes.slice(1).map((s) => s.id);
    activeDoc.execute(new SwitchSceneCommand(scenes[0].id));
    // loadModel(model, 0) fires via onChange (sceneChanged=true); ondidload → presenter.play()
    presentationMode = true;
    designMode = false;
    void document.documentElement.requestFullscreen?.();
    if ('wakeLock' in navigator) {
      void navigator.wakeLock.request('screen').then((s) => { wakeLock = s; }).catch(() => {});
    }
  }

  function onPresentationSceneEnd() {
    if (presentationQueue.length === 0) {
      // End of show — freeze on the last scene's final frame rather than exiting
      // presentation mode. The transport has nothing scheduled past this point so
      // animations naturally hold their last state; we just need to stop the engine.
      if (isPlaying) presenter?.handlePlayPauseClick();
      return;
    }
    const nextId = presentationQueue[0];
    presentationQueue = presentationQueue.slice(1);
    activeDoc?.execute(new SwitchSceneCommand(nextId));
    // loadModel(model, 0) fires via onChange; ondidload → presenter.play()
  }

  function exitPresentation() {
    presentationMode = false;
    if (isPlaying) presenter?.handlePlayPauseClick();
    if (prePresentationSceneId) {
      activeDoc?.execute(new SwitchSceneCommand(prePresentationSceneId));
    }
    prePresentationSceneId = undefined;
    presentationQueue = [];
    if (document.fullscreenElement) void document.exitFullscreen();
    void wakeLock?.release();
    wakeLock = null;
  }

  function deepCopyTree(tree: Array<StoredGroup | NamedScene>): Array<StoredGroup | NamedScene> {
    return tree.map((node) => {
      if ((node as StoredGroup).type === 'group') {
        const g = node as StoredGroup;
        return { ...g, children: deepCopyTree(g.children) };
      }
      return { ...node, id: crypto.randomUUID() } as NamedScene;
    });
  }

  function duplicateProduction(prod: StoredProduction) {
    const copy = ProductionStore.create(`${prod.name} (copy)`);
    ProductionStore.save({
      ...copy,
      actors: prod.actors ? [...prod.actors] : undefined,
      tree: prod.tree ? deepCopyTree(prod.tree) : undefined,
      activeSceneId: undefined,
      script: prod.script ? [...prod.script] : undefined,
      modifiedAt: Date.now(),
    });
    productions = ProductionStore.list();
  }

  function startRename(id: string) {
    renameValue = productions.find((p) => p.id === id)?.name ?? '';
    renamingId = id;
  }

  function addGroup() {
    if (!activeDoc) return;
    const groupCount = (activeDoc.current.tree ?? []).filter((n) => 'type' in n).length;
    const name = `Act ${groupCount + 1}`;
    const id = crypto.randomUUID();
    activeDoc.execute(new AddGroupCommand(name, id));
    renamingGroupId = id;
    renameGroupValue = name;
  }

  function insertSceneAt(parentGroupId: string | undefined, index: number) {
    if (!activeDoc) return;
    const newId = crypto.randomUUID();
    activeDoc.execute(new InsertSceneAtCommand('', parentGroupId, index, newId));
    const newScene = getScenes(activeDoc.current.tree ?? []).find((ns) => ns.id === newId);
    renamingSceneId = newId;
    renameSceneValue = newScene?.name ?? '';
  }

  function insertGroupAt(parentGroupId: string | undefined, index: number) {
    if (!activeDoc) return;
    const groupCount = (activeDoc.current.tree ?? []).filter((n) => 'type' in n).length;
    const name = `Act ${groupCount + 1}`;
    const id = crypto.randomUUID();
    activeDoc.execute(new InsertGroupAtCommand(name, index, id, parentGroupId));
    renamingGroupId = id;
    renameGroupValue = name;
  }

  function addActor() {
    if (!activeDoc) return;
    const allActors = activeDoc.current.actors ?? [];
    const base = 'Character';
    let num = allActors.length + 1;
    let role = allActors.length === 0 ? base : `${base} ${num}`;
    while (allActors.some((a) => a.role === role)) { num++; role = `${base} ${num}`; }
    const actor: StoredActor = {
      id: crypto.randomUUID(),
      role,
      catalogueId: CATALOGUE_CHARACTERS[0]?.id ?? '',
      tint: hexToNum(ACTOR_COLORS[allActors.length % ACTOR_COLORS.length]),
    };
    activeDoc.execute(new AddActorCommand(actor));
    renamingActorId = actor.id;
    renameActorValue = actor.role;
  }

  function removeActor(actorId: string) {
    activeDoc?.execute(new RemoveActorCommand(actorId));
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
    const current = getActiveScene(activeDoc.current)?.camera;
    if (!current) return;
    activeDoc.execute(new UpdateCameraCommand({ ...current, position: state.position, lookAt: state.lookAt }));
  }

  function enterSpawnMode(entityId: string) {
    if (!designMode) designMode = true;
    if (entityId === '__camera__') {
      selectionState = { kind: 'camera-initial' };
    } else if (scenePieces.some((p) => p.name === entityId)) {
      selectionState = { kind: 'setpiece-initial', setPieceId: entityId };
    } else {
      selectionState = { kind: 'actor-initial', actorId: entityId };
    }
    if (currentPosition >= 0.05) presenter?.handleSliderInput(0);
  }

  function handleViewportSelect(id: string | null) {
    if (id === null) { selectionState = null; return; }
    if (currentPosition < 0.05) {
      if (actors.some((a) => a.id === id)) { selectionState = { kind: 'actor-initial', actorId: id }; return; }
      if (scenePieces.some((p) => p.name === id)) { selectionState = { kind: 'setpiece-initial', setPieceId: id }; return; }
    }
  }

  /**
   * Called by Presenter when a catalogue item is dropped onto the design viewport,
   * and by the CataloguePanel "+" button (position defaults to [0,0,0]).
   * Adds the character/set-piece/light and selects it.
   */
  function handleCatalogueDrop(
    kind: 'character' | 'setpiece' | 'light',
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
      const castIndex = (activeDoc.current.actors ?? []).length;
      const actor: StoredActor = { id: crypto.randomUUID(), role, catalogueId: id, tint: hexToNum(ACTOR_COLORS[castIndex % ACTOR_COLORS.length]) };
      activeDoc.execute(new AddActorCommand(actor));
      // Set selectionState now so the sceneLoadCount $effect in Presenter re-applies
      // selection visuals after the next loadModel triggered by MoveStagedActorCommand.
      selectionState = { kind: 'actor-initial', actorId: actor.id };
      activeDoc.execute(new MoveStagedActorCommand(actor.id, position));
    } else if (kind === 'setpiece') {
      const entry = CATALOGUE_SET_PIECES.find((p) => p.id === id);
      if (!entry) return;
      const existing = getActiveScene(activeDoc.current)?.set ?? [];
      const base = entry.id;
      const count = existing.filter((p) => p.name === base || p.name.startsWith(base + '-')).length;
      const name = count === 0 ? base : `${base}-${count + 1}`;
      const piece: SetPiece = {
        name,
        geometry: entry.geometry,
        material: entry.material,
        ...(entry.defaultRotation ? { rotation: entry.defaultRotation } : {}),
      };
      activeDoc.execute(new AddSetPieceCommand(piece));
      selectionState = { kind: 'setpiece-initial', setPieceId: name };
      activeDoc.execute(new MoveSetPieceCommand(name, position));
    } else {
      const entry = CATALOGUE_LIGHTS.find((l) => l.id === id);
      if (!entry) return;
      const existing = getActiveScene(activeDoc.current)?.lights ?? [];
      const base = id.replace('-light', '');
      const count = existing.filter((l) => l.id === base || l.id.startsWith(base + '-')).length;
      const lightId = count === 0 ? base : `${base}-${count + 1}`;
      activeDoc.execute(new AddSceneLightCommand({ ...entry.config, id: lightId } as LightConfig));
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

  function addScene(parentGroupId?: string, prepend = false) {
    if (!activeDoc) return;
    const newId = crypto.randomUUID();
    activeDoc.execute(new AddSceneCommand('', parentGroupId, newId, prepend));
    const newScene = getScenes(activeDoc.current.tree ?? []).find((ns) => ns.id === newId);
    renamingSceneId = newId;
    renameSceneValue = newScene?.name ?? '';
  }

  // ── Tree helpers ───────────────────────────────────────────────────────────

  type NodeCtx = { parentId: string | undefined; index: number; isGroup: boolean };

  function locateNode(
    tree: Array<StoredGroup | NamedScene>,
    id: string,
    parentId: string | undefined = undefined,
  ): NodeCtx | null {
    for (let i = 0; i < tree.length; i++) {
      const n = tree[i];
      if (n.id === id) return { parentId, index: i, isGroup: (n as StoredGroup).type === 'group' };
      if ((n as StoredGroup).type === 'group') {
        const found = locateNode((n as StoredGroup).children, id, n.id);
        if (found) return found;
      }
    }
    return null;
  }

  function treeNodeById(
    tree: Array<StoredGroup | NamedScene>,
    id: string,
  ): StoredGroup | NamedScene | null {
    for (const n of tree) {
      if (n.id === id) return n;
      if ((n as StoredGroup).type === 'group') {
        const found = treeNodeById((n as StoredGroup).children, id);
        if (found) return found;
      }
    }
    return null;
  }

  function contextualAddScene() {
    if (!activeDoc || !docSnapshot) return;
    const tree = docSnapshot.tree ?? [];
    if (!treeSelectedId) { insertSceneAt(undefined, tree.length); return; }
    const ctx = locateNode(tree, treeSelectedId);
    if (!ctx) { insertSceneAt(undefined, tree.length); return; }
    if (ctx.isGroup) {
      const grp = treeNodeById(tree, treeSelectedId) as StoredGroup;
      insertSceneAt(treeSelectedId, grp.children.length);
    } else {
      insertSceneAt(ctx.parentId, ctx.index + 1);
    }
  }

  function contextualAddGroup() {
    if (!activeDoc || !docSnapshot) return;
    const tree = docSnapshot.tree ?? [];
    if (!treeSelectedId) { insertGroupAt(undefined, tree.length); return; }
    const ctx = locateNode(tree, treeSelectedId);
    if (!ctx) { insertGroupAt(undefined, tree.length); return; }
    if (ctx.isGroup) {
      const grp = treeNodeById(tree, treeSelectedId) as StoredGroup;
      insertGroupAt(treeSelectedId, grp.children.length);
    } else {
      insertGroupAt(ctx.parentId, ctx.index + 1);
    }
  }

  function getDropHalf(e: DragEvent, el: HTMLElement): 'before' | 'inside' {
    const rect = el.getBoundingClientRect();
    return e.clientY - rect.top < rect.height / 2 ? 'before' : 'inside';
  }

  function handleTreeDrop(e: DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragNodeId || !activeDoc || !docSnapshot || dragNodeId === targetId) {
      dragNodeId = null; dragOverId = null; return;
    }
    const tree = docSnapshot.tree ?? [];
    // Sentinel drop zone at the very end of the root list
    if (targetId === '__tree-end__') {
      activeDoc.execute(new MoveNodeCommand(dragNodeId, undefined, tree.length));
      dragNodeId = null; dragOverId = null; return;
    }
    const targetNode = treeNodeById(tree, targetId);
    const targetCtx = locateNode(tree, targetId);
    if (!targetCtx) { dragNodeId = null; dragOverId = null; return; }

    let newParentId: string | undefined;
    let newIndex: number;
    if ((targetNode as StoredGroup)?.type === 'group' && dragOverHalf === 'inside') {
      newParentId = targetId;
      newIndex = (targetNode as StoredGroup).children.length;
    } else if (dragOverHalf === 'before') {
      newParentId = targetCtx.parentId;
      newIndex = targetCtx.index;
    } else {
      newParentId = targetCtx.parentId;
      newIndex = targetCtx.index + 1;
    }
    activeDoc.execute(new MoveNodeCommand(dragNodeId, newParentId, newIndex));
    dragNodeId = null;
    dragOverId = null;
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

    // Re-acquire wake lock if the page becomes visible again during presentation
    // (the sentinel is automatically released when the page is hidden).
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && presentationMode && 'wakeLock' in navigator) {
        void navigator.wakeLock.request('screen').then((s) => { wakeLock = s; }).catch(() => {});
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && presentationMode) { e.preventDefault(); exitPresentation(); return; }
      if (e.key === 'Escape' && openContextMenuId !== null) { openContextMenuId = null; return; }
      if (!activeDoc) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); activeDoc.undo(); }
      if (mod && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); activeDoc.redo(); }
    }
    window.addEventListener('keydown', handleKeyDown);

    function handleWindowPointerdown(e: PointerEvent) {
      if (openContextMenuId !== null && !(e.target as Element)?.closest?.('.tree-ctx-menu, .tree-ctx-btn')) {
        openContextMenuId = null;
      }
    }
    window.addEventListener('pointerdown', handleWindowPointerdown);

    if (import.meta.env.DEV) {
      void import('../core/document/buildWorkflow1.js').then(({ seedWorkflow1 }) => {
        (window as unknown as Record<string, unknown>).__seedWorkflow1 = () => {
          const p = seedWorkflow1();
          console.info('[dev] Seeded "' + p.name + '" (' + p.id + ') — reloading…');
          window.location.reload();
        };
      });
    }
    void import('../core/document/buildWorkflow2.js').then(({ seedWorkflow2 }) => {
      seedWorkflow2Fn = () => {
        seedWorkflow2();
        window.location.reload();
      };
      if (import.meta.env.DEV) {
        (window as unknown as Record<string, unknown>).__seedWorkflow2 = seedWorkflow2Fn;
      }
    });

    return () => {
      mq.removeEventListener('change', onChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handleWindowPointerdown);
    };
  });
</script>

<!-- Single layout: Splitpanes always present; left pane collapses to 0 on mobile.
     Presenter lives only in the right pane so it is never destroyed at the breakpoint. -->

{#snippet treeNodeRow(node: StoredGroup | NamedScene, parentId: string | undefined, depth: number)}
  {#if (node as StoredGroup).type === 'group'}
    {@const grp = node as StoredGroup}
    <li
      class="cast-row act-header"
      class:tree-selected={treeSelectedId === grp.id}
      class:drag-over-before={dragOverId === grp.id && dragOverHalf === 'before'}
      class:drag-over-inside={dragOverId === grp.id && dragOverHalf === 'inside'}
      draggable="true"
      style="padding-left: {6 + depth * 12}px"
      role="treeitem"
      aria-selected={treeSelectedId === grp.id}
      onclick={(e) => { e.stopPropagation(); treeSelectedId = grp.id; }}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); treeSelectedId = grp.id; } }}
      ondragstart={(e) => { dragNodeId = grp.id; e.dataTransfer?.setData('text/plain', grp.id); }}
      ondragover={(e) => { e.preventDefault(); dragOverId = grp.id; dragOverHalf = getDropHalf(e, e.currentTarget as HTMLElement); }}
      ondragleave={(e) => { if (dragOverId === grp.id && !e.currentTarget.contains(e.relatedTarget as Node)) dragOverId = null; }}
      ondrop={(e) => handleTreeDrop(e, grp.id)}
      ondragend={() => { dragNodeId = null; dragOverId = null; }}
    >
      <span class="drag-handle" aria-hidden="true">⠿</span>
      {#if renamingGroupId === grp.id}
        <input
          class="cast-role-input"
          type="text"
          bind:value={renameGroupValue}
          onblur={() => { activeDoc?.execute(new RenameGroupCommand(grp.id, renameGroupValue)); renamingGroupId = null; }}
          onkeydown={(e) => { if (e.key === 'Enter') { activeDoc?.execute(new RenameGroupCommand(grp.id, renameGroupValue)); renamingGroupId = null; } if (e.key === 'Escape') renamingGroupId = null; }}
          use:focusAndSelect
        />
      {:else}
        <span class="cast-role act-label">{grp.name}</span>
        <span class="tree-spacer"></span>
        <div class="tree-ctx-wrap">
          <button
            class="icon-btn tree-ctx-btn"
            onclick={(e) => { e.stopPropagation(); openContextMenuId = openContextMenuId === grp.id ? null : grp.id; }}
            title="More options"
          >⋯</button>
          {#if openContextMenuId === grp.id}
            <div class="tree-ctx-menu">
              <button class="tree-ctx-item" onclick={(e) => { e.stopPropagation(); renameGroupValue = grp.name; renamingGroupId = grp.id; openContextMenuId = null; }}>Rename</button>
              <button class="tree-ctx-item danger" onclick={(e) => { e.stopPropagation(); activeDoc?.execute(new RemoveGroupCommand(grp.id)); openContextMenuId = null; }}>Delete</button>
            </div>
          {/if}
        </div>
      {/if}
    </li>
    {#each grp.children as child (child.id)}
      {@render treeNodeRow(child, grp.id, depth + 1)}
    {/each}
  {:else}
    {@const ns = node as NamedScene}
    <li
      class="cast-row"
      class:indent={depth > 0}
      class:selected={ns.id === treeActiveSceneId}
      class:tree-selected={treeSelectedId === ns.id}
      class:drag-over-before={dragOverId === ns.id && dragOverHalf === 'before'}
      class:drag-over-inside={dragOverId === ns.id && dragOverHalf === 'inside'}
      draggable="true"
      style="padding-left: {6 + depth * 12}px"
      role="treeitem"
      aria-selected={treeSelectedId === ns.id}
      onclick={(e) => { e.stopPropagation(); treeSelectedId = ns.id; }}
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); treeSelectedId = ns.id; } }}
      ondragstart={(e) => { dragNodeId = ns.id; e.dataTransfer?.setData('text/plain', ns.id); }}
      ondragover={(e) => { e.preventDefault(); dragOverId = ns.id; dragOverHalf = getDropHalf(e, e.currentTarget as HTMLElement); }}
      ondragleave={(e) => { if (dragOverId === ns.id && !e.currentTarget.contains(e.relatedTarget as Node)) dragOverId = null; }}
      ondrop={(e) => handleTreeDrop(e, ns.id)}
      ondragend={() => { dragNodeId = null; dragOverId = null; }}
    >
      <span class="drag-handle" aria-hidden="true">⠿</span>
      {#if renamingSceneId === ns.id}
        <input
          class="cast-role-input"
          type="text"
          bind:value={renameSceneValue}
          onblur={() => { activeDoc?.execute(new RenameSceneCommand(ns.id, renameSceneValue)); renamingSceneId = null; }}
          onkeydown={(e) => { if (e.key === 'Enter') { activeDoc?.execute(new RenameSceneCommand(ns.id, renameSceneValue)); renamingSceneId = null; } if (e.key === 'Escape') renamingSceneId = null; }}
          use:focusAndSelect
        />
      {:else}
        <button
          class="cast-role-btn"
          onclick={(e) => { e.stopPropagation(); treeSelectedId = ns.id; activeDoc?.execute(new SwitchSceneCommand(ns.id)); }}
          title="Switch to scene"
        >{ns.name}</button>
        <span class="tree-spacer"></span>
        <div class="tree-ctx-wrap">
          <button
            class="icon-btn tree-ctx-btn"
            onclick={(e) => { e.stopPropagation(); openContextMenuId = openContextMenuId === ns.id ? null : ns.id; }}
            title="More options"
          >⋯</button>
          {#if openContextMenuId === ns.id}
            <div class="tree-ctx-menu">
              <button class="tree-ctx-item" onclick={(e) => { e.stopPropagation(); renameSceneValue = ns.name; renamingSceneId = ns.id; openContextMenuId = null; }}>Rename</button>
              <button class="tree-ctx-item danger" onclick={(e) => { e.stopPropagation(); activeDoc?.execute(new RemoveSceneCommand(ns.id)); openContextMenuId = null; }}>Delete</button>
            </div>
          {/if}
        </div>
      {/if}
    </li>
  {/if}
{/snippet}

{#snippet leftPanelContent()}
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
                        {#each productions as prod (prod.id)}
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
                              <div class="prod-row-main">
                                <button
                                  class="prod-expand-btn"
                                  onclick={() => {
                                    const next = new Set(expandedProductionCast);
                                    next.has(prod.id) ? next.delete(prod.id) : next.add(prod.id);
                                    expandedProductionCast = next;
                                  }}
                                  title="Toggle cast"
                                  aria-label="Toggle cast list"
                                >{expandedProductionCast.has(prod.id) ? '▼' : '▶'}</button>
                                <button
                                  class="scene-btn"
                                  class:active={activeProductionId === prod.id}
                                  onclick={() => {
                                    if (activeProductionId === prod.id) {
                                      const next = new Set(expandedProductionCast);
                                      next.has(prod.id) ? next.delete(prod.id) : next.add(prod.id);
                                      expandedProductionCast = next;
                                    } else {
                                      loadProduction(prod);
                                    }
                                  }}
                                >{prod.name}</button>
                                {#if activeProductionId === prod.id && docSnapshot && getScenes(docSnapshot.tree ?? []).length > 0}
                                  <button class="present-btn" onclick={startPresentation} title="Present all scenes in order" aria-label="Present production">⏵⏵ Present</button>
                                {/if}
                                <div class="prod-actions">
                                  <button class="icon-btn" onclick={() => startRename(prod.id)} title="Rename">✎</button>
                                  <button class="icon-btn" onclick={() => duplicateProduction(prod)} title="Duplicate">⎘</button>
                                  <button class="icon-btn danger" onclick={() => deleteProduction(prod.id)} title="Delete">✕</button>
                                </div>
                              </div>
                            {/if}
                            {#if expandedProductionCast.has(prod.id)}
                              {@const isActive = activeProductionId === prod.id}
                              {@const prodActors = isActive ? actors : (prod.actors ?? [])}
                              <div class="prod-cast">
                                {#if isActive}
                                  {#if prodActors.length === 0}
                                    <p class="stage-empty">No cast.</p>
                                  {:else}
                                    <div class="cast-col-header">
                                      <span class="cast-col-label-name">Cast member</span>
                                      <span class="cast-col-label-badge">In scene</span>
                                    </div>
                                    <ul class="cast-list">
                                      {#each prodActors as actor}
                                        {@const isStaged = (activeScene?.stagedActors ?? []).some(sa => sa.actorId === actor.id)}
                                        <li class="cast-row" class:selected={selectedObjectId === actor.id} class:in-scene={isStaged}>
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
                                          <input
                                            type="color"
                                            class="actor-tint-swatch"
                                            value={actor.tint !== undefined ? numToHex(actor.tint) : ACTOR_COLORS[(actors.indexOf(actor)) % ACTOR_COLORS.length]}
                                            title="Actor tint colour"
                                            oninput={(e) => activeDoc?.execute(new SetActorTintCommand(actor.id, hexToNum(e.currentTarget.value)))}
                                            aria-label="Actor tint"
                                          />
                                          <select class="actor-char-select cast-char-select" value={actor.catalogueId} onchange={(e) => activeDoc?.execute(new SetActorCatalogueIdCommand(actor.id, e.currentTarget.value))} aria-label="Character model">
                                            {#each CATALOGUE_CHARACTERS as char}
                                              <option value={char.id}>{char.label}</option>
                                            {/each}
                                          </select>
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
                                          <button
                                            class="stage-badge"
                                            class:staged={isStaged}
                                            title={isStaged ? 'In scene — click to remove' : 'Add to scene'}
                                            onclick={() => {
                                              if (isStaged) {
                                                activeDoc?.execute(new UnstageActorCommand(actor.id));
                                              } else {
                                                const n = (activeScene?.stagedActors ?? []).length;
                                                const x = (n % 2 === 0 ? 1 : -1) * Math.ceil(n / 2) * 3;
                                                activeDoc?.execute(new StageActorCommand({ actorId: actor.id, startPosition: [x, 0, 0] }));
                                              }
                                            }}
                                          >{isStaged ? '●' : '○'}</button>
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
                                              <div class="anim-row">
                                                <label class="anim-label" for="voice-preset-{actor.id}">Voice</label>
                                                <select
                                                  id="voice-preset-{actor.id}"
                                                  class="actor-char-select"
                                                  value={VOICE_PRESETS.findIndex((p) => JSON.stringify(p.voice) === JSON.stringify(actor.voice ?? VOICE_PRESETS[0].voice))}
                                                  onchange={(e) => {
                                                    const idx = parseInt(e.currentTarget.value);
                                                    if (idx >= 0 && idx < VOICE_PRESETS.length) {
                                                      const preset = VOICE_PRESETS[idx];
                                                      activeDoc?.execute(new SetActorVoiceCommand(actor.id, preset.voice));
                                                    }
                                                  }}
                                                >
                                                  {#each VOICE_PRESETS as preset, idx}
                                                    <option value={idx}>{preset.label}</option>
                                                  {/each}
                                                </select>
                                              </div>
                                              {#if voiceMode === 'kokoro'}
                                                <div class="anim-row">
                                                  <label class="anim-label" for="kokoro-voice-{actor.id}">Kokoro</label>
                                                  <select
                                                    id="kokoro-voice-{actor.id}"
                                                    class="actor-char-select"
                                                    value={actor.voice?.kokoro ?? (VOICE_PRESETS[0].voice.kokoro ?? '')}
                                                    onchange={(e) => {
                                                      const current = actor.voice ?? VOICE_PRESETS[0].voice;
                                                      activeDoc?.execute(new SetActorVoiceCommand(actor.id, { ...current, kokoro: e.currentTarget.value as KokoroVoice }));
                                                    }}
                                                  >
                                                    {#each KOKORO_VOICES as v}
                                                      <option value={v}>{v}</option>
                                                    {/each}
                                                  </select>
                                                </div>
                                              {/if}
                                            </div>
                                          </li>
                                        {/if}
                                      {/each}
                                    </ul>
                                  {/if}
                                  <button class="new-btn prod-cast-add" onclick={() => addActor()} title="Add character">+ Add</button>
                                {:else}
                                  {#if prodActors.length === 0}
                                    <p class="stage-empty">No cast.</p>
                                  {:else}
                                    <ul class="cast-list">
                                      {#each prodActors as actor}
                                        <li class="cast-row">
                                          <span class="cast-role">{actor.role}</span>
                                          <span class="cast-char">{CATALOGUE_CHARACTERS.find(c => c.id === actor.catalogueId)?.label ?? actor.catalogueId}</span>
                                        </li>
                                      {/each}
                                    </ul>
                                  {/if}
                                {/if}
                              </div>
                              {#if isActive && docSnapshot}
                                {@const prodTree = docSnapshot.tree ?? []}
                                <div class="prod-cast">
                                  <span class="cast-section-label">Scenes</span>
                                  <ul class="cast-list tree-list" role="tree" onclick={(e) => { if (e.target === e.currentTarget) treeSelectedId = null; }} onkeydown={(e) => { if (e.key === 'Escape') treeSelectedId = null; }}>
                                    {#each prodTree as node (node.id)}
                                      {@render treeNodeRow(node, undefined, 0)}
                                    {/each}
                                    {#if dragNodeId}
                                      <li
                                        class="tree-end-drop"
                                        class:drag-over-before={dragOverId === '__tree-end__'}
                                        ondragover={(e) => { e.preventDefault(); dragOverId = '__tree-end__'; dragOverHalf = 'before'; }}
                                        ondragleave={() => { if (dragOverId === '__tree-end__') dragOverId = null; }}
                                        ondrop={(e) => handleTreeDrop(e, '__tree-end__')}
                                      ></li>
                                    {/if}
                                  </ul>
                                  <div class="cast-add-row">
                                    <button class="new-btn prod-cast-add" onclick={() => contextualAddGroup()} title="Add act">+ Act</button>
                                    <button class="new-btn prod-cast-add" onclick={() => contextualAddScene()} title="Add scene">+ Scene</button>
                                  </div>
                                </div>
                                {#if docSnapshot.speechSettings !== undefined}
                                  {@const ss = docSnapshot.speechSettings}
                                  <div class="prod-cast">
                                    <span class="cast-section-label">Speech</span>
                                    <div class="audio-settings">
                                      <div class="anim-row">
                                        <label class="anim-label" for="speech-engine-{prod.id}">Engine</label>
                                        <select
                                          id="speech-engine-{prod.id}"
                                          class="actor-char-select"
                                          value={ss.engine}
                                          onchange={(e) => activeDoc?.execute(new SetProductionSpeechSettingsCommand({ engine: e.currentTarget.value as VoiceMode, bubbleScale: ss.bubbleScale }))}
                                        >
                                          <option value="espeak">eSpeak (fast)</option>
                                          <option value="web-speech">Browser voices</option>
                                          <option value="kokoro">Kokoro (~92 MB)</option>
                                        </select>
                                      </div>
                                      <div class="anim-row">
                                        <label class="anim-label" for="speech-bubble-{prod.id}">Bubble</label>
                                        <input
                                          id="speech-bubble-{prod.id}"
                                          type="range"
                                          min="0.1"
                                          max="1.5"
                                          step="0.05"
                                          value={ss.bubbleScale}
                                          oninput={(e) => activeDoc?.execute(new SetProductionSpeechSettingsCommand({ engine: ss.engine, bubbleScale: parseFloat(e.currentTarget.value) }))}
                                          style="flex:1"
                                        />
                                        <span class="anim-label">{ss.bubbleScale.toFixed(1)}</span>
                                      </div>
                                      <button class="new-btn" style="margin-top:4px" onclick={() => activeDoc?.execute(new SetProductionSpeechSettingsCommand(undefined))}>← global</button>
                                    </div>
                                  </div>
                                {:else}
                                  <div class="prod-cast">
                                    <span class="cast-section-label">Speech</span>
                                    <p class="stage-empty">Using global defaults.</p>
                                    <button class="new-btn prod-cast-add" onclick={() => activeDoc?.execute(new SetProductionSpeechSettingsCommand({ engine: voiceMode, bubbleScale }))}>+ Override</button>
                                  </div>
                                {/if}
                              {:else if prod.tree?.length}
                                <div class="prod-cast">
                                  <span class="cast-section-label">Scenes</span>
                                  <ul class="cast-list">
                                    {#each prod.tree as node (node.id)}
                                      {#if (node as StoredGroup).type === 'group'}
                                        {@const group = node as StoredGroup}
                                        <li class="act-header cast-row">
                                          <span class="cast-role act-label">{group.name}</span>
                                        </li>
                                        {#each group.children as child (child.id)}
                                          {#if !(child as StoredGroup).type}
                                            {@const ns = child as NamedScene}
                                            <li class="cast-row indent">
                                              <button class="cast-role-btn" onclick={() => loadProduction(prod)}>{ns.name}</button>
                                            </li>
                                          {/if}
                                        {/each}
                                      {:else}
                                        {@const ns = node as NamedScene}
                                        <li class="cast-row">
                                          <button class="cast-role-btn" onclick={() => loadProduction(prod)}>{ns.name}</button>
                                        </li>
                                      {/if}
                                    {/each}
                                  </ul>
                                </div>
                              {/if}
                            {/if}
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  </section>

                  <!-- Examples (collapsible, read-only) — always at bottom -->
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
                      {#if seedWorkflow2Fn}
                        <p class="cast-section-label" style="margin-top:0.5rem">Workflows</p>
                        <ul class="scene-list">
                          <li>
                            <button class="scene-btn" onclick={seedWorkflow2Fn} title="Create The Robot Play production">The Robot Play</button>
                          </li>
                        </ul>
                      {/if}
                    </details>
                  </section>

                  <!-- Audio settings (global defaults) — always at bottom -->
                  <section class="sidebar-section speech-section">
                    <details>
                      <summary class="section-heading">Speech and Audio</summary>
                      <div class="audio-settings">
                        <div class="anim-row">
                          <label class="anim-label" for="voice-mode-left">Engine</label>
                          <select
                            id="voice-mode-left"
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
                          <label class="anim-label" for="bubble-scale-left">Bubble</label>
                          <input
                            id="bubble-scale-left"
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
                    </details>
                  </section>

                </aside>
              {:else}
                <CataloguePanel
                  onadd={(kind, id) => handleCatalogueDrop(kind, id, [0, 0, 0])}
                  onapplyenvironment={(id) => {
                    if (activeSceneId && activeDoc) {
                      activeDoc.execute(new SetSceneEnvironmentCommand(activeSceneId, id));
                    }
                  }}
                  activeEnvironmentId={activeScene?.environmentMap}
                />
              {/if}
            </div>
          </div>
{/snippet}

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
      {@render leftPanelContent()}
    </div>
  {/if}

  <div class="workspace">
    <Splitpanes theme="directionally">
      <!-- Left pane: collapsed to 0 on mobile, normal sidebar on desktop -->
      <Pane
        size={isMobile || presentationMode ? 0 : 18}
        minSize={isMobile || presentationMode ? 0 : 10}
        maxSize={isMobile || presentationMode ? 0 : 40}
      >
        {#if !isMobile}
          {@render leftPanelContent()}
        {/if}
      </Pane>

      <!-- Main pane: Presenter is always mounted here, never destroyed -->
      <Pane minSize={30}>
        <div class="main-pane">
          <div class="main-view-toggle-bar">
            <button
              class="main-view-btn"
              class:active={mainView === '3d'}
              onclick={() => (mainView = '3d')}
              title="3D view"
            >3D</button>
            <button
              class="main-view-btn"
              class:active={mainView === 'script'}
              onclick={() => (mainView = 'script')}
              title="Full script view"
            >Script</button>
            {#if designMode && activeDoc && mainView === '3d'}
              <button class="undo-redo-btn main-undo" disabled={!canUndo} onclick={() => activeDoc!.undo()} title="Undo (Ctrl+Z)" aria-label="Undo">↩</button>
              <button class="undo-redo-btn main-undo" disabled={!canRedo} onclick={() => activeDoc!.redo()} title="Redo (Ctrl+Y)" aria-label="Redo">↪</button>
            {/if}
          </div>
          {#if mainView === 'script'}
            <div class="main-script-view">
              {#if activeDoc && docSnapshot}
                <ProductionScriptView
                  doc={docSnapshot}
                  actors={actors.map(a => ({ id: a.id, label: a.role }))}
                  activeSceneId={treeActiveSceneId}
                  onactivatescene={(id) => activeDoc?.execute(new SwitchSceneCommand(id))}
                  onsettransition={(sceneId, t) => activeDoc?.execute(new SetSceneTransitionCommand(sceneId, t))}
                  onsetgroupnotes={(groupId, notes) => activeDoc?.execute(new SetGroupNotesCommand(groupId, notes))}
                />
              {:else}
                <p class="main-script-placeholder">Select or create a production.</p>
              {/if}
            </div>
          {/if}
          <!-- Presenter stays mounted at all times; hidden when script view is active -->
          <div class="presenter-container" style:display={mainView === '3d' ? 'flex' : 'none'}>
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
            voiceMode={effectiveVoiceMode}
            bubbleScale={effectiveBubbleScale}
            bind:isPlaying={isPlaying}
            bind:isToneSetup={isToneSetup}
            bind:currentPosition={currentPosition}
            bind:sceneDuration={sceneDuration}
            bind:voiceBackend={voiceBackend}
            bind:sliderValue={sliderValue}
            bind:isSliderDragging={isSliderDragging}
            bind:designMode={designMode}
            selectedObjectId={selectedObjectId}
            onviewportselect={handleViewportSelect}
            ontransformend={handleTransformEnd}
            oncataloguedrop={handleCatalogueDrop}
            ondiscoverclips={(clips) => { discoveredClips = clips; }}
            {dragHint}
            {hudMode}
            rotationEnabled={selectionState?.kind !== 'actor-block'}
            objectSelectable={(id) => {
              const isActor = actors.some((a) => a.id === id);
              const isSetPiece = scenePieces.some((p) => p.name === id);
              if (isActor) {
                return currentPosition < 0.05 || (selectionState?.kind === 'actor-block' && selectionState.actorId === id);
              }
              if (isSetPiece) {
                return currentPosition < 0.05 || (selectionState?.kind === 'setpiece-block' && selectionState.setPieceId === id);
              }
              return true;
            }}
            onsceneend={presentationMode ? onPresentationSceneEnd : undefined}
            ondidload={presentationMode ? () => presenter?.play() : undefined}
            {presentationMode}
          />
          {#if presentationMode && docSnapshot}
            {@const _hudScenes = getScenes(docSnapshot.tree ?? [])}
            {@const _hudName = _hudScenes.find(ns => ns.id === docSnapshot!.activeSceneId)?.name ?? 'Scene'}
            <div class="presentation-hud">
              <span class="presentation-scene-name">{_hudName}</span>
              <button class="presentation-exit-btn" onclick={exitPresentation} title="Exit presentation (Esc)">✕ Exit</button>
            </div>
          {:else if !activeScene}
            <div class="viewport-no-scene">
              {#if !docSnapshot}
                Select or create a production
              {:else}
                Select or create a scene
              {/if}
            </div>
          {/if}
          </div>
        </div>
      </Pane>

      <!-- Right panel -->
      <Pane
        size={rightPanelOpen && !presentationMode ? 22 : 0}
        minSize={rightPanelOpen && !presentationMode ? 12 : 0}
        maxSize={rightPanelOpen && !presentationMode ? 40 : 0}
      >
        {#if rightPanelOpen}
          <div class="right-panel">
            <div class="tab-bar right-panel-tab-bar">
              <button
                class="tab-btn"
                class:active={rightTab === 'staging'}
                onclick={() => (rightTab = 'staging')}
              >Staging</button>
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
              {#if rightTab === 'staging'}
                {#if activeDoc}
                  {#if activeScene}

                  <!-- Roster -->
                  <div class="stage-section">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Roster</span>
                    </div>

                    <!-- Staged actors -->
                    {#if activeScene.stagedActors.length > 0}
                      <ul class="cast-list">
                        {#each activeScene.stagedActors as sa}
                          {@const actor = actors.find(a => a.id === sa.actorId)}
                          <li class="cast-row">
                            <span class="cast-role">{actor?.role ?? sa.actorId}</span>
                            <span class="cast-char roster-type-badge">actor</span>
                          </li>
                        {/each}
                      </ul>
                    {/if}

                    <!-- Camera (always present) -->
                    <ul class="cast-list">
                      <li class="cast-row">
                        <span class="cast-role">Camera</span>
                      </li>
                    </ul>

                    <!-- Lights -->
                    {#if sceneLights.length > 0}
                      <ul class="cast-list">
                        {#each sceneLights as light}
                          <li class="cast-row">
                            <span class="cast-role">{light.id}</span>
                            <span class="cast-char roster-type-badge">{light.type}</span>
                            <button class="icon-btn danger" onclick={() => activeDoc?.execute(new RemoveSceneLightCommand(light.id))} title="Remove light">✕</button>
                          </li>
                        {/each}
                      </ul>
                    {/if}

                    <!-- Set pieces -->
                    <div class="roster-setpieces">
                      {#if scenePieces.length > 0}
                        <ul class="cast-list">
                          {#each scenePieces as piece}
                            <li class="cast-row" class:selected={selectedObjectId === piece.name}>
                              <span class="cast-role">{piece.name}</span>
                              <span class="cast-char roster-type-badge">set piece</span>
                              <button class="icon-btn danger" onclick={() => removeSetPiece(piece.name)} title="Remove set piece">✕</button>
                            </li>
                          {/each}
                        </ul>
                      {/if}
                    </div>
                  </div>

                  <!-- Design camera -->
                  {#if designMode}
                    <div class="stage-section stage-section-design-camera">
                      <div class="stage-section-header">
                        <span class="stage-section-label">🎥 Design camera</span>
                      </div>
                      <button class="sync-design-camera-btn" onclick={() => presenter?.snapDesignCameraToPlayback()} title="Snap design view to match the playback camera's current position (P)">Sync design view to current playback view</button>
                    </div>
                  {/if}

                  <!-- Properties -->
                  <div class="stage-section stage-section-properties">
                    <div class="stage-section-header">
                      <span class="stage-section-label">Properties</span>
                    </div>
                    <PropertiesPanel
                      selectedEntity={selectedEntity}
                      {actors}
                      {actorBlocks}
                      {lightBlocks}
                      {cameraBlocks}
                      {setPieceBlocks}
                      lights={sceneLights}
                      setPieces={scenePieces}
                      {activeScene}
                      {discoveredClips}
                      {designMode}
                      execute={(cmd) => activeDoc?.execute(cmd)}
                      oncapturecamerablock={captureDesignCameraForBlock}
                      oncaptureinitialcamera={captureInitialCamera}
                      onremoveblock={(idx) => {
                        const blkType = (activeScene?.blocks ?? [])[idx]?.type;
                        if (blkType === 'actorBlock') activeDoc?.execute(new RemoveActorBlockCommand(idx));
                        else if (blkType === 'lightBlock') activeDoc?.execute(new RemoveLightBlockCommand(idx));
                        else if (blkType === 'cameraBlock') activeDoc?.execute(new RemoveCameraBlockCommand(idx));
                        else if (blkType === 'setPieceBlock') activeDoc?.execute(new RemoveSetPieceBlockCommand(idx));
                        selectionState = null;
                      }}
                    />
                  </div>

                {:else}
                  <p class="panel-placeholder">Add a scene to start staging.</p>
                {/if}
                {:else}
                  <p class="panel-placeholder">Select or create a production.</p>
                {/if}
              {:else if rightTab === 'script'}
                {#if activeDoc}
                  <ScriptEditor
                    script={sceneScriptLines}
                    actors={actors.map(a => ({ id: a.id, label: a.role }))}
                    currentPosition={currentPosition}
                    transition={activeNamedScene?.transition}
                    onchange={(s) => { if (treeActiveSceneId) activeDoc?.execute(new SetSceneScriptCommand(treeActiveSceneId, s)); }}
                    ontransitionchange={(t) => { if (treeActiveSceneId) activeDoc?.execute(new SetSceneTransitionCommand(treeActiveSceneId, t)); }}
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
  <div class="bottom-panel" class:hidden={presentationMode}>
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
          onrewind={() => { selectionState = null; presenter?.handleRewindClick(); }}
          onsliderinput={(t) => { selectionState = null; presenter?.handleSliderInput(t); }}
          onsliderpointerdown={() => presenter?.handleSliderPointerDown()}
          onsliderpointerup={() => presenter?.handleSliderPointerUp()}
          onupdateduration={activeDoc ? setSceneDuration : undefined}
        />
        {#if activeScene}
        <TimelinePanel
          actors={actors.filter(a => activeScene?.stagedActors.some(sa => sa.actorId === a.id) ?? false)}
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
          onspawnselect={enterSpawnMode}
          onlightinitialselect={(id) => {
            selectionState = { kind: 'light-initial', lightId: id };
            if (rightTab !== 'staging') rightTab = 'staging';
          }}
          onupdateduration={setSceneDuration}
          onblockselect={(i) => {
            if (i !== null) {
              if (rightTab !== 'staging') rightTab = 'staging';
              const raw = (activeScene?.blocks ?? [])[i];
              if (raw) presenter?.handleSliderInput(raw.endTime);
              if (raw?.type === 'actorBlock') selectionState = { kind: 'actor-block', actorId: raw.actorId, blockIndex: i };
              else if (raw?.type === 'setPieceBlock') selectionState = { kind: 'setpiece-block', setPieceId: raw.targetId, blockIndex: i };
              else if (raw?.type === 'cameraBlock') selectionState = { kind: 'camera-block', blockIndex: i };
              else if (raw?.type === 'lightBlock') selectionState = { kind: 'light-block', lightId: raw.lightId, blockIndex: i };
              else selectionState = null;
            } else {
              selectionState = null;
            }
          }}
          onaddblock={(actorId, startTime, endTime) => {
            if (!activeDoc) return;
            if (!designMode) designMode = true;
            const newBlock: ActorBlock = { type: 'actorBlock', actorId, startTime, endTime };
            activeDoc.execute(new AddActorBlockCommand(newBlock));
            const newIdx = (getActiveScene(activeDoc.current)?.blocks?.length ?? 1) - 1;
            selectionState = { kind: 'actor-block', actorId, blockIndex: newIdx };
            if (rightTab !== 'staging') rightTab = 'staging';
            presenter?.handleSliderInput(endTime);
          }}
          onupdateblock={(i, patch) => activeDoc?.execute(new UpdateActorBlockCommand(i, patch))}
          onremoveblock={(i) => { activeDoc?.execute(new RemoveActorBlockCommand(i)); if (selectionState && 'blockIndex' in selectionState && selectionState.blockIndex === i) selectionState = null; }}
          onaddlightblock={(lightId, startTime, endTime) => {
            if (!activeDoc) return;
            const newBlock: LightBlock = { type: 'lightBlock', lightId, startTime, endTime };
            activeDoc.execute(new AddLightBlockCommand(newBlock));
            const newIdx = (getActiveScene(activeDoc.current)?.blocks?.length ?? 1) - 1;
            selectionState = { kind: 'light-block', lightId, blockIndex: newIdx };
            if (rightTab !== 'staging') rightTab = 'staging';
          }}
          onupdatelightblock={(i, patch) => activeDoc?.execute(new UpdateLightBlockCommand(i, patch))}
          onremovelightblock={(i) => { activeDoc?.execute(new RemoveLightBlockCommand(i)); if (selectionState && 'blockIndex' in selectionState && selectionState.blockIndex === i) selectionState = null; }}
          onaddcamerablock={(startTime, endTime) => {
            if (!activeDoc) return;
            const newBlock: CameraBlock = { type: 'cameraBlock', startTime, endTime };
            activeDoc.execute(new AddCameraBlockCommand(newBlock));
            const newIdx = (getActiveScene(activeDoc.current)?.blocks?.length ?? 1) - 1;
            selectionState = { kind: 'camera-block', blockIndex: newIdx };
            if (rightTab !== 'staging') rightTab = 'staging';
          }}
          onupdatecamerablock={(i, patch) => activeDoc?.execute(new UpdateCameraBlockCommand(i, patch))}
          onremovecamerablock={(i) => { activeDoc?.execute(new RemoveCameraBlockCommand(i)); if (selectionState && 'blockIndex' in selectionState && selectionState.blockIndex === i) selectionState = null; }}
          onaddsetpieceblock={(targetId, startTime, endTime) => {
            if (!activeDoc) return;
            const newBlock: SetPieceBlock = { type: 'setPieceBlock', targetId, startTime, endTime };
            activeDoc.execute(new AddSetPieceBlockCommand(newBlock));
            const newIdx = (getActiveScene(activeDoc.current)?.blocks?.length ?? 1) - 1;
            selectionState = { kind: 'setpiece-block', setPieceId: targetId, blockIndex: newIdx };
            if (rightTab !== 'staging') rightTab = 'staging';
            presenter?.handleSliderInput(endTime);
          }}
          onupdatesetpieceblock={(i, patch) => activeDoc?.execute(new UpdateSetPieceBlockCommand(i, patch))}
          onremovesetpieceblock={(i) => { activeDoc?.execute(new RemoveSetPieceBlockCommand(i)); if (selectionState && 'blockIndex' in selectionState && selectionState.blockIndex === i) selectionState = null; }}
        />
        {:else}
          <div class="timeline-no-scene">No scene selected</div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .timeline-no-scene {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: #555;
    font-size: 12px;
    font-style: italic;
  }

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
    overflow-y: auto;
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
    flex-direction: column;
    align-items: stretch;
  }

  .prod-row-main {
    display: flex;
    align-items: center;
  }

  .prod-expand-btn {
    background: none;
    border: none;
    color: #666;
    padding: 2px 4px;
    cursor: pointer;
    font-size: 10px;
    flex-shrink: 0;
    min-width: 18px;
    line-height: 1;
  }

  .prod-expand-btn:hover {
    color: #bbb;
  }

  .prod-row-main .scene-btn {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .prod-cast {
    padding: 4px 4px 6px 20px;
    border-left: 2px solid #2a2a2a;
    margin: 2px 0 4px 10px;
  }

  .cast-section-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
    margin-bottom: 2px;
  }

  .cast-col-header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 2px 6px 4px;
    margin-bottom: 2px;
    border-bottom: 1px solid #2e2e2e;
  }

  .cast-col-label-badge {
    flex-shrink: 0;
    width: 44px;
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
    text-align: center;
    margin-left: auto;
  }

  .cast-col-label-name {
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #555;
  }

  .prod-cast-add {
    margin-top: 6px;
    width: 100%;
  }

  .audio-settings {
    padding: 4px 8px 8px;
  }

  .prod-actions {
    display: flex;
    opacity: 0;
    transition: opacity 0.1s;
    flex-shrink: 0;
  }

  .prod-row-main:hover .prod-actions,
  .prod-row-main:focus-within .prod-actions {
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

  .icon-btn:disabled {
    opacity: 0.2;
    cursor: default;
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

  .examples-section details > summary.section-heading,
  .speech-section details > summary.section-heading {
    list-style: none;
    cursor: pointer;
  }

  .examples-section details > summary.section-heading::-webkit-details-marker,
  .speech-section details > summary.section-heading::-webkit-details-marker {
    display: none;
  }

  .examples-section details > summary.section-heading::before,
  .speech-section details > summary.section-heading::before {
    content: '▶';
    font-size: 8px;
    margin-right: 6px;
    display: inline-block;
    transition: transform 0.15s;
  }

  .examples-section details[open] > summary.section-heading::before,
  .speech-section details[open] > summary.section-heading::before {
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

  .speech-section {
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

  .stage-section-properties {
    padding: 0 0 8px;
  }

  .stage-section-properties .stage-section-header {
    padding: 6px 10px 4px;
  }

  .roster-type-badge {
    font-size: 10px;
    color: #555;
    padding: 1px 4px;
    background: #222;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .roster-setpieces {
    margin-top: 4px;
  }

  .stage-section-design-camera {
    border-bottom: 1px solid #2a2a2a;
    margin-bottom: 6px;
  }

  .sync-design-camera-btn {
    background: #1e1e1e;
    color: #ccc;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 11px;
    cursor: pointer;
  }

  .sync-design-camera-btn:hover {
    background: #2a2a2a;
    color: #fff;
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

  .act-header {
    background: #1e1e1e;
    border-left: 2px solid #4a9eff44;
    margin-top: 4px;
  }

  .act-label {
    color: #7ec8e3;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    flex: 1;
  }

  .cast-row.indent {
    padding-left: 18px;
    background: #1d1d1d;
  }

  .drag-handle {
    cursor: grab;
    color: #444;
    font-size: 13px;
    flex-shrink: 0;
    user-select: none;
    transition: color 0.1s;
  }

  .cast-row:hover .drag-handle,
  .cast-row:focus-within .drag-handle {
    color: #777;
  }

  .cast-row.tree-selected {
    outline: 1px solid #4a9eff66;
  }

  .cast-row.drag-over-before {
    border-top: 2px solid #4a9eff;
    margin-top: -1px;
  }

  .tree-end-drop {
    height: 8px;
    list-style: none;
  }

  .tree-end-drop.drag-over-before {
    border-top: 2px solid #4a9eff;
    height: 8px;
  }

  .cast-row.drag-over-inside {
    background: #1a2a1a;
    outline: 1px dashed #4a9eff66;
  }

  .tree-spacer {
    flex: 1;
  }

  .tree-ctx-wrap {
    position: relative;
    flex-shrink: 0;
  }

  .tree-ctx-btn {
    opacity: 0;
    transition: opacity 0.1s;
    font-size: 14px;
    letter-spacing: 1px;
  }

  .cast-row:hover .tree-ctx-btn,
  .cast-row:focus-within .tree-ctx-btn {
    opacity: 1;
  }

  .tree-ctx-menu {
    position: absolute;
    right: 0;
    top: 100%;
    z-index: 100;
    background: #2a2a2a;
    border: 1px solid #444;
    border-radius: 4px;
    min-width: 100px;
    padding: 2px 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  .tree-ctx-item {
    display: block;
    width: 100%;
    background: none;
    border: none;
    color: #ccc;
    font-size: 12px;
    text-align: left;
    padding: 5px 10px;
    cursor: pointer;
  }

  .tree-ctx-item:hover {
    background: #3a3a3a;
    color: #fff;
  }

  .tree-ctx-item.danger {
    color: #e06c75;
  }

  .tree-ctx-item.danger:hover {
    background: #3a1a1a;
  }

  .tree-list {
    user-select: none;
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

  .stage-badge {
    flex-shrink: 0;
    margin-left: auto;
    width: 44px;
    height: 24px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    color: #c8864a;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    transition: color 0.15s;
  }

  .stage-badge.staged {
    color: #4a9eff;
  }

  .stage-badge:hover {
    color: #fff;
  }

  .cast-row.in-scene {
    background: #1a2535;
  }

  .actor-tint-swatch {
    width: 18px;
    height: 18px;
    padding: 0;
    border: 1px solid #444;
    border-radius: 3px;
    cursor: pointer;
    flex-shrink: 0;
    background: none;
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

  /* In a cast row, the character selector should auto-size so the role name input gets flex space. */
  .cast-char-select {
    width: auto;
    flex-shrink: 0;
    max-width: 50%;
  }

  .main-pane {
    position: relative;
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .main-view-toggle-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 4px 6px;
    background: #0e0e0e;
    border-bottom: 1px solid #1e1e1e;
    flex-shrink: 0;
    z-index: 10;
  }

  .main-view-btn {
    background: transparent;
    border: 1px solid transparent;
    color: #555;
    font-size: 11px;
    font-family: inherit;
    letter-spacing: 0.06em;
    padding: 2px 10px;
    border-radius: 3px;
    cursor: pointer;
    transition: color 0.1s, background 0.1s, border-color 0.1s;
  }

  .main-view-btn:hover {
    color: #aaa;
  }

  .main-view-btn.active {
    background: #1a1a24;
    color: #ccc;
    border-color: #333;
  }

  .main-undo {
    width: 28px;
    height: 24px;
    font-size: 14px;
    margin-left: 4px;
    border-radius: 4px;
  }

  .main-script-view {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .main-script-placeholder {
    padding: 16px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
  }

  .presenter-container {
    flex: 1;
    min-height: 0;
    position: relative;
    flex-direction: column;
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

  /* ── Present button ────────────────────────────── */

  .present-btn {
    background: #1a3a5c;
    border: none;
    border-radius: 3px;
    color: #5aaeff;
    font-size: 11px;
    font-weight: 600;
    padding: 3px 9px;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .present-btn:hover {
    background: #1e4a75;
    color: #7bc0ff;
  }

  .bottom-panel.hidden {
    display: none;
  }

  /* ── Presentation HUD overlay ──────────────────── */

  .viewport-no-scene {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #111;
    color: #555;
    font-size: 13px;
    font-style: italic;
    pointer-events: none;
    z-index: 10;
  }

  .presentation-hud {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 16px;
    background: rgba(0, 0, 0, 0.6);
    border-radius: 6px;
    padding: 6px 14px;
    z-index: 100;
  }

  .presentation-scene-name {
    font-size: 13px;
    font-weight: 600;
    color: #e0e0e0;
    letter-spacing: 0.03em;
  }

  .presentation-exit-btn {
    font-size: 11px;
    color: #999;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 4px;
    line-height: 1;
  }

  .presentation-exit-btn:hover {
    color: #e0e0e0;
    background: rgba(255, 255, 255, 0.1);
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

  .anim-light-expand {
    background: none;
    padding: 0;
    list-style: none;
  }

  .icon-btn.active {
    color: #4a9eff;
  }
</style>
