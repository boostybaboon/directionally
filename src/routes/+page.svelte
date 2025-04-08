<script lang="ts">
  import Presenter from '$lib/Presenter.svelte';
  import { createBasicScene } from '$lib/examples/BasicScene';
  import { createColorfulSpheresScene } from '$lib/examples/ColorfulSpheresScene';
  
  let presenter: Presenter;

  const loadBasicScene = () => {
    const scene = createBasicScene();
    presenter.loadModel(scene.camera, scene.assets, scene.actions);
  };

  const loadColorfulScene = () => {
    const scene = createColorfulSpheresScene();
    presenter.loadModel(scene.camera, scene.assets, scene.actions);
  };
</script>

<h1>Choose a scene to load</h1>

<div class="scene-buttons">
  <button on:click={loadBasicScene}>Load Basic Scene</button>
  <button on:click={loadColorfulScene}>Load Colorful Spheres</button>
</div>

<Presenter bind:this={presenter} />

<style>
  .scene-buttons {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
</style>
