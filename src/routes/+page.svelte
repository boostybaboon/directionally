<script lang="ts">
  import Presenter from '$lib/Presenter.svelte';
  import { exampleModel1 } from '$lib/exampleModel1';
  import { exampleModel2 } from '$lib/exampleModel2';
  import { exampleModel3 } from '$lib/exampleModel3';
  import { exampleModel4 } from '$lib/exampleModel4';
  import { flyIntoRoomExample } from '$lib/FlyIntoRoomExample';
  import { exampleProduction1Scene } from '$lib/exampleProduction1';
  import { twoRobotsScene } from '$lib/twoRobotsScene';
  
  let presenter: Presenter;
  let activeModel = '';

  const loadExampleModel1 = () => {
    presenter.loadModel(exampleModel1);
    activeModel = 'model1';
  };

  const loadExampleModel2 = () => {
    presenter.loadModel(exampleModel2);
    activeModel = 'model2';
  };

  const loadExampleModel3 = () => {
    presenter.loadModel(exampleModel3);
    activeModel = 'model3';
  };

  const loadExampleModel4 = () => {
    presenter.loadModel(exampleModel4);
    activeModel = 'model4';
  };

  const loadFlyIntoRoomExample = () => {
    presenter.loadModel(flyIntoRoomExample);
    activeModel = 'fly';
  };

  const loadExampleProduction1 = () => {
    presenter.loadModel(exampleProduction1Scene);
    activeModel = 'prod1';
  };

  const loadTwoRobots = () => {
    presenter.loadModel(twoRobotsScene);
    activeModel = 'robots';
  };
</script>

<nav>
  <button class:active={activeModel === 'model1'} on:click={loadExampleModel1}>Camera rot</button>
  <button class:active={activeModel === 'model2'} on:click={loadExampleModel2}>Ball pos</button>
  <button class:active={activeModel === 'model3'} on:click={loadExampleModel3}>Robot rot</button>
  <button class:active={activeModel === 'model4'} on:click={loadExampleModel4}>Robot quat</button>
  <button class:active={activeModel === 'fly'} on:click={loadFlyIntoRoomExample}>Fly Into Room</button>
  <button class:active={activeModel === 'prod1'} on:click={loadExampleProduction1}>Ball (domain API)</button>
  <button class:active={activeModel === 'robots'} on:click={loadTwoRobots}>Two Robots</button>
</nav>

<Presenter bind:this={presenter} />

<style>
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding: 8px 12px;
    background: #111;
    border-bottom: 1px solid #333;
  }

  button {
    padding: 4px 10px;
    background: #2a2a2a;
    color: #ccc;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
  }

  button:hover {
    background: #3a3a3a;
  }

  button.active {
    background: #1a4a7a;
    color: #fff;
    border-color: #4a9eff;
  }
</style>
