<script lang="ts">
  import { sceneStore } from '$lib/stores/scene';
  import { createBasicScene } from '$lib/examples/BasicScene';
  import { createColorfulSpheresScene } from '$lib/examples/ColorfulSpheresScene';
  import Presenter from '$lib/components/Presenter.svelte';
  import Inspector from '$lib/components/Inspector.svelte';
</script>

<div class="page">
  <div class="controls">
    <h1>Choose a scene to load</h1>
    <div class="scene-buttons">
      <button on:click={() => {
        const scene = createBasicScene();
        const camera = scene.createCamera();
        sceneStore.loadScene(camera, scene.assets);
      }}>Load Basic Scene</button>
      <button on:click={() => {
        const scene = createColorfulSpheresScene();
        const camera = scene.createCamera();
        sceneStore.loadScene(camera, scene.assets);
      }}>Load Colorful Spheres</button>
    </div>
  </div>

  <div class="main-content">
    <div class="presenter-container">
      <Presenter />
    </div>
    <div class="inspector-container">
      <Inspector />
    </div>
  </div>
</div>

<style>
  :global(html, body) {
    height: 100%;
    margin: 0;
    padding: 0;
    overflow: hidden;
  }

  .page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
  }

  .controls {
    padding: 1rem;
    border-bottom: 1px solid #ddd;
  }

  .scene-buttons {
    display: flex;
    gap: 1rem;
    margin-top: 1rem;
  }

  .main-content {
    flex: 1;
    display: flex;
    overflow: hidden;
    min-height: 0;
  }

  .presenter-container {
    flex: 1;
    height: 100%;
    position: relative;
    min-height: 0;
    min-width: 0;
  }

  .inspector-container {
    flex: 0 0 20%;
    height: 100%;
    background-color: #f5f5f5;
    border-left: 1px solid #ddd;
    overflow: auto;
    min-height: 0;
  }
</style>
