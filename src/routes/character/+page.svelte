<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
  import { ProceduralHumanoid, C3PO_COLORS, SONNY_COLORS, DEFAULT_COLORS, DEFAULT_BONE_PARAMS, BONE_GROUPS } from '../../core/character/ProceduralHumanoid.js';
  import type { RobotStyle, BoneParamMap } from '../../core/character/ProceduralHumanoid.js';

  let canvas: HTMLCanvasElement;

  // Animation GLBs to load. Each filename becomes the clip label.
  const ANIM_GLBS = [
    '/models/gltf/anim-tpose.glb',
    '/models/gltf/anim-idle.glb',
    '/models/gltf/anim-walk.glb',
    '/models/gltf/anim-run.glb',
    '/models/gltf/anim-jump.glb',
    '/models/gltf/anim-turn-left.glb',
    '/models/gltf/anim-turn-right.glb',
    '/models/gltf/anim-turn-left-90.glb',
    '/models/gltf/anim-turn-right-90.glb',
    '/models/gltf/anim-strafe-left.glb',
    '/models/gltf/anim-strafe-right.glb',
    '/models/gltf/anim-strafe-left-walk.glb',
    '/models/gltf/anim-strafe-right-walk.glb',
  ];

  // Clip display name: capitalise each hyphen-separated word.
  function clipLabel(name: string): string {
    return name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  let clipNames = $state<string[]>([]);
  let activeClip = $state<string | null>(null);
  let bodyVisible = $state(true);
  let skeletonVisible = $state(false);
  let inPlace = $state(true);
  let robotStyle = $state<RobotStyle>('organic');
  let boneParams = $state<BoneParamMap>({ ...DEFAULT_BONE_PARAMS });
  let selectedGroup = $state<string>(BONE_GROUPS[0].key);
  let insetFactor = $state(0);
  let hoveredBone = $state<string | null>(null);
  let loading = $state(true);
  let loadError = $state(false);

  // Stored so style changes can rebuild without reloading assets.
  let rigGltfScene: THREE.Group | null = null;
  let allLoadedClips: THREE.AnimationClip[] = [];

  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let orbit: OrbitControls;
  let clock: THREE.Clock;
  let animId: number;
  let humanoid: ProceduralHumanoid | null = null;

  function buildHumanoid(style: RobotStyle): void {
    if (!rigGltfScene || !scene) return;
    if (humanoid) {
      scene.remove(humanoid.root);
      humanoid.dispose();
    }
    const colors = style === 'c3po' ? C3PO_COLORS : style === 'sonny' ? SONNY_COLORS : DEFAULT_COLORS;
    humanoid = new ProceduralHumanoid(rigGltfScene, [...allLoadedClips], colors, style, boneParams, insetFactor);
    humanoid.setInPlace(inPlace);
    humanoid.setBodyVisible(bodyVisible);
    humanoid.setSkeletonVisible(skeletonVisible);
    scene.add(humanoid.root);
    if (activeClip) humanoid.playClip(activeClip, inPlace);
  }

  function selectClip(name: string): void {
    activeClip = name;
    humanoid?.playClip(name, inPlace);
  }

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(devicePixelRatio);
    renderer.shadowMap.enabled = true;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.add(new THREE.GridHelper(10, 20, 0x444466, 0x333355));

    // Lighting
    scene.add(new THREE.HemisphereLight(0xffffff, 0x333355, 1.2));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 4);
    key.castShadow = true;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899cc, 0.5);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    camera = new THREE.PerspectiveCamera(55, 1, 0.01, 200);
    camera.position.set(0, 1.4, 3.5);
    camera.lookAt(0, 1.0, 0);

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1.0, 0);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.update();

    clock = new THREE.Clock();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointerMove = (e: MouseEvent) => {
      if (!humanoid) return;
      const rect = canvas.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(humanoid.allMeshes.filter(m => m.visible));
      hoveredBone = hits.length > 0 ? (hits[0].object.userData.boneName as string ?? null) : null;
    };
    canvas.addEventListener('pointermove', handlePointerMove);

    const handleResize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    handleResize();
    window.addEventListener('resize', handleResize);

    const render = () => {
      animId = requestAnimationFrame(render);
      const delta = clock.getDelta();
      humanoid?.update(delta);
      orbit.update();
      renderer.render(scene, camera);
    };
    render();

    // Load xbot-rig (skeleton only, no mesh), then load all animation GLBs in parallel.
    const loader = new GLTFLoader();
    loader.loadAsync('/models/gltf/xbot-rig.glb').then(async (rigGltf) => {
      rigGltfScene = rigGltf.scene;
      humanoid = new ProceduralHumanoid(rigGltfScene, []);
      scene.add(humanoid.root);

      // Fetch all animation GLBs, ignoring individual failures.
      // Derive the clip name from the filename ("anim-walk.glb" → "walk") —
      // immune to whatever Blender puts in the animation.name field.
      const animResults = await Promise.allSettled(
        ANIM_GLBS.map(async (path) => {
          const gltf = await loader.loadAsync(path);
          const label = path.split('/').pop()!.replace(/^anim-/, '').replace(/\.glb$/, '');
          for (const clip of gltf.animations) clip.name = label;
          return gltf;
        })
      );
      for (const result of animResults) {
        if (result.status === 'fulfilled') {
          humanoid.addClips(result.value.animations);
        }
      }
      allLoadedClips = [...humanoid.clips];

      clipNames = humanoid.clips.map((c) => c.name);
      const first = clipNames.find((n) => /idle/i.test(n)) ?? (clipNames[0] ?? null);
      if (first) {
        activeClip = first;
        humanoid.playClip(first, inPlace);
      }
      loading = false;
    }).catch(() => {
      loadError = true;
      loading = false;
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      canvas.removeEventListener('pointermove', handlePointerMove);
    };
  });

  onDestroy(() => {
    cancelAnimationFrame(animId);
    humanoid?.dispose();
    orbit?.dispose();
    renderer?.dispose();
  });
</script>

<div class="page">
  <header class="toolbar">
    <a href="/" class="back-btn">← Back</a>
    <span class="title">Character Creator</span>
    <div class="layer-bar">
      <button
        class="layer-btn"
        class:active={inPlace}
        onclick={() => {
          inPlace = !inPlace;
          humanoid?.setInPlace(inPlace);
          if (activeClip) humanoid?.playClip(activeClip, inPlace);
        }}
      >In Place</button>
      <button
        class="layer-btn"
        class:active={bodyVisible}
        onclick={() => { bodyVisible = !bodyVisible; humanoid?.setBodyVisible(bodyVisible); }}
      >Body</button>
      <button
        class="layer-btn"
        class:active={skeletonVisible}
        onclick={() => { skeletonVisible = !skeletonVisible; humanoid?.setSkeletonVisible(skeletonVisible); }}
      >Skeleton</button>
      <span class="style-label">Style:</span>
      {#each (['organic', 'c3po', 'sonny'] as RobotStyle[]) as s}
        <button
          class="layer-btn style-btn"
          class:active={robotStyle === s}
          onclick={() => { robotStyle = s; buildHumanoid(s); }}
        >{s === 'organic' ? 'Organic' : s === 'c3po' ? 'C-3PO' : 'Sonny'}</button>
      {/each}
    </div>
    {#if clipNames.length > 0}
      <div class="clip-bar">
        {#each clipNames as name}
          <button
            class="clip-btn"
            class:active={activeClip === name}
            onclick={() => selectClip(name)}
          >{clipLabel(name)}</button>
        {/each}
      </div>
    {/if}
  </header>

  {#if !loading}
    <div class="params-bar">
      <label class="param-label">
        <select
          class="group-select"
          value={selectedGroup}
          onchange={(e) => { selectedGroup = e.currentTarget.value; }}
        >
          {#each BONE_GROUPS as g}
            <option value={g.key}>{g.label}</option>
          {/each}
        </select>
      </label>
      {#if boneParams[selectedGroup]}
        {@const bp = boneParams[selectedGroup]}
        <label class="param-label">
          Width
          <span class="param-val">{bp.tubeRadiusX.toFixed(1)} cm</span>
          <input type="range" min="0" max="25" step="0.5"
            value={bp.tubeRadiusX}
            oninput={(e) => {
              boneParams = { ...boneParams, [selectedGroup]: { ...bp, tubeRadiusX: +e.currentTarget.value } };
              buildHumanoid(robotStyle);
            }}
          />
        </label>
        <label class="param-label">
          Depth
          <span class="param-val">{bp.tubeRadiusZ.toFixed(1)} cm</span>
          <input type="range" min="0" max="25" step="0.5"
            value={bp.tubeRadiusZ}
            oninput={(e) => {
              boneParams = { ...boneParams, [selectedGroup]: { ...bp, tubeRadiusZ: +e.currentTarget.value } };
              buildHumanoid(robotStyle);
            }}
          />
        </label>
        <label class="param-label">
          Joint
          <span class="param-val">{bp.jointRadius.toFixed(1)} cm</span>
          <input type="range" min="0" max="20" step="0.5"
            value={bp.jointRadius}
            oninput={(e) => {
              boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointRadius: +e.currentTarget.value } };
              buildHumanoid(robotStyle);
            }}
          />
        </label>
        {#if bp.jointFrustumRatio !== undefined}
          <label class="param-label">
            Palm depth
            <span class="param-val">{(bp.jointRadiusZ ?? bp.jointRadius).toFixed(1)} cm</span>
            <input type="range" min="0" max="20" step="0.5"
              value={bp.jointRadiusZ ?? bp.jointRadius}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointRadiusZ: +e.currentTarget.value } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Palm length
            <span class="param-val">{((bp.jointRadiusY ?? bp.jointRadius) * 2).toFixed(1)} cm</span>
            <input type="range" min="0" max="30" step="0.5"
              value={bp.jointRadiusY ?? bp.jointRadius}
              oninput={(e) => {
                const ry = +e.currentTarget.value;
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointRadiusY: ry, jointOffsetY: ry / 2 } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Wrist taper
            <span class="param-val">{((bp.jointFrustumRatio) * 100).toFixed(0)}%</span>
            <input type="range" min="0.1" max="1" step="0.05"
              value={bp.jointFrustumRatio}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointFrustumRatio: +e.currentTarget.value } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Knuckle taper
            <span class="param-val">{((bp.jointFrustumRatioZ ?? 1) * 100).toFixed(0)}%</span>
            <input type="range" min="0.1" max="1" step="0.05"
              value={bp.jointFrustumRatioZ ?? 1}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointFrustumRatioZ: +e.currentTarget.value } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
        {/if}
        {#if selectedGroup === 'foot'}
          <label class="param-label">
            Heel width
            <span class="param-val">{bp.jointRadius.toFixed(1)} cm</span>
            <input type="range" min="0" max="10" step="0.5"
              value={bp.jointRadius}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointRadius: +e.currentTarget.value } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Heel height
            <span class="param-val">{(bp.jointRadiusZ ?? bp.jointRadius).toFixed(1)} cm</span>
            <input type="range" min="0" max="10" step="0.5"
              value={bp.jointRadiusZ ?? bp.jointRadius}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointRadiusZ: +e.currentTarget.value } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Heel length
            <span class="param-val">{(bp.jointRadiusY ?? bp.jointRadius).toFixed(1)} cm</span>
            <input type="range" min="0" max="12" step="0.5"
              value={bp.jointRadiusY ?? bp.jointRadius}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointRadiusY: +e.currentTarget.value } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Heel offset Y
            <span class="param-val">{(bp.jointOffsetY ?? 0).toFixed(1)} cm</span>
            <input type="range" min="-15" max="15" step="0.5"
              value={bp.jointOffsetY ?? 0}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointOffsetY: e.currentTarget.valueAsNumber } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
          <label class="param-label">
            Heel offset Z
            <span class="param-val">{(bp.jointOffsetZ ?? 0).toFixed(1)} cm</span>
            <input type="range" min="-10" max="10" step="0.5"
              value={bp.jointOffsetZ ?? 0}
              oninput={(e) => {
                boneParams = { ...boneParams, [selectedGroup]: { ...bp, jointOffsetZ: e.currentTarget.valueAsNumber } };
                buildHumanoid(robotStyle);
              }}
            />
          </label>
        {/if}
        <button class="reset-btn" onclick={() => {
          boneParams = { ...boneParams, [selectedGroup]: DEFAULT_BONE_PARAMS[selectedGroup] };
          buildHumanoid(robotStyle);
        }}>Reset</button>
      {/if}
      <span class="param-sep">|</span>
      <label class="param-label">
        Inset
        <span class="param-val">{(insetFactor * 100).toFixed(0)}%</span>
        <input type="range" min="0" max="1.0" step="0.05"
          value={insetFactor}
          oninput={(e) => { insetFactor = +e.currentTarget.value; buildHumanoid(robotStyle); }}
        />
      </label>
    </div>
  {/if}

  <div class="viewport">
    <canvas bind:this={canvas}></canvas>
    {#if loading}
      <div class="overlay">Loading…</div>
    {:else if loadError}
      <div class="overlay error">Failed to load character.</div>
    {/if}
    {#if hoveredBone}
      <div class="bone-label">{hoveredBone}</div>
    {/if}
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    background: #0f0f1a;
    border-bottom: 1px solid #333;
    flex-shrink: 0;
  }

  .back-btn {
    color: #aaa;
    text-decoration: none;
    font-size: 12px;
    padding: 3px 8px;
    border: 1px solid #444;
    border-radius: 3px;
  }
  .back-btn:hover { color: #fff; border-color: #888; }

  .title {
    font-size: 13px;
    color: #ccc;
    font-weight: 600;
  }

  .clip-bar {
    display: flex;
    gap: 6px;
    margin-left: auto;
  }

  .clip-btn {
    padding: 3px 10px;
    background: #1e1e33;
    border: 1px solid #444;
    border-radius: 3px;
    color: #aaa;
    font-size: 12px;
    cursor: pointer;
  }
  .clip-btn:hover { color: #fff; border-color: #888; }
  .clip-btn.active {
    background: #3355aa;
    border-color: #4466cc;
    color: #fff;
  }

  .viewport {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #aaa;
    font-size: 14px;
    pointer-events: none;
  }
  .overlay.error { color: #cc6666; }

  .layer-bar {
    display: flex;
    gap: 4px;
    margin-left: 4px;
    align-items: center;
  }

  .style-label {
    margin-left: 8px;
    font-size: 11px;
    color: #666;
  }

  .params-bar {
    display: flex;
    gap: 20px;
    padding: 6px 16px;
    background: #0d0d1a;
    border-bottom: 1px solid #2a2a44;
    flex-shrink: 0;
    align-items: center;
  }

  .param-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #999;
    white-space: nowrap;
  }

  .param-val {
    width: 32px;
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #ccc;
  }

  .param-label input[type="range"] {
    width: 80px;
    accent-color: #4466cc;
    cursor: pointer;
  }

  .param-sep {
    color: #333;
    font-size: 16px;
    margin: 0 4px;
  }

  .group-select {
    background: #1e1e33;
    border: 1px solid #444;
    border-radius: 3px;
    color: #ccc;
    font-size: 12px;
    padding: 2px 6px;
    cursor: pointer;
  }

  .reset-btn {
    padding: 2px 7px;
    background: transparent;
    border: 1px solid #444;
    border-radius: 3px;
    color: #888;
    font-size: 11px;
    cursor: pointer;
  }
  .reset-btn:hover { color: #fff; border-color: #888; }

  .layer-btn {
    padding: 3px 10px;
    background: #1e1e33;
    border: 1px solid #444;
    border-radius: 3px;
    color: #aaa;
    font-size: 12px;
    cursor: pointer;
  }
  .layer-btn:hover { color: #fff; border-color: #888; }
  .layer-btn.active {
    background: #2a4a2a;
    border-color: #448844;
    color: #aaffaa;
  }

  .bone-label {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(0, 0, 0, 0.75);
    color: #ffee44;
    font-size: 13px;
    font-family: monospace;
    padding: 4px 14px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
  }
</style>
