<script lang="ts">
  import * as Tone from 'tone';
  import * as THREE from 'three';
  import { onMount } from 'svelte';
  import type { Model } from './Model';
  import type { AnimationDict } from './model/Action';
  import { PlaybackEngine } from '../core/scene/PlaybackEngine';
  import { buildSceneGraph } from './scene/buildSceneGraph.js';
  import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
  import { TransformControls } from 'three/addons/controls/TransformControls.js';
  import { synthesise, isAvailable } from './tts/KokoroSynthesiser';
  import { synthesise as espeakSynthesise } from './tts/EspeakSynthesiser';
  import type { ActorVoice, VoiceFallback } from '../core/domain/types';
  import type { VoiceMode, VoiceBackend } from './types.js';
  import { estimateDuration } from '../core/storage/sceneBuilder.js';

  let canvas: HTMLCanvasElement;
  // Overlay div covering the editor (right) viewport — used as domElement for
  // TransformControls so its NDC math is relative to the editor half only.
  let editorOverlay: HTMLElement;
  let renderer: THREE.WebGLRenderer;

  let animationDict: AnimationDict = {};

  let mixers: THREE.AnimationMixer[] = [];
  let scene: THREE.Scene;
  let clock: THREE.Clock;
  let camera: THREE.Camera;
  // Editor camera for the design view — free-orbit, independent of the model's authored camera.
  let editorCamera: THREE.PerspectiveCamera;
  // OrbitControls attached to the editor camera; active only in design mode.
  let orbitControls: OrbitControls;
  // TransformControls for moving/rotating selected objects; lives on layer 1.
  let transformControls: TransformControls;
  // The Object3D helper returned by TransformControls.getHelper() — this is what
  // gets added to the scene and must have its layer set (TC itself is not an Object3D).
  let tcHelper: THREE.Object3D;
  // Frustum helper visualising the playback camera in the design view (layer 1).
  let cameraHelper: THREE.CameraHelper | null = null;
  // Bounding-box highlight for the selected scene object in the design view (layer 1).
  let selectionBox: THREE.BoxHelper | null = null;
  // True while TransformControls is actively dragging — used to skip click-as-selection.
  let tcDragging = false;
  // Shift key held — enables fine-mode: orbit at 1/10 speed, TC gizmo moves at 1/10 delta.
  let shiftHeld = false;
  // Current gizmo mode — reactive so the mode-button toolbar re-renders.
  let tcMode = $state<'translate' | 'rotate'>('translate');
  // Incremented after each loadModel completes — triggers the selection effect to
  // re-attach TC and selection box to the freshly built scene graph.
  let sceneLoadCount = $state(0);

  // Reactively apply TC gizmo + selection box whenever the selected object or the
  // scene graph changes (model reloaded after a command).
  $effect(() => {
    void selectedObjectId;
    void sceneLoadCount;
    if (scene) applySelectionVisuals(selectedObjectId ?? null);
  });

  // When rotationEnabled is withdrawn mid-drag, snap back to translate.
  $effect(() => {
    if (!rotationEnabled && tcMode === 'rotate') setGizmoMode('translate');
  });

  function setGizmoMode(mode: 'translate' | 'rotate') {
    tcMode = mode;
    transformControls?.setMode(mode);
  }
  // Overlay pointer position sampled on pointerdown, used for drag vs click detection.
  let overlayPointerDownPos = { x: 0, y: 0 };

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

  interface PresenterProps {
    /** When true: split-screen design/playback view. When false: full-canvas playback. */
    designMode?: boolean;
    /** Name of the currently selected scene object (actor ID or set-piece name). Drives TC gizmo and selection highlight. */
    selectedObjectId?: string | null;
    /** Fired when the user clicks an object (or misses) in the design viewport. Caller updates selection state. */
    onviewportselect?: (id: string | null) => void;
    /** Fired when TransformControls drag ends; carries the object's new position and rotation. */
    ontransformend?: (id: string, position: [number, number, number], rotation: [number, number, number]) => void;
    /** Fired when a catalogue item from the left panel is dropped onto the design viewport. */
    oncataloguedrop?: (kind: 'character' | 'setpiece', id: string, position: [number, number, number]) => void;
    /** Fired after a model finishes loading; maps each GLTF object name (actor ID) to its discovered clip names. */
    ondiscoverclips?: (clips: Record<string, string[]>) => void;
    /** Contextual hint shown in the design HUD to communicate what the next interaction will do. */
    dragHint?: string;
    /** Macro-mode label shown bottom-left in the design HUD (e.g. "Scene Start", "Block End"). */
    hudMode?: string;
    /**
     * When false, the rotate gizmo button is hidden and the mode is forced to translate.
     * Use this when the selected object's rotation has no authored effect (e.g. actor blocks:
     * endFacing is derived from direction-of-travel, not from a rotation drag).
     */
    rotationEnabled?: boolean;
    /**
     * Optional guard called before committing a viewport click as a selection.
     * Return false to silently ignore the click (e.g. actors at t>0 with no block selected).
     * Set pieces should always return true. Defaults to always-allow.
     */
    objectSelectable?: (id: string) => boolean;
    voiceMode?: VoiceMode;
    bubbleScale?: number;
    isPlaying?: boolean;
    isToneSetup?: boolean;
    currentPosition?: number;
    sceneDuration?: number;
    voiceBackend?: VoiceBackend;
    sliderValue?: number;
    isSliderDragging?: boolean;
    /** Called when the scene reaches its authored end time. Caller is responsible for transitioning; Presenter will NOT auto-pause when this is provided. */
    onsceneend?: () => void;
    /** Called after every loadModel completes (async GLTFs resolved, engine loaded, seek applied). */
    ondidload?: () => void;
  }

  let {
    designMode = $bindable(false),
    selectedObjectId,
    onviewportselect,
    ontransformend,
    oncataloguedrop,
    ondiscoverclips,
    voiceMode = $bindable('espeak' as VoiceMode),
    bubbleScale = $bindable(1),
    isPlaying = $bindable(false),
    isToneSetup = $bindable(false),
    currentPosition = $bindable(0),
    sceneDuration = $bindable(0),
    voiceBackend = $bindable('idle' as VoiceBackend),
    sliderValue = $bindable(0),
    isSliderDragging = $bindable(false),
    dragHint = '',
    hudMode = '',
    rotationEnabled = true,
    objectSelectable,
    onsceneend,
    ondidload,
  }: PresenterProps = $props();

  // Tracks the most recently loaded model to support re-synthesis when voiceMode changes.
  let currentLoadedModel: Model | null = null;
  let wasPlayingBeforeDrag = false;

  // H+ FOV adaptation: preserves horizontal coverage on viewports narrower than 16:9.
  // authoredFov is the camera's authored vFOV, always interpreted relative to the 16:9 reference.
  const DESIGN_ASPECT = 16 / 9;
  let authoredFov = 50;

  $effect(() => {
    void voiceMode; // track voiceMode changes — re-synthesise speech when mode switches
    if (currentLoadedModel && currentLoadedModel.speechEntries.length > 0) {
      loadModel(currentLoadedModel);
    }
  });

  $effect(() => {
    void designMode; // react when design/playback mode is toggled
    if (!renderer) return;
    updateRendererSize();
    if (orbitControls) orbitControls.enabled = designMode;
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

    // Editor camera for the design viewport — free orbit, not tied to any model.
    editorCamera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);
    editorCamera.position.set(0, 12, 20);
    editorCamera.lookAt(0, 0, 0);
    editorCamera.layers.enable(1); // sees scene content (layer 0) + design overlays (layer 1)

    // TransformControls is created BEFORE OrbitControls so its event listeners are
    // registered first. This gives TC priority in the pointerdown chain: when the user
    // clicks a gizmo handle, TC fires 'dragging-changed' (disabling orbit) before
    // OrbitControls has a chance to claim the drag. Both share the overlay domElement —
    // using different elements would reintroduce the drag-capture race.
    transformControls = new TransformControls(editorCamera, editorOverlay);
    // getHelper() returns the visual Object3D gizmo; TC itself is a Controls/EventDispatcher.
    tcHelper = transformControls.getHelper();
    // Do NOT move tcHelper to layer 1 — TC's internal hover raycaster defaults to layer 0
    // only, so shifting picker meshes to layer 1 would blind its own hit-detection.
    // Instead, visibility is toggled each frame based on designMode (see animate()).
    tcHelper.visible = false; // hidden until design mode is entered
    transformControls.addEventListener('dragging-changed', (event) => {
      if (event.value) {
        // Drag started — disable orbit so it doesn't fight the gizmo.
        tcDragging = true;
        orbitControls.enabled = false;
      } else {
        // Drag ended — re-enable orbit and emit the new transform.
        tcDragging = false;
        orbitControls.enabled = designMode;
        if (selectedObjectId && transformControls.object) {
          const obj = transformControls.object;
          ontransformend?.(
            selectedObjectId,
            [obj.position.x, obj.position.y, obj.position.z],
            [obj.rotation.x, obj.rotation.y, obj.rotation.z],
          );
        }
      }
    });

    // Shift fine-mode: scale TC's computed delta to 10% each frame.
    // TC recomputes from its own _positionStart/_quaternionStart every pointer-move, so
    // we read those directly (as any) and scale back toward them — no separate snapshot needed.
    transformControls.addEventListener('objectChange', () => {
      if (!shiftHeld || !tcDragging || !transformControls.object) return;
      const tc = transformControls as any;
      const obj = transformControls.object;
      const FINE = 0.1;
      if (tc._positionStart) {
        const ps = tc._positionStart as THREE.Vector3;
        // obj.position = ps + fullDelta  →  scale to ps + fullDelta * FINE
        obj.position.sub(ps).multiplyScalar(FINE).add(ps);
      }
      if (tc._quaternionStart) {
        const qs = tc._quaternionStart as THREE.Quaternion;
        // obj.quaternion = full rotation from qs  →  slerp to FINE fraction
        obj.quaternion.slerpQuaternions(qs, obj.quaternion, FINE);
      }
    });

    orbitControls = new OrbitControls(editorCamera, editorOverlay);
    orbitControls.enabled = false; // only active in design mode
    orbitControls.target.set(0, 1, 0); // orbit around roughly actor-eye-height
    // Record pointer-down position on the overlay for drag vs click discrimination.
    editorOverlay.addEventListener('pointerdown', (e) => {
      overlayPointerDownPos = { x: e.clientX, y: e.clientY };
      // Do NOT reset tcDragging here — TC's pointerdown handler fires first and sets
      // tcDragging = true via dragging-changed; overwriting it here would kill fine-mode.
    });

    // ResizeObserver fires on any container size change: window resize, Splitpanes
    // divider drag, pane collapse — window 'resize' misses all but the first.
    const container = canvas.parentElement!;
    const resizeObserver = new ResizeObserver(() => updateRendererSize());
    resizeObserver.observe(container);

    updateRendererSize();
    initializeCustomConsoleLog();
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.code === 'Space' && isToneSetup && !isTyping) {
        e.preventDefault();
        handlePlayPauseClick();
        return;
      }
      if (e.key === 'Shift' && designMode && !shiftHeld) {
        shiftHeld = true;
        orbitControls.rotateSpeed = 0.1;
        orbitControls.panSpeed = 0.1;
        orbitControls.zoomSpeed = 0.1;
      }
      if (!designMode || isTyping) return;
      if (e.key === 'Escape') { onviewportselect?.(null); return; }
      if (e.key === 'g' || e.key === 'G') setGizmoMode('translate');
      if (e.key === 'r' || e.key === 'R') setGizmoMode('rotate');
      if (e.key === 'p' || e.key === 'P') snapDesignCameraToPlayback();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        shiftHeld = false;
        orbitControls.rotateSpeed = 1;
        orbitControls.panSpeed = 1;
        orbitControls.zoomSpeed = 1;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      resizeObserver.disconnect();
      orbitControls.dispose();
      transformControls.dispose();
    };
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
    if (!canvas || !renderer) return;
    const container = canvas.parentElement;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (width < 1 || height < 1) return;
    renderer.setSize(width, height);
    // Keep the editor overlay covering exactly the right half in pixel terms.
    const half = Math.floor(width / 2);
    if (editorOverlay) {
      editorOverlay.style.width = `${width - half}px`;
    }
    if (designMode) {
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = half / height;
        camera.fov = 2 * Math.atan(Math.tan((authoredFov * Math.PI) / 360) * DESIGN_ASPECT / (half / height)) * (180 / Math.PI);
        camera.updateProjectionMatrix();
      }
      if (editorCamera) {
        editorCamera.aspect = (width - half) / height;
        editorCamera.fov = 2 * Math.atan(Math.tan((authoredFov * Math.PI) / 360) * DESIGN_ASPECT / ((width - half) / height)) * (180 / Math.PI);
        editorCamera.updateProjectionMatrix();
      }
    } else {
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
  export async function loadModel(model: Model, seekTo?: number) {
    currentLoadedModel = model;
    if (!isToneSetup) {
      await setupTone();
    }

    // Clear existing selection overlays before rebuilding the scene graph.
    if (selectionBox) {
      scene?.remove(selectionBox);
      selectionBox.dispose();
      selectionBox = null;
    }
    transformControls?.detach();

    Tone.getTransport().cancel();

    const graphResult = await buildSceneGraph(model);
    ({ scene, camera, authoredFov, animationDict, mixers } = graphResult);
    ondiscoverclips?.(graphResult.discoveredClips);
    updateRendererSize();

    // Playback camera frustum — visible to the editor camera (layer 1) only.
    cameraHelper = new THREE.CameraHelper(camera);
    cameraHelper.layers.set(1);
    scene.add(cameraHelper);

    // Re-add the TC helper to the new scene.
    if (tcHelper) {
      scene.add(tcHelper);
    }

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

    // Halt at the authored end of the scene; if onsceneend is wired (presentation mode),
    // delegate to the caller instead of pausing so it can load the next scene.
    const endTime = model.duration;
    if (endTime !== undefined) {
      Tone.getTransport().schedule((time) => {
        Tone.getDraw().schedule(() => {
          if (onsceneend) {
            onsceneend();
          } else {
            engine.pause();
            isPlaying = false;
            currentPosition = endTime;
            sliderValue = endTime;
          }
        }, time);
      }, endTime);
    }

    // Delegate playback to engine with freshly built animations/mixers
    engine.load({ animations: animationDict, mixers, duration: model.duration });
    sceneDuration = model.duration ?? 0;

    // A fresh scene load (seekTo provided) resets the engine's own isPlaying flag.
    // Mirror that here so ondidload callers (e.g. presentation mode auto-play) can
    // reliably call presenter.play() regardless of whether a previous scene was playing.
    // Without this, presenter.play() is a no-op when transitioning between scenes while
    // isPlaying=true, leaving the engine paused on the new scene.
    if (seekTo !== undefined) isPlaying = false;

    // Preserve playhead when reloading due to a command (seekTo omitted);
    // reset to 0 only for fresh production/example loads (seekTo === 0).
    setSequenceTo(seekTo ?? engine.getPosition());

    clock = new THREE.Clock();
    renderer.setAnimationLoop(animate);

    // Re-apply selection visuals to the freshly built scene graph.
    sceneLoadCount++;

    ondidload?.();
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

    if (designMode) {
      // Keep the frustum helper in sync with the playback camera's current transform.
      cameraHelper?.update();
      // Keep the selection bounding box tight around any animated object.
      selectionBox?.update();
      // Advance damped orbital movement.
      orbitControls?.update();
      const w = renderer.domElement.width;
      const h = renderer.domElement.height;
      const half = Math.floor(w / 2);

      renderer.setScissorTest(true);

      // Left viewport — playback camera, scene content only.
      // Hide the gizmo here: it lives on layer 0 so the playback camera would see it.
      if (tcHelper) tcHelper.visible = false;
      renderer.setViewport(0, 0, half, h);
      renderer.setScissor(0, 0, half, h);
      renderer.render(scene, camera);

      // Right viewport — editor camera, scene + design overlays.
      // Show gizmo only when an object is attached (not when deselected).
      if (tcHelper) tcHelper.visible = selectedObjectId != null;
      renderer.setViewport(half, 0, w - half, h);
      renderer.setScissor(half, 0, w - half, h);
      renderer.render(scene, editorCamera);

      renderer.setScissorTest(false);
      // Restore full-canvas viewport so the next mode switch starts clean.
      renderer.setViewport(0, 0, w, h);
    } else {
      // Hide gizmo in playback-only mode.
      if (tcHelper) tcHelper.visible = false;
      renderer.render(scene, camera);
    }
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
    // Reconcile speech bubbles: clear all, then recreate any whose window covers the new time.
    activeSpeechBubbles.forEach((sprite, actorId) => removeSpeechBubble(actorId));
    currentLoadedModel?.speechEntries.forEach((entry) => {
      if (time >= entry.startTime && time < entry.startTime + estimateDuration(entry.text)) {
        createSpeechBubble(entry.actorId, entry.text);
      }
    });
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

  /**
   * Apply TC gizmo + selection-box highlight to the given scene object.
   * Called reactively via a $effect whenever selectedObjectId or sceneLoadCount changes.
   */
  function applySelectionVisuals(name: string | null) {
    if (selectionBox) {
      scene?.remove(selectionBox);
      selectionBox.dispose();
      selectionBox = null;
    }
    if (name && scene) {
      const obj = scene.getObjectByName(name);
      if (obj) {
        selectionBox = new THREE.BoxHelper(obj, 0x4a9eff);
        selectionBox.layers.set(1); // design-only overlay
        scene.add(selectionBox);
        transformControls?.attach(obj);
      } else {
        transformControls?.detach();
      }
    } else {
      transformControls?.detach();
    }
  }

  /**
   * Click handler for the editor overlay in design mode.
   * Raycasts from the editor camera using the overlay's own bounds (correct NDC for
   * the right-half viewport) to find and select or deselect a scene object.
   */
  /**
   * Drop handler for catalogue items dragged from the left panel.
   * Raycasts against the y=0 ground plane to find the world-space drop position.
   */
  function handleCatalogueDrop(e: DragEvent) {
    if (!designMode || !editorCamera) return;
    e.preventDefault();
    const raw = e.dataTransfer?.getData('application/directionally-catalogue');
    if (!raw) return;
    let payload: { kind: 'character' | 'setpiece'; id: string };
    try { payload = JSON.parse(raw); } catch { return; }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), editorCamera);
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const intersected = raycaster.ray.intersectPlane(groundPlane, hit);
    const position: [number, number, number] = intersected ? [hit.x, 0, hit.z] : [0, 0, 0];
    oncataloguedrop?.(payload.kind, payload.id, position);
  }

  function handleOverlayPointerUp(e: PointerEvent) {
    if (!designMode || !scene || !editorCamera) return;
    if (e.button !== 0) return; // only left-button clicks
    // Skip if the pointer moved enough to be a drag (gizmo drag or orbit).
    const dx = e.clientX - overlayPointerDownPos.x;
    const dy = e.clientY - overlayPointerDownPos.y;
    if (Math.sqrt(dx * dx + dy * dy) > 4) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    const raycaster = new THREE.Raycaster();
    raycaster.layers.set(0); // only intersect scene content — skip layer 1 design overlays
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), editorCamera);
    // Exclude the TC gizmo helper: its layer-0 meshes would otherwise be hit first,
    // producing a bogus scene-root object with no name and preventing proper selection.
    const allHits = raycaster.intersectObjects(scene.children, true);
    const hits = tcHelper
      ? allHits.filter((h) => !tcHelper.getObjectById(h.object.id))
      : allHits;
    if (hits.length === 0) {
      onviewportselect?.(null);
      return;
    }
    // Walk up to the immediate child of the scene to get the root object name.
    let obj: THREE.Object3D | null = hits[0].object;
    while (obj && obj.parent !== scene) {
      obj = obj.parent;
    }
    if (obj && obj.name) {
      if (!(objectSelectable?.(obj.name) ?? true)) return;
      // Toggle: clicking the already-selected object deselects it.
      onviewportselect?.(obj.name === selectedObjectId ? null : obj.name);
    }
  }

  /** Unconditionally starts playback. Used by presentation mode after scene loads. */
  export function play() {
    if (!isPlaying) {
      playSequence();
      isPlaying = true;
    }
  }

  export const handlePlayPauseClick = () => {
    if (!isPlaying) {
      playSequence();
    } else {
      pauseSequence();
    }
    isPlaying = !isPlaying;
  };

  export const handleRewindClick = () => {
    rewindSequence();
  };

  export const handleSliderInput = (time: number) => {
    setSequenceTo(time);
  };

  export const handleSliderPointerDown = () => {
    wasPlayingBeforeDrag = isPlaying;
    isSliderDragging = true;
    if (isPlaying) {
      engine.pause();
      isPlaying = false;
    }
  };

  export const handleSliderPointerUp = () => {
    isSliderDragging = false;
    if (wasPlayingBeforeDrag) {
      playSequence();
      isPlaying = true;
    }
  };

  /**
   * Returns the current design camera position and the OrbitControls look-at target.
   * Use this to capture a camera keyframe at the current playback time.
   * Returns null when design mode is not yet initialised.
   */
  export function getDesignCameraState(): { position: [number, number, number]; lookAt: [number, number, number] } | null {
    if (!editorCamera || !orbitControls) return null;
    const p = editorCamera.position;
    const t = orbitControls.target;
    return {
      position: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)],
      lookAt:   [+t.x.toFixed(3), +t.y.toFixed(3), +t.z.toFixed(3)],
    };
  }

  /**
   * Snap the design (editor) camera to the current playback camera position and orientation.
   * The orbit target is set 5 units ahead along the playback camera's look direction,
   * giving a sensible pivot for continued orbiting after snapping.
   */
  export function snapDesignCameraToPlayback() {
    if (!camera || !orbitControls || !editorCamera) return;
    editorCamera.position.copy(camera.position);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    orbitControls.target.copy(camera.position).addScaledVector(forward, 5);
    orbitControls.update();
    updateRendererSize();
  }

  /**
   * Returns the current world-space position and Euler rotation (XYZ, radians)
   * of the named object in the live Three.js scene graph.
   * Returns null when the object is not found or the scene is not yet built.
   */
  export function getObjectTransform(id: string): { position: [number, number, number]; rotation: [number, number, number] } | null {
    const obj = scene?.getObjectByName(id);
    if (!obj) return null;
    const p = obj.getWorldPosition(new THREE.Vector3());
    const q = obj.getWorldQuaternion(new THREE.Quaternion());
    const e = new THREE.Euler().setFromQuaternion(q, 'XYZ');
    return {
      position: [+p.x.toFixed(3), +p.y.toFixed(3), +p.z.toFixed(3)],
      rotation: [+e.x.toFixed(4), +e.y.toFixed(4), +e.z.toFixed(4)],
    };
  }

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

    const actor = scene.getObjectByName(actorId);
    if (actor) {
      // Measure the actor's world-space bounding box.
      const box = new THREE.Box3().setFromObject(actor);
      const actorHeight = Math.max(0.5, box.max.y - box.min.y);

      // Screen-invariant sizing: decide how tall the bubble should be in *screen
      // pixels*, then convert to world units via the camera frustum.  This keeps
      // the bubble the same apparent size regardless of character defaultScale,
      // camera zoom, FOV, or canvas resolution.
      const actorCenter  = box.getCenter(new THREE.Vector3());
      const distToActor  = camera.position.distanceTo(actorCenter);
      const activeCam    = camera instanceof THREE.PerspectiveCamera ? camera : editorCamera;
      const vFovRad      = (activeCam.fov * Math.PI) / 180;
      const worldPerPx   = (2 * distToActor * Math.tan(vFovRad / 2)) / renderer.domElement.height;

      // Target ~130 screen-pixels tall, scaled by the user's bubble-scale slider.
      const targetWorldH = 130 * bubbleScale * worldPerPx;
      const spriteScale  = targetWorldH / canvas.height;

      // The sprite is a child of the actor, so actor.scale would amplify
      // sprite.scale in world space.  Divide by actor world scale to cancel it.
      const actorWorldScale = actor.getWorldScale(new THREE.Vector3());
      const localScale = spriteScale / actorWorldScale.y;
      sprite.scale.set(canvas.width * localScale, canvas.height * localScale, 1);

      // Place the sprite centre just above the bounding-box top.
      const gap      = actorHeight * 0.08 + targetWorldH / 2;
      const worldTopY = box.max.y + gap;
      const actorWorld = new THREE.Vector3();
      actor.getWorldPosition(actorWorld);
      const localPos = actor.worldToLocal(new THREE.Vector3(actorWorld.x, worldTopY, actorWorld.z));
      sprite.position.copy(localPos);

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
    touch-action: none;
  }

  #log-panel {
    display: none;
  }

  #editor-overlay {
    position: absolute;
    top: 0;
    right: 0;
    width: 50%;
    height: 100%;
    pointer-events: none;
  }

  #editor-overlay.active {
    pointer-events: all;
    cursor: default;
  }

  .mode-toggle {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    background: rgba(28, 28, 32, 0.80);
    color: #e8e8e8;
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 6px;
    padding: 4px 14px;
    font-size: 11px;
    letter-spacing: 0.04em;
    cursor: pointer;
    backdrop-filter: blur(4px);
    user-select: none;
  }

  .mode-toggle:hover {
    background: rgba(55, 55, 65, 0.90);
  }

  .gizmo-toolbar {
    position: absolute;
    bottom: 12px;
    right: 12px;
    z-index: 10;
    display: flex;
    gap: 4px;
  }

  .gizmo-btn {
    width: 44px;
    height: 44px;
    background: rgba(28, 28, 32, 0.82);
    color: #aaa;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    font-size: 20px;
    line-height: 1;
    cursor: pointer;
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.1s, color 0.1s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .gizmo-btn:hover {
    background: rgba(55, 55, 65, 0.90);
    color: #e0e0e0;
  }

  .gizmo-btn.active {
    background: rgba(74, 158, 255, 0.22);
    color: #4a9eff;
    border-color: rgba(74, 158, 255, 0.45);
  }

  .hud-status {
    position: absolute;
    bottom: 12px;
    left: calc(50% + 12px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: 3px;
    pointer-events: none;
    user-select: none;
  }

  .hud-mode-label {
    font-size: 11px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.70);
    background: rgba(28, 28, 32, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.10);
    border-radius: 4px;
    padding: 2px 7px;
    backdrop-filter: blur(4px);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    align-self: flex-start;
  }

  .hud-hint {
    font-size: 11px;
    color: rgba(200, 200, 210, 0.70);
    background: rgba(28, 28, 32, 0.60);
    border-radius: 4px;
    padding: 2px 7px;
    backdrop-filter: blur(3px);
    white-space: nowrap;
  }
</style>
  
<div id="content">
  <div id="render-container">
    <canvas bind:this={canvas} id="c"></canvas>
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div
      bind:this={editorOverlay}
      id="editor-overlay"
      role="application"
      aria-label="Design viewport"
      class:active={designMode}
      onpointerup={handleOverlayPointerUp}
      ondragover={(e) => { if (designMode) e.preventDefault(); }}
      ondrop={handleCatalogueDrop}
      onkeydown={() => {}}
    ></div>
    <button
      class="mode-toggle"
      onclick={() => { designMode = !designMode; }}
      title={designMode ? 'Switch to playback view' : 'Switch to design view'}
    >{designMode ? '▶ Switch to Playback view' : '✏ Switch to Design view'}</button>
    {#if designMode}
      <div class="gizmo-toolbar" role="toolbar" aria-label="Gizmo mode">
        {#if selectedObjectId}
          <button
            class="gizmo-btn" class:active={tcMode === 'translate'}
            onclick={() => setGizmoMode('translate')}
            title="Move (G)"
            aria-label="Move"
            aria-pressed={tcMode === 'translate'}
          >⇔</button>
          {#if rotationEnabled}
          <button
            class="gizmo-btn" class:active={tcMode === 'rotate'}
            onclick={() => setGizmoMode('rotate')}
            title="Rotate (R)"
            aria-label="Rotate"
            aria-pressed={tcMode === 'rotate'}
          >↻</button>
          {/if}
        {/if}
      </div>
      {#if hudMode || dragHint}
        <div class="hud-status">
          {#if hudMode}<span class="hud-mode-label">{hudMode}</span>{/if}
          {#if dragHint}<span class="hud-hint">{dragHint}</span>{/if}
        </div>
      {/if}
    {/if}
  </div>
  <div id="log-panel"></div>
</div>