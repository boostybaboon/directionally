<script lang="ts">
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Model } from './Model';
  import { ScenePlayer } from '../core';

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;
  let clock: THREE.Clock;
  let animationLoopFn: ((deltaTime: number) => void) | null = null;
  let scenePlayer: ScenePlayer | null = null;

  let isPlaying = $state<boolean>(false);
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);
  let positionUpdateInterval: number | null = null;
  let isToneSetup = $state<boolean>(false);

  // Function to initialize the custom console.log
  function initializeCustomConsoleLog() {
    const logPanel = document.getElementById('log-panel');

    if (logPanel) {
      const originalConsoleLog = console.log;

      console.log = function (...args) {
        // Call the original console.log function
        originalConsoleLog.apply(console, args);

        // Append the log message to the log panel
        const message = args.map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : arg)).join(' ');
        const logEntry = document.createElement('div');
        logEntry.textContent = message;
        logPanel.appendChild(logEntry);

        // Scroll to the bottom of the log panel
        logPanel.scrollTop = logPanel.scrollHeight;
      };
    }
  }
  
  
  onMount(() => {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    updateRendererSize();
    initializeCustomConsoleLog();
  });

  function updateRendererSize() {
    const container = canvas.parentElement;
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      if (scenePlayer && scenePlayer.camera instanceof THREE.PerspectiveCamera) {
        scenePlayer.camera.aspect = width / height;
        scenePlayer.camera.updateProjectionMatrix();
      }
    }
  }

  function onWindowResize() {
    updateRendererSize();
  }

  //need a method to load a model into the scene, and set up the animations
  export async function loadModel(model: Model) {
    scenePlayer = new ScenePlayer();
    const { scene, camera, getAnimationLoop } = await scenePlayer.loadModel(model);
    animationLoopFn = getAnimationLoop();
    isToneSetup = true;
    
    // Set initial aspect ratio based on container dimensions
    updateRendererSize();

    setSequenceTo(0);

    clock = new THREE.Clock();
    renderer.setAnimationLoop(() => {
      const delta = clock.getDelta();
      if (animationLoopFn) {
        animationLoopFn(delta);
      }
      renderer.render(scene, camera);
    });

    window.addEventListener('resize', onWindowResize);
  };;

  const clearPositionUpdateInterval = () => {
    if (positionUpdateInterval !== null) {
      window.clearInterval(positionUpdateInterval);
      positionUpdateInterval = null;
    }
  };

  const playSequence = () => {
    if (scenePlayer) {
      scenePlayer.play();
      
      // Start updating position every 100ms during playback
      positionUpdateInterval = window.setInterval(() => {
        updatePosition();
      }, 100);
    }
  };

  const updatePosition = () => {
    if (scenePlayer) {
      currentPosition = scenePlayer.currentTime();
      sliderValue = currentPosition;
    }
  };

  const pauseSequence = () => {
    if (scenePlayer) {
      scenePlayer.pause();
      updatePosition();
      clearPositionUpdateInterval();
    }
  };

  const setSequenceTo = (time: number) => {
    if (scenePlayer) {
      scenePlayer.seek(time);
      updatePosition();
    }
  };

  const rewindSequence = () => {
    if (scenePlayer) {
      scenePlayer.stop();
      updatePosition();
      clearPositionUpdateInterval();
    }
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

  // Function to create a speech bubble using SpriteMaterial
  function createSpeechBubble(text: string) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    const fontSize = 48; // Increase the font size
    const borderSize = 2;
    const baseWidth = 300; // Base width for the text
    const font = `${fontSize}px Arial`;
    context.font = font;

    // Measure the text width
    const textWidth = context.measureText(text).width;
    const doubleBorderSize = borderSize * 2;
    const width = baseWidth + doubleBorderSize;
    const height = fontSize + doubleBorderSize;
    canvas.width = width;
    canvas.height = height;

    // Set font again after resizing canvas
    context.font = font;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    // Draw background
    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    // Draw text
    const scaleFactor = Math.min(1, baseWidth / textWidth);
    context.translate(width / 2, height / 2);
    context.scale(scaleFactor, 1);
    context.fillStyle = 'black';
    context.fillText(text, 0, 0);

    // Create texture and sprite material
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);

    // Scale the sprite
    const labelBaseScale = 0.01;
    sprite.scale.set(canvas.width * labelBaseScale, canvas.height * labelBaseScale, 1);

    // Attach the sprite to the robot
    const robot = scenePlayer?.scene?.getObjectByName('robot1');
    if (robot) {
      sprite.position.set(0, 5, 0); // Adjust the position as needed
      robot.add(sprite);
    }

    // Remove the speech bubble after 3 seconds
    setTimeout(() => {
      if (robot) {
        robot.remove(sprite);
      }
    }, 3000);
  }

  // Example of speech synthesis api
  function speak() {
    const voices = speechSynthesis.getVoices();
    console.log(voices);
    const utterance = new SpeechSynthesisUtterance('Hello, I am a robot!');
    speechSynthesis.speak(utterance);

    createSpeechBubble('Hello, I am a robot!');
  }

</script>

<style>
  #c {
    width: 100%;
    height: 100%;
  }

  #content {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100%;
  }

  #render-container {
    flex: 1;
    min-height: 0; /* This is important for flex child to respect parent's height */
    position: relative;
  }

  #controls-top {
    padding: 10px;
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }

  #controls-bottom {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  button {
    padding: 5px 10px;
  }

  #slider-container {
    width: 100%;
  }

  #log-panel {
    height: 200px;
    overflow-y: scroll;
    border: 1px solid #ccc;
    background-color: #f9f9f9;
    padding: 10px;
  }
</style>
  
<div id="content">
  <div id="controls-top">
    <button onclick={handlePlayPauseClick} disabled={!isToneSetup}>{isPlaying ? 'Pause' : 'Play'}</button>
    <button onclick={handleRewindClick} disabled={!isToneSetup}>Rewind</button>
    <button onclick={speak}>Speak</button>
  </div>
  <div id="render-container">
    <canvas bind:this={canvas} id="c"></canvas>
  </div>
  <div id="controls-bottom">
    <div>Position: {currentPosition.toFixed(2)}</div>
    <div id="slider-container">
      <input type="range" min="0" max="16" step="0.01" bind:value={sliderValue} oninput={handleSliderInput} disabled={!isToneSetup}>
    </div>
    <div id="log-panel"></div>
  </div>
</div>