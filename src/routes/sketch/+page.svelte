<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';
  import { CartoonSketcher } from '../../core/sketcher/CartoonSketcher.js';
  import { SelectionManager } from '../../core/sketcher/SelectionManager.js';
  import { faceGroupFromNormal, faceGroupLabel } from '../../core/sketcher/GlueManager.js';
  import { SketcherDocument } from '../../core/sketcher/SketcherDocument.js';
  import {
    InsertPartCommand,
    DuplicatePartCommand,
    DeletePartCommand,
    ChangeColorCommand,
    TransformPartCommand,
    CommitGlueCommand,
    UnglueAllCommand,
  } from '../../core/sketcher/sketcherCommands.js';
  import { exportGLB } from '../../core/sketcher/exportGLB.js';
  import * as OPFSCatalogueStore from '../../core/storage/OPFSCatalogueStore.js';

  // DEV-only guard – redirect to home in production builds.
  if (!import.meta.env.DEV) {
    goto('/');
  }

  let canvas: HTMLCanvasElement;
  let statusMessage = $state('');
  let transformMode = $state<'translate' | 'rotate' | 'scale'>('translate');
  let selectedPartId = $state<string | null>(null);
  let selectedColor = $state('#8888cc');
  let canUndo = $state(false);
  let canRedo = $state(false);
  // Glue interaction state
  let gluePhase = $state<'src' | 'target' | null>(null);
  // The anchor blob placed in phase 'src'.
  let glueSrcBlob = $state<{ partId: string; localPoint: THREE.Vector3; localNormal: THREE.Vector3; worldPoint: THREE.Vector3 } | null>(null);
  // Diagnostic HUD: always shows what face + UV is under the mouse.
  let hoverInfo = $state('—');

  const PALETTE = [
    '#cc4444', '#cc8844', '#cccc44', '#44cc44',
    '#44cccc', '#4488cc', '#8844cc', '#cc44cc',
  ];

  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let orbit: OrbitControls;
  let tc: TransformControls;
  let sketcher: CartoonSketcher;
  let sketcherDoc: SketcherDocument;
  let selection: SelectionManager;
  let animId: number;
  let draftSaveTimer: ReturnType<typeof setTimeout> | null = null;

  // Yellow hover highlight shown over the hovered face during glue-pick.
  let faceHighlight: THREE.Mesh | null = null;
  // Pink blob placed at the chosen src face to confirm the glue point.
  let glueBlobMarker: THREE.Mesh | null = null;

  // Orbit drag detection: suppress click when the pointer was dragged.
  let pointerDownAt: [number, number] | null = null;
  let suppressNextClick = false;

  // Extrusion handle drag suppresses orbit.
  let handleDragActive = false;

  // Snapshot captured at TC drag-start; passed to execute() at drag-end.
  let tcPreDragSnapshot: ReturnType<typeof sketcherDoc.captureSnapshot> | null = null;

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);

    scene.add(new THREE.GridHelper(20, 40, 0x444466, 0x333355));
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;

    // ── TransformControls ────────────────────────────────────────────────────
    tc = new TransformControls(camera, renderer.domElement);
    scene.add(tc.getHelper());
    tc.addEventListener('dragging-changed', (e) => {
      const isDragging = e.value as boolean;
      // Suppress orbit while the gizmo is being dragged.
      orbit.enabled = !isDragging;
      if (isDragging) {
        // Capture the scene state before the gizmo starts mutating the object.
        tcPreDragSnapshot = sketcherDoc.captureSnapshot();
      } else {
        // Drag ended: record the transform as an undoable entry using the
        // pre-drag snapshot as `before` so it is immune to stale group references.
        if (tcPreDragSnapshot) {
          sketcherDoc.execute(
            new TransformPartCommand(sketcher, selectedPartId),
            tcPreDragSnapshot,
          );
        }
        tcPreDragSnapshot = null;
      }
    });

    // ── SelectionManager ─────────────────────────────────────────────────────
    selection = new SelectionManager();
    selection.onSelectionChanged = (mesh) => {
      if (mesh) {
        tc.attach(mesh);
        statusMessage = 'W translate · E rotate · R scale · Shift+D duplicate · Delete remove · Esc deselect';
        const part = sketcher.getSession().parts.find((p) => p.mesh === mesh);
        if (part) {
          selectedPartId = part.id;
          selectedColor = '#' + part.color.toString(16).padStart(6, '0');
        }
      } else {
        tc.detach();
        statusMessage = '';
        selectedPartId = null;
      }
    };

    sketcher = new CartoonSketcher(scene, camera);
    sketcherDoc = new SketcherDocument(sketcher, () => {
      canUndo = sketcherDoc.canUndo;
      canRedo = sketcherDoc.canRedo;
      // Persist the session after every mutation so it survives a page reload.
      if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(() => {
        localStorage.setItem('sketcher-draft', JSON.stringify(sketcher.toDraft()));
        draftSaveTimer = null;
      }, 500);
    });

    // Restore draft from a previous session if one was saved.
    const rawDraft = localStorage.getItem('sketcher-draft');
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft);
        if (draft?.version === 1) sketcher.loadDraft(draft);
      } catch {
        // Corrupt draft — ignore and start fresh.
      }
    }

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'w': case 'W': setTransformMode('translate'); break;
        case 'e': case 'E': setTransformMode('rotate'); break;
        case 'r': case 'R': setTransformMode('scale'); break;
        case 'z': case 'Z':
          if (e.ctrlKey && e.shiftKey) { sketcherDoc.redo(); e.preventDefault(); }
          else if (e.ctrlKey) { sketcherDoc.undo(); e.preventDefault(); }
          break;
        case 'y': case 'Y':
          if (e.ctrlKey) { sketcherDoc.redo(); e.preventDefault(); }
          break;
        case 'Escape':
          if (gluePhase !== null) { cancelGluePick(); } else { selection.deselect(); }
          break;
        case 'Delete': case 'Backspace': deleteSelected(); break;
        case 'd': case 'D':
          if (e.shiftKey) { duplicateSelected(); }
          break;
        case 'g': case 'G':
          if (gluePhase === null) startGluePick();
          break;
        case 'u': case 'U':
          if (selectedPartId) unglueSelected();
          break;
      }
    };
    window.addEventListener('keydown', onKey);

    const handleResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    const render = () => {
      animId = requestAnimationFrame(render);
      orbit.update();
      renderer.render(scene, camera);
    };
    render();

    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', handleResize);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(animId);
    clearFaceHighlight();
    clearGlueBlobMarker();
    selection?.dispose();
    tc?.dispose();
    sketcher?.dispose();
    orbit?.dispose();
    renderer?.dispose();
  });

  // ── NDC helpers ──────────────────────────────────────────────────────────────

  function toNDC(e: MouseEvent | PointerEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    ];
  }

  // ── Transform mode ──────────────────────────────────────────────────────────

  function setTransformMode(mode: 'translate' | 'rotate' | 'scale') {
    transformMode = mode;
    tc?.setMode(mode);
  }

  // ── Selection + delete ──────────────────────────────────────────────────────

  function deleteSelected() {
    const mesh = selection.selectedMesh;
    if (!mesh) return;
    const session = sketcher.getSession();
    const part = session.parts.find((p) => p.mesh === mesh);
    if (!part) return;
    selection.deselect();
    sketcherDoc.execute(new DeletePartCommand(part.id, sketcher));
    statusMessage = 'Part deleted.';
  }

  function duplicateSelected() {
    const id = selectedPartId;
    if (!id) return;
    selection.deselect();
    const cmd = new DuplicatePartCommand(id, sketcher);
    sketcherDoc.execute(cmd);
    if (cmd.clonedPart) {
      selection.select(cmd.clonedPart.mesh);
      statusMessage = 'Duplicated. Reposition with gizmo.';
    }
  }

  function applyColor(hex: string) {
    selectedColor = hex;
    if (!selectedPartId) return;
    sketcherDoc.execute(new ChangeColorCommand(selectedPartId, parseInt(hex.replace('#', ''), 16), sketcher));
  }

  // ── Mouse / pointer handlers ─────────────────────────────────────────────────

  function updateDiagnosticHover(ndcX: number, ndcY: number) {
    if (!sketcher) { hoverInfo = '—'; return; }
    const session = sketcher.getSession();
    const meshes = session.parts.map((p) => p.mesh);
    if (!meshes.length) { hoverInfo = '—'; return; }
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) { hoverInfo = '—'; return; }
    const hit = hits[0];
    const hitMesh = hit.object as THREE.Mesh;
    const part = session.parts.find((p) => p.mesh === hitMesh);
    const localNormal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
    const group = faceGroupFromNormal(hitMesh, localNormal);
    const label = faceGroupLabel(hitMesh.geometry, group);
    const uv = hit.uv ? `(${hit.uv.x.toFixed(2)}, ${hit.uv.y.toFixed(2)})` : 'n/a';
    hoverInfo = `${part?.name ?? '?'} · ${label} · uv ${uv}`;
  }

  function onMouseMove(e: MouseEvent) {
    const [x, y] = toNDC(e);
    updateDiagnosticHover(x, y);
    if (sketcher.currentPhase === 'drawing') {
      sketcher.onMouseMove(x, y);
    }
    if (handleDragActive) {
      const newMesh = sketcher.onPointerMove(x, y);
      if (newMesh) scene.add(newMesh);
    }
    if (gluePhase !== null) {
      updateFaceHighlight(x, y);
    }
  }

  function onMouseClick(e: MouseEvent) {
    if (suppressNextClick) { suppressNextClick = false; return; }
    if (handleDragActive) return;
    const [x, y] = toNDC(e);

    if (sketcher.currentPhase === 'drawing') {
      sketcher.onClick(x, y);
      return;
    }

    if (gluePhase === 'src') {
      commitSrcFacePick(x, y);
      return;
    }

    if (gluePhase === 'target') {
      commitGlueClick(x, y);
      return;
    }

    // Idle phase: click → try to select a part.
    if (sketcher.currentPhase === 'idle') {
      const session = sketcher.getSession();
      const meshes = session.parts.map((p) => p.mesh);
      const hit = selection.pick(x, y, camera, meshes);
      if (hit) {
        // In normal mode, selecting any mesh in a group selects the whole group.
        const hitPart = session.parts.find((p) => p.mesh === hit);
        const ag = hitPart ? sketcher.glueManager.groupForPart(hitPart.id) : undefined;
        if (ag) {
          // Fire onSelectionChanged first (sets selectedPartId / selectedColor),
          // then override TC to the group so the group moves as a unit.
          selection.select(hit);
          tc.attach(ag.group);
          statusMessage = 'Group selected. W/E/R transform · G=glue edit · U=unglue';
          return;
        }
      }
      selection.select(hit);
    }
  }

  function onPointerDown(e: PointerEvent) {
    pointerDownAt = [e.clientX, e.clientY];
    const [x, y] = toNDC(e);
    const consumed = sketcher.onPointerDown(x, y);
    if (consumed) {
      handleDragActive = true;
      orbit.enabled = false;
    }
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerDownAt) {
      const dx = e.clientX - pointerDownAt[0];
      const dy = e.clientY - pointerDownAt[1];
      if (Math.hypot(dx, dy) > 4) suppressNextClick = true;
      pointerDownAt = null;
    }
    if (handleDragActive) {
      sketcher.onPointerUp();
      handleDragActive = false;
      orbit.enabled = true;
    }
  }

  // ── Glue interaction ─────────────────────────────────────────────────────────

  function startGluePick() {
    // Detach the transform gizmo so it doesn't block face picking.
    tc.detach();
    gluePhase = 'src';
    statusMessage = 'Click any surface to place the anchor blob. Esc cancels.';
  }

  function cancelGluePick() {
    gluePhase = null;
    glueSrcBlob = null;
    clearFaceHighlight();
    clearGlueBlobMarker();
    // Restore the gizmo to whatever is currently selected.
    if (selectedPartId) {
      const session = sketcher.getSession();
      const part = session.parts.find((p) => p.id === selectedPartId);
      if (part) {
        const ag = sketcher.glueManager.groupForPart(part.id);
        tc.attach(ag ? ag.group : part.mesh);
      }
    }
    statusMessage = '';
  }

  function clearFaceHighlight() {
    if (faceHighlight) {
      scene.remove(faceHighlight);
      faceHighlight.geometry.dispose();
      (faceHighlight.material as THREE.Material).dispose();
      faceHighlight = null;
    }
  }

  function clearGlueBlobMarker() {
    if (glueBlobMarker) {
      scene.remove(glueBlobMarker);
      glueBlobMarker.geometry.dispose();
      (glueBlobMarker.material as THREE.Material).dispose();
      glueBlobMarker = null;
    }
  }

  function updateFaceHighlight(ndcX: number, ndcY: number) {
    const session = sketcher.getSession();

    // Phase 'src': hover over any part. Phase 'target': exclude the src blob's group.
    let meshesToHit: THREE.Mesh[];
    if (gluePhase === 'src') {
      meshesToHit = session.parts.map((p) => p.mesh);
    } else {
      const srcGroup = glueSrcBlob ? sketcher.glueManager.groupForPart(glueSrcBlob.partId) : undefined;
      const excludedIds = srcGroup ? srcGroup.partIds : glueSrcBlob ? [glueSrcBlob.partId] : [];
      meshesToHit = session.parts.filter((p) => !excludedIds.includes(p.id)).map((p) => p.mesh);
    }
    if (!meshesToHit.length) return;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(meshesToHit, false);
    clearFaceHighlight();
    if (!hits.length) return;

    // Place the dot at the exact hit point, nudged slightly along the face normal.
    const hitNormal = hits[0].face?.normal?.clone() ?? new THREE.Vector3(0, 1, 0);
    hitNormal.transformDirection(hits[0].object.matrixWorld);
    const pos = hits[0].point.clone().addScaledVector(hitNormal, 0.02);
    const geo = new THREE.SphereGeometry(0.07, 8, 6);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee00, depthTest: false, transparent: true, opacity: 0.9 });
    faceHighlight = new THREE.Mesh(geo, mat);
    faceHighlight.position.copy(pos);
    scene.add(faceHighlight);
  }

  /**
   * Phase 'src' click: place the anchor blob on the clicked surface.
   * The anchor part stays put; the second click's part will move to meet it.
   */
  function commitSrcFacePick(ndcX: number, ndcY: number) {
    const session = sketcher.getSession();
    const meshes = session.parts.map((p) => p.mesh);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return; // missed — stay in 'src' phase

    const hitMesh = hits[0].object as THREE.Mesh;
    const part = session.parts.find((p) => p.mesh === hitMesh);
    if (!part) return;

    // Store hit point and face normal in the mesh's local space.
    hitMesh.updateWorldMatrix(true, false);
    const localPoint = hits[0].point.clone().applyMatrix4(hitMesh.matrixWorld.clone().invert());
    const localNormal = (hits[0].face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();

    // Pink blob at the chosen surface point as anchor marker.
    const hitNormal = localNormal.clone().transformDirection(hitMesh.matrixWorld);
    const blobPos = hits[0].point.clone().addScaledVector(hitNormal, 0.04);
    clearGlueBlobMarker();
    const geo = new THREE.SphereGeometry(0.12, 10, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff44aa, depthTest: false, transparent: true, opacity: 0.85 });
    glueBlobMarker = new THREE.Mesh(geo, mat);
    glueBlobMarker.position.copy(blobPos);
    scene.add(glueBlobMarker);

    clearFaceHighlight();
    glueSrcBlob = { partId: part.id, localPoint, localNormal, worldPoint: hits[0].point.clone() };
    gluePhase = 'target';
    statusMessage = 'Now click any surface on a different part to snap it here. Esc cancels.';
  }

  /**
   * Phase 'target' click: snap the mover part so its clicked surface point
   * meets the anchor blob placed in phase 'src'.
   */
  function commitGlueClick(ndcX: number, ndcY: number) {
    const session = sketcher.getSession();
    if (!glueSrcBlob) { cancelGluePick(); return; }

    const srcPart = session.parts.find((p) => p.id === glueSrcBlob!.partId);
    if (!srcPart) { cancelGluePick(); return; }

    // Exclude the anchor part and all parts in its group.
    const srcGroup = sketcher.glueManager.groupForPart(glueSrcBlob.partId);
    const excludedIds = srcGroup ? srcGroup.partIds : [glueSrcBlob.partId];
    const targetMeshes = session.parts
      .filter((p) => !excludedIds.includes(p.id))
      .map((p) => p.mesh);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(targetMeshes, false);
    if (!hits.length) return; // missed — stay in 'target' phase so user can reposition

    const hitMesh = hits[0].object as THREE.Mesh;
    const targetPart = session.parts.find((p) => p.mesh === hitMesh);
    if (!targetPart) return;

    hitMesh.updateWorldMatrix(true, false);
    const localPointTarget = hits[0].point.clone().applyMatrix4(hitMesh.matrixWorld.clone().invert());
    const localNormalTarget = (hits[0].face?.normal ?? new THREE.Vector3(0, 1, 0)).clone();

    // Anchor (A) stays; mover (B) rotates to face-align then snaps to meet the anchor point.
    sketcherDoc.execute(new CommitGlueCommand(
      sketcher,
      srcPart, glueSrcBlob.localPoint, glueSrcBlob.localNormal,
      targetPart, localPointTarget, localNormalTarget,
    ));

    clearFaceHighlight();
    clearGlueBlobMarker();
    gluePhase = null;
    glueSrcBlob = null;
    statusMessage = 'Glued. Parts joined in assembly group.';

    // Re-attach TC to the new assembly group.
    const ag = sketcher.glueManager.groupForPart(targetPart.id);
    if (ag) {
      tc.attach(ag.group);
    } else {
      tc.attach(targetPart.mesh);
    }
  }

  function unglueSelected() {
    if (!selectedPartId) return;
    sketcherDoc.execute(new UnglueAllCommand(selectedPartId, sketcher));
    // Re-attach TC to the individual mesh after ungluing.
    const part = sketcher.getSession().parts.find((p) => p.id === selectedPartId);
    if (part) tc.attach(part.mesh);
    statusMessage = 'Unglued. Part detached from assembly.';
  }

  // ── Toolbar actions ─────────────────────────────────────────────────────────

  function insertPrimitive(kind: string) {
    selection.deselect();
    const cmd = new InsertPartCommand(kind, sketcher);
    sketcherDoc.execute(cmd);
    if (cmd.insertedPart) {
      selection.select(cmd.insertedPart.mesh);
      statusMessage = `Inserted ${kind}. Move with gizmo, then add more parts or export.`;
    }
  }

  function newSketch() {
    selection.deselect();
    sketcher.startNewSketch();
    statusMessage = 'Click to place polygon vertices. Click near the first vertex to close the shape.';
  }

  function clearSession() {
    if (gluePhase !== null) cancelGluePick();
    selection.deselect();
    sketcher.clearSession();
    sketcherDoc.clearStack();
    localStorage.removeItem('sketcher-draft');
    statusMessage = 'Session cleared.';
  }

  async function exportToCatalogue() {
    const session = sketcher?.getSession();
    if (!session || session.parts.length === 0) {
      statusMessage = 'No parts to export. Complete at least one sketch first.';
      return;
    }
    statusMessage = 'Exporting…';
    const { blob, filename } = await exportGLB(session);
    await OPFSCatalogueStore.add(blob, {
      kind: 'set-piece',
      label: filename.replace('.glb', ''),
    });
    statusMessage = `Exported "${filename}" to catalogue.`;
  }
</script>

<div class="sketch-page">
  <header class="toolbar">
    <a class="back-link" href="/">← Back</a>
    <span class="title">Sketcher</span>
    <div class="actions">
      <button onclick={newSketch}>New sketch</button>
      <button onclick={clearSession}>Clear</button>
      <button disabled={!canUndo} onclick={() => sketcherDoc.undo()} title="Ctrl+Z">↩ Undo</button>
      <button disabled={!canRedo} onclick={() => sketcherDoc.redo()} title="Ctrl+Shift+Z">↪ Redo</button>
      <span class="separator"></span>
      <button class:active={transformMode === 'translate'} onclick={() => setTransformMode('translate')} title="W">Move</button>
      <button class:active={transformMode === 'rotate'} onclick={() => setTransformMode('rotate')} title="E">Rotate</button>
      <button class:active={transformMode === 'scale'} onclick={() => setTransformMode('scale')} title="R">Scale</button>
      <span class="separator"></span>
      <button class="primary" onclick={exportToCatalogue}>Export to Catalogue</button>
    </div>
  </header>
  <div class="primitives-bar">
    <span class="bar-label">Insert:</span>
    <button onclick={() => insertPrimitive('box')}>Cube</button>
    <button onclick={() => insertPrimitive('sphere')}>Sphere</button>
    <button onclick={() => insertPrimitive('cylinder')}>Cylinder</button>
    <button onclick={() => insertPrimitive('capsule')}>Capsule</button>
    <button onclick={() => insertPrimitive('cone')}>Cone</button>
    <span class="separator"></span>
    <button class="glue-btn" class:active={gluePhase !== null} onclick={startGluePick} title="G">Glue…</button>
    {#if selectedPartId}
      <button class="glue-btn" onclick={unglueSelected} title="U">Unglue</button>
    {/if}
  </div>

  {#if selectedPartId}
    <div class="colour-hud">
      <span class="hud-label">Colour</span>
      {#each PALETTE as hex}
        <button
          class="swatch"
          class:swatch-active={selectedColor === hex}
          style="background:{hex}"
          onclick={() => applyColor(hex)}
          aria-label={hex}
        ></button>
      {/each}
      <input
        type="color"
        class="hex-input"
        value={selectedColor}
        oninput={(e) => applyColor((e.target as HTMLInputElement).value)}
      />
      <button class="dup-btn" onclick={duplicateSelected} title="Shift+D">Duplicate</button>
    </div>
  {/if}

  <canvas
    bind:this={canvas}
    class="sketch-canvas"
    onmousemove={onMouseMove}
    onclick={onMouseClick}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
  ></canvas>
  {#if statusMessage}
    <div class="sketch-hint">{statusMessage}</div>
  {/if}
  <div class="diag-hud">{hoverInfo}</div>
</div>

<style>
  .sketch-page {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: #0f0f1a;
    color: #e0e0f0;
    font-family: sans-serif;
    position: relative;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: #12122a;
    border-bottom: 1px solid #2a2a4a;
    flex-shrink: 0;
  }

  .back-link {
    color: #8888cc;
    text-decoration: none;
    font-size: 13px;
  }
  .back-link:hover { color: #aaaae8; }

  .title {
    font-size: 14px;
    font-weight: 600;
    flex: 1;
  }

  .actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .separator {
    width: 1px;
    height: 20px;
    background: #3a3a6a;
  }

  button.active {
    background: #3d2d8a;
    border-color: #6050c8;
    color: #f0eeff;
  }

  .primitives-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 12px;
    background: #0f0f22;
    border-bottom: 1px solid #2a2a4a;
    flex-shrink: 0;
  }

  .bar-label {
    font-size: 11px;
    color: #6060a0;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-right: 2px;
  }

  button {
    padding: 4px 12px;
    font-size: 13px;
    border: 1px solid #3a3a6a;
    background: #1e1e40;
    color: #c0c0e0;
    border-radius: 4px;
    cursor: pointer;
  }
  button:hover { background: #28285a; }
  button.primary { background: #3d2d8a; border-color: #6050c8; color: #f0eeff; }
  button.primary:hover { background: #4e3aaa; }

  .sketch-hint {
    position: absolute;
    bottom: 12px;
    left: 12px;
    font-size: 12px;
    color: #9090c8;
    background: rgba(15, 15, 26, 0.75);
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 5;
  }

  .sketch-canvas {
    flex: 1;
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }

  .colour-hud {
    position: absolute;
    top: 80px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #12122a;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 8px;
    z-index: 10;
    min-width: 44px;
  }

  .hud-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6060a0;
    text-align: center;
  }

  .swatch {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    padding: 0;
    display: block;
  }
  .swatch:hover { border-color: #ffffff88; }
  .swatch-active { border-color: #ffffff !important; }

  .hex-input {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid #3a3a6a;
    border-radius: 4px;
    cursor: pointer;
    background: none;
  }

  .dup-btn {
    font-size: 11px;
    padding: 3px 6px;
    margin-top: 2px;
  }

  .glue-btn {
    font-size: 11px;
    padding: 3px 6px;
  }
  .glue-btn.active {
    background: #4a3a00;
    border-color: #cc9900;
    color: #ffee88;
  }

  .diag-hud {
    position: absolute;
    bottom: 12px;
    right: 12px;
    font-family: monospace;
    font-size: 11px;
    color: #60c080;
    background: rgba(15, 15, 26, 0.80);
    padding: 4px 8px;
    border-radius: 4px;
    pointer-events: none;
    z-index: 5;
  }
</style>
