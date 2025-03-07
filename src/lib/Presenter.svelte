<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Model } from './Model';
  import { SceneUtils } from './SceneUtils';

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;

  // TODO - should this be a type?
  let animationDict: { [key: string]: { anim: THREE.AnimationAction; start: number; end: number }[] } = {};

  let mixers: THREE.AnimationMixer[] = [];
  let scene: THREE.Scene;
  let clock: THREE.Clock;
  // TODO multiple cameras
  let camera: THREE.PerspectiveCamera;

  let isToneSetup = $state<boolean>(false);
  let isPlaying = $state<boolean>(false);
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);

  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  });

  const handleSetupClick = async () => {
    await setupTone();
    console.log('Tone setup complete');
    isToneSetup = true;
  };

  const setupTone = async () => {
    if (!isToneSetup) {
      await Tone.start();
      Tone.setContext(new Tone.Context({ lookAhead: 0 }));
      Tone.getDraw().anticipation = 0.5;
      isToneSetup = true;
    }
  };

  //need a method to load a model into the scene, and set up the animations
  const loadModel = (model: Model) => {

    mixers = [];
    animationDict = {};

    scene = new THREE.Scene();

    // for each camera in the model (at present only one) add to our cameras
    camera = SceneUtils.createCamera(model.camera);

    //for each asset in model, add the asset to the scene
    model.assets.forEach((asset) => {
      SceneUtils.addAsset(scene, asset);
    });

    //for each animation in model, add the animation to the animationDict
    //and add its mixer to the mixers array
    model.actions.forEach((action) => {
      SceneUtils.addAction(animationDict, mixers, action);
    });

    Object.values(animationDict).forEach((animGroup) => {
      animGroup.forEach((anim) => {
        Tone.getTransport().schedule((time) => {
          Tone.getDraw().schedule(() => {
            anim.anim.enabled = true;
            anim.anim.time = 0;
            anim.anim.paused = false;
          }, time);
        }, anim.start);
      });
    });

    setSequenceTo(0);

    clock = new THREE.Clock();
    renderer.setAnimationLoop(animate);

    window.addEventListener('resize', onWindowResize);
  };

  const animate = () => {
    const delta = clock.getDelta();
    mixers.forEach(mixer => mixer.update(delta));
    renderer.render(scene, camera);
  };

  function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const playSequence = () => {
    let currentTime = Tone.getTransport().seconds;
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        if (anim.start < currentTime && currentTime < anim.end) {
          anim.anim.paused = false;
        }
      });
    });
    Tone.getTransport().start();
  };

  const updatePosition = () => {
    const currentTime = Tone.getTransport().seconds;
    currentPosition = currentTime;
    sliderValue = currentTime;
  };

  const pauseSequence = () => {
    Tone.getTransport().pause();
    updatePosition();

    let currentTime = Tone.getTransport().seconds;
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        if (anim.start < currentTime && currentTime < anim.end) {
          anim.anim.paused = true;
        }
      });
    });
  };

  const pauseAndDisableAll = () => {
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        anim.anim.enabled = false;
        anim.anim.getMixer().setTime(0);
        anim.anim.paused = true;
      });
    });
  };

  // TODO - need to think this method through, this is the crucial method in the presenter
  // I do not currently understand why getMixer().setTime(0) works above but not here
  // but with this arrangement, I do not get the bug when stepping back into an already 
  // completed animation (door suddenly closing in the babylon example when rewinding back to 5s)
  // It's something to do with getMixer().setTime being designed to reset the animation to a time whilst
  // scaling by the timeScale (which gets set to 0 when paused, so scaling gets screwed up if paused)
  // but anim.time setting the local time without any scaling applied
  // Need to set up an isolated test to understand this fully
  const setSequenceTo = (time: number) => {
    Tone.getTransport().seconds = time;
    updatePosition();

    pauseAndDisableAll();

    Object.entries(animationDict).forEach(([_, animationList]) => {
        for (let i = animationList.length - 1; i >= 0; i--) {
        const anim = animationList[i];

        if (i === 0) {
          anim.anim.enabled = true;
          anim.anim.time = 0;
        }

        if (time < anim.start) {
          continue;
        }
        
        if (time >= anim.end) {
          anim.anim.enabled = true;
          anim.anim.time = (anim.end - anim.start);
          break;
        } 
        
        if (time >= anim.start && time < anim.end) {
          anim.anim.enabled = true;
          anim.anim.time = (time - anim.start);
          break;
        }
      }
    });
  };

  const rewindSequence = () => {
    Tone.getTransport().seconds = 0.0;
    updatePosition();
    setSequenceTo(0);
  };

  const handlePlayPauseClick = () => {
    if (!isPlaying) {
      playSequence();
    } else {
      pauseSequence();
    }
    isPlaying = !isPlaying;
  };

  const handleRewindClick = () => {
    rewindSequence();
  };

  const handleSliderInput = (event: Event) => {
    const time = parseFloat((event.target as HTMLInputElement).value);
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      pauseSequence();
    }
    setSequenceTo(time);
    if (wasPlaying) {
      playSequence();
    }
  };

</script>

<style>
    #c {
      width: 100%;
      height: 600px;
    }
  
    #content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
  
    button {
      margin: 10px;
    }
  
    #slider-container {
      margin: 20px;
      width: 80%;
    }
  </style>
  
  <div id="content">
    <div><canvas bind:this={canvas} id="c"></canvas></div>
    <button onclick={handleSetupClick} disabled={isToneSetup}>Initialise Tone</button>
    <div>Play/Pause: <button onclick={handlePlayPauseClick} disabled={!isToneSetup}>{isPlaying ? 'Pause' : 'Play'}</button></div>
    <div><button onclick={handleRewindClick} disabled={!isToneSetup}>Rewind</button></div>
    <div>Position: {currentPosition.toFixed(2)}</div>
    <div id="slider-container">
      <input type="range" min="0" max="16" step="0.01" bind:value={sliderValue} oninput={handleSliderInput} disabled={!isToneSetup}>
    </div>
  </div>