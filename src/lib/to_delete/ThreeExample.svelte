<script lang="ts">
    import { onMount } from 'svelte';
    import * as THREE from 'three';
  
    let canvas: HTMLCanvasElement;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let cube: THREE.Mesh;
    let animationFrameId: number;
  
    const createScene = () => {
      // Create the renderer
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  
      // Create the scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x33334c);
  
      // Create the camera
      camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
      camera.position.z = 5;
  
      // Create a cube with different colors for each face
      const geometry = new THREE.BoxGeometry();
      const materials = [
        new THREE.MeshBasicMaterial({ color: 0xff0000 }), // Red
        new THREE.MeshBasicMaterial({ color: 0x00ff00 }), // Green
        new THREE.MeshBasicMaterial({ color: 0x0000ff }), // Blue
        new THREE.MeshBasicMaterial({ color: 0xffff00 }), // Yellow
        new THREE.MeshBasicMaterial({ color: 0xff00ff }), // Magenta
        new THREE.MeshBasicMaterial({ color: 0x00ffff })  // Cyan
      ];
      cube = new THREE.Mesh(geometry, materials);
      scene.add(cube);
  
      // Add a light
      const light = new THREE.PointLight(0xffffff, 1, 100);
      light.position.set(10, 10, 10);
      scene.add(light);
  
      // Start the animation loop
      animate();
    };
  
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
  
      // Rotate the cube
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;
  
      // Render the scene
      renderer.render(scene, camera);
    };
  
    const onWindowResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
  
    onMount(() => {
      createScene();
      window.addEventListener('resize', onWindowResize);
  
      return () => {
        cancelAnimationFrame(animationFrameId);
        window.removeEventListener('resize', onWindowResize);
      };
    });
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
  </style>
  
  <div id="content">
    <canvas bind:this={canvas} id="c"></canvas>
  </div>