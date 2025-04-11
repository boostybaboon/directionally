<script lang="ts">
    import * as THREE from 'three';
    import * as Tone from 'tone';
    import { onMount } from 'svelte';
    import { sceneStore } from '$lib/stores/scene';
    import { Asset } from '../common/Asset';
    import { Object3DAsset } from '../scene/Object3D/Object3DAsset';
    import { PerspectiveCameraAsset } from '../scene/Object3D/Camera/PerspectiveCamera/PerspectiveCameraAsset';

    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    let animationFrameId: number;
    let raycaster: THREE.Raycaster;
    let mouse: THREE.Vector2;
    let selectedAsset: Asset | null = null;
    let selectedObject: THREE.Object3D | null = null;
    let highlightMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xffff00,
        transparent: true,
        opacity: 0.5
    });
    let originalMaterials = new Map<THREE.Object3D, THREE.Material>();

    // Animation state
    let isToneSetup = $state<boolean>(false);
    let isPlaying = $state<boolean>(false);
    let currentPosition = $state<number>(0);
    let sliderValue = $state<number>(0);
    let animationMixer: THREE.AnimationMixer | null = null;
    let animationAction: THREE.AnimationAction | null = null;
    let animationDict: { [key: string]: { anim: THREE.AnimationAction; start: number; end: number }[] } = {};

    // Debug overlay
    let debugOverlay: HTMLDivElement | null = null;
    let canvasSize = { width: 0, height: 0 };
    let rendererSize = { width: 0, height: 0 };
    let pixelRatio = 1;

    const setupTone = async () => {
        if (!isToneSetup) {
            await Tone.start();
            Tone.setContext(new Tone.Context({ lookAhead: 0 }));
            Tone.getDraw().anticipation = 0.5;
            isToneSetup = true;
        }
    };

    function updateDebugInfo() {
        if (!debugOverlay || !renderer) return;
        
        canvasSize = {
            width: canvas.clientWidth,
            height: canvas.clientHeight
        };
        
        rendererSize = {
            width: renderer.domElement.width,
            height: renderer.domElement.height
        };
        
        pixelRatio = renderer.getPixelRatio();
        
        const camera = $sceneStore.camera?.getObject3D() as THREE.PerspectiveCamera;
        debugOverlay.innerHTML = `
            <div>Canvas: ${canvasSize.width}x${canvasSize.height}</div>
            <div>Renderer: ${rendererSize.width}x${rendererSize.height}</div>
            <div>Pixel Ratio: ${pixelRatio}</div>
            <div>Camera Aspect: ${camera?.aspect.toFixed(2) ?? 'N/A'}</div>
            <div>Position: ${currentPosition.toFixed(2)}</div>
        `;
    }

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        
        if ($sceneStore.camera && $sceneStore.scene) {
            const camera = $sceneStore.camera.getObject3D() as THREE.PerspectiveCamera;
            
            // Update animation mixer if it exists
            if (animationMixer) {
                const delta = 1/60; // Fixed time step for consistent animation
                animationMixer.update(delta);
            }
            
            renderer.render($sceneStore.scene, camera);
            updateDebugInfo();
        }
    }

    function handleResize() {
        if (!canvas || !$sceneStore.camera || !$sceneStore.scene) return;

        // Get the container dimensions
        const container = canvas.parentElement;
        if (!container) return;

        // Get the actual pixel dimensions of the container
        const width = container.clientWidth;
        const height = container.clientHeight;
        
        // Set the canvas size directly
        canvas.width = width;
        canvas.height = height;
        
        // Set the renderer to the exact pixel dimensions, updating the drawing buffer
        renderer.setSize(width, height, false);
        
        // Update camera aspect ratio
        if ($sceneStore.camera instanceof PerspectiveCameraAsset) {
            $sceneStore.camera.updateAspectRatio(width, height);
        }
        
        // Force a render after resize
        const camera = $sceneStore.camera.getObject3D() as THREE.PerspectiveCamera;
        renderer.render($sceneStore.scene, camera);
        updateDebugInfo();
    }

    const setupAnimation = () => {
        if (!$sceneStore.scene) return;

        // Find the sphere in the scene
        const sphere = $sceneStore.scene.children.find(child => child.name === 'sphere');
        if (!sphere) {
            console.log('No sphere found in scene');
            return;
        }

        // Create animation clip for up and down movement
        const times = [0, 1, 2]; // Keyframe times
        const values = [0, 2, 0]; // Y position values
        const track = new THREE.KeyframeTrack('.position[y]', times, values);
        const clip = new THREE.AnimationClip('bounce', 2, [track]);

        // Create mixer and action
        animationMixer = new THREE.AnimationMixer(sphere);
        animationAction = animationMixer.clipAction(clip);
        animationAction.setLoop(THREE.LoopRepeat, Infinity);
        animationAction.play();
        animationAction.paused = true;

        console.log('Animation setup:', {
            mixer: animationMixer,
            action: animationAction,
            sphere: sphere
        });

        // Add to animation dictionary
        animationDict['sphere_bounce'] = [{
            anim: animationAction,
            start: 0,
            end: 2
        }];

        // Schedule animation state changes with Tone.js
        Tone.getTransport().clear(0);
        Object.entries(animationDict).forEach(([_, animationList]) => {
            animationList.forEach((anim) => {
                // Schedule start
                Tone.getTransport().schedule((time) => {
                    console.log('Animation start scheduled at:', time);
                    if (animationMixer) {
                        animationMixer.time = 0;
                        anim.anim.time = 0;
                        anim.anim.paused = false;
                    }
                }, anim.start);

                // Schedule end for non-looping animations
                if (anim.anim.loop !== THREE.LoopRepeat) {
                    Tone.getTransport().schedule((time) => {
                        console.log('Animation end scheduled at:', time);
                        anim.anim.paused = true;
                    }, anim.end);
                }
            });
        });
    };

    const playSequence = async () => {
        if (!isToneSetup) {
            await setupTone();
        }
        console.log('Starting transport, current time:', Tone.getTransport().seconds);
        Tone.getTransport().start();
        
        // Ensure animations are unpaused
        Object.values(animationDict).forEach((animationList) => {
            animationList.forEach((anim) => {
                anim.anim.paused = false;
            });
        });
    };

    const pauseSequence = () => {
        Tone.getTransport().pause();
        updatePosition();

        // Pause all animations
        Object.values(animationDict).forEach((animationList) => {
            animationList.forEach((anim) => {
                anim.anim.paused = true;
            });
        });
    };

    const updatePosition = () => {
        const currentTime = Tone.getTransport().seconds;
        currentPosition = currentTime;
        sliderValue = currentTime;
    };

    const setSequenceTo = (time: number) => {
        Tone.getTransport().seconds = time;
        updatePosition();

        if (animationMixer) {
            animationMixer.time = 0;
        }

        Object.entries(animationDict).forEach(([_, animationList]) => {
            for (let i = animationList.length - 1; i >= 0; i--) {
                const anim = animationList[i];

                if (time < anim.start) {
                    anim.anim.enabled = false;
                    continue;
                }
                
                if (time >= anim.end && anim.anim.loop !== THREE.LoopRepeat) {
                    anim.anim.enabled = false;
                    continue;
                }
                
                anim.anim.enabled = true;
                if (anim.anim.loop === THREE.LoopRepeat) {
                    anim.anim.time = (time - anim.start) % (anim.end - anim.start);
                } else {
                    anim.anim.time = Math.min(time - anim.start, anim.end - anim.start);
                }
            }
        });
    };

    const rewindSequence = () => {
        Tone.getTransport().seconds = 0;
        updatePosition();
        setSequenceTo(0);
    };

    const handlePlayPauseClick = async () => {
        if (!isPlaying) {
            await playSequence();
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

    onMount(() => {
        // Create renderer with correct pixel ratio
        renderer = new THREE.WebGLRenderer({ 
            canvas, 
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setPixelRatio(window.devicePixelRatio);

        // Initialize picking
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // Use ResizeObserver to handle size changes
        const resizeObserver = new ResizeObserver(() => {
            handleResize();
        });
        resizeObserver.observe(canvas);

        // Start animation loop
        animate();

        return () => {
            resizeObserver.disconnect();
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
            }
        };
    });

    // Handle scene changes
    $effect(() => {
        if ($sceneStore.scene && $sceneStore.camera) {
            // When a new scene is loaded, ensure the renderer size is correct
            handleResize();
            // Setup animation when scene changes
            setupAnimation();
        }
    });

    function handleClick(event: MouseEvent) {
        if (!$sceneStore.scene || !$sceneStore.camera) return;

        // Calculate mouse position in normalized device coordinates
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        const camera = $sceneStore.camera.getObject3D() as THREE.PerspectiveCamera;
        raycaster.setFromCamera(mouse, camera);

        // Find intersections with objects in the scene
        const intersects = raycaster.intersectObjects($sceneStore.scene.children, true);

        if (intersects.length > 0) {
            // Find the first object that has an asset reference
            const selected = intersects.find(intersect => {
                let obj: THREE.Object3D | null = intersect.object;
                while (obj && !obj.userData.asset) {
                    obj = obj.parent;
                }
                return obj?.userData.asset;
            });

            if (selected) {
                const asset: Object3DAsset = selected.object.userData.asset;
                
                // Remove highlight from previously selected object
                if (selectedObject) {
                    if (selectedObject instanceof THREE.Mesh) {
                        const originalMaterial = originalMaterials.get(selectedObject);
                        if (originalMaterial) {
                            selectedObject.material = originalMaterial;
                        }
                    }
                }

                // Apply highlight to newly selected object
                selectedObject = selected.object;
                if (selectedObject instanceof THREE.Mesh) {
                    originalMaterials.set(selectedObject, selectedObject.material);
                    selectedObject.material = highlightMaterial;
                }

                sceneStore.selectAsset(asset);
            } else {
                sceneStore.selectAsset(null);
            }
        } else {
            // Remove highlight if clicking empty space
            if (selectedObject) {
                if (selectedObject instanceof THREE.Mesh) {
                    const originalMaterial = originalMaterials.get(selectedObject);
                    if (originalMaterial) {
                        selectedObject.material = originalMaterial;
                    }
                }
            }
            selectedObject = null;
            selectedAsset = null;
            sceneStore.selectAsset(null);
        }
    }

    function initializeCustomConsoleLog() {
        // Override console.log to display in the custom console
        const originalConsoleLog = console.log;
        console.log = (...args) => {
            originalConsoleLog.apply(console, args);
            // Add to custom console if it exists
            const customConsole = document.getElementById('custom-console');
            if (customConsole) {
                const message = args.map(arg => 
                    typeof arg === 'object' ? JSON.stringify(arg) : arg
                ).join(' ');
                customConsole.innerHTML += `<div>${message}</div>`;
                customConsole.scrollTop = customConsole.scrollHeight;
            }
        };
    }

    // ... rest of existing code ...
</script>

<div class="presenter">
    <canvas 
        bind:this={canvas} 
        onclick={handleClick}
    ></canvas>
    <div class="debug-overlay" bind:this={debugOverlay}></div>
    <div class="controls">
        <button onclick={handlePlayPauseClick}>{isPlaying ? 'Pause' : 'Play'}</button>
        <button onclick={handleRewindClick}>Rewind</button>
        <div>Position: {currentPosition.toFixed(2)}</div>
        <div class="slider-container">
            <input type="range" min="0" max="16" step="0.01" bind:value={sliderValue} oninput={handleSliderInput}>
        </div>
    </div>
</div>

<style>
    .presenter {
        width: 100%;
        height: 100%;
        position: relative;
        overflow: hidden;
    }

    canvas {
        width: 100%;
        height: 100%;
        display: block;
        position: absolute;
        top: 0;
        left: 0;
    }

    .debug-overlay {
        position: absolute;
        top: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        pointer-events: none;
        z-index: 1;
    }

    .controls {
        position: absolute;
        bottom: 10px;
        left: 10px;
        background: rgba(0, 0, 0, 0.7);
        color: white;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        z-index: 1;
    }

    .slider-container {
        width: 200px;
        margin-top: 10px;
    }

    button {
        margin-right: 10px;
        padding: 5px 10px;
        background: #444;
        color: white;
        border: none;
        border-radius: 3px;
        cursor: pointer;
    }

    button:hover {
        background: #666;
    }
</style> 