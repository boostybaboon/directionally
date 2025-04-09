<script lang="ts">
    import * as THREE from 'three';
    import { onMount, onDestroy } from 'svelte';
    import { sceneStore } from '$lib/stores/scene';
    import { Asset } from '../common/Asset';
    import { Object3DAsset } from '../scene/Object3D/Object3DAsset';

    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
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

    // Initialize scene
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0f0f0);

    function animate() {
        animationFrameId = requestAnimationFrame(animate);
        
        if ($sceneStore.camera) {
            renderer.render(scene, $sceneStore.camera);
        }
    }

    // Update scene when store changes
    $effect(() => {
        // Clear existing scene
        while(scene.children.length > 0) { 
            scene.remove(scene.children[0]); 
        }

        // Add new assets
        $sceneStore.assets.forEach(asset => {
            const object = asset.getObject3D();
            if (object) {
                // Store reference to asset in userData for raycasting
                object.userData.asset = asset;
                scene.add(object);
            }
        });
    });

    onMount(() => {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        renderer.setSize(canvas.clientWidth, canvas.clientHeight);

        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2();

        // Start animation loop
        animate();

        // Handle window resize
        const handleResize = () => {
            if ($sceneStore.camera) {
                const width = canvas.clientWidth;
                const height = canvas.clientHeight;
                
                renderer.setSize(width, height);
                $sceneStore.camera.aspect = width / height;
                $sceneStore.camera.updateProjectionMatrix();
            }
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    });

    onDestroy(() => {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
        }
    });

    function handleClick(event: MouseEvent) {
        if (!scene || !$sceneStore.camera) return;

        // Calculate mouse position in normalized device coordinates
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Update the picking ray with the camera and mouse position
        raycaster.setFromCamera(mouse, $sceneStore.camera);

        // Find intersections with objects in the scene
        const intersects = raycaster.intersectObjects(scene.children, true);

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

<canvas 
    bind:this={canvas} 
    on:click={handleClick}
/>

<style>
    canvas {
        width: 100%;
        height: 100%;
        background: #f0f0f0;
    }
</style> 