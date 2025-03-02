<script lang="ts">
  import { onMount } from 'svelte';
  import * as Tone from 'tone';
  import * as THREE from 'three';

  let canvas: HTMLCanvasElement;
  let frameRate = 20;
  let isPlaying = false;
  let isSetup = false;
  let animationDict: { [key: string]: { anim: THREE.AnimationAction; start: number; end: number }[] } = {};
  let mixers: THREE.AnimationMixer[] = [];
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let clock: THREE.Clock;
  let currentPosition = 0;
  let sliderValue = 0;

  const setupTone = async () => {
    if (!isSetup) {
      await Tone.start();
      Tone.setContext(new Tone.Context({ lookAhead: 0 }));
      Tone.getDraw().anticipation = 0.5;
      isSetup = true;
    }
  };

  const setupScene = () => {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x33334c);

    camera = new THREE.PerspectiveCamera(45.8366, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.set(0, 5, -30);
    camera.lookAt(0, 3, 0);

    const light1 = new THREE.DirectionalLight(0xffffff, 1.5);
    light1.position.set(0, 20, 0);
    scene.add(light1);

    const light2 = new THREE.HemisphereLight(0xffffff, 0x444444, 2.5);
    light2.position.set(0, 20, -20);
    scene.add(light2);

    const doorGeometry = new THREE.BoxGeometry(2, 4, 0.1);
    const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const door = new THREE.Mesh(doorGeometry, doorMaterial);
    door.position.set(-1, 0, 0);
    scene.add(door);

    const hinge = new THREE.Object3D();
    hinge.position.y = 2;
    hinge.add(door);
    scene.add(hinge);

    const sphereGeometry = new THREE.SphereGeometry(0.2, 32, 32);
    const sphereMaterial = new THREE.MeshStandardMaterial({ color: 0x808080, emissive: 0xffffff });
    const sphereLight = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphereLight.position.set(2, 3, 0.1);

    const sphereLights: THREE.Mesh[] = [sphereLight];
    const lightPositions = [-2, 3, 6.9];

    sphereLights.push(sphereLight.clone());
    sphereLights[1].position.set(lightPositions[0], lightPositions[1], lightPositions[2]);
    scene.add(sphereLights[1]);

    const spotLights: THREE.SpotLight[] = [];
    const lightDirections = [-0.5, -0.25, 1, 0, 0, -1];
    for (let i = 0; i < sphereLights.length; i++) {
      const spotLight = new THREE.SpotLight(0xffffff, 0, 0, Math.PI / 8, 0, 2);
      spotLight.position.copy(sphereLights[i].position);
      spotLight.lookAt(new THREE.Vector3(lightDirections[3 * i], lightDirections[3 * i + 1], lightDirections[3 * i + 2]));
      spotLight.color.set(0xffffff);
      scene.add(spotLight);
      spotLights.push(spotLight);
    }

    const groundGeometry = new THREE.PlaneGeometry(50, 50);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    const wallGeometry = new THREE.BoxGeometry(8, 6, 0.1);
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x808080 });
    const wall1 = new THREE.Mesh(wallGeometry, wallMaterial);
    wall1.position.set(-6, 3, 0);
    scene.add(wall1);

    const wall2 = wall1.clone();
    wall2.scale.set(0.5, 1, 1);
    wall2.position.set(2, 3, 0);
    scene.add(wall2);

    const wall3 = wall1.clone();
    wall3.scale.set(0.25, 0.33, 1);
    wall3.position.set(-1, 5, 0);
    scene.add(wall3);

    const wall4 = wall1.clone();
    wall4.scale.set(1.75, 1, 1);
    wall4.position.set(-3, 3, 7);
    scene.add(wall4);

    const wall5 = wall1.clone();
    wall5.scale.set(0.875, 1, 1);
    wall5.rotation.y = Math.PI / 2;
    wall5.position.set(-10, 3, 3.5);
    scene.add(wall5);

    const wall6 = wall5.clone();
    wall6.position.set(4, 3, 3.5);
    scene.add(wall6);

    const roof = wall1.clone();
    roof.scale.set(1.75, 1.1667, 1);
    roof.rotation.x = Math.PI / 2;
    roof.position.set(-3, 6, 3.5);
    scene.add(roof);

    createAxis(scene);

    const frameRate = 20;

    const rotateTimes = [0, 5];
    const rotateValues = [
      0, 1, 0, 0,
      0, 0, 0, 1
    ];
    const rotateTrack = new THREE.QuaternionKeyframeTrack('.quaternion', rotateTimes, rotateValues);
    const rotateClip = new THREE.AnimationClip('rotate', -1, [rotateTrack]);
    const rotateMixer = new THREE.AnimationMixer(camera);
    const rotateAction = rotateMixer.clipAction(rotateClip).setLoop(THREE.LoopOnce);
    rotateAction.clampWhenFinished = true;
    rotateAction.play();
    rotateAction.paused = true;
    mixers.push(rotateMixer);

    const moveTimes1 = [0, 3];
    const moveValues1 = [0, 5, -30, 0, 2, -10];
    const moveTrack1 = new THREE.VectorKeyframeTrack('.position', moveTimes1, moveValues1);
    const moveClip1 = new THREE.AnimationClip('movein1', -1, [moveTrack1]);
    const moveMixer1 = new THREE.AnimationMixer(camera);
    const moveAction1 = moveMixer1.clipAction(moveClip1).setLoop(THREE.LoopOnce);
    moveAction1.clampWhenFinished = true;
    moveAction1.play();
    moveAction1.paused = true;
    mixers.push(moveMixer1);

    const moveTimes2 = [0, 3];
    const moveValues2 = [0, 2, -10, -2, 2, 3];
    const moveTrack2 = new THREE.VectorKeyframeTrack('.position', moveTimes2, moveValues2);
    const moveClip2 = new THREE.AnimationClip('movein2', -1, [moveTrack2]);
    const moveMixer2 = new THREE.AnimationMixer(camera);
    const moveAction2 = moveMixer2.clipAction(moveClip2).setLoop(THREE.LoopOnce);
    moveAction2.clampWhenFinished = true;
    moveAction2.play();
    moveAction2.paused = true;
    mixers.push(moveMixer2);

    animationDict["cameramove"] = [
      { anim: moveAction1, start: 0, end: 3 },
      { anim: moveAction2, start: 5, end: 8 }
    ];
    animationDict["camerarot"] = [{ anim: rotateAction, start: 9, end: 14 }];

    const createAnimation = (object: THREE.Object3D, anim_name: string, property: string, times: number[], values: number[]) => {
      const track = new THREE.KeyframeTrack(property, times, values);
      const clip = new THREE.AnimationClip('clip' + anim_name, -1, [track]);
      const mixer = new THREE.AnimationMixer(object);
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce);
      action.clampWhenFinished = true;
      action.play();
      action.paused = true;
      mixers.push(mixer);
      return action;
    };

    const doorSweep1 = createAnimation(hinge, "a1", '.rotation[y]', [0, 2], [0, Math.PI / 3]);
    const doorSweep2 = createAnimation(hinge, "a2", '.rotation[y]', [0, 2], [Math.PI / 3, 0]);

    animationDict["doorsweep"] = [
      { anim: doorSweep1, start: 3, end: 5 },
      { anim: doorSweep2, start: 13, end: 15 }
    ];

    const lightBrighten1 = createAnimation(spotLights[0], "a3", '.intensity', [0, 3], [0, 1]);
    const lightDim1 = createAnimation(spotLights[0], "a4", '.intensity', [0, 1], [1, 0]);
    const lightBrighten2 = createAnimation(spotLights[1], "a5", '.intensity', [0, 3], [0, 1]);
    const lightDim2 = createAnimation(spotLights[1], "a6", '.intensity', [0, 1], [1, 0]);

    animationDict["spotlight0intensity"] = [
      { anim: lightBrighten1, start: 7, end: 10 },
      { anim: lightDim1, start: 14, end: 15 }
    ];
    animationDict["spotlight1intensity"] = [
      { anim: lightBrighten2, start: 7, end: 10 },
      { anim: lightDim2, start: 14, end: 15 }
    ];

    Object.values(animationDict).forEach((animGroup) => {
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
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  const updatePosition = () => {
    const currentTime = Tone.getTransport().seconds;
    currentPosition = currentTime;
    sliderValue = currentTime;
  };

  const playSequence = () => {
    let currentTime = Tone.getTransport().seconds;
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        if (anim.start < currentTime && currentTime < anim.end) {
          anim.anim.paused = false;
        }
      });
    });
    Tone.getTransport().start();
  };

  const pauseSequence = () => {
    Tone.getTransport().pause();
    updatePosition();

    let currentTime = Tone.getTransport().seconds;
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        if (anim.start < currentTime && currentTime < anim.end) {
          anim.anim.paused = true;
        }
      });
    });
  };

  const pauseAndDisableAll = () => {
    Object.values(animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        anim.anim.enabled = false;
        anim.anim.time = 0;
        anim.anim.paused = true;
      });
    });
  };

  const setSequenceTo = (time: number) => {
    Tone.getTransport().seconds = time;
    updatePosition();

    pauseAndDisableAll();

    Object.entries(animationDict).forEach(([key, animationList]) => {
      for (let i = 0; i < animationList.length; i++) {
        const anim = animationList[i];
        if (time < anim.start) {
          anim.anim.enabled = true;
          anim.anim.time = 0;
          break;
        } else if (time >= anim.start && time < anim.end) {
          anim.anim.enabled = true;
          anim.anim.time = (time - anim.start);
          break;
        } else if (i === animationList.length - 1) {
          anim.anim.enabled = true;
          anim.anim.time = (anim.end - anim.start);
        }
      }
    });
  };

  const rewindSequence = () => {
    Tone.getTransport().seconds = 0.0;
    updatePosition();
    setSequenceTo(0);
  };

  const updateSlider = () => {
    if (isPlaying) {
      const currentTime = Tone.getTransport().seconds;
      sliderValue = currentTime;
    }
    requestAnimationFrame(updateSlider);
  };

  const handleSetupClick = async () => {
    await setupTone();
    setupScene();
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

  onMount(() => {
    requestAnimationFrame(updateSlider);
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

  button {
    margin: 10px;
  }

  #slider-container {
    margin: 20px;
    width: 80%;
  }
</style>

<div id="content">
  <div><canvas bind:this={canvas} id="c"></canvas></div>
  <button on:click={handleSetupClick}>Setup Tone & Load Scene and Sequence</button>
  <div>Play/Pause: <button on:click={handlePlayPauseClick}>{isPlaying ? 'Pause' : 'Play'}</button></div>
  <div><button on:click={handleRewindClick}>Rewind</button></div>
  <div>Position: {currentPosition.toFixed(2)}</div>
  <div id="slider-container">
    <input type="range" min="0" max="16" step="0.01" bind:value={sliderValue} on:input={handleSliderInput}>
  </div>
</div>