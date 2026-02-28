<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Model } from './Model';
  import type { AnimationDict } from './model/Action';
  import { PerspectiveCameraAsset } from './model/Camera';
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

  // Entries with fadeIn/fadeOut: weights are updated per-frame in animate() using
  // Tone transport time instead of Three.js mixer._time (which gets reset by seek()).
  let fadedAnimEntries: Array<{ anim: THREE.AnimationAction; start: number; end: number; fadeIn: number; fadeOut: number }> = [];

  // Headless playback core (delegates shuttle/transport control)
  const engine = new PlaybackEngine();

  let isToneSetup = $state<boolean>(false);
  let isPlaying = $state<boolean>(false);
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);
  let sceneDuration = $state<number>(0);
  let isSliderDragging = false;
  let wasPlayingBeforeDrag = false;

  // H+ FOV adaptation: preserves horizontal coverage on viewports narrower than 16:9.
  // authoredFov is the camera's authored vFOV, always interpreted relative to the 16:9 reference.
  const DESIGN_ASPECT = 16 / 9;
  let authoredFov = 50;

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

    // ResizeObserver fires on any container size change: window resize, Splitpanes
    // divider drag, pane collapse — window 'resize' misses all but the first.
    const container = canvas.parentElement!;
    const resizeObserver = new ResizeObserver(() => updateRendererSize());
    resizeObserver.observe(container);

    updateRendererSize();
    initializeCustomConsoleLog();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && isToneSetup) {
        e.preventDefault();
        handlePlayPauseClick();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      resizeObserver.disconnect();
    };
  });

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toFixed(1).padStart(4, '0')}`;
  }

  const setupTone = async () => {
    if (!isToneSetup) {
      await Tone.start();
      Tone.setContext(new Tone.Context({ lookAhead: 0 }));
      Tone.getDraw().anticipation = 0.5;
      isToneSetup = true;
    }
  };

  function updateRendererSize() {
    if (!canvas || !renderer) return;
    const container = canvas.parentElement;
    if (container) {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width < 1 || height < 1) return;
      renderer.setSize(width, height);
      if (camera instanceof THREE.PerspectiveCamera) {
        const aspect = width / height;
        camera.aspect = aspect;
        // Derive vFOV from a fixed hFOV (the horizontal angle visible at 16:9 with authoredFov).
        // This keeps horizontal content identical at every aspect ratio — narrower viewports
        // show more sky/ground; wider viewports show less. No conditional branch needed.
        camera.fov = 2 * Math.atan(Math.tan((authoredFov * Math.PI) / 360) * DESIGN_ASPECT / aspect) * (180 / Math.PI);
        camera.updateProjectionMatrix();
      }
    }
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

    // Read authoredFov from the asset's stored property, not from the Three.js camera object.
    // The Three.js camera.fov is mutated by updateRendererSize() on every resize, so reading
    // it back on a subsequent load would capture an already-adapted value, not the authored one.
    if (model.camera instanceof PerspectiveCameraAsset) {
      authoredFov = model.camera.fov;
    }

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
    // Shared mixer map: all GLTF clips for the same actor use one mixer so they can be crossfaded
    const actorMixerMap = new Map<string, THREE.AnimationMixer>();
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
      action.addAction(animationDict, mixers, sceneObject, modelAnimationClips[action.target], actorMixerMap);
    });

    Object.values(animationDict).forEach((animGroup) => {
      animGroup.forEach((anim) => {
        // Start: enable, reset time to beginning of clip, set initial weight
        Tone.getTransport().schedule((time) => {
          Tone.getDraw().schedule(() => {
            anim.anim.enabled = true;
            anim.anim.time = 0;
            // Clips with fadeIn start at weight 0; per-frame logic in animate() ramps the weight.
            // Clips without fadeIn start at full weight immediately.
            anim.anim.setEffectiveWeight(anim.fadeIn > 0 ? 0 : 1);
            anim.anim.paused = false;
          }, time);
        }, anim.start);

        // Hard stop at explicit endTime for LoopRepeat segments only.
        // LoopOnce clips self-terminate via clampWhenFinished; disabling them early
        // reverts the object to its base state, causing visible snaps.
        if (isFinite(anim.end) && anim.loop !== THREE.LoopOnce) {
          Tone.getTransport().schedule((time) => {
            Tone.getDraw().schedule(() => {
              anim.anim.paused = true;
              anim.anim.enabled = false;
            }, time);
          }, anim.end);
        }
      });
    });

    // Collect entries that need per-frame weight management (crossfades)
    fadedAnimEntries = Object.values(animationDict)
      .flat()
      .filter((e) => e.fadeIn > 0 || e.fadeOut > 0);

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

    // Halt at the authored end of the scene so Play is available to resume
    const endTime = model.duration;
    if (endTime !== undefined) {
      Tone.getTransport().schedule((time) => {
        Tone.getDraw().schedule(() => {
          engine.pause();
          isPlaying = false;
          currentPosition = endTime;
          sliderValue = endTime;
        }, time);
      }, endTime);
    }

    // Delegate playback to engine with freshly built animations/mixers
    engine.load({ animations: animationDict, mixers, duration: model.duration });
    sceneDuration = model.duration ?? 0;

    setSequenceTo(0);

    clock = new THREE.Clock();
    renderer.setAnimationLoop(animate);
  };

  const animate = () => {
    const delta = clock.getDelta();

    // Update position display at render-loop frequency (replaces 100 ms setInterval poll)
    currentPosition = engine.getPosition();
    if (!isSliderDragging) {
      sliderValue = currentPosition;
    }

    // Per-frame crossfade weight — driven by Tone transport time rather than mixer._time,
    // because mixer._time is reset by seek() and would corrupt Three.js fade interpolants.
    if (Tone.getTransport().state === 'started') {
      const t = Tone.getTransport().seconds;
      fadedAnimEntries.forEach((entry) => {
        if (!entry.anim.enabled) return;
        const elapsed = t - entry.start;
        let weight = 1;
        if (entry.fadeIn > 0 && elapsed < entry.fadeIn) {
          weight = Math.max(0, elapsed / entry.fadeIn);
        } else if (entry.fadeOut > 0 && isFinite(entry.end) && t > entry.end - entry.fadeOut) {
          weight = Math.max(0, (entry.end - t) / entry.fadeOut);
        }
        entry.anim.setEffectiveWeight(weight);
      });
    }

    // Drive mixers via the playback engine
    engine.update(delta);
    renderer.render(scene, camera);
  };

  const playSequence = () => {
    engine.play();
  };

  const pauseSequence = () => {
    engine.pause();
    currentPosition = engine.getPosition();
    sliderValue = currentPosition;
  };

  // Seek uses anim.time directly rather than mixer.setTime() — see PlaybackEngine seek comments.
  const setSequenceTo = (time: number) => {
    engine.seek(time);
    currentPosition = engine.getPosition();
    sliderValue = currentPosition;
  };

  const rewindSequence = () => {
    if (isPlaying) {
      engine.pause();
    }
    engine.rewind();
    isPlaying = false;
    currentPosition = 0;
    sliderValue = 0;
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
    setSequenceTo(time);
  };

  const handleSliderPointerDown = () => {
    wasPlayingBeforeDrag = isPlaying;
    isSliderDragging = true;
    if (isPlaying) {
      engine.pause();
      isPlaying = false;
    }
  };

  const handleSliderPointerUp = () => {
    isSliderDragging = false;
    if (wasPlayingBeforeDrag) {
      playSequence();
      isPlaying = true;
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
    height: 100%;
    width: 100%;
  }

  #render-container {
    flex: 1;
    min-height: 0; /* This is important for flex child to respect parent's height */
    position: relative;
  }

  #transport {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: #1a1a1a;
    border-top: 1px solid #333;
    user-select: none;
  }

  .transport-btn {
    font-size: 16px;
    padding: 4px 10px;
    background: #2a2a2a;
    color: #e0e0e0;
    border: 1px solid #444;
    border-radius: 4px;
    cursor: pointer;
    line-height: 1;
  }

  .transport-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .transport-btn:not(:disabled):hover {
    background: #3a3a3a;
  }

  #timecode {
    font-family: monospace;
    font-size: 13px;
    color: #aaa;
    white-space: nowrap;
    min-width: 12ch;
  }

  #transport-slider {
    flex: 1;
    min-width: 0;
    accent-color: #4a9eff;
  }

  #log-panel {
    display: none;
  }

  @media (max-width: 640px) {
    #transport {
      flex-wrap: wrap;
      gap: 8px;
    }

    .transport-btn {
      min-width: 44px;
      min-height: 44px;
      padding: 8px 14px;
      font-size: 18px;
    }

    #timecode {
      order: 2;
    }

    #transport-slider {
      flex-basis: 100%;
      order: 3;
    }
  }
</style>
  
<div id="content">
  <div id="render-container">
    <canvas bind:this={canvas} id="c"></canvas>
  </div>
  <div id="transport">
    <button class="transport-btn" onclick={handleRewindClick} disabled={!isToneSetup} title="Rewind to start">⏮</button>
    <button class="transport-btn" onclick={handlePlayPauseClick} disabled={!isToneSetup} title={isPlaying ? 'Pause' : 'Play'}>
      {isPlaying ? '⏸' : '▶'}
    </button>
    <span id="timecode">{formatTime(currentPosition)} / {formatTime(sceneDuration || 16)}</span>
    <input
      id="transport-slider"
      type="range"
      min="0"
      max={sceneDuration || 16}
      step="0.01"
      bind:value={sliderValue}
      oninput={handleSliderInput}
      onpointerdown={handleSliderPointerDown}
      onpointerup={handleSliderPointerUp}
      disabled={!isToneSetup}
    />
  </div>
  <div id="log-panel"></div>
</div>