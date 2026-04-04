<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { CartoonSketcher } from '../../core/sketcher/CartoonSketcher.js';
  import { exportGLB } from '../../core/sketcher/exportGLB.js';
  import * as OPFSCatalogueStore from '../../core/storage/OPFSCatalogueStore.js';

  // DEV-only guard – redirect to home in production builds.
  if (!import.meta.env.DEV) {
    goto('/');
  }

  let canvas: HTMLCanvasElement;
  let statusMessage = $state('');

  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let sketcher: CartoonSketcher;
  let animId: number;

  // Track whether a drag started on the extrusion handle so we can suppress
  // orbit controls for that gesture only.
  let handleDragActive = false;

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    camera = new THREE.PerspectiveCamera(60, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 8, 12);
    camera.lookAt(0, 0, 0);

    // Ground grid helper
    scene.add(new THREE.GridHelper(20, 40, 0x444466, 0x333355));

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(5, 10, 5);
    scene.add(dir);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    sketcher = new CartoonSketcher(scene, camera);

    const render = () => {
      animId = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();

    const handleResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', handleResize);

    return () => window.removeEventListener('resize', handleResize);
  });

  onDestroy(() => {
    cancelAnimationFrame(animId);
    sketcher?.dispose();
    controls?.dispose();
    renderer?.dispose();
  });

  // ── NDC helpers ──────────────────────────────────────────────────────────────

  function toNDC(e: MouseEvent): [number, number] {
    const rect = canvas.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    ];
  }

  // ── Mouse handlers ──────────────────────────────────────────────────────────

  function onMouseMove(e: MouseEvent) {
    const [x, y] = toNDC(e);
    sketcher?.onMouseMove(x, y);
    if (handleDragActive) {
      const newMesh = sketcher?.onPointerMove(x, y);
      if (newMesh) scene.add(newMesh);
    }
  }

  function onMouseClick(e: MouseEvent) {
    if (handleDragActive) return;
    const [x, y] = toNDC(e);
    sketcher?.onClick(x, y);
  }

  function onPointerDown(e: PointerEvent) {
    const [x, y] = toNDC(e);
    const consumed = sketcher?.onPointerDown(x, y);
    if (consumed) {
      handleDragActive = true;
      controls.enabled = false;
    }
  }

  function onPointerUp(_e: PointerEvent) {
    if (handleDragActive) {
      sketcher?.onPointerUp();
      handleDragActive = false;
      controls.enabled = true;
    }
  }

  // ── Toolbar actions ─────────────────────────────────────────────────────────

  function newSketch() {
    sketcher?.startNewSketch();
    statusMessage = 'Click to place polygon vertices. Click near the first vertex to close the shape.';
  }

  function clearSession() {
    sketcher?.clearSession();
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
      <button class="primary" onclick={exportToCatalogue}>Export to Catalogue</button>
    </div>
  </header>

  {#if statusMessage}
    <div class="status-bar">{statusMessage}</div>
  {/if}

  <canvas
    bind:this={canvas}
    class="sketch-canvas"
    onmousemove={onMouseMove}
    onclick={onMouseClick}
    onpointerdown={onPointerDown}
    onpointerup={onPointerUp}
  ></canvas>
</div>

<style>
  .sketch-page {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: #0f0f1a;
    color: #e0e0f0;
    font-family: sans-serif;
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

  .status-bar {
    padding: 4px 12px;
    font-size: 12px;
    background: #16162e;
    color: #9090c8;
    border-bottom: 1px solid #22224a;
    flex-shrink: 0;
  }

  .sketch-canvas {
    flex: 1;
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }
</style>
