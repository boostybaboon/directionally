<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Object3DAsset } from './scene/Object3D/Object3DAsset';
  import type { PerspectiveCamera } from 'three';

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;

  let animationDict: { [key: string]: any[] } = {};
  let mixers: THREE.AnimationMixer[] = [];
  let scene: THREE.Scene;
  let clock: THREE.Clock;
  let camera: PerspectiveCamera | null = null;

  let isToneSetup = $state<boolean>(false);
  let isPlaying = $state<boolean>(false);
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);

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
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    initializeCustomConsoleLog();
  });

  const setupTone = async () => {
    if (!isToneSetup) {
      await Tone.start();
      Tone.setContext(new Tone.Context({ lookAhead: 0 }));
      Tone.getDraw().anticipation = 0.5;
      isToneSetup = true;
    }
  };

  // New loadModel function that works with our asset system
  export async function loadModel(newCamera: PerspectiveCamera, assets: Object3DAsset[], actions: any[] = []) {
    if (!isToneSetup) {
      await setupTone();
    }

    mixers = [];
    animationDict = {};
    Tone.getTransport().cancel();

    scene = new THREE.Scene();
    camera = newCamera;

    // Add all assets to the scene
    assets.forEach(asset => {
      const object3D = asset.getObject3D();
      scene.add(object3D);
    });

    // TODO: Handle animations when we implement them
    // For now, we just have an empty actions array

    setSequenceTo(0);

    clock = new THREE.Clock();
    renderer.setAnimationLoop(animate);

    window.addEventListener('resize', onWindowResize);
  };

  const animate = () => {
    if (!camera) return; // Guard against uninitialized camera
    const delta = clock.getDelta();
    mixers.forEach(mixer => mixer.update(delta));
    renderer.render(scene, camera);
  };

  function onWindowResize() {
    if (!camera) return; // Guard against uninitialized camera
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const playSequence = () => {
    let currentTime = Tone.getTransport().seconds;
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
      if (anim.start < currentTime && (currentTime < anim.end || anim.loop === THREE.LoopRepeat)) {
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
        anim.anim.paused = true;
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
          if (anim.loop === THREE.LoopOnce) {
            anim.anim.time = (anim.end - anim.start);
          } else if (anim.loop === THREE.LoopRepeat) {
            anim.anim.time = (time - anim.start) % (anim.end - anim.start);
          }
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
    const robot = scene.getObjectByName('robot1');
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
  .controls {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    padding: 1rem;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }

  canvas {
    width: 100%;
    height: 100%;
  }

  #log-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 200px;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    overflow-y: auto;
    padding: 1rem;
    font-family: monospace;
  }
</style>

<div class="controls">
  <button on:click={handlePlayPauseClick}>{isPlaying ? 'Pause' : 'Play'}</button>
  <button on:click={handleRewindClick}>Rewind</button>
  <input 
    type="range" 
    min="0" 
    max="10" 
    step="0.1" 
    bind:value={sliderValue} 
    on:input={handleSliderInput}
  />
  <span>Time: {currentPosition.toFixed(1)}s</span>
</div>

<canvas bind:this={canvas} />

<div id="log-panel"></div>