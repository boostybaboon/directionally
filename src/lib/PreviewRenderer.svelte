<script lang="ts">
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { onMount } from 'svelte';

  interface Props {
    gltfPath: string;
    animationClips?: string[];
  }

  let { gltfPath, animationClips = [] }: Props = $props();

  let canvasEl: HTMLCanvasElement;
  /** Clip names discovered from the loaded GLTF — drives the button bar. */
  let loadedClipNames = $state<string[]>([]);
  let selectedClip = $state<string | null>(animationClips[0] ?? null);
  let loading = $state(true);
  let loadError = $state(false);

  let renderer: THREE.WebGLRenderer;
  let threeScene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let controls: OrbitControls;
  let mixer: THREE.AnimationMixer | null = null;
  let clips: THREE.AnimationClip[] = [];
  let activeAction: THREE.AnimationAction | null = null;
  let clock: THREE.Clock;
  let rafId: number;

  /** Position the camera so the full bounding sphere of the model is in frame. */
  function fitCamera(object: THREE.Object3D): void {
    const box = new THREE.Box3().setFromObject(object);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fovRad = camera.fov * (Math.PI / 180);
    // 2.2× padding gives a comfortable full-body framing
    const distance = (maxDim / 2) / Math.tan(fovRad / 2) * 2.2;
    camera.position.set(center.x, center.y, center.z + distance);
    controls.target.copy(center);
    controls.update();
  }

  function playClip(name: string | null): void {
    if (!mixer || !name) return;
    activeAction?.fadeOut(0.2);
    const clip = clips.find(c => c.name === name);
    if (clip) {
      activeAction = mixer.clipAction(clip);
      activeAction.reset().fadeIn(0.2).play();
    }
  }

  async function loadGltf(): Promise<void> {
    loading = true;
    loadError = false;

    // Clear previous model from scene
    if (mixer) { mixer.stopAllAction(); mixer = null; }
    activeAction = null;
    clips = [];
    const toRemove = threeScene.children.filter(c => !(c instanceof THREE.Light));
    toRemove.forEach(c => threeScene.remove(c));

    try {
      const loader = new GLTFLoader();
      const gltf = await loader.loadAsync(gltfPath);
      threeScene.add(gltf.scene);
      clips = gltf.animations;
      loadedClipNames = clips.map(c => c.name);
      mixer = new THREE.AnimationMixer(gltf.scene);
      fitCamera(gltf.scene);
      // Auto-play: prefer the hinted clip name, fall back to the first loaded clip.
      const hinted = animationClips[0] ?? null;
      const first = loadedClipNames[0] ?? null;
      selectedClip = (hinted && loadedClipNames.includes(hinted)) ? hinted : first;
      playClip(selectedClip);
    } catch {
      loadError = true;
    } finally {
      loading = false;
    }
  }

  function handleClipClick(clip: string): void {
    selectedClip = clip;
    playClip(clip);
  }

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
    threeScene = new THREE.Scene();
    threeScene.background = new THREE.Color(0x1a1a1a);

    camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);

    // Neutral preview lighting rig
    threeScene.add(new THREE.HemisphereLight(0xffffff, 0x333333, 1.5));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(3, 5, 3);
    threeScene.add(keyLight);

    controls = new OrbitControls(camera, canvasEl);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    clock = new THREE.Clock();

    const wrap = canvasEl.parentElement!;
    const resizeObserver = new ResizeObserver(() => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(wrap);

    // Initial size
    renderer.setSize(wrap.clientWidth || 200, wrap.clientHeight || 200);
    camera.aspect = (wrap.clientWidth || 200) / (wrap.clientHeight || 200);
    camera.updateProjectionMatrix();

    function animate(): void {
      rafId = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      mixer?.update(delta);
      controls.update();
      renderer.render(threeScene, camera);
    }
    animate();

    loadGltf();

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
    };
  });
</script>

<div class="preview-wrap">
  {#if loading}
    <div class="preview-status">Loading…</div>
  {:else if loadError}
    <div class="preview-status preview-status--error">Failed to load model</div>
  {/if}
  <canvas bind:this={canvasEl}></canvas>
</div>

{#if loadedClipNames.length > 0}
  <div class="clip-bar">
    {#each loadedClipNames as clip (clip)}
      <button
        class="clip-btn"
        class:active={selectedClip === clip}
        onclick={() => handleClipClick(clip)}
      >{clip}</button>
    {/each}
  </div>
{/if}

<style>
  .preview-wrap {
    position: relative;
    width: 100%;
    height: 200px;
    background: #1a1a1a;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .preview-status {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
    font-size: 11px;
    font-style: italic;
    pointer-events: none;
    z-index: 1;
  }

  .preview-status--error {
    color: #e06c75;
  }

  .clip-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 6px 8px;
    background: #141414;
    border-top: 1px solid #2a2a2a;
  }

  .clip-btn {
    background: #242424;
    border: 1px solid #333;
    border-radius: 3px;
    color: #888;
    font-size: 11px;
    padding: 3px 8px;
    cursor: pointer;
    transition: background 0.1s, color 0.1s, border-color 0.1s;
    line-height: 1.4;
  }

  .clip-btn:hover {
    background: #2a2a2a;
    color: #ccc;
  }

  .clip-btn.active {
    background: #1e2d3d;
    border-color: #4a9eff;
    color: #4a9eff;
  }
</style>
