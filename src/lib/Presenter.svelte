<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Model } from './Model';
  import type { AnimationDict } from './model/Action';
  import { PlaybackEngine } from '../core/scene/PlaybackEngine';

  let canvas: HTMLCanvasElement;
  let renderer: THREE.WebGLRenderer;

  let animationDict: AnimationDict = {};

  let modelAnimationClips: { [key: string]: THREE.AnimationClip[] } = {};

  let mixers: THREE.AnimationMixer[] = [];
  let scene: THREE.Scene;
  let clock: THREE.Clock;
  // TODO multiple cameras
  let camera: THREE.Camera;

  // Headless playback core (delegates shuttle/transport control)
  const engine = new PlaybackEngine();

  let isToneSetup = $state<boolean>(false);
  let isPlaying = $state<boolean>(false);
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);
  let positionUpdateInterval: number | null = null;

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

  const setupTone = async () => {
    if (!isToneSetup) {
      await Tone.start();
      Tone.setContext(new Tone.Context({ lookAhead: 0 }));
      Tone.getDraw().anticipation = 0.5;
      isToneSetup = true;
    }
  };

  function updateRendererSize() {
    const container = canvas.parentElement;
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      renderer.setSize(width, height);
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
    }
  }

  function onWindowResize() {
    updateRendererSize();
  }

  //need a method to load a model into the scene, and set up the animations
  export async function loadModel(model: Model) {
    if (!isToneSetup) {
      await setupTone();
    }

    mixers = [];
    animationDict = {};
    Tone.getTransport().cancel();

    scene = new THREE.Scene();
    if (model.backgroundColor !== undefined) {
      scene.background = new THREE.Color(model.backgroundColor);
    }

    // Use the camera directly from the model
    camera = model.camera.threeCamera;
    
    // Set initial aspect ratio based on container dimensions
    updateRendererSize();

    // Add lights to the scene
    model.lights.forEach(light => {
      scene.add(light.threeObject);
    });

    // Load all meshes and add them to the scene
    model.meshes.forEach(mesh => {
      scene.add(mesh.threeMesh);
      
      // Handle parent-child relationships for meshes
      if (mesh.parent) {
        const parentObject = scene.getObjectByName(mesh.parent);
        if (parentObject) {
          scene.remove(mesh.threeMesh); // Remove from scene
          parentObject.add(mesh.threeMesh); // Add to parent
        } else {
          console.warn(`Parent object ${mesh.parent} not found for ${mesh.name}`);
        }
      }
    });

    // Load all GLTF assets and wait for them to be added to the scene
    const gltfPromises = model.gltfs.map(async (gltf) => {
      await gltf.load();

      scene.add(gltf.threeObject);
      modelAnimationClips[gltf.name] = gltf.animations;

      // Handle parent-child relationships
      if (gltf.parent) {
        const parentObject = scene.getObjectByName(gltf.parent);
        if (parentObject) {
          scene.remove(gltf.threeObject); // Remove from scene
          parentObject.add(gltf.threeObject); // Add to parent
        } else {
          console.warn(`Parent object ${gltf.parent} not found for ${gltf.name}`);
        }
      }
    });

    await Promise.all(gltfPromises);

    //for each animation in model, add the animation to the animationDict
    //and add its mixer to the mixers array
    model.actions.forEach((action) => {
      var sceneObject = scene.getObjectByName(action.target);
      if (!sceneObject) {
        //is action.target the name of the camera?
        if (action.target === camera.name) {
          sceneObject = camera;
        } else {
          console.error(`Could not find object with name ${action.target}`);
          return; // from this iteration of the loop
        }
      }
      action.addAction(animationDict, mixers, sceneObject, modelAnimationClips[action.target]);
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

        if (isFinite(anim.end)) {
          Tone.getTransport().schedule((time) => {
            Tone.getDraw().schedule(() => {
              anim.anim.paused = true;
              anim.anim.enabled = false;
            }, time);
          }, anim.end);
        }
      });
    });

    model.speechEntries.forEach((entry) => {
      Tone.getTransport().schedule((time) => {
        Tone.getDraw().schedule(() => {
          const utterance = new SpeechSynthesisUtterance(entry.text);
          const voice = findVoice(entry.voice);
          if (voice) utterance.voice = voice;
          utterance.onend = () => removeSpeechBubble(entry.actorId);
          createSpeechBubble(entry.actorId, entry.text);
          speechSynthesis.speak(utterance);
        }, time);
      }, entry.startTime);
    });

    // Delegate playback to engine with freshly built animations/mixers
    engine.load({ animations: animationDict, mixers });

    setSequenceTo(0);

    clock = new THREE.Clock();
    renderer.setAnimationLoop(animate);

    window.addEventListener('resize', onWindowResize);
  };

  const animate = () => {
    const delta = clock.getDelta();
    // Drive mixers via the playback engine
    engine.update(delta);
    renderer.render(scene, camera);
  };

  const clearPositionUpdateInterval = () => {
    if (positionUpdateInterval !== null) {
      window.clearInterval(positionUpdateInterval);
      positionUpdateInterval = null;
    }
  };

  const playSequence = () => {
    // Delegate enabling and transport start to engine
    engine.play();
    
    // Start updating position every 100ms during playback
    positionUpdateInterval = window.setInterval(() => {
      updatePosition();
    }, 100);
  };

  const updatePosition = () => {
    const currentTime = Tone.getTransport().seconds;
    currentPosition = currentTime;
    sliderValue = currentTime;
  };

  const pauseSequence = () => {
    engine.pause();
    updatePosition();

    // Clear the position update interval
    clearPositionUpdateInterval();

    // Engine maintains enabled/paused states; Presenter just reflects position
  };

  const pauseAndDisableAll = () => {
    // Clear the position update interval if it exists
    clearPositionUpdateInterval();

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
    // Delegate fragile seek to engine to ensure identical shuttle behavior
    engine.seek(time);
    updatePosition();
  };

  const rewindSequence = () => {
    engine.rewind();
    updatePosition();
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

  // Returns the first voice whose name contains the given substring (case-insensitive).
  // Returns undefined if no match — the browser will use its default voice.
  function findVoice(name?: string): SpeechSynthesisVoice | undefined {
    if (!name) return undefined;
    const lower = name.toLowerCase();
    return speechSynthesis.getVoices().find((v) => v.name.toLowerCase().includes(lower));
  }

  // Creates a speech bubble sprite above the named actor and stores it for later removal.
  const activeSpeechBubbles = new Map<string, THREE.Sprite>();

  function createSpeechBubble(actorId: string, text: string) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    const fontSize = 48;
    const borderSize = 2;
    const baseWidth = 300;
    const font = `${fontSize}px Arial`;
    context.font = font;

    const textWidth = context.measureText(text).width;
    const doubleBorderSize = borderSize * 2;
    const width = baseWidth + doubleBorderSize;
    const height = fontSize + doubleBorderSize;
    canvas.width = width;
    canvas.height = height;

    context.font = font;
    context.textBaseline = 'middle';
    context.textAlign = 'center';

    context.fillStyle = 'white';
    context.fillRect(0, 0, width, height);

    const scaleFactor = Math.min(1, baseWidth / textWidth);
    context.translate(width / 2, height / 2);
    context.scale(scaleFactor, 1);
    context.fillStyle = 'black';
    context.fillText(text, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);

    const labelBaseScale = 0.01;
    sprite.scale.set(canvas.width * labelBaseScale, canvas.height * labelBaseScale, 1);

    const actor = scene.getObjectByName(actorId);
    if (actor) {
      sprite.position.set(0, 5, 0);
      actor.add(sprite);
      activeSpeechBubbles.set(actorId, sprite);
    }
  }

  function removeSpeechBubble(actorId: string) {
    const sprite = activeSpeechBubbles.get(actorId);
    if (!sprite) return;
    const actor = scene.getObjectByName(actorId);
    if (actor) actor.remove(sprite);
    activeSpeechBubbles.delete(actorId);
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