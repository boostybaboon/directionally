<script lang="ts">
  import { onMount } from 'svelte';
  import Presenter from '$lib/Presenter.svelte';
  import CataloguePanel from '$lib/CataloguePanel.svelte';
  import PropertiesPanel from '$lib/PropertiesPanel.svelte';
  import type { SelectedEntity } from '$lib/types.js';
  import { ProductionDocument } from '../../core/document/ProductionDocument.js';
  import {
    ApplySetCommand,
    AddSceneLightCommand,
    MoveSetPieceCommand,
    MoveStagedActorCommand,
    SetSceneEnvironmentCommand,
  } from '../../core/document/commands.js';
  import { starterSceneShell } from '../../core/storage/sceneBuilder.js';
  import { storedSceneToModel } from '../../core/storage/storedSceneToModel.js';
  import { getScenes, type StoredProduction } from '../../core/storage/types.js';
  import { getById } from '../../core/catalogue/catalogue.js';
  import { CATALOGUE_ENTRIES } from '../../core/catalogue/entries.js';
  import { expandEntry, setPiecesToCompose, settingSpecToScene, type SettingSpec } from '../../core/setting/settingSpec.js';
  import * as OPFSCatalogueStore from '../../core/storage/OPFSCatalogueStore.js';
  import type { CatalogueEntry } from '../../core/catalogue/types.js';
  import type { LightConfig } from '../../core/domain/types.js';

  function freshProduction(): StoredProduction {
    const scene = starterSceneShell();
    return {
      id: crypto.randomUUID(),
      name: 'Untitled Setting',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      actors: [],
      tree: [{ id: crypto.randomUUID(), name: 'Setting', scene }],
    };
  }

  // Plain (non-state) seed shared by `production` and the initial `doc`, so
  // building the doc from it triggers no state-referenced-locally warning.
  const initialProduction = freshProduction();
  let production = $state<StoredProduction>(initialProduction);
  let userCatalogueEntries = $state<CatalogueEntry[]>([]);
  let selectedObjectId = $state<string | null>(null);
  let selectedEntity = $state<SelectedEntity>(null);
  let statusMessage = $state('');
  let settingName = $state('');
  let specInput = $state('');
  const SPEC_PLACEHOLDER = '{"name":"classroom","props":[{"ref":"chair","position":[1,0,2]}]}';
  let editMode = $state(true);
  let presenter: Presenter | undefined = $state();

  const scene = $derived(getScenes(production.tree ?? [])[0]);
  const mergedEntries = $derived<CatalogueEntry[]>([...CATALOGUE_ENTRIES, ...userCatalogueEntries]);

  function renderModel() {
    if (!scene || !presenter) return;
    presenter.loadModel(storedSceneToModel(scene.scene, production.actors ?? [], userCatalogueEntries));
  }

  function makeDocument(initial: StoredProduction): ProductionDocument {
    return new ProductionDocument(
      initial,
      (next) => {
        production = next;
        renderModel();
      },
      () => {},
    );
  }

  let doc = $state(makeDocument(initialProduction));

  onMount(async () => {
    userCatalogueEntries = await OPFSCatalogueStore.list();
    renderModel();
  });

  function handleCatalogueAdd(kind: 'character' | 'setpiece' | 'light', id: string) {
    if (!scene) return;
    if (kind === 'character') {
      statusMessage = 'Character staging happens in the script view.';
      return;
    }
    if (kind === 'light') {
      const entry = getById(id, mergedEntries);
      if (entry?.kind !== 'light') return;
      const light = { id: `${entry.id}-${crypto.randomUUID().slice(0, 6)}`, ...entry.config } as LightConfig;
      doc.execute(new AddSceneLightCommand(light));
      statusMessage = `Added ${entry.label}.`;
      return;
    }
    const entry = getById(id, mergedEntries);
    if (entry?.kind !== 'set-piece') return;
    const pieces = expandEntry(entry, undefined, mergedEntries);
    doc.execute(new ApplySetCommand(scene.id, [...scene.scene.set, ...pieces]));
    statusMessage = `Added ${entry.label}.`;
  }

  function handleApplyEnvironment(environmentId: string | undefined) {
    if (!scene) return;
    doc.execute(new SetSceneEnvironmentCommand(scene.id, environmentId));
  }

  function handleCatalogueDrop(kind: 'character' | 'setpiece', id: string, position: [number, number, number]) {
    if (kind === 'character') {
      statusMessage = 'Character staging happens in the script view.';
      return;
    }
    if (!scene) return;
    const entry = getById(id, mergedEntries);
    if (entry?.kind !== 'set-piece') return;
    const pieces = expandEntry(entry, { position }, mergedEntries);
    doc.execute(new ApplySetCommand(scene.id, [...scene.scene.set, ...pieces]));
  }

  function handleViewportSelect(id: string | null) {
    selectedObjectId = id;
    if (!id || !scene) {
      selectedEntity = null;
      return;
    }
    if (production.actors?.some((a) => a.id === id)) {
      selectedEntity = { kind: 'actor-initial', actorId: id };
    } else if (scene.scene.set.some((p) => p.name === id)) {
      selectedEntity = { kind: 'setpiece-initial', setPieceId: id };
    } else if (scene.scene.lights.some((l) => l.id === id)) {
      selectedEntity = { kind: 'light-initial', lightId: id };
    } else {
      selectedEntity = null;
    }
  }

  function handleTransformEnd(id: string, position: [number, number, number], rotation: [number, number, number]) {
    if (!scene) return;
    if (scene.scene.set.some((p) => p.name === id)) {
      doc.execute(new MoveSetPieceCommand(id, position, rotation));
    } else if (scene.scene.stagedActors.some((s) => s.actorId === id)) {
      doc.execute(new MoveStagedActorCommand(id, position, rotation));
    }
  }

  function newSetting() {
    production = freshProduction();
    doc = makeDocument(production);
    selectedObjectId = null;
    selectedEntity = null;
    statusMessage = 'New setting.';
    renderModel();
  }

  function loadSpecFromText() {
    let spec: SettingSpec;
    try {
      spec = JSON.parse(specInput);
    } catch {
      statusMessage = 'Invalid JSON.';
      return;
    }
    const newScene = settingSpecToScene(spec, mergedEntries);
    production = {
      id: crypto.randomUUID(),
      name: spec.name || 'Untitled Setting',
      createdAt: Date.now(),
      modifiedAt: Date.now(),
      actors: [],
      tree: [{ id: crypto.randomUUID(), name: spec.name || 'Setting', scene: newScene }],
    };
    doc = makeDocument(production);
    selectedObjectId = null;
    selectedEntity = null;
    statusMessage = 'Loaded spec.';
    renderModel();
  }

  async function saveAsSetting() {
    if (!scene) return;
    const label = settingName.trim();
    if (!label) {
      statusMessage = 'Enter a name first.';
      return;
    }
    try {
      const entry = await OPFSCatalogueStore.addSetPiece({
        label,
        compose: setPiecesToCompose(scene.scene.set),
        environmentId: scene.scene.environmentMap,
        lights: scene.scene.lights,
      });
      userCatalogueEntries = [...userCatalogueEntries, entry];
      new BroadcastChannel('directionally-catalogue').postMessage({ type: 'catalogue-updated' });
      statusMessage = `Saved "${label}" as a setting.`;
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : 'Save failed.';
    }
  }

  async function saveAsSetPiece() {
    if (!scene) return;
    const label = settingName.trim();
    if (!label) {
      statusMessage = 'Enter a name first.';
      return;
    }
    try {
      const entry = await OPFSCatalogueStore.addSetPiece({ label, compose: setPiecesToCompose(scene.scene.set) });
      userCatalogueEntries = [...userCatalogueEntries, entry];
      new BroadcastChannel('directionally-catalogue').postMessage({ type: 'catalogue-updated' });
      statusMessage = `Saved "${label}" as a set piece.`;
    } catch (err) {
      statusMessage = err instanceof Error ? err.message : 'Save failed.';
    }
  }
</script>

<div class="studio">
  <header class="topbar">
    <a class="nav-link" href="/">← Script</a>
    <span class="title">Set Studio</span>
    <div class="actions">
      <button class="btn" onclick={newSetting}>New</button>
      <button class="btn" onclick={() => doc.undo()} disabled={!doc.canUndo}>Undo</button>
      <button class="btn" onclick={() => doc.redo()} disabled={!doc.canRedo}>Redo</button>
    </div>
    <input class="name-input" bind:value={settingName} placeholder="Name…" />
    <button class="btn" onclick={saveAsSetting}>Save as Setting</button>
    <button class="btn" onclick={saveAsSetPiece}>Save as Set Piece</button>
    <span class="status">{statusMessage}</span>
  </header>

  <div class="columns">
    <aside class="left">
      <div class="spec-import">
        <textarea class="spec-input" bind:value={specInput} placeholder={SPEC_PLACEHOLDER}></textarea>
        <button class="btn" onclick={loadSpecFromText}>Load spec</button>
      </div>
      <CataloguePanel
        userEntries={userCatalogueEntries}
        onadd={handleCatalogueAdd}
        onapplyenvironment={handleApplyEnvironment}
        activeEnvironmentId={scene?.scene.environmentMap}
      />
    </aside>

    <main class="viewport">
      <Presenter
        bind:this={presenter}
        bind:editMode={editMode}
        selectedObjectId={selectedObjectId}
        onviewportselect={handleViewportSelect}
        ontransformend={handleTransformEnd}
        oncataloguedrop={handleCatalogueDrop}
        rotationEnabled={true}
        dragHint="Drag set pieces into the scene; click to select and move"
      />
    </main>

    <aside class="right">
      <PropertiesPanel
        selectedEntity={selectedEntity}
        actors={production.actors ?? []}
        actorBlocks={[]}
        lightBlocks={[]}
        cameraBlocks={[]}
        setPieceBlocks={[]}
        lights={scene?.scene.lights ?? []}
        setPieces={scene?.scene.set ?? []}
        activeScene={scene?.scene}
        discoveredClips={{}}
        editMode={true}
        execute={(cmd) => doc.execute(cmd)}
      />
    </aside>
  </div>
</div>

<style>
  .studio {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #161616;
    color: #ccc;
  }
  .topbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 12px;
    border-bottom: 1px solid #2a2a2a;
  }
  .nav-link {
    color: #4a9eff;
    text-decoration: none;
    font-size: 13px;
  }
  .title {
    font-weight: 600;
    font-size: 14px;
  }
  .actions {
    display: flex;
    gap: 6px;
  }
  .btn {
    background: #1a2a3a;
    color: #4a9eff;
    border: 1px solid #2a4a6a;
    border-radius: 4px;
    padding: 4px 10px;
    font-size: 12px;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .name-input {
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ddd;
    font-size: 12px;
    padding: 4px 8px;
    width: 140px;
  }
  .spec-import {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-bottom: 1px solid #2a2a2a;
  }
  .spec-input {
    width: 100%;
    min-height: 64px;
    resize: vertical;
    background: #1e1e1e;
    border: 1px solid #333;
    border-radius: 4px;
    color: #ddd;
    font-family: monospace;
    font-size: 11px;
    padding: 6px;
  }
  .status {
    font-size: 12px;
    color: #888;
    margin-left: auto;
  }
  .columns {
    display: grid;
    grid-template-columns: 260px 1fr 260px;
    flex: 1;
    min-height: 0;
  }
  .left {
    border-right: 1px solid #2a2a2a;
    overflow-y: auto;
  }
  .right {
    border-left: 1px solid #2a2a2a;
    overflow-y: auto;
  }
  .viewport {
    position: relative;
    min-width: 0;
    min-height: 0;
  }
</style>
