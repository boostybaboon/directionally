<script lang="ts">
  import Presenter from '$lib/Presenter.svelte';
  import { exampleModel1 } from '$lib/exampleModel1';
  import { exampleModel2 } from '$lib/exampleModel2';
  import { exampleModel3 } from '$lib/exampleModel3';
  import { exampleModel4 } from '$lib/exampleModel4';
  import { flyIntoRoomExample } from '$lib/FlyIntoRoomExample';
  import { exampleProduction1Scene } from '$lib/exampleProduction1';
  import { twoRobotsScene } from '$lib/twoRobotsScene';
  
  let presenter : Presenter;

  const loadExampleModel1 = () => {
    presenter.loadModel(exampleModel1);
  };

  const loadExampleModel2 = () => {
    presenter.loadModel(exampleModel2);
  };

  const loadExampleModel3 = () => {
    presenter.loadModel(exampleModel3);
  };

  const loadExampleModel4 = () => {
    presenter.loadModel(exampleModel4);
  };

  const loadFlyIntoRoomExample = () => {
    presenter.loadModel(flyIntoRoomExample);
  };

  const loadExampleProduction1 = () => {
    presenter.loadModel(exampleProduction1Scene);
  };

  const loadTwoRobots = () => {
    presenter.loadModel(twoRobotsScene);
  };
</script>

<h1>Load some example models into the scene</h1>

<button on:click={loadExampleModel1}>Camera rot</button>
<button on:click={loadExampleModel2}>Ball pos</button>
<button on:click={loadExampleModel3}>Bobot rot</button>
<button on:click={loadExampleModel4}>Bobot quat</button>
<button on:click={loadFlyIntoRoomExample}>Fly Into Room</button>
<button on:click={loadExampleProduction1}>Ball (domain API)</button>
<button on:click={loadTwoRobots}>Two Robots</button>

<Presenter bind:this={presenter} />
