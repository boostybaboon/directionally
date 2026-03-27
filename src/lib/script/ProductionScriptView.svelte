<script lang="ts">
  import type { StoredProduction, NamedScene, StoredGroup } from '../../core/storage/types.js';
  import { getScenes } from '../../core/storage/types.js';
  import { isDialogueLine, isDirectionLine } from './types.js';
  import type { SpeakAction } from '../../core/domain/types.js';

  interface Props {
    doc: StoredProduction;
    actors: { id: string; label: string }[];
    activeSceneId: string | undefined;
    onactivatescene: (sceneId: string) => void;
    onsettransition: (sceneId: string, transition: string) => void;
    onsetgroupnotes: (groupId: string, notes: string) => void;
  }

  let {
    doc,
    actors,
    activeSceneId,
    onactivatescene,
    onsettransition,
    onsetgroupnotes,
  }: Props = $props();

  type ViewItem =
    | { kind: 'act'; key: string; group: StoredGroup; depth: number }
    | { kind: 'scene'; key: string; ns: NamedScene; sceneNumber: number };

  function flattenToViewItems(
    tree: Array<StoredGroup | NamedScene>,
    depth = 0,
    counter = { n: 0 },
  ): ViewItem[] {
    const items: ViewItem[] = [];
    for (const node of tree) {
      if ((node as StoredGroup).type === 'group') {
        const g = node as StoredGroup;
        items.push({ kind: 'act', key: 'act:' + g.id, group: g, depth });
        items.push(...flattenToViewItems(g.children, depth + 1, counter));
      } else {
        counter.n++;
        const ns = node as NamedScene;
        items.push({ kind: 'scene', key: 'scene:' + ns.id, ns, sceneNumber: counter.n });
      }
    }
    return items;
  }

  const viewItems = $derived(flattenToViewItems(doc.tree ?? []));

  function actorLabel(id: string): string {
    return actors.find((a) => a.id === id)?.label ?? id;
  }

  /** For a scene, get the displayable lines: from NamedScene.script if present,
   *  otherwise fall back to derived dialogue from scene.actions. */
  function sceneLines(ns: NamedScene) {
    if (ns.script) return ns.script;
    return (ns.scene.actions ?? [])
      .filter((a): a is SpeakAction => a.type === 'speak')
      .map((a) => ({ actorId: a.actorId, text: a.text, pauseAfter: a.pauseAfter ?? 0, startTime: a.startTime }));
  }

  // Inline editing state for transitions and group notes.
  let editingTransitionSceneId = $state<string | null>(null);
  let editingTransitionText = $state('');
  let editingNotesGroupId = $state<string | null>(null);
  let editingNotesText = $state('');

  function startEditTransition(sceneId: string, current: string) {
    editingTransitionSceneId = sceneId;
    editingTransitionText = current;
  }

  function commitTransition(sceneId: string) {
    onsettransition(sceneId, editingTransitionText.trim());
    editingTransitionSceneId = null;
    editingTransitionText = '';
  }

  function cancelTransition() {
    editingTransitionSceneId = null;
    editingTransitionText = '';
  }

  function startEditNotes(groupId: string, current: string) {
    editingNotesGroupId = groupId;
    editingNotesText = current;
  }

  function commitNotes(groupId: string) {
    onsetgroupnotes(groupId, editingNotesText.trim());
    editingNotesGroupId = null;
    editingNotesText = '';
  }

  function cancelNotes() {
    editingNotesGroupId = null;
    editingNotesText = '';
  }
</script>

<div class="production-script">
  <div class="toolbar">
    <span class="production-title">{doc.name}</span>
    <button class="print-btn" onclick={() => window.print()} title="Print full production script">⎙ Print</button>
  </div>

  {#if !viewItems.some((v) => v.kind === 'scene')}
    <p class="empty-hint">No scenes yet — add a scene to begin writing.</p>
  {:else}
    <div class="script-body">
      {#each viewItems as item, i (item.key)}
        {#if item.kind === 'act'}
          {@const grp = item.group}
          <div class="act-heading" class:act-top={item.depth === 0}>
            <span class="act-label">ACT</span>
            <span class="act-name">{grp.name.toUpperCase()}</span>
          </div>
          {#if editingNotesGroupId === grp.id}
            <div class="annotation-edit">
              <!-- svelte-ignore a11y_autofocus -->
              <textarea
                class="annotation-input"
                autofocus
                rows="2"
                placeholder="Context note for this act…"
                value={editingNotesText}
                oninput={(e) => { editingNotesText = (e.currentTarget as HTMLTextAreaElement).value; }}
                onblur={() => commitNotes(grp.id)}
                onkeydown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitNotes(grp.id); }
                  if (e.key === 'Escape') { e.preventDefault(); cancelNotes(); }
                }}
              ></textarea>
            </div>
          {:else if grp.notes}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div class="act-notes" onclick={() => startEditNotes(grp.id, grp.notes ?? '')} title="Click to edit note">
              <span class="annotation-text">{grp.notes}</span>
            </div>
          {:else}
            <button class="add-annotation-btn" onclick={() => startEditNotes(grp.id, '')}>+ Add note…</button>
          {/if}
        {:else}
          {@const ns = item.ns}
          {@const lines = sceneLines(ns)}
          {@const isActive = ns.id === activeSceneId}

          <div class="scene-section" class:active-scene={isActive}>
            <!-- Scene heading — click to switch active scene -->
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="scene-heading"
              class:active-heading={isActive}
              onclick={() => onactivatescene(ns.id)}
              title="Switch to this scene"
            >
              <span class="scene-label">SCENE {item.sceneNumber}:</span>
              <span class="scene-name">{ns.name.toUpperCase()}</span>
              {#if isActive}<span class="active-badge">●</span>{/if}
            </div>

            {#if lines.length === 0}
              <p class="scene-empty">No content yet.</p>
            {:else}
              <div class="lines">
                {#each lines as line, li (li)}
                  {#if isDirectionLine(line)}
                    <div class="direction-line">
                      <span class="direction-text">{line.text}</span>
                    </div>
                  {:else if isDialogueLine(line)}
                    <div class="dialogue-line">
                      <span class="character-name">{actorLabel(line.actorId).toUpperCase()}</span>
                      {#if line.parenthetical}
                        <p class="parenthetical-text">({line.parenthetical})</p>
                      {/if}
                      <p class="dialogue-text">{line.text || '…'}</p>
                    </div>
                  {/if}
                {/each}
              </div>
            {/if}

            <!-- Scene transition annotation -->
            {#if editingTransitionSceneId === ns.id}
              <div class="annotation-edit">
                <!-- svelte-ignore a11y_autofocus -->
                <textarea
                  class="annotation-input"
                  autofocus
                  rows="2"
                  placeholder="Scene transition, e.g. LIGHTS FADE TO BLACK."
                  value={editingTransitionText}
                  oninput={(e) => { editingTransitionText = (e.currentTarget as HTMLTextAreaElement).value; }}
                  onblur={() => commitTransition(ns.id)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTransition(ns.id); }
                    if (e.key === 'Escape') { e.preventDefault(); cancelTransition(); }
                  }}
                ></textarea>
              </div>
            {:else if ns.transition}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="scene-transition" onclick={() => startEditTransition(ns.id, ns.transition ?? '')} title="Click to edit transition">
                <span class="annotation-text">{ns.transition}</span>
              </div>
            {:else}
              <button class="add-annotation-btn" onclick={() => startEditTransition(ns.id, '')}>+ Add transition…</button>
            {/if}
          </div>

          {#if i < viewItems.length - 1 && viewItems[i + 1].kind === 'scene'}
            <hr class="scene-divider" />
          {/if}
        {/if}
      {/each}
    </div>
  {/if}
</div>

<style>
  .production-script {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    font-family: 'Courier New', 'Courier', monospace;
    color: #ccc;
    background: #0e0e0e;
  }

  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid #222;
    flex-shrink: 0;
  }

  .production-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #888;
    text-transform: uppercase;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .print-btn {
    background: transparent;
    border: 1px solid #333;
    color: #aaa;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-family: inherit;
    flex-shrink: 0;
  }

  .print-btn:hover {
    background: #1e2d3d;
    color: #4a9eff;
    border-color: #4a9eff;
  }

  .empty-hint {
    padding: 16px 14px;
    color: #444;
    font-style: italic;
    font-size: 12px;
    margin: 0;
    font-family: inherit;
  }

  .script-body {
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding: 0 0 24px;
  }

  /* Act heading */

  .act-heading {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 16px 16px 8px;
    border-top: 2px solid #333;
    margin-top: 4px;
  }

  .act-heading.act-top {
    border-top-color: #4a9eff;
    margin-top: 0;
  }

  .act-label {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #555;
    flex-shrink: 0;
  }

  .act-name {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #bbb;
  }

  /* Scene section */

  .scene-section {
    padding: 18px 16px 12px;
  }

  .scene-section.active-scene {
    background: #111318;
  }

  .scene-heading {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
    margin-bottom: 12px;
    padding: 4px 0;
    border-bottom: 1px solid #2a2a2a;
    user-select: none;
  }

  .scene-heading:hover {
    background: #1a1a2a;
  }

  .scene-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #555;
    flex-shrink: 0;
  }

  .scene-name {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #e0e0e0;
  }

  .scene-heading.active-heading .scene-name {
    color: #4a9eff;
  }

  .active-badge {
    font-size: 8px;
    color: #4a9eff;
    margin-left: 4px;
  }

  .scene-empty {
    font-size: 11px;
    color: #444;
    font-style: italic;
    margin: 0 0 8px;
  }

  .lines {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 10px;
  }

  /* Dialogue line */

  .dialogue-line {
    padding: 0 4px;
  }

  .character-name {
    display: block;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #4a9eff;
    margin-bottom: 2px;
  }

  .parenthetical-text {
    margin: 0 0 2px 0;
    font-size: 11px;
    font-style: italic;
    color: #777;
    padding-left: 24px;
  }

  .dialogue-text {
    margin: 0;
    font-size: 12px;
    color: #ccc;
    line-height: 1.5;
    padding-left: 24px;
  }

  /* Direction line (read-only in full script view; authored in Scene Script tab) */

  .direction-line {
    padding: 2px 4px;
  }

  .direction-text {
    font-style: italic;
    font-size: 12px;
    color: #888;
    padding-left: 24px;
    display: block;
  }

  /* Structural annotation: act notes + scene transition */

  .act-notes,
  .scene-transition {
    margin: 0 16px 8px;
    padding: 4px 8px;
    border-left: 2px solid #2a2a2a;
    cursor: pointer;
    border-radius: 0 2px 2px 0;
    transition: border-color 0.1s, background 0.1s;
  }

  .act-notes:hover,
  .scene-transition:hover {
    background: #1a1a1a;
    border-left-color: #4a9eff;
  }

  .annotation-text {
    font-size: 11px;
    font-style: italic;
    color: #666;
    display: block;
    line-height: 1.5;
  }

  .annotation-edit {
    margin: 4px 16px;
  }

  .annotation-input {
    width: 100%;
    box-sizing: border-box;
    background: #141418;
    color: #ccc;
    border: 1px solid #4a9eff;
    border-radius: 2px;
    padding: 4px 8px;
    font-family: inherit;
    font-size: 11px;
    font-style: italic;
    resize: none;
    outline: none;
  }

  .add-annotation-btn {
    display: block;
    background: transparent;
    border: none;
    color: #333;
    font-size: 10px;
    text-align: left;
    cursor: pointer;
    padding: 4px 20px;
    font-family: inherit;
    transition: color 0.1s;
    font-style: italic;
  }

  .add-annotation-btn:hover {
    color: #4a9eff;
  }

  /* Scene separator */

  .scene-divider {
    border: none;
    border-top: 2px solid #222;
    margin: 0;
  }

  /* Print styles */

  @media print {
    .production-script {
      font-family: 'Courier New', monospace;
      color: #000;
      background: #fff;
      font-size: 12pt;
      overflow: visible;
      height: auto;
    }

    .toolbar {
      margin-bottom: 24pt;
      border-bottom: 1px solid #000;
    }

    .production-title {
      font-size: 14pt;
      font-weight: bold;
      color: #000;
      letter-spacing: normal;
    }

    .print-btn,
    .add-annotation-btn {
      display: none;
    }

    .script-body {
      overflow: visible;
    }

    .act-heading {
      border-top-color: #000;
    }

    .act-label,
    .act-name {
      color: #000;
    }

    .scene-section {
      page-break-inside: avoid;
    }

    .scene-heading {
      cursor: default;
      border-bottom: 1px solid #000;
    }

    .scene-label,
    .scene-name {
      color: #000;
    }

    .active-badge {
      display: none;
    }

    .character-name {
      color: #000;
    }

    .dialogue-text {
      color: #000;
    }

    .direction-text {
      color: #444;
    }

    .annotation-text {
      color: #555;
    }

    .scene-divider {
      border-top: 1px solid #ccc;
    }
  }
</style>
