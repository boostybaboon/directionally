<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import { Model } from './model/index';
  import type { Asset } from './model/types';
  import type { Action, AnimationDict } from './model/animation/types';
  import { SceneUtils } from './SceneUtils';

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;

  let animationDict: AnimationDict = {};

  let modelAnimationClips: { [key: string]: THREE.AnimationClip[] } = {};

  let mixers: THREE.AnimationMixer[] = [];
  let scene: THREE.Scene;
  let clock: THREE.Clock;
  // TODO multiple cameras
  let camera: THREE.Camera;

  let isToneSetup = $state<boolean>(false);
  let isPlaying = $state<boolean>(false);
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);

  type AnimationEntry = {
    anim: THREE.AnimationAction;
    start: number;
    end: number;
    loop: THREE.AnimationActionLoopStyles;
    repetitions: number;
  };

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

  //need a method to load a model into the scene, and set up the animations
  export async function loadModel(model: Model) {
    if (!isToneSetup) {
      await setupTone();
    }

    mixers = [];
    animationDict = {};
    Tone.getTransport().cancel();

    scene = new THREE.Scene();

    camera = SceneUtils.createCamera(model.camera, window.innerWidth / window.innerHeight);

    const assetPromises = model.assets.map(async (asset: Asset) => {
      const sceneObject = await SceneUtils.sceneObjectForAsset(asset);
      scene.add(sceneObject[0]);
      modelAnimationClips[asset.name] = sceneObject[1];
    });

    await Promise.all(assetPromises);

    model.actions.forEach((action: Action) => {
      var sceneObject = scene.getObjectByName(action.target);
      if (!sceneObject) {
        if (action.target === camera.name) {
          sceneObject = camera;
        } else {
          console.error(`Could not find object with name ${action.target}`);
          return;
        }
      }
      SceneUtils.addAction(animationDict, mixers, sceneObject, action, modelAnimationClips[action.target]);
    });

    Object.values(animationDict).forEach((animGroup: AnimationDict[string]) => {
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
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const playSequence = () => {
    let currentTime = Tone.getTransport().seconds;
    console.log('Animation state:', {
      currentTime,
      animationCount: Object.keys(animationDict).length,
      mixers: mixers.length,
      isPlaying: isPlaying
    });
    Object.entries(animationDict).forEach(([target, animationList]: [string, AnimationEntry[]]) => {
      console.log(`Animations for ${target}:`, animationList.map(anim => ({
        name: anim.anim.getClip().name,
        start: anim.start,
        end: anim.end,
        loop: anim.loop,
        paused: anim.anim.paused,
        enabled: anim.anim.enabled,
        time: anim.anim.time
      })));
    });
    Object.values(animationDict).forEach((animationList: AnimationEntry[]) => {
      animationList.forEach((anim: AnimationEntry) => {
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

  #log-panel {
    width: 100%;
    height: 200px;
    overflow-y: scroll;
    border: 1px solid #ccc;
    background-color: #f9f9f9;
    padding: 10px;
  }
</style>
  
<div id="content">
  <div><canvas bind:this={canvas} id="c"></canvas></div>
  <div>Play/Pause: <button onclick={handlePlayPauseClick} disabled={!isToneSetup}>{isPlaying ? 'Pause' : 'Play'}</button></div>
  <div><button onclick={handleRewindClick} disabled={!isToneSetup}>Rewind</button></div>
  <div>Position: {currentPosition.toFixed(2)}</div>
  <div id="slider-container">
    <input type="range" min="0" max="16" step="0.01" bind:value={sliderValue} oninput={handleSliderInput} disabled={!isToneSetup}>
  </div>
  <div><button onclick={speak}>Speak</button></div>
  <div id="log-panel"></div>
</div>