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
    ChangeFaceColorCommand,
    ApplyTextureCommand,
    TransformPartCommand,
    CommitGlueCommand,
    UnglueAllCommand,
    SnapToFloorCommand,
    WeldCommand,
    UnweldCommand,
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
  // Number of currently selected meshes (primary + multi). Drives the Weld button.
  let multiSelectedCount = $state(0);
  // Whether the primary selected part belongs to a weld group (not a glue group).
  let selectedGroupIsWeld = $state(false);
  // Whether the primary selected part has any active glue joints.
  let selectedPartHasGlue = $state(false);
  // When non-null, we are in group edit mode — editing a single member of this weld group id.
  let groupEditGroupId = $state<string | null>(null);
  // Face paint mode: when true, clicks colour individual faces instead of selecting parts.
  let facePaintMode = $state(false);
  // The materialIndex of the face last hovered/selected when in face paint mode.
  let hoveredFaceMaterialIndex = $state<number | null>(null);
  // Id of the part under the cursor during a drag-over (for texture drop targeting).
  let dragTargetPartId = $state<string | null>(null);
  let dragTargetMaterialIndex = $state<number | null>(null);
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
  // Original material properties for meshes dimmed during group edit mode.
  let dimmedMeshes: Array<{ mesh: THREE.Mesh; origTransparent: boolean[]; origOpacity: number[] }> = [];

  // Orbit drag detection: suppress click when the pointer was dragged.
  let pointerDownAt: [number, number] | null = null;
  let suppressNextClick = false;

  // Extrusion handle drag suppresses orbit.
  let handleDragActive = false;
  let extrusionDepth = $state(1);
  let isExtruding = $state(false);
  let extrusionBeforeSnapshot: ReturnType<typeof sketcherDoc.captureSnapshot> | null = null;

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
      // A new primary selection clears multi-select.
      selection.clearMultiSelection();
      multiSelectedCount = mesh ? 1 : 0;
      if (mesh) {
        tc.attach(mesh);
        // tc.attach() always sets _root.visible = true internally; re-apply face-paint override.
        tc.getHelper().visible = !facePaintMode;
        // In group edit mode the status is set by enterGroupEditMode; don't clobber it.
        if (groupEditGroupId === null) {
          statusMessage = 'W translate · E rotate · R scale · Shift+D duplicate · Delete remove · Esc deselect';
        }
        const part = sketcher.getSession().parts.find((p) => p.mesh === mesh);
        if (part) {
          selectedPartId = part.id;
          selectedColor = '#' + part.color.toString(16).padStart(6, '0');
          selectedGroupIsWeld = sketcher.glueManager.isWeldGroup(part.id);
          selectedPartHasGlue = sketcher.glueManager.getJoints().some(
            (j) => j.partAId === part.id || j.partBId === part.id,
          );
        }
      } else {
        // Deselection — if in group edit mode, clean up dimming before TC detaches.
        if (groupEditGroupId !== null) {
          restoreGroupDimming();
          groupEditGroupId = null;
        }
        tc.detach();
        statusMessage = '';
        selectedPartId = null;
        facePaintMode = false;
        hoveredFaceMaterialIndex = null;
        selectedGroupIsWeld = false;
        selectedPartHasGlue = false;
        clearFaceHighlight();
        // tc.detach() already sets _root.visible = false; no need to touch it here.
      }
    };

    sketcher = new CartoonSketcher(scene, camera);
    sketcher.onExtrusionStarted = () => { isExtruding = true; extrusionDepth = 1; };
    sketcher.onExtrusionDepthChanged = (d) => { extrusionDepth = d; };
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
        if (draft?.version === 2) sketcher.loadDraft(draft);
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
          if (e.ctrlKey && e.shiftKey) { exitGroupEditMode(); sketcherDoc.redo(); e.preventDefault(); }
          else if (e.ctrlKey) { exitGroupEditMode(); sketcherDoc.undo(); e.preventDefault(); }
          break;
        case 'y': case 'Y':
          if (e.ctrlKey) { exitGroupEditMode(); sketcherDoc.redo(); e.preventDefault(); }
          break;
        case 'Escape':
          if (groupEditGroupId !== null) { exitGroupEditMode(); }
          else if (gluePhase !== null) { cancelGluePick(); }
          else if (sketcher.currentPhase === 'drawing') { sketcher.cancelSketch(); orbit.enabled = true; }
          else { selection.deselect(); }
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
    if (facePaintMode && hoveredFaceMaterialIndex !== null) {
      sketcherDoc.execute(new ChangeFaceColorCommand(selectedPartId, hoveredFaceMaterialIndex, parseInt(hex.replace('#', ''), 16), sketcher));
    } else if (!facePaintMode) {
      sketcherDoc.execute(new ChangeColorCommand(selectedPartId, parseInt(hex.replace('#', ''), 16), sketcher));
    }
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
    if (!hits.length) { hoverInfo = '—'; hoveredFaceMaterialIndex = null; return; }
    const hit = hits[0];
    const hitMesh = hit.object as THREE.Mesh;
    const part = session.parts.find((p) => p.mesh === hitMesh);
    const localNormal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
    const group = faceGroupFromNormal(hitMesh, localNormal);
    const label = faceGroupLabel(hitMesh.geometry, group);
    const uv = hit.uv ? `(${hit.uv.x.toFixed(2)}, ${hit.uv.y.toFixed(2)})` : 'n/a';
    hoverInfo = `${part?.name ?? '?'} · ${label} · uv ${uv}`;
    // Track which material index is under the cursor so face paint clicks know which slot to update.
    if (facePaintMode && part?.id === selectedPartId) {
      hoveredFaceMaterialIndex = hit.face?.materialIndex ?? null;
    } else {
      hoveredFaceMaterialIndex = null;
    }
  }

  function onMouseMove(e: MouseEvent) {
    const [x, y] = toNDC(e);
    updateDiagnosticHover(x, y);
    if (sketcher.currentPhase === 'drawing') {
      sketcher.onMouseMove(x, y);
      // Alt held → let the user orbit mid-sketch without placing a point
      orbit.enabled = e.altKey;
    }
    if (handleDragActive) {
      sketcher.onPointerMove(x, y);
    }
    if (gluePhase !== null || facePaintMode) {
      updateFaceHighlight(x, y);
    }
  }

  function onMouseClick(e: MouseEvent) {
    if (suppressNextClick) { suppressNextClick = false; return; }
    if (handleDragActive) return;
    const [x, y] = toNDC(e);

    if (sketcher.currentPhase === 'drawing') {
      if (e.altKey) return; // Alt held — user is orbiting, not placing a vertex
      sketcher.onClick(x, y);
      // Re-enable orbit when the polygon closes and extrusion phase starts
      if (sketcher.currentPhase !== 'drawing') orbit.enabled = true;
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

    // Idle phase: click → try to select a part (or paint a face in face-paint mode).
    if (sketcher.currentPhase === 'idle') {
      const session = sketcher.getSession();
      const meshes = session.parts.map((p) => p.mesh);

      // Shift-click: toggle a part in the multi-selection.
      // TC is detached during multi-select; the user presses Weld to proceed.
      if (e.shiftKey && selection.selectedMesh) {
        const hit = selection.pick(x, y, camera, meshes);
        if (hit && hit !== selection.selectedMesh) {
          if (selection.selectedMeshes.includes(hit)) {
            selection.removeFromSelection(hit);
          } else {
            // Reject parts already in any assembly group during multi-select —
            // only standalone parts can be welded.
            const hitPart = session.parts.find((p) => p.mesh === hit);
            if (hitPart && !sketcher.glueManager.groupForPart(hitPart.id)) {
              // Also reject if the primary selected part is in a group.
              if (!sketcher.glueManager.groupForPart(selectedPartId ?? '')) {
                selection.addToSelection(hit);
              } else {
                statusMessage = 'Multi-select only works with standalone parts (not in a group).';
              }
            } else {
              statusMessage = 'Multi-select only works with standalone parts (not in a group).';
            }
          }
          multiSelectedCount = selection.selectedMeshes.length;
          // Detach TC when more than one part is selected.
          if (multiSelectedCount > 1) tc.detach();
        }
        return;
      }

      // In face paint mode, a click on the selected part's mesh paints the hovered face.
      if (facePaintMode && selectedPartId && hoveredFaceMaterialIndex !== null) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length) {
          const hitPart = session.parts.find((p) => p.mesh === hits[0].object);
          if (hitPart?.id === selectedPartId) {
            const mi = hits[0].face?.materialIndex ?? hoveredFaceMaterialIndex;
            sketcherDoc.execute(new ChangeFaceColorCommand(selectedPartId, mi, parseInt(selectedColor.replace('#', ''), 16), sketcher));
            return;
          }
        }
      }

      const hit = selection.pick(x, y, camera, meshes);

      // ── Group edit mode routing ───────────────────────────────────────────
      if (groupEditGroupId !== null) {
        const hitPart = hit ? session.parts.find((p) => p.mesh === hit) : undefined;
        const ag = hitPart ? sketcher.glueManager.groupForPart(hitPart.id) : undefined;
        const editAg = sketcher.glueManager.getAssemblyGroups().find((g) => g.id === groupEditGroupId);
        if (ag && editAg && ag.id === editAg.id) {
          // Clicked a member inside the group being edited — switch the active member.
          enterGroupEditMode(ag, hit!);
        } else {
          // Clicked outside the group — exit, then handle the new hit normally.
          exitGroupEditMode();
          if (hit) {
            const newHitPart = session.parts.find((p) => p.mesh === hit);
            const newAg = newHitPart ? sketcher.glueManager.groupForPart(newHitPart.id) : undefined;
            if (newAg) {
              selection.select(hit);
              tc.attach(newAg.group);
              statusMessage = 'Group selected. W/E/R transform · G=glue edit · U=unglue · double-click to edit a member';
            } else {
              selection.select(hit);
            }
          } else {
            selection.select(null);
          }
        }
        return;
      }

      // ── Normal click (not in group edit mode) ─────────────────────────────
      if (hit) {
        // In normal mode, selecting any mesh in a group selects the whole group.
        const hitPart = session.parts.find((p) => p.mesh === hit);
        const ag = hitPart ? sketcher.glueManager.groupForPart(hitPart.id) : undefined;
        if (ag) {
          // Fire onSelectionChanged first (sets selectedPartId / selectedColor),
          // then override TC to the group so the group moves as a unit.
          selection.select(hit);
          tc.attach(ag.group);
          statusMessage = 'Group selected. W/E/R transform · G=glue edit · U=unglue · double-click to edit a member';
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
      // Capture state before the extrusion is committed so it can be undone.
      if (sketcher.currentPhase === 'extruding') {
        extrusionBeforeSnapshot = sketcherDoc.captureSnapshot();
      }
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
      isExtruding = false;
      orbit.enabled = true;
      // If this pointer-up committed an extrusion, record it as an undoable entry.
      if (extrusionBeforeSnapshot) {
        sketcherDoc.record(extrusionBeforeSnapshot, sketcherDoc.captureSnapshot(), 'Commit sketch');
        extrusionBeforeSnapshot = null;
      }
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

    // Face-paint: highlight only the selected part's faces.
    // Glue src: hover over any part. Glue target: exclude the src blob's group.
    let meshesToHit: THREE.Mesh[];
    if (facePaintMode && selectedPartId) {
      const selectedPart = session.parts.find((p) => p.id === selectedPartId);
      meshesToHit = selectedPart ? [selectedPart.mesh] : [];
    } else if (gluePhase === 'src') {
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
    const highlightColor = facePaintMode ? 0x44ccaa : 0xffee00;
    const mat = new THREE.MeshBasicMaterial({ color: highlightColor, depthTest: false, transparent: true, opacity: 0.9 });
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
    statusMessage = 'Glued.';

    // Re-attach TC: after SA15 glue, parts stay at scene root (no glue group).
    // If targetPart was already welded, remain attached to the weld group.
    const ag = sketcher.glueManager.groupForPart(targetPart.id);
    if (ag) {
      tc.attach(ag.group);
    } else {
      tc.attach(targetPart.mesh);
    }
    selectedPartHasGlue = true;
  }

  function unglueSelected() {
    if (!selectedPartId) return;
    sketcherDoc.execute(new UnglueAllCommand(selectedPartId, sketcher));
    // Re-attach TC. Under SA15 parts are never reparented by glue, so the
    // part stays at scene root (or inside its weld group if it has one).
    const part = sketcher.getSession().parts.find((p) => p.id === selectedPartId);
    if (part) {
      const ag = sketcher.glueManager.groupForPart(part.id);
      tc.attach(ag ? ag.group : part.mesh);
    }
    selectedPartHasGlue = false;
    statusMessage = 'Unglued.';
  }

  // ── Texture drag-and-drop ────────────────────────────────────────────────────

  function faceBelowPointer(ndcX: number, ndcY: number): { partId: string; materialIndex: number } | null {
    const session = sketcher.getSession();
    const meshes = session.parts.map((p) => p.mesh);
    if (!meshes.length) return null;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = raycaster.intersectObjects(meshes, false);
    if (!hits.length) return null;
    const hitPart = session.parts.find((p) => p.mesh === hits[0].object);
    const materialIndex = hits[0].face?.materialIndex ?? 0;
    return hitPart ? { partId: hitPart.id, materialIndex } : null;
  }

  function onDragOver(e: DragEvent) {
    const hasImage = Array.from(e.dataTransfer?.items ?? []).some(
      (item) => item.kind === 'file' && item.type.startsWith('image/'),
    );
    if (!hasImage) return;
    e.preventDefault();
    e.dataTransfer!.dropEffect = 'copy';
    const [x, y] = toNDC(e as unknown as MouseEvent);
    const target = faceBelowPointer(x, y);
    dragTargetPartId = target?.partId ?? null;
    dragTargetMaterialIndex = target?.materialIndex ?? null;
  }

  function onDragLeave() {
    dragTargetPartId = null;
    dragTargetMaterialIndex = null;
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer?.files[0];
    if (!file || !file.type.startsWith('image/')) {
      dragTargetPartId = null;
      dragTargetMaterialIndex = null;
      return;
    }
    const [x, y] = toNDC(e as unknown as MouseEvent);
    const target = faceBelowPointer(x, y) ?? (
      dragTargetPartId !== null && dragTargetMaterialIndex !== null
        ? { partId: dragTargetPartId, materialIndex: dragTargetMaterialIndex }
        : null
    );
    dragTargetPartId = null;
    dragTargetMaterialIndex = null;
    if (!target) { statusMessage = 'Drop an image onto a face to texture it.'; return; }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      sketcherDoc.execute(new ApplyTextureCommand(target.partId, target.materialIndex, dataUrl, sketcher));
      statusMessage = 'Texture applied.';
    };
    reader.readAsDataURL(file);
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
    orbit.enabled = false; // orbit suppressed during polygon drawing; hold Alt to orbit temporarily
    statusMessage = 'Click to place polygon vertices. Click near the first vertex to close the shape. Hold Alt to orbit.';
  }

  function clearSession() {
    if (gluePhase !== null) cancelGluePick();
    selection.deselect();
    sketcher.clearSession();
    sketcherDoc.clearStack();
    localStorage.removeItem('sketcher-draft');
    statusMessage = 'Session cleared.';
  }

  // ── Group edit mode ──────────────────────────────────────────────────────────

  function applyGroupDimming(ag: import('../../core/sketcher/types.js').AssemblyGroup, activeMesh: THREE.Mesh) {
    restoreGroupDimming();
    for (const child of ag.group.children) {
      if (!(child instanceof THREE.Mesh) || child === activeMesh) continue;
      const mats = Array.isArray(child.material)
        ? (child.material as THREE.MeshStandardMaterial[])
        : [child.material as THREE.MeshStandardMaterial];
      const origTransparent = mats.map((m) => m.transparent);
      const origOpacity = mats.map((m) => m.opacity);
      for (const m of mats) { m.transparent = true; m.opacity = 0.22; m.needsUpdate = true; }
      dimmedMeshes.push({ mesh: child as THREE.Mesh, origTransparent, origOpacity });
    }
  }

  function restoreGroupDimming() {
    for (const { mesh, origTransparent, origOpacity } of dimmedMeshes) {
      const mats = Array.isArray(mesh.material)
        ? (mesh.material as THREE.MeshStandardMaterial[])
        : [mesh.material as THREE.MeshStandardMaterial];
      mats.forEach((m, i) => { m.transparent = origTransparent[i]; m.opacity = origOpacity[i]; m.needsUpdate = true; });
    }
    dimmedMeshes = [];
  }

  function enterGroupEditMode(ag: import('../../core/sketcher/types.js').AssemblyGroup, activeMesh: THREE.Mesh) {
    groupEditGroupId = ag.id;
    applyGroupDimming(ag, activeMesh);
    // selection.select fires onSelectionChanged → tc.attach(activeMesh); TC stays on the individual mesh.
    selection.select(activeMesh);
    statusMessage = 'Group edit: W/E/R transform selected member · click another member to switch · Esc to exit';
  }

  function exitGroupEditMode() {
    if (groupEditGroupId === null) return;
    restoreGroupDimming();
    const prevGroupId = groupEditGroupId;
    groupEditGroupId = null;
    const ag = sketcher.glueManager.getAssemblyGroups().find((g) => g.id === prevGroupId);
    if (ag && selection.selectedMesh) {
      // Re-attach TC to the group; selection outline stays on the last-active member.
      tc.attach(ag.group);
      statusMessage = 'Group selected. W/E/R transform · double-click to edit a member · U=unweld';
    } else {
      selection.deselect();
    }
  }

  function weldSelected() {    if (!sketcher || !selectedPartId) return;
    const meshes = selection.selectedMeshes;
    if (meshes.length < 2) return;
    const session = sketcher.getSession();
    const partIds = meshes
      .map((m) => session.parts.find((p) => p.mesh === m)?.id)
      .filter((id): id is string => id !== undefined);
    if (partIds.length < 2) return;
    selection.clearMultiSelection();
    selection.deselect();
    multiSelectedCount = 0;
    const cmd = new WeldCommand(partIds, sketcher);
    sketcherDoc.execute(cmd);
    // Re-select the group so TC attaches to the weld group and the button state updates.
    const ag = sketcher.glueManager.groupForPart(partIds[0]);
    const firstPart = sketcher.getSession().parts.find((p) => p.id === partIds[0]);
    if (ag && firstPart) {
      selection.select(firstPart.mesh);
      tc.attach(ag.group);
      selectedGroupIsWeld = true;
    }
    statusMessage = 'Welded. Parts grouped as one rigid unit.';
  }

  function unweldSelected() {
    if (!sketcher || !selectedPartId) return;
    sketcherDoc.execute(new UnweldCommand(selectedPartId, sketcher));
    const part = sketcher.getSession().parts.find((p) => p.id === selectedPartId);
    if (part) tc.attach(part.mesh);
    selectedGroupIsWeld = false;
    statusMessage = 'Unwelded. Parts returned to scene root.';
  }
  function onDoubleClick(e: MouseEvent) {
    if (!sketcher) return;
    if (sketcher.currentPhase !== 'idle') return;
    if (gluePhase !== null) return;
    const [x, y] = toNDC(e);
    const session = sketcher.getSession();
    const meshes = session.parts.map((p) => p.mesh);
    const hit = selection.pick(x, y, camera, meshes);
    if (!hit) return;
    const hitPart = session.parts.find((p) => p.mesh === hit);
    if (!hitPart) return;
    if (!sketcher.glueManager.isWeldGroup(hitPart.id)) return;
    const ag = sketcher.glueManager.groupForPart(hitPart.id);
    if (!ag) return;
    enterGroupEditMode(ag, hit);
  }

  function snapToFloor() {
    if (!selectedPartId) return;
    sketcherDoc.execute(new SnapToFloorCommand(selectedPartId, sketcher));
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
      <button disabled={!canUndo} onclick={() => { exitGroupEditMode(); sketcherDoc.undo(); }} title="Ctrl+Z">↩ Undo</button>
      <button disabled={!canRedo} onclick={() => { exitGroupEditMode(); sketcherDoc.redo(); }} title="Ctrl+Shift+Z">↪ Redo</button>
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
    {#if groupEditGroupId !== null}
      <button class="glue-btn" onclick={exitGroupEditMode} title="Esc">Exit group edit</button>
    {/if}
    {#if multiSelectedCount > 1}
      <button class="glue-btn" onclick={weldSelected} title="Weld selected parts into one rigid group">Weld</button>
    {/if}
    {#if selectedPartId}
      {#if selectedGroupIsWeld}
        <button class="glue-btn" onclick={unweldSelected} title="Dissolve weld group">Unweld</button>
      {/if}
      {#if selectedPartHasGlue}
        <button class="glue-btn" onclick={unglueSelected} title="U">Unglue</button>
      {/if}
      <button class="glue-btn" onclick={snapToFloor} title="F">⬇ Floor</button>
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
      <button
        class="face-paint-btn"
        class:active={facePaintMode}
        title="Face paint mode: click a face to colour it individually"
        onclick={() => { facePaintMode = !facePaintMode; hoveredFaceMaterialIndex = null; tc.getHelper().visible = !facePaintMode; if (!facePaintMode) clearFaceHighlight(); }}
      >Face</button>
      {#if facePaintMode}
        <span class="hud-label" style="font-size:9px">
          {hoveredFaceMaterialIndex !== null ? `face ${hoveredFaceMaterialIndex}` : 'hover a face'}
        </span>
      {/if}
      <button class="dup-btn" onclick={duplicateSelected} title="Shift+D">Duplicate</button>
    </div>
  {/if}

  <canvas
    bind:this={canvas}
    class="sketch-canvas"
    class:drag-target={dragTargetMaterialIndex !== null}
    onmousemove={onMouseMove}
    onclick={onMouseClick}
    ondblclick={onDoubleClick}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
    ondragover={onDragOver}
    ondragleave={onDragLeave}
    ondrop={onDrop}
  ></canvas>
  {#if statusMessage}
    <div class="sketch-hint">{statusMessage}</div>
  {/if}
  {#if isExtruding}
    <div class="depth-hud">Depth: {extrusionDepth.toFixed(2)}</div>
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

  .depth-hud {
    position: absolute;
    top: 56px;
    right: 12px;
    font-size: 13px;
    font-weight: 600;
    color: #ffdd00;
    background: rgba(15, 15, 26, 0.8);
    padding: 4px 10px;
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
  .sketch-canvas.drag-target {
    outline: 2px solid #44ccaa;
    outline-offset: -2px;
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

  .face-paint-btn {
    font-size: 11px;
    padding: 3px 6px;
  }
  .face-paint-btn.active {
    background: #1a3a2a;
    border-color: #44cc88;
    color: #88ffcc;
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
