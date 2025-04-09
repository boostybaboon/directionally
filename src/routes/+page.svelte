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
        sceneStore.loadScene(scene.camera, scene.assets);
      }}>Load Basic Scene</button>
      <button on:click={() => {
        const scene = createColorfulSpheresScene();
        sceneStore.loadScene(scene.camera, scene.assets);
      }}>Load Colorful Spheres</button>
    </div>
  </div>

  <div class="main-content">
    <Presenter />
    <Inspector />
  </div>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
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
  }
</style>
