<script lang="ts">
  import Presenter from '$lib/Presenter.svelte';
  import { exampleModel1 } from '$lib/exampleModel1';
  import { exampleModel2 } from '$lib/exampleModel2';

  let presenter : Presenter;

  const loadExampleModel1 = () => {
    presenter.loadModel(exampleModel1);
  };

  const loadExampleModel2 = () => {
    presenter.loadModel(exampleModel2);
  };
</script>

<h1>Load some example models into the scene</h1>

<button on:click={loadExampleModel1}>Load Example Model 1</button>
<button on:click={loadExampleModel2}>Load Example Model 2</button>

<Presenter bind:this={presenter} />
