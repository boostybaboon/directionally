<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
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
  import * as SketcherAssemblyStore from '../../core/storage/SketcherAssemblyStore.js';
  import type { AssemblyMeta } from '../../core/storage/SketcherAssemblyStore.js';

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
  // Face paint mode: when true, clicks lock and colour individual faces instead of selecting parts.
  let facePaintMode = $state(false);
  // The materialIndex of the face currently under the cursor (drives yellow highlight only).
  let hoveredFaceMaterialIndex = $state<number | null>(null);
  // True when the hovered face has an active texture.
  let hoveredFaceHasTexture = $state(false);
  // The materialIndex locked for editing by the last click in face paint mode.
  // All HUD actions (swatches, ↺ col, ✕ tex) target this face, not the hover face.
  let lockedFaceMaterialIndex = $state<number | null>(null);
  // True when the locked face has an active texture.
  let lockedFaceHasTexture = $state(false);
  // Id of the part under the cursor during a drag-over (for texture drop targeting).
  let dragTargetPartId = $state<string | null>(null);
  let dragTargetMaterialIndex = $state<number | null>(null);
  let canUndo = $state(false);
  let canRedo = $state(false);
  // Assembly management (SA9)
  let assemblyName = $state('Untitled');
  let currentAssemblyId = $state<string | null>(null);
  let savedAssemblies = $state<AssemblyMeta[]>([]);
  let showOpenPanel = $state(false);
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
  let isDrawing = $state(false);
  // True while the outer shape has been closed and the user may add holes before confirming extrusion.
  let isHolePending = $state(false);
  // True while a revolve profile has closed and is awaiting confirmation.
  let isRevolvePending = $state(false);
  // Sweep angle (degrees) for the pending revolve. Shown as a slider in the revolve HUD.
  let revolveAngleDeg = $state(360);
  // Saved camera state to restore on revolve-mode exit.
  let revolveAxisLine: THREE.Line | null = null;
  let revolveGhostedMeshes: Array<{ mesh: THREE.Mesh; origTransparent: boolean[]; origOpacity: number[] }> = [];
  let savedRevolveCamera: { position: THREE.Vector3; target: THREE.Vector3 } | null = null;
  let extrusionBeforeSnapshot: ReturnType<typeof sketcherDoc.captureSnapshot> | null = null;

  // SA12b: grid snap size for the polygon sketcher (default 0.1, persisted in localStorage)
  const _savedGridSnap = typeof localStorage !== 'undefined' ? parseFloat(localStorage.getItem('sketcher-grid-snap') ?? '0.1') : 0.1;
  let gridSnap = $state(isNaN(_savedGridSnap) ? 0.1 : _savedGridSnap);

  // SA6: sketch drawing mode and circle segments.
  let sketchMode = $state<'polygon' | 'rectangle' | 'circle'>('polygon');
  let circleSegments = $state(32);

  // SA12d: when true, glue src-pick snaps to the face-group centroid instead of the exact hit point.
  let glueMidpointMode = $state(false);

  // SA12a: transform inspector fields (world-space, shown when something is selected).
  let inspX = $state('0.000'); let inspY = $state('0.000'); let inspZ = $state('0.000');
  let inspRX = $state('0.0'); let inspRY = $state('0.0'); let inspRZ = $state('0.0');
  let inspSX = $state('1.000'); let inspSY = $state('1.000'); let inspSZ = $state('1.000');
  let uniformScale = $state(false);
  let inspectorFocused = false; // not reactive — only used to gate refreshInspector()

  // Snapshot captured at TC drag-start; passed to execute() at drag-end.
  let tcPreDragSnapshot: ReturnType<typeof sketcherDoc.captureSnapshot> | null = null;
  // Snapshot captured when an inspector field is focused; enables spinner steps to collapse
  // to a single undo entry (mirrors TC drag-start snapshot pattern).
  let inspPreFocusSnapshot: ReturnType<typeof sketcherDoc.captureSnapshot> | null = null;
  // True once the first oninput step of a focus session has pushed an entry;
  // subsequent steps amend rather than push.
  let inspSpinnerActive = false;
  // Whether the drag started in group-edit member mode or group-level mode.
  let tcDragMode: 'group' | 'member' = 'group';
  // Scale at TC drag-start; used to apply uniform scale during scale-mode drag.
  let tcDragStartScale: THREE.Vector3 | null = null;
  // Fine grid shown during polygon drawing; null when not drawing.
  let snapGrid: THREE.GridHelper | null = null;
  // Meshes temporarily ghosted while the glue target phase is active.
  let glueSrcGhostEntries: Array<{ mesh: THREE.Mesh; saved: Array<{ transparent: boolean; opacity: number }> }> = [];

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
        // member-edit: TC is on an individual mesh inside a group.
        // group-level: TC is on the group itself or a standalone mesh.
        tcDragMode = groupEditGroupId !== null ? 'member' : 'group';
        // Capture scale so the objectChange handler can apply uniform scaling relative to start.
        tcDragStartScale = (transformMode === 'scale' && tc.object) ? tc.object.scale.clone() : null;
      } else {
        // Drag ended: record the transform as an undoable entry using the
        // pre-drag snapshot as `before` so it is immune to stale group references.
        if (tcPreDragSnapshot) {
          sketcherDoc.execute(
            new TransformPartCommand(sketcher, selectedPartId, tcDragMode),
            tcPreDragSnapshot,
          );
        }
        tcPreDragSnapshot = null;
        tcDragStartScale = null;
        refreshInspector();
      }
    });

    tc.addEventListener('objectChange', () => {
      if (transformMode === 'scale' && uniformScale && tc.object && tcDragStartScale) {
        const s = tc.object.scale;
        const s0 = tcDragStartScale;
        const rx = s0.x > 1e-10 ? s.x / s0.x : 1;
        const ry = s0.y > 1e-10 ? s.y / s0.y : 1;
        const rz = s0.z > 1e-10 ? s.z / s0.z : 1;
        // Use the ratio of the axis dragged most (furthest from 1) and apply it uniformly.
        const ratio = [rx, ry, rz].reduce((a, b) => Math.abs(b - 1) > Math.abs(a - 1) ? b : a, 1);
        s.set(s0.x * ratio, s0.y * ratio, s0.z * ratio);
      }
      refreshInspector();
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
          refreshInspector();
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
        hoveredFaceHasTexture = false;
        lockedFaceMaterialIndex = null;
        lockedFaceHasTexture = false;
        selectedGroupIsWeld = false;
        selectedPartHasGlue = false;
        clearFaceHighlight();
        // tc.detach() already sets _root.visible = false; no need to touch it here.
      }
    };

    sketcher = new CartoonSketcher(scene, camera);
    sketcher.onExtrusionStarted = () => { isDrawing = false; hideSnapGrid(); isExtruding = true; isHolePending = false; extrusionDepth = 1; };
    sketcher.onExtrusionDepthChanged = (d) => { extrusionDepth = d; };
    sketcher.onShapeReadyForHoles = () => {
      isDrawing = false;
      hideSnapGrid();
      isHolePending = true;
      orbit.enabled = true;
      const holeCount = sketcher.pendingHoleCount;
      statusMessage = holeCount > 0
        ? `${holeCount} hole${holeCount > 1 ? 's' : ''} added. Add another hole or confirm to extrude.`
        : 'Shape closed. Click \u201cAdd hole\u201d to cut a hole through the extrusion, or \u201cConfirm\u201d to extrude.';
    };
    sketcher.onRevolveReady = () => {
      isDrawing = false;
      hideSnapGrid();
      isRevolvePending = true;
      statusMessage = 'Profile closed. Click \u201cRevolve\u201d to sweep it around the Y axis, or \u201cCancel\u201d to discard.';
    };
    sketcherDoc = new SketcherDocument(sketcher, () => {
      canUndo = sketcherDoc.canUndo;
      canRedo = sketcherDoc.canRedo;
      // Persist the session after every mutation so it survives a page reload.
      if (draftSaveTimer !== null) clearTimeout(draftSaveTimer);
      draftSaveTimer = setTimeout(async () => {
        const draft = sketcher.toDraft();
        if (currentAssemblyId) {
          await SketcherAssemblyStore.save(currentAssemblyId, assemblyName, draft);
        } else {
          const meta = await SketcherAssemblyStore.create(assemblyName, draft);
          currentAssemblyId = meta.id;
          localStorage.setItem('sketcher-assembly-id', meta.id);
          savedAssemblies = await SketcherAssemblyStore.list();
        }
        draftSaveTimer = null;
      }, 500);
    });

    // Restore the last-opened assembly from OPFS, or migrate the legacy localStorage draft.
    void (async () => {
      savedAssemblies = await SketcherAssemblyStore.list();
      const lastId = localStorage.getItem('sketcher-assembly-id');
    if (lastId) {
      const draft = await SketcherAssemblyStore.get(lastId);
      const meta = savedAssemblies.find((a) => a.id === lastId);
      if (draft && meta) {
        sketcher.loadDraft(draft);
        currentAssemblyId = lastId;
        assemblyName = meta.name;
      }
    } else {
      // Migrate legacy localStorage draft to a named OPFS assembly.
      const rawDraft = localStorage.getItem('sketcher-draft');
      if (rawDraft) {
        try {
          const draft = JSON.parse(rawDraft);
          if (draft?.version === 2) {
            sketcher.loadDraft(draft);
            const meta = await SketcherAssemblyStore.create('Untitled', draft);
            currentAssemblyId = meta.id;
            assemblyName = meta.name;
            localStorage.setItem('sketcher-assembly-id', meta.id);
            localStorage.removeItem('sketcher-draft');
            savedAssemblies = await SketcherAssemblyStore.list();
          }
        } catch {
          // Corrupt legacy draft — ignore and start fresh.
        }
      }
    }
    })();

    // ── Keyboard shortcuts ───────────────────────────────────────────────────
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case 'w': case 'W': setTransformMode('translate'); break;
        case 'e': case 'E': setTransformMode('rotate'); break;
        case 'r': case 'R': setTransformMode('scale'); break;
        case 'z': case 'Z':
          if (e.ctrlKey && e.shiftKey) { const lbl = sketcherDoc.redoLabel; exitGroupEditMode(); sketcherDoc.redo(); refreshInspector(); statusMessage = lbl ? `Redid: ${lbl}` : 'Redone.'; e.preventDefault(); }
          else if (e.ctrlKey) { const lbl = sketcherDoc.undoLabel; exitGroupEditMode(); sketcherDoc.undo(); refreshInspector(); statusMessage = lbl ? `Undid: ${lbl}` : 'Undone.'; e.preventDefault(); }
          break;
        case 'y': case 'Y':
          if (e.ctrlKey) { const lbl = sketcherDoc.redoLabel; exitGroupEditMode(); sketcherDoc.redo(); refreshInspector(); statusMessage = lbl ? `Redid: ${lbl}` : 'Redone.'; e.preventDefault(); }
          break;
        case 'Escape':
          if (groupEditGroupId !== null) { exitGroupEditMode(); }
          else if (gluePhase !== null) { cancelGluePick(); }
          else if (sketcher.currentPhase === 'drawing') { isDrawing = false; hideSnapGrid(); sketcher.cancelSketch(); orbit.enabled = true; }
          else if (sketcher.currentPhase === 'hole-drawing') { isDrawing = false; hideSnapGrid(); sketcher.cancelHole(); }
          else if (sketcher.currentPhase === 'pending-holes') { isHolePending = false; sketcher.cancelPendingShape(); orbit.enabled = true; }
          else if (sketcher.currentPhase === 'revolve-drawing' || sketcher.currentPhase === 'pending-revolve') { cancelRevolve(); }
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

  // ── SA12a: Transform inspector ───────────────────────────────────────────────

  /**
   * Read the current world-space transform of the selected object and update
   * the inspector input fields. Called on selection change and after TC drag-end.
   * Skipped when inspectorFocused=true so active typing isn't interrupted.
   */
  function refreshInspector() {
    if (!selectedPartId || inspectorFocused || !sketcher) return;
    const session = sketcher.getSession();
    const part = session.parts.find((p) => p.id === selectedPartId);
    if (!part) return;
    const ag = sketcher.glueManager.groupForPart(selectedPartId);
    // In member-edit mode TC is on the mesh; in group-level mode TC is on the group.
    const target: THREE.Object3D =
      groupEditGroupId !== null ? part.mesh : (ag ? ag.group : part.mesh);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    target.getWorldPosition(pos);
    target.getWorldQuaternion(quat);
    target.getWorldScale(scale);
    const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
    const toDeg = THREE.MathUtils.radToDeg;
    inspX = pos.x.toFixed(3); inspY = pos.y.toFixed(3); inspZ = pos.z.toFixed(3);
    inspRX = toDeg(euler.x).toFixed(1); inspRY = toDeg(euler.y).toFixed(1); inspRZ = toDeg(euler.z).toFixed(1);
    inspSX = scale.x.toFixed(3); inspSY = scale.y.toFixed(3); inspSZ = scale.z.toFixed(3);
  }

  /**
   * Apply a desired world-space transform to a Three.js object, converting to
   * local space when the object has a non-scene parent (i.e. is inside a group).
   */
  function applyWorldTransform(
    target: THREE.Object3D,
    pos: THREE.Vector3,
    quat: THREE.Quaternion,
    scale: THREE.Vector3,
  ): void {
    const worldMatrix = new THREE.Matrix4().compose(pos, quat, scale);
    if (target.parent && target.parent.type !== 'Scene') {
      target.parent.updateWorldMatrix(true, false);
      const localMatrix = target.parent.matrixWorld.clone().invert().multiply(worldMatrix);
      localMatrix.decompose(target.position, target.quaternion, target.scale);
    } else {
      target.position.copy(pos);
      target.quaternion.copy(quat);
      target.scale.copy(scale);
    }
    target.updateMatrixWorld(true);
  }

  /**
   * Resolve the Three.js target object and parsed transform values from the
   * current inspector fields. Returns null if fields are invalid or nothing
   * is selected. Used by both live preview and commit.
   */
  function resolveInspectorTransform(): {
    target: THREE.Object3D;
    pos: THREE.Vector3;
    quat: THREE.Quaternion;
    scale: THREE.Vector3;
    mode: 'group' | 'member';
  } | null {
    if (!selectedPartId) return null;
    const pos = new THREE.Vector3(parseFloat(inspX), parseFloat(inspY), parseFloat(inspZ));
    const euler = new THREE.Euler(
      THREE.MathUtils.degToRad(parseFloat(inspRX)),
      THREE.MathUtils.degToRad(parseFloat(inspRY)),
      THREE.MathUtils.degToRad(parseFloat(inspRZ)),
      'YXZ',
    );
    const scale = new THREE.Vector3(parseFloat(inspSX), parseFloat(inspSY), parseFloat(inspSZ));
    if ([pos.x, pos.y, pos.z, euler.x, euler.y, euler.z, scale.x, scale.y, scale.z].some(isNaN)) return null;
    const session = sketcher.getSession();
    const part = session.parts.find((p) => p.id === selectedPartId);
    if (!part) return null;
    const ag = sketcher.glueManager.groupForPart(selectedPartId);
    const mode: 'group' | 'member' = groupEditGroupId !== null ? 'member' : 'group';
    const target: THREE.Object3D = (mode === 'group' && ag) ? ag.group : part.mesh;
    return { target, pos, quat: new THREE.Quaternion().setFromEuler(euler), scale, mode };
  }

  /**
   * Called on every oninput: applies the transform to Three.js AND commits to
   * the undo stack, collapsing the whole spinner session into one entry.
   *
   * First call in a focus session: executes normally (pushes entry with
   * inspPreFocusSnapshot as `before`). Subsequent calls amend the top entry
   * (`after` snapshot replaced) so Ctrl+Z after N spinner steps undoes the
   * whole session in one keystroke.
   */
  function stepInspectorTransform() {
    const resolved = resolveInspectorTransform();
    if (!resolved) return;
    // Guard: if onfocus somehow didn't fire first, capture the pre-move state now.
    if (!inspPreFocusSnapshot) inspPreFocusSnapshot = sketcherDoc.captureSnapshot();
    applyWorldTransform(resolved.target, resolved.pos, resolved.quat, resolved.scale);
    const cmd = new TransformPartCommand(sketcher, selectedPartId, resolved.mode);
    if (!inspSpinnerActive) {
      sketcherDoc.execute(cmd, inspPreFocusSnapshot);
      inspSpinnerActive = true;
    } else {
      cmd.execute(); // resolveConstraints
      sketcherDoc.amendLastEntry(sketcherDoc.captureSnapshot());
    }
  }

  /**
   * Finalize the current inspector edit on blur or Enter.
   *
   * If a spinner session was active, amend the top entry with the final state.
   * Otherwise execute a fresh commit.
   */
  function commitInspectorTransform() {
    const resolved = resolveInspectorTransform();
    if (!resolved) return;
    applyWorldTransform(resolved.target, resolved.pos, resolved.quat, resolved.scale);
    const cmd = new TransformPartCommand(sketcher, selectedPartId, resolved.mode);
    if (inspSpinnerActive) {
      cmd.execute();
      sketcherDoc.amendLastEntry(sketcherDoc.captureSnapshot());
    } else {
      const before = inspPreFocusSnapshot ?? sketcherDoc.captureSnapshot();
      sketcherDoc.execute(cmd, before);
    }
    inspPreFocusSnapshot = null;
    inspSpinnerActive = false;
    refreshInspector();
  }

  // ── Selection + delete ──────────────────────────────────────────────────────

  function deleteSelected() {
    const mesh = selection.selectedMesh;
    if (!mesh) return;
    const session = sketcher.getSession();
    const part = session.parts.find((p) => p.mesh === mesh);
    if (!part) return;
    const ag = sketcher.glueManager.groupForPart(part.id);
    selection.deselect();
    if (ag) {
      // Delete all members of the weld group as one undoable action.
      const before = sketcherDoc.captureSnapshot();
      for (const pid of [...ag.partIds]) sketcher.removePart(pid);
      sketcherDoc.record(before, sketcherDoc.captureSnapshot(), 'Delete group');
      statusMessage = 'Group deleted.';
    } else {
      sketcherDoc.execute(new DeletePartCommand(part.id, sketcher));
      statusMessage = 'Part deleted.';
    }
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
    if (facePaintMode && lockedFaceMaterialIndex !== null) {
      sketcherDoc.execute(new ChangeFaceColorCommand(selectedPartId, lockedFaceMaterialIndex, parseInt(hex.replace('#', ''), 16), sketcher));
      // Keep lockedFaceHasTexture accurate after a colour change (texture stays, but re-check).
      const part = sketcher.getSession().parts.find((p) => p.id === selectedPartId);
      lockedFaceHasTexture = !!part?.faceTextures[lockedFaceMaterialIndex];
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
    if (!hits.length) { hoverInfo = '—'; hoveredFaceMaterialIndex = null; hoveredFaceHasTexture = false; return; }
    const hit = hits[0];
    const hitMesh = hit.object as THREE.Mesh;
    const part = session.parts.find((p) => p.mesh === hitMesh);
    const localNormal = hit.face?.normal ?? new THREE.Vector3(0, 1, 0);
    const group = faceGroupFromNormal(hitMesh, localNormal);
    const label = faceGroupLabel(hitMesh.geometry, group);
    const uv = hit.uv ? `(${hit.uv.x.toFixed(2)}, ${hit.uv.y.toFixed(2)})` : 'n/a';
    const inWeldGroup = part ? sketcher.glueManager.isWeldGroup(part.id) : false;
    const partLabel = inWeldGroup ? `${part?.name ?? '?'} (weld group — click to select group)` : (part?.name ?? '?');
    hoverInfo = `${partLabel} · ${label} · uv ${uv}`;
    // Track which material index is under the cursor so face paint clicks know which slot to update.
    if (facePaintMode && part?.id === selectedPartId) {
      const idx = hit.face?.materialIndex ?? null;
      hoveredFaceMaterialIndex = idx;
      hoveredFaceHasTexture = idx !== null ? !!part?.faceTextures[idx] : false;
    } else {
      hoveredFaceMaterialIndex = null;
      hoveredFaceHasTexture = false;
    }
  }

  function onMouseMove(e: MouseEvent) {
    const [x, y] = toNDC(e);
    updateDiagnosticHover(x, y);
    if (isDrawing) {
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

    if (isDrawing) {
      if (e.altKey) return; // Alt held — user is orbiting, not placing a vertex
      sketcher.onClick(x, y);
      // Re-enable orbit when all drawing phases complete
      if (!isDrawing) orbit.enabled = true;
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

      // Shift-click: toggle a standalone part in the multi-selection.
      // Weld groups are treated as atomic — shift-clicking any member of a
      // group that is already selected does nothing (the group is already
      // selected as a unit). TC is detached during multi-select.
      if (e.shiftKey && selection.selectedMesh) {
        const hit = selection.pick(x, y, camera, meshes);
        if (hit && hit !== selection.selectedMesh) {
          const hitPart = session.parts.find((p) => p.mesh === hit);
          const hitInGroup = hitPart ? sketcher.glueManager.groupForPart(hitPart.id) : undefined;
          const primaryInGroup = sketcher.glueManager.groupForPart(selectedPartId ?? '');
          if (hitInGroup || primaryInGroup) {
            // Groups are atomic — can't be mixed into a standalone multi-select.
            statusMessage = 'Multi-select only works with standalone parts (not in a group).';
          } else if (selection.selectedMeshes.includes(hit)) {
            selection.removeFromSelection(hit);
          } else {
            selection.addToSelection(hit);
          }
          multiSelectedCount = selection.selectedMeshes.length;
          if (multiSelectedCount > 1) tc.detach();
        }
        return;
      }

      // In face paint mode, a click on the selected part's mesh paints the hovered face.
      if (facePaintMode && selectedPartId) {
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length) {
          const hitPart = session.parts.find((p) => p.mesh === hits[0].object);
          if (hitPart?.id === selectedPartId) {
            const mi = hits[0].face?.materialIndex ?? 0;
            // Lock this face for editing and apply the current colour.
            lockedFaceMaterialIndex = mi;
            lockedFaceHasTexture = !!hitPart.faceTextures[mi];
            sketcherDoc.execute(new ChangeFaceColorCommand(selectedPartId, mi, parseInt(selectedColor.replace('#', ''), 16), sketcher));
            return;
          }
        }
        // Clicked canvas but missed the part — clear the lock.
        lockedFaceMaterialIndex = null;
        lockedFaceHasTexture = false;
        return;
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
              selection.selectGroup(hit, newAg.group);
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
          // Amber bounding box on the group instead of per-mesh outlines.
          selection.selectGroup(hit, ag.group);
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
    restoreGlueSrcGhost();
    gluePhase = null;
    glueSrcBlob = null;
    glueMidpointMode = false;
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

  function restoreGlueSrcGhost() {
    for (const { mesh, saved } of glueSrcGhostEntries) {
      const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.MeshStandardMaterial[];
      mats.forEach((m, i) => {
        m.transparent = saved[i].transparent;
        m.opacity = saved[i].opacity;
        m.needsUpdate = true;
      });
    }
    glueSrcGhostEntries = [];
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

  // ── SA12d: Glue face-group centroid helper ────────────────────────────────

  /**
   * Compute the centroid (average vertex position) of a draw group in a
   * geometry, in the geometry's local space. Used for midpoint-mode glue.
   */
  function computeGroupCentreLocal(
    geo: THREE.BufferGeometry,
    materialIndex: number,
  ): THREE.Vector3 {
    const grp = geo.groups.find((g) => g.materialIndex === materialIndex);
    if (!grp) return new THREE.Vector3();
    const pos = geo.getAttribute('position') as THREE.BufferAttribute;
    const index = geo.index;
    let cx = 0, cy = 0, cz = 0, count = 0;
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const vi = index ? index.getX(i) : i;
      cx += pos.getX(vi); cy += pos.getY(vi); cz += pos.getZ(vi);
      count++;
    }
    if (count === 0) return new THREE.Vector3();
    return new THREE.Vector3(cx / count, cy / count, cz / count);
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
    const matInv = hitMesh.matrixWorld.clone().invert();
    // In midpoint mode, snap the pick to the draw-group centroid instead of the exact cursor position.
    const localPoint = glueMidpointMode
      ? computeGroupCentreLocal(hitMesh.geometry, hits[0].face?.materialIndex ?? 0)
      : hits[0].point.clone().applyMatrix4(matInv);
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

    // Ghost the src entity so it doesn't occlude clicks on parts behind it.
    const srcGroup = sketcher.glueManager.groupForPart(part.id);
    const srcPartIds = srcGroup ? srcGroup.partIds : [part.id];
    glueSrcGhostEntries = [];
    for (const pid of srcPartIds) {
      const sp = session.parts.find((x) => x.id === pid);
      if (!sp) continue;
      const mats = (Array.isArray(sp.mesh.material) ? sp.mesh.material : [sp.mesh.material]) as THREE.MeshStandardMaterial[];
      const saved = mats.map((m) => ({ transparent: m.transparent, opacity: m.opacity }));
      glueSrcGhostEntries.push({ mesh: sp.mesh, saved });
      for (const m of mats) { m.transparent = true; m.opacity = 0.2; m.needsUpdate = true; }
    }

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
    restoreGlueSrcGhost();
    gluePhase = null;
    glueSrcBlob = null;
    statusMessage = 'Glued.';

    // Re-attach TC to the combined glue group.
    const ag = sketcher.glueManager.groupForPart(targetPart.id);
    if (ag) {
      selection.selectGroup(targetPart.mesh, ag.group);
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

  function showSnapGrid(vertical = false) {
    hideSnapGrid();
    const size = 10;
    const divisions = Math.min(Math.round(size / gridSnap), 200);
    snapGrid = new THREE.GridHelper(size, divisions, 0x667799, 0x445566);
    if (vertical) {
      // Revolve mode: rotate grid from XZ floor plane into the XY vertical plane.
      snapGrid.rotation.x = Math.PI / 2;
      snapGrid.position.set(size / 2, size / 2, 0);
    }
    scene.add(snapGrid);
  }

  function hideSnapGrid() {
    if (snapGrid) {
      scene.remove(snapGrid);
      snapGrid.geometry.dispose();
      const m = snapGrid.material;
      Array.isArray(m) ? m.forEach((mat) => mat.dispose()) : m.dispose();
      snapGrid = null;
    }
  }

  function newSketch() {
    selection.deselect();
    isDrawing = true;
    showSnapGrid();
    sketcher.gridSnapSize = gridSnap;
    sketcher.startNewSketch(sketchMode, circleSegments);
    orbit.enabled = false;
    if (sketchMode === 'rectangle') {
      statusMessage = 'Click to set one corner of the rectangle, then click the opposite corner. Hold Alt to orbit.';
    } else if (sketchMode === 'circle') {
      statusMessage = 'Click to set the circle centre, then click to set the radius. Hold Alt to orbit.';
    } else {
      statusMessage = 'Click to place polygon vertices. Click near the first vertex to close the shape. Hold Alt to orbit.';
    }
  }

  function addHole() {
    isHolePending = false;
    isDrawing = true;
    showSnapGrid();
    orbit.enabled = false;
    sketcher.addHole();
    statusMessage = 'Click to draw the hole boundary. Click near the first vertex to close. Hold Alt to orbit.';
  }

  function confirmShape() {
    isHolePending = false;
    sketcher.confirmShape();
  }

  function revolveShape() {
    isRevolvePending = false;
    hideSnapGrid();
    sketcher.confirmLathe(revolveAngleDeg);
    exitRevolveEnvironment();
    statusMessage = 'Revolved shape added. Move with gizmo or start a new sketch.';
  }

  function cancelRevolve() {
    isRevolvePending = false;
    isDrawing = false;
    hideSnapGrid();
    if (sketcher.currentPhase === 'revolve-drawing') {
      sketcher.cancelRevolveSketch();
    } else {
      sketcher.cancelPendingRevolve();
    }
    exitRevolveEnvironment();
    statusMessage = '';
  }

  function enterRevolveEnvironment() {
    // Save camera state and pivot to front view (XY plane face-on).
    savedRevolveCamera = { position: camera.position.clone(), target: orbit.target.clone() };
    camera.position.set(0, 2, 15);
    orbit.target.set(0, 2, 0);
    orbit.enableRotate = false;
    orbit.update();

    // Ghost all existing parts so the profile is easy to read.
    revolveGhostedMeshes = [];
    for (const part of sketcher.getSession().parts) {
      const mats = part.mesh.material as THREE.MeshStandardMaterial[];
      revolveGhostedMeshes.push({
        mesh: part.mesh,
        origTransparent: mats.map((m) => m.transparent),
        origOpacity: mats.map((m) => m.opacity),
      });
      mats.forEach((m) => { m.transparent = true; m.opacity = 0.15; m.needsUpdate = true; });
    }

    // Y-axis revolution indicator line.
    const axisGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -20, 0),
      new THREE.Vector3(0, 20, 0),
    ]);
    const axisMat = new THREE.LineBasicMaterial({ color: 0xff4400, depthTest: false });
    revolveAxisLine = new THREE.Line(axisGeo, axisMat);
    revolveAxisLine.renderOrder = 999;
    scene.add(revolveAxisLine);
  }

  function exitRevolveEnvironment() {
    // Restore camera.
    if (savedRevolveCamera) {
      camera.position.copy(savedRevolveCamera.position);
      orbit.target.copy(savedRevolveCamera.target);
      orbit.enableRotate = true;
      orbit.update();
      savedRevolveCamera = null;
    }
    // Un-ghost parts.
    for (const entry of revolveGhostedMeshes) {
      const mats = entry.mesh.material as THREE.MeshStandardMaterial[];
      mats.forEach((m, i) => {
        m.transparent = entry.origTransparent[i];
        m.opacity = entry.origOpacity[i];
        m.needsUpdate = true;
      });
    }
    revolveGhostedMeshes = [];
    // Remove axis indicator.
    if (revolveAxisLine) {
      scene.remove(revolveAxisLine);
      revolveAxisLine.geometry.dispose();
      (revolveAxisLine.material as THREE.Material).dispose();
      revolveAxisLine = null;
    }
  }

  function startRevolveMode() {
    enterRevolveEnvironment();
    isDrawing = true;
    isRevolvePending = false;
    showSnapGrid(true);
    sketcher.gridSnapSize = gridSnap;
    sketcher.startRevolveSketch();
    statusMessage = 'Draw the half-profile against the Y axis (left edge = revolution axis, Y = height). Click near the first vertex to close.';
  }

  function clearSession() {
    if (gluePhase !== null) cancelGluePick();
    selection.deselect();
    sketcher.clearSession();
    sketcherDoc.clearStack();
    statusMessage = 'Session cleared.';
  }

  async function newAssembly() {
    if (currentAssemblyId) {
      await SketcherAssemblyStore.save(currentAssemblyId, assemblyName, sketcher.toDraft());
    }
    clearSession();
    const meta = await SketcherAssemblyStore.create('Untitled', { version: 2, parts: [], joints: [], weldGroups: [] });
    currentAssemblyId = meta.id;
    assemblyName = meta.name;
    localStorage.setItem('sketcher-assembly-id', meta.id);
    savedAssemblies = await SketcherAssemblyStore.list();
    statusMessage = 'New assembly started.';
  }

  async function openAssembly(id: string) {
    if (currentAssemblyId) {
      await SketcherAssemblyStore.save(currentAssemblyId, assemblyName, sketcher.toDraft());
    }
    const meta = savedAssemblies.find((a) => a.id === id);
    const draft = await SketcherAssemblyStore.get(id);
    if (draft && meta) {
      clearSession();
      sketcher.loadDraft(draft);
      sketcherDoc.clearStack();
      currentAssemblyId = id;
      assemblyName = meta.name;
      localStorage.setItem('sketcher-assembly-id', id);
      showOpenPanel = false;
      statusMessage = `Opened "${meta.name}".`;
    }
  }

  async function deleteAssembly(id: string) {
    await SketcherAssemblyStore.remove(id);
    savedAssemblies = await SketcherAssemblyStore.list();
    if (currentAssemblyId === id) {
      currentAssemblyId = null;
      assemblyName = 'Untitled';
      localStorage.removeItem('sketcher-assembly-id');
    }
  }

  async function renameCurrentAssembly() {
    if (!currentAssemblyId) return;
    await SketcherAssemblyStore.save(currentAssemblyId, assemblyName, sketcher.toDraft());
    savedAssemblies = await SketcherAssemblyStore.list();
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
      // Switch from per-mesh outline back to amber group bounding box.
      selection.selectGroup(selection.selectedMesh, ag.group);
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
      selection.selectGroup(firstPart.mesh, ag.group);
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
    const mode = groupEditGroupId !== null ? 'member' : 'group';
    sketcherDoc.execute(new SnapToFloorCommand(selectedPartId, sketcher, mode));
  }

  async function exportToCatalogue() {
    const session = sketcher?.getSession();
    if (!session || session.parts.length === 0) {
      statusMessage = 'No parts to export. Complete at least one sketch first.';
      return;
    }
    statusMessage = 'Exporting…';
    const { blob } = await exportGLB(session);
    const label = assemblyName.trim() || 'Untitled';
    await OPFSCatalogueStore.add(blob, {
      kind: 'set-piece',
      label,
    });
    statusMessage = `Exported "${label}" to catalogue.`;
  }
</script>

<div class="sketch-page">
  <header class="toolbar">
    <a class="back-link" href="/">← Back</a>
    <div class="assembly-controls">
      <input
        class="assembly-name-input"
        type="text"
        bind:value={assemblyName}
        onblur={renameCurrentAssembly}
        onkeydown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        title="Assembly name"
        placeholder="Untitled"
      />
      <button onclick={newAssembly} title="New assembly">New</button>
      <button class:active={showOpenPanel} onclick={() => { showOpenPanel = !showOpenPanel; }} title="Open saved assembly">Open…</button>
    </div>
    <div class="actions">
      <select
        class="sketch-mode-select"
        bind:value={sketchMode}
        title="Sketch drawing mode"
        disabled={isDrawing || isExtruding}
      >
        <option value="polygon">Poly</option>
        <option value="rectangle">Rect</option>
        <option value="circle">Circle</option>
      </select>
      {#if sketchMode === 'circle'}
        <input
          type="number"
          class="segments-input"
          min="6" max="128" step="1"
          bind:value={circleSegments}
          disabled={isDrawing || isExtruding}
          title="Circle segments (N-gon approximation quality)"
        />
      {/if}
      <button onclick={newSketch}>New sketch</button>
      <button onclick={startRevolveMode} disabled={isDrawing || isExtruding || isRevolvePending} title="Draw a half-profile to revolve around the Y axis">Revolve…</button>
      <button disabled={!canUndo} onclick={() => { const lbl = sketcherDoc.undoLabel; exitGroupEditMode(); sketcherDoc.undo(); refreshInspector(); statusMessage = lbl ? `Undid: ${lbl}` : 'Undone.'; }} title="Ctrl+Z">↩ Undo</button>
      <button disabled={!canRedo} onclick={() => { const lbl = sketcherDoc.redoLabel; exitGroupEditMode(); sketcherDoc.redo(); refreshInspector(); statusMessage = lbl ? `Redid: ${lbl}` : 'Redone.'; }} title="Ctrl+Shift+Z">↪ Redo</button>
      <span class="separator"></span>
      <button class:active={transformMode === 'translate'} onclick={() => setTransformMode('translate')} title="W">Move</button>
      <button class:active={transformMode === 'rotate'} onclick={() => setTransformMode('rotate')} title="E">Rotate</button>
      <button class:active={transformMode === 'scale'} onclick={() => setTransformMode('scale')} title="R">Scale</button>
      <span class="separator"></span>
      <button class="primary" onclick={exportToCatalogue}>Export to Catalogue</button>
    </div>
  </header>

  {#if showOpenPanel}
    <div class="open-panel">
      <div class="open-panel-header">
        <span>Saved assemblies</span>
        <button class="panel-close" onclick={() => { showOpenPanel = false; }}>✕</button>
      </div>
      {#if savedAssemblies.length === 0}
        <p class="open-panel-empty">No saved assemblies yet.</p>
      {:else}
        <ul class="assembly-list">
          {#each savedAssemblies as a (a.id)}
            <li class="assembly-item" class:current={a.id === currentAssemblyId}>
              <button class="assembly-open-btn" onclick={() => openAssembly(a.id)}>
                <span class="assembly-item-name">{a.name}</span>
                <span class="assembly-item-date">{new Date(a.modifiedAt).toLocaleDateString()}</span>
              </button>
              <button class="assembly-delete-btn" title="Delete" onclick={() => deleteAssembly(a.id)}>✕</button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {/if}
  <div class="primitives-bar">
    <span class="bar-label">Insert:</span>
    <button onclick={() => insertPrimitive('box')}>Cube</button>
    <button onclick={() => insertPrimitive('sphere')}>Sphere</button>
    <button onclick={() => insertPrimitive('cylinder')}>Cylinder</button>
    <button onclick={() => insertPrimitive('capsule')}>Capsule</button>
    <button onclick={() => insertPrimitive('cone')}>Cone</button>
    <button onclick={() => insertPrimitive('torus')}>Torus</button>
    <span class="separator"></span>
    <button class="glue-btn" class:active={gluePhase !== null} onclick={startGluePick} title="G">Glue…</button>
    {#if gluePhase !== null}
      <button
        class="glue-btn"
        class:active={glueMidpointMode}
        title="Snap glue anchor to face-group centroid"
        onclick={() => { glueMidpointMode = !glueMidpointMode; }}
      >⊕ Centre</button>
    {/if}
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
    {#if isDrawing}
      <span class="separator"></span>
      <label class="snap-label" title="Grid snap size in world units">
        Snap
        <input
          type="number"
          class="snap-input"
          min="0.01" max="2" step="0.05"
          value={gridSnap}
          oninput={(e) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            if (!isNaN(v) && v > 0) {
              gridSnap = v;
              sketcher.gridSnapSize = v;
              localStorage.setItem('sketcher-grid-snap', String(v));
            }
          }}
        />
        m
      </label>
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
        onclick={() => { facePaintMode = !facePaintMode; hoveredFaceMaterialIndex = null; hoveredFaceHasTexture = false; lockedFaceMaterialIndex = null; lockedFaceHasTexture = false; tc.getHelper().visible = !facePaintMode; if (!facePaintMode) clearFaceHighlight(); }}
      >Face</button>
      {#if facePaintMode}
        <span class="hud-label" style="font-size:9px">
          {lockedFaceMaterialIndex !== null ? `face ${lockedFaceMaterialIndex}` : 'click a face'}
        </span>
        {#if lockedFaceMaterialIndex !== null}
          <button
            class="hud-action-btn"
            title="Reset this face to the body colour"
            onclick={() => {
              const part = sketcher.getSession().parts.find((p) => p.id === selectedPartId);
              if (part && lockedFaceMaterialIndex !== null)
                sketcherDoc.execute(new ChangeFaceColorCommand(selectedPartId!, lockedFaceMaterialIndex, part.color, sketcher));
            }}
          >↺ col</button>
        {/if}
        {#if lockedFaceHasTexture && lockedFaceMaterialIndex !== null}
          <button
            class="hud-action-btn"
            title="Remove texture from this face"
            onclick={() => {
              if (selectedPartId !== null && lockedFaceMaterialIndex !== null) {
                sketcherDoc.execute(new ApplyTextureCommand(selectedPartId, lockedFaceMaterialIndex, null, sketcher));
                lockedFaceHasTexture = false;
              }
            }}
          >✕ tex</button>
        {/if}
      {:else}
        <button
          class="hud-action-btn"
          title="Reset all face colours to the body colour"
          onclick={() => {
            const part = sketcher.getSession().parts.find((p) => p.id === selectedPartId);
            if (part) sketcherDoc.execute(new ChangeColorCommand(selectedPartId!, part.color, sketcher));
          }}
        >↺ col</button>
      {/if}
      <button class="dup-btn" onclick={duplicateSelected} title="Shift+D">Duplicate</button>
    </div>
  {/if}

  {#if selectedPartId && !isExtruding && !isDrawing}
    <div class="transform-inspector">
      <div class="insp-row">
        <span class="insp-label">Pos</span>
        <label>X<input type="number" step="0.01" class="insp-field" value={inspX}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => { inspX = (e.target as HTMLInputElement).value; stepInspectorTransform(); }}
          onblur={(e) => { inspectorFocused = false; inspX = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { inspX = (e.target as HTMLInputElement).value; commitInspectorTransform(); (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <label>Y<input type="number" step="0.01" class="insp-field" value={inspY}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => { inspY = (e.target as HTMLInputElement).value; stepInspectorTransform(); }}
          onblur={(e) => { inspectorFocused = false; inspY = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { inspY = (e.target as HTMLInputElement).value; commitInspectorTransform(); (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <label>Z<input type="number" step="0.01" class="insp-field" value={inspZ}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => { inspZ = (e.target as HTMLInputElement).value; stepInspectorTransform(); }}
          onblur={(e) => { inspectorFocused = false; inspZ = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { inspZ = (e.target as HTMLInputElement).value; commitInspectorTransform(); (e.target as HTMLInputElement).blur(); } }}
        /></label>
      </div>
      <div class="insp-row">
        <span class="insp-label">Rot°</span>
        <label>X<input type="number" step="1" class="insp-field" value={inspRX}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => { inspRX = (e.target as HTMLInputElement).value; stepInspectorTransform(); }}
          onblur={(e) => { inspectorFocused = false; inspRX = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { inspRX = (e.target as HTMLInputElement).value; commitInspectorTransform(); (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <label>Y<input type="number" step="1" class="insp-field" value={inspRY}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => { inspRY = (e.target as HTMLInputElement).value; stepInspectorTransform(); }}
          onblur={(e) => { inspectorFocused = false; inspRY = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { inspRY = (e.target as HTMLInputElement).value; commitInspectorTransform(); (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <label>Z<input type="number" step="1" class="insp-field" value={inspRZ}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => { inspRZ = (e.target as HTMLInputElement).value; stepInspectorTransform(); }}
          onblur={(e) => { inspectorFocused = false; inspRZ = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { inspRZ = (e.target as HTMLInputElement).value; commitInspectorTransform(); (e.target as HTMLInputElement).blur(); } }}
        /></label>
      </div>
      <div class="insp-row">
        <span class="insp-label">Scale</span>
        <label>X<input type="number" step="0.01" min="0.001" class="insp-field" value={inspSX}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (uniformScale && inspSX) { const ratio = parseFloat(v) / parseFloat(inspSX); inspSX = v; inspSY = (parseFloat(inspSY) * ratio).toFixed(3); inspSZ = (parseFloat(inspSZ) * ratio).toFixed(3); }
            else { inspSX = v; }
            stepInspectorTransform();
          }}
          onblur={(e) => { inspectorFocused = false; inspSX = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <label>Y<input type="number" step="0.01" min="0.001" class="insp-field" value={inspSY}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (uniformScale && inspSY) { const ratio = parseFloat(v) / parseFloat(inspSY); inspSY = v; inspSX = (parseFloat(inspSX) * ratio).toFixed(3); inspSZ = (parseFloat(inspSZ) * ratio).toFixed(3); }
            else { inspSY = v; }
            stepInspectorTransform();
          }}
          onblur={(e) => { inspectorFocused = false; inspSY = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <label>Z<input type="number" step="0.01" min="0.001" class="insp-field" value={inspSZ}
          onfocus={() => { inspectorFocused = true; inspSpinnerActive = false; inspPreFocusSnapshot = sketcherDoc.captureSnapshot(); }}
          oninput={(e) => {
            const v = (e.target as HTMLInputElement).value;
            if (uniformScale && inspSZ) { const ratio = parseFloat(v) / parseFloat(inspSZ); inspSZ = v; inspSX = (parseFloat(inspSX) * ratio).toFixed(3); inspSY = (parseFloat(inspSY) * ratio).toFixed(3); }
            else { inspSZ = v; }
            stepInspectorTransform();
          }}
          onblur={(e) => { inspectorFocused = false; inspSZ = (e.target as HTMLInputElement).value; commitInspectorTransform(); }}
          onkeydown={(e) => { if (e.key === 'Enter') { (e.target as HTMLInputElement).blur(); } }}
        /></label>
        <button
          class="insp-lock"
          class:active={uniformScale}
          title="Lock uniform scale"
          onclick={() => { uniformScale = !uniformScale; }}
        >{uniformScale ? '🔒' : '🔓'}</button>
      </div>
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
  {#if isHolePending}
    <div class="hole-hud">
      <button class="hole-btn" onclick={addHole}>Add hole</button>
      <button class="hole-btn confirm-btn" onclick={confirmShape}>Extrude</button>
    </div>
  {/if}
  {#if isRevolvePending}
    <div class="hole-hud revolve-hud">
      <label class="angle-label">
        Angle
        <input
          type="range"
          class="angle-slider"
          min="5" max="360" step="5"
          bind:value={revolveAngleDeg}
        />
        {revolveAngleDeg}°
      </label>
      <button class="hole-btn revolve-btn" onclick={revolveShape}>Revolve</button>
      <button class="hole-btn cancel-btn" onclick={cancelRevolve}>Cancel</button>
    </div>
  {/if}
  {#if isExtruding}
    <div class="depth-hud">
      <label class="depth-label">
        Depth
        <input
          class="depth-input"
          type="number"
          min="0.05" step="0.05"
          value={extrusionDepth.toFixed(2)}
          oninput={(e) => {
            const d = parseFloat((e.target as HTMLInputElement).value);
            if (!isNaN(d) && d >= 0.05) sketcher.setExtrusionDepth(d);
          }}
        />
        m
      </label>
    </div>
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

  .assembly-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .assembly-name-input {
    background: #1e1e3a;
    border: 1px solid #3a3a6a;
    border-radius: 4px;
    color: #e0e0ff;
    font-size: 13px;
    padding: 3px 8px;
    width: 160px;
  }
  .assembly-name-input:focus {
    outline: none;
    border-color: #6050c8;
  }

  .open-panel {
    position: absolute;
    top: 36px;
    left: 52px;
    z-index: 100;
    background: #1a1a36;
    border: 1px solid #3a3a6a;
    border-radius: 6px;
    min-width: 280px;
    max-height: 320px;
    display: flex;
    flex-direction: column;
    box-shadow: 0 4px 16px #0008;
  }

  .open-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    font-size: 12px;
    font-weight: 600;
    color: #8888cc;
    border-bottom: 1px solid #2a2a4a;
  }

  .panel-close {
    background: none;
    border: none;
    color: #6666aa;
    cursor: pointer;
    font-size: 14px;
    padding: 0 4px;
  }
  .panel-close:hover { color: #e0e0ff; }

  .open-panel-empty {
    padding: 16px 12px;
    font-size: 12px;
    color: #5555a0;
    margin: 0;
  }

  .assembly-list {
    list-style: none;
    margin: 0;
    padding: 4px 0;
    overflow-y: auto;
  }

  .assembly-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
  }
  .assembly-item.current { background: #25254a; }

  .assembly-open-btn {
    flex: 1;
    display: flex;
    align-items: baseline;
    gap: 8px;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    padding: 6px 4px;
    border-radius: 3px;
    color: #d0d0f0;
  }
  .assembly-open-btn:hover { background: #2a2a50; }

  .assembly-item-name {
    font-size: 13px;
    flex: 1;
  }

  .assembly-item-date {
    font-size: 11px;
    color: #5555a0;
  }

  .assembly-delete-btn {
    background: none;
    border: none;
    color: #5555a0;
    cursor: pointer;
    font-size: 13px;
    padding: 2px 6px;
  }
  .assembly-delete-btn:hover { color: #cc4444; }

  .back-link {
    color: #8888cc;
    text-decoration: none;
    font-size: 13px;
  }
  .back-link:hover { color: #aaaae8; }

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

  .hole-hud {
    position: absolute;
    top: 56px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 8px;
    pointer-events: all;
    z-index: 5;
  }

  .hole-btn {
    background: #1e1e40;
    border: 1px solid #3a3a6a;
    color: #c0c0e0;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    padding: 5px 14px;
    cursor: pointer;
  }
  .hole-btn:hover { background: #2a2a58; }

  .confirm-btn {
    background: #1a3a1a;
    border-color: #3a6a3a;
    color: #a0e0a0;
  }
  .confirm-btn:hover { background: #244224; }

  .revolve-btn {
    background: #1a2a3a;
    border-color: #3a5a7a;
    color: #a0c0e0;
  }
  .revolve-btn:hover { background: #223244; }

  .cancel-btn {
    background: #2a1a1a;
    border-color: #6a3a3a;
    color: #d0a0a0;
  }
  .cancel-btn:hover { background: #3a2020; }

  .angle-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #b0c0d8;
    font-size: 12px;
    white-space: nowrap;
  }
  .angle-slider { width: 100px; cursor: pointer; }

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
    pointer-events: all;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .depth-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #ffdd00;
    font-size: 13px;
    font-weight: 600;
  }

  .depth-input {
    width: 62px;
    background: rgba(30, 30, 60, 0.9);
    border: 1px solid #cc9900;
    color: #ffdd00;
    border-radius: 3px;
    font-size: 13px;
    padding: 1px 4px;
    text-align: right;
  }

  .transform-inspector {
    position: absolute;
    top: 80px;
    left: 12px;
    background: #12122a;
    border: 1px solid #2a2a4a;
    border-radius: 6px;
    padding: 8px 10px;
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 220px;
  }

  .insp-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .insp-label {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #6060a0;
    width: 32px;
    flex-shrink: 0;
  }

  .insp-row label {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 10px;
    color: #8080b0;
    flex: 1;
  }

  .insp-field {
    width: 52px;
    background: rgba(20, 20, 50, 0.9);
    border: 1px solid #3a3a6a;
    color: #c0c0e0;
    border-radius: 3px;
    font-size: 11px;
    padding: 1px 3px;
    text-align: right;
  }

  .insp-field:focus {
    outline: none;
    border-color: #6050c8;
    color: #ffffff;
  }

  .insp-lock {
    padding: 1px 4px;
    font-size: 11px;
    border: 1px solid #3a3a6a;
    background: #1a1a38;
    border-radius: 3px;
    cursor: pointer;
    line-height: 1;
  }
  .insp-lock.active {
    background: #1e1e4a;
    border-color: #6050c8;
  }

  .snap-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #8080b0;
  }

  .snap-input {
    width: 52px;
    background: rgba(20, 20, 50, 0.9);
    border: 1px solid #3a3a6a;
    color: #c0c0e0;
    border-radius: 3px;
    font-size: 11px;
    padding: 1px 3px;
    text-align: right;
  }
  .snap-input:focus {
    outline: none;
    border-color: #6050c8;
  }

  .sketch-mode-select {
    background: #1e1e40;
    border: 1px solid #3a3a6a;
    color: #c0c0e0;
    border-radius: 4px;
    font-size: 12px;
    padding: 3px 6px;
    cursor: pointer;
  }
  .sketch-mode-select:disabled { opacity: 0.5; cursor: default; }

  .segments-input {
    width: 44px;
    background: rgba(20, 20, 50, 0.9);
    border: 1px solid #3a3a6a;
    color: #c0c0e0;
    border-radius: 3px;
    font-size: 11px;
    padding: 1px 3px;
    text-align: right;
  }
  .segments-input:disabled { opacity: 0.5; }

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

  .hud-action-btn {
    font-size: 10px;
    padding: 2px 5px;
    opacity: 0.75;
  }
  .hud-action-btn:hover {
    opacity: 1;
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
