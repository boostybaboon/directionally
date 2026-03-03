<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Model } from './Model';
  import type { AnimationDict } from './model/Action';
  import { PerspectiveCameraAsset } from './model/Camera';
  import { PlaybackEngine } from '../core/scene/PlaybackEngine';
  import { synthesise, isAvailable } from './tts/KokoroSynthesiser';
  import { synthesise as espeakSynthesise } from './tts/EspeakSynthesiser';
  import type { ActorVoice, VoiceFallback } from '../core/domain/types';

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

  // Pre-synthesised Tone.Players, one per SpeechEntry in the current scene.
  // null slots mean synthesis is still in progress for that line.
  let speechPlayers: (Tone.Player | null)[] = [];
  // Tracks which slots permanently failed synthesis — triggers Web Speech fallback.
  let speechFailed: boolean[] = [];
  // Incremented on every loadModel call; async synthesis callbacks compare against
  // this to bail out if the scene changed while they were running.
  let sceneVersion = 0;

  let isToneSetup = $state<boolean>(false);
  let isPlaying = $state<boolean>(false);
  // 'idle'    — no speech entries in the current scene
  // 'loading' — synthesis in progress (any engine)
  // 'espeak'  — eSpeak-NG synthesis succeeded for all lines
  // 'kokoro'  — Kokoro synthesis succeeded for all lines
  // 'browser' — using Web Speech API (selected mode, or fallback)
  let voiceBackend = $state<'idle' | 'loading' | 'espeak' | 'kokoro' | 'browser'>('idle');
  // 'espeak'     — eSpeak-NG WASM formant synthesis (~20 MB first load, then HTTP-cached)
  // 'web-speech' — browser Web Speech API (OS voice, no download)
  // 'kokoro'     — opt-in Kokoro neural synthesis (~92 MB model download)
  type VoiceMode = 'espeak' | 'web-speech' | 'kokoro';
  const VOICE_MODE_KEY = 'directionally_voice_mode';
  let voiceMode = $state<VoiceMode>(
    (localStorage.getItem(VOICE_MODE_KEY) as VoiceMode | null) ?? 'espeak'
  );
  const BUBBLE_SCALE_KEY = 'directionally_bubble_scale';
  let bubbleScale = $state<number>(parseFloat(localStorage.getItem(BUBBLE_SCALE_KEY) ?? '1'));
  $effect(() => { localStorage.setItem(BUBBLE_SCALE_KEY, String(bubbleScale)); });

  // Tracks the most recently loaded model to support re-synthesis when voiceMode changes.
  let currentLoadedModel: Model | null = null;
  let currentPosition = $state<number>(0);
  let sliderValue = $state<number>(0);
  let sceneDuration = $state<number>(0);
  let isSliderDragging = false;
  let wasPlayingBeforeDrag = false;

  // H+ FOV adaptation: preserves horizontal coverage on viewports narrower than 16:9.
  // authoredFov is the camera's authored vFOV, always interpreted relative to the 16:9 reference.
  const DESIGN_ASPECT = 16 / 9;
  let authoredFov = 50;

  $effect(() => {
    localStorage.setItem(VOICE_MODE_KEY, voiceMode);
    if (currentLoadedModel && currentLoadedModel.speechEntries.length > 0) {
      loadModel(currentLoadedModel);
    }
  });

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
      if (e.code !== 'Space' || !isToneSetup) return;
      const t = e.target as HTMLElement | null;
      // Don't intercept Space when the user is typing in any text field.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      handlePlayPauseClick();
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
    currentLoadedModel = model;
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

    // Stop and dispose speech players from any previous scene load.
    speechPlayers.forEach(p => { p?.stop(); p?.dispose(); });
    speechPlayers = [];
    speechFailed = [];
    sceneVersion++;
    const currentVersion = sceneVersion;

    voiceBackend = 'idle';

    if (model.speechEntries.length > 0) {
      speechPlayers = new Array(model.speechEntries.length).fill(null);
      speechFailed = new Array(model.speechEntries.length).fill(false);

      const audioCtx = Tone.getContext().rawContext as AudioContext;

      if (voiceMode === 'espeak' || voiceMode === 'kokoro') {
        // Pre-synthesis path: synthesise all lines via WASM, fill Tone.Players as each
        // completes. If a line isn't ready by play time, Web Speech fires as fallback.
        voiceBackend = 'loading';

        model.speechEntries.forEach((entry, i) => {
          Tone.getTransport().schedule((time) => {
            if (speechPlayers[i]) {
              speechPlayers[i]!.start(time);
            } else {
              // Synthesis still in progress or failed — Web Speech keeps the line audible.
              Tone.getDraw().schedule(() => {
                const utterance = new SpeechSynthesisUtterance(entry.text);
                configureUtterance(utterance, entry.voice);
                utterance.onend = () => removeSpeechBubble(entry.actorId);
                speechSynthesis.speak(utterance);
              }, time);
            }
            Tone.getDraw().schedule(() => createSpeechBubble(entry.actorId, entry.text), time);
          }, entry.startTime);
        });

        (async () => {
          let anyFailed = false;
          // For Kokoro: probe availability first (may reject on unsupported CPUs).
          // Uses an actual synthesis attempt because onnxruntime-web has its own
          // runtime SIMD check independent of WebAssembly.validate().
          if (voiceMode === 'kokoro') {
            const kokoroAvailable = await isAvailable(audioCtx);
            if (sceneVersion !== currentVersion) return;
            if (!kokoroAvailable) {
              voiceBackend = 'browser';
              return;
            }
          }

          try {
            await Promise.all(
              model.speechEntries.map(async (entry, i) => {
                try {
                  const audioBuffer = voiceMode === 'espeak'
                    ? await espeakSynthesise(entry.text, entry.voice?.espeak, audioCtx)
                    : await synthesise(entry.text, entry.voice?.kokoro, audioCtx);
                  if (sceneVersion !== currentVersion) return;
                  const toneBuffer = new Tone.ToneAudioBuffer(audioBuffer);
                  speechPlayers[i] = new Tone.Player(toneBuffer).toDestination();
                  const endTime = entry.startTime + audioBuffer.duration;
                  Tone.getTransport().schedule((time) => {
                    Tone.getDraw().schedule(() => removeSpeechBubble(entry.actorId), time);
                  }, endTime);
                } catch {
                  anyFailed = true;
                  if (sceneVersion === currentVersion) speechFailed[i] = true;
                }
              })
            );
          } finally {
            if (sceneVersion === currentVersion) {
              voiceBackend = anyFailed ? 'browser' : voiceMode;
            }
          }
        })();
      } else {
        // Web Speech mode — schedule utterances directly, no download.
        voiceBackend = 'browser';
        model.speechEntries.forEach((entry) => {
          Tone.getTransport().schedule((time) => {
            Tone.getDraw().schedule(() => {
              const utterance = new SpeechSynthesisUtterance(entry.text);
              configureUtterance(utterance, entry.voice);
              utterance.onend = () => removeSpeechBubble(entry.actorId);
              speechSynthesis.speak(utterance);
              createSpeechBubble(entry.actorId, entry.text);
            }, time);
          }, entry.startTime);
        });
      }
    }

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
    // Stop any currently-playing speech audio so it doesn't bleed across the seek boundary.
    speechPlayers.forEach(p => { if (p?.state === 'started') p.stop(); });
    speechSynthesis.cancel();
    engine.seek(time);
    currentPosition = engine.getPosition();
    sliderValue = currentPosition;
  };

  const rewindSequence = () => {
    if (isPlaying) {
      engine.pause();
    }
    // Stop any in-flight speech audio before rewinding.
    speechPlayers.forEach(p => { if (p?.state === 'started') p.stop(); });
    speechSynthesis.cancel();
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


  // Pitch and rate per fallback gender — audibly distinguishes characters even
  // when the browser only has one installed voice.
  const FALLBACK_PROFILES: Record<VoiceFallback, { pitch: number; rate: number }> = {
    female:  { pitch: 1.15, rate: 1.0  },
    male:    { pitch: 0.75, rate: 0.92 },
    neutral: { pitch: 1.0,  rate: 0.85 },
  };

  // Resolves a fallback gender to a browser SpeechSynthesisVoice if possible.
  // Tries name/URI substring match first; falls back to list position when
  // voice labels don't indicate gender.
  function findWebSpeechVoice(gender: VoiceFallback): SpeechSynthesisVoice | undefined {
    if (gender === 'neutral') return undefined;
    const voices = speechSynthesis.getVoices();
    if (voices.length === 0) return undefined;
    const enVoices = voices.filter(v => v.lang.startsWith('en'));
    const pool = enVoices.length > 0 ? enVoices : voices;
    if (gender === 'female') return pool[0];
    if (gender === 'male')   return pool[1] ?? pool[0];
    return undefined;
  }

  // Applies voice, pitch, and rate from a VoicePersona to a SpeechSynthesisUtterance.
  // pitch/rate differentiate characters audibly even when only one voice is installed.
  function configureUtterance(utterance: SpeechSynthesisUtterance, voice?: ActorVoice): void {
    const gender: VoiceFallback = voice?.persona.gender ?? 'neutral';
    const matched = findWebSpeechVoice(gender);
    if (matched) utterance.voice = matched;
    const profile = FALLBACK_PROFILES[gender];
    utterance.pitch = profile.pitch;
    utterance.rate  = profile.rate;
  }

  // Creates a speech bubble sprite above the named actor and stores it for later removal.
  const activeSpeechBubbles = new Map<string, THREE.Sprite>();

  /** Word-wrap text to canvas units, returning one string per line. */
  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(test).width > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines.length > 0 ? lines : [''];
  }

  function createSpeechBubble(actorId: string, text: string) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;

    const fontSize = 32;
    const font = `600 ${fontSize}px Arial, sans-serif`;
    const padding = 22;
    const lineHeight = fontSize * 1.45;
    const maxContentWidth = 520;
    const cornerRadius = 18;
    const tailH = 22;
    const tailW = 32;

    context.font = font;
    const wrappedLines = wrapText(context, text, maxContentWidth);
    const contentWidth = Math.min(
      maxContentWidth,
      Math.max(...wrappedLines.map(l => context.measureText(l).width)),
    );
    const bubbleW = Math.ceil(contentWidth + padding * 2);
    const bubbleH = Math.ceil(wrappedLines.length * lineHeight + padding * 2);
    const canvasW = bubbleW;
    const canvasH = bubbleH + tailH;

    canvas.width = canvasW;
    canvas.height = canvasH;

    // Re-apply font after canvas resize (resize clears the 2D context state).
    context.font = font;

    // Bubble body: rounded rectangle.
    const r = cornerRadius;
    context.beginPath();
    context.moveTo(r, 0);
    context.lineTo(bubbleW - r, 0);
    context.arcTo(bubbleW, 0,      bubbleW, r,      r);
    context.lineTo(bubbleW, bubbleH - r);
    context.arcTo(bubbleW, bubbleH, bubbleW - r, bubbleH, r);
    context.lineTo(r, bubbleH);
    context.arcTo(0, bubbleH, 0, bubbleH - r, r);
    context.lineTo(0, r);
    context.arcTo(0, 0, r, 0, r);
    context.closePath();
    context.shadowColor = 'rgba(0,0,0,0.25)';
    context.shadowBlur = 8;
    context.shadowOffsetY = 3;
    context.fillStyle = 'rgba(255,255,255,0.97)';
    context.fill();
    context.shadowColor = 'transparent';
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    context.strokeStyle = 'rgba(30,30,30,0.85)';
    context.lineWidth = 3;
    context.stroke();

    // Tail: downward triangle from the bubble's bottom-centre.
    const tailX = canvasW / 2;
    context.beginPath();
    context.moveTo(tailX - tailW / 2, bubbleH);
    context.lineTo(tailX, bubbleH + tailH);
    context.lineTo(tailX + tailW / 2, bubbleH);
    context.closePath();
    context.fillStyle = 'rgba(255,255,255,0.97)';
    context.fill();
    // Outline the two diagonal edges only (top edge is already bordered by the bubble).
    context.beginPath();
    context.moveTo(tailX - tailW / 2, bubbleH);
    context.lineTo(tailX, bubbleH + tailH);
    context.lineTo(tailX + tailW / 2, bubbleH);
    context.strokeStyle = 'rgba(30,30,30,0.85)';
    context.lineWidth = 3;
    context.stroke();

    // Text lines.
    context.fillStyle = '#111';
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    const textStartY = padding + lineHeight / 2;
    for (let i = 0; i < wrappedLines.length; i++) {
      context.fillText(wrappedLines[i], canvasW / 2, textStartY + i * lineHeight);
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;

    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.renderOrder = 999;

    // bubbleScale is captured by closure — uses the value current at bubble-creation time.
    const labelBaseScale = 0.01 * bubbleScale;
    sprite.scale.set(canvas.width * labelBaseScale, canvas.height * labelBaseScale, 1);

    const actor = scene.getObjectByName(actorId);
    if (actor) {
      sprite.position.set(0, 4.5, 0);
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

  #voices-status {
    font-size: 12px;
    white-space: nowrap;
    border-radius: 3px;
    padding: 2px 6px;
  }

  .voices-loading { color: #888; font-style: italic; }
  .voices-kokoro  { color: #4caf7d; background: #1a2e22; }
  .voices-browser { color: #c8a84b; background: #2a2318; cursor: help; }

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

  #bubble-scale-label {
      display: flex;
      align-items: center;
      gap: 4px;
      color: #888;
      font-size: 14px;
      white-space: nowrap;
      cursor: default;
      user-select: none;
    }

  #bubble-scale-input {
      width: 64px;
      accent-color: #4a9eff;
      cursor: pointer;
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
    {#if voiceBackend !== 'idle'}
      <span
        id="voices-status"
        class="voices-{voiceBackend}"
        title={voiceBackend === 'browser' && voiceMode === 'kokoro' ? 'Kokoro unavailable on this CPU/browser. Using browser voices.' : undefined}
      >{voiceBackend === 'loading'
          ? 'Synthesising…'
          : voiceBackend === 'espeak'
          ? '🔊 eSpeak'
          : voiceBackend === 'kokoro'
          ? '🔊 Kokoro'
          : '🔊 Browser voices'}</span>
    {/if}
    <select
      id="voice-mode"
      bind:value={voiceMode}
      title="Voice synthesis mode"
      disabled={!isToneSetup}
    >
      <option value="espeak">eSpeak (fast)</option>
      <option value="web-speech">Browser voices</option>
      <option value="kokoro">Kokoro (~92 MB)</option>
    </select>
    <label id="bubble-scale-label" title="Speech bubble size">
      💬
      <input
        id="bubble-scale-input"
        type="range"
        min="0.5"
        max="2.5"
        step="0.1"
        bind:value={bubbleScale}
      />
    </label>
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