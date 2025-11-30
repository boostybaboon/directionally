import * as Tone from 'tone';
import * as THREE from 'three';
import type { Model } from '../../lib/Model';
import type { AnimationDict } from '../../lib/model/Action';

/**
 * ScenePlayer manages a complete animated scene:
 * - Scene construction from Model
 * - Animation orchestration with Three.js mixers
 * - Playback control (play/pause/seek) with Tone.js transport
 * - Animation loop generation
 */
export class ScenePlayer {
  private isPlaying_ = false;
  private isToneSetup = false;
  private positionUpdateInterval: number | null = null;

  private animationDict: AnimationDict = {};
  private modelAnimationClips: { [key: string]: THREE.AnimationClip[] } = {};
  private mixers: THREE.AnimationMixer[] = [];
  private _scene: THREE.Scene | null = null;
  private _camera: THREE.Camera | null = null;
  private clock: THREE.Clock | null = null;

  // Public accessors for scene and camera
  get scene(): THREE.Scene | null {
    return this._scene;
  }

  get camera(): THREE.Camera | null {
    return this._camera;
  }

  /**
   * Initialize Tone.js context and transport.
   */
  private async setupTone(): Promise<void> {
    if (!this.isToneSetup) {
      await Tone.start();
      Tone.setContext(new Tone.Context({ lookAhead: 0 }));
      Tone.getDraw().anticipation = 0.5;
      this.isToneSetup = true;
    }
  }

  /**
   * Load a model into the scene, set up animations and playback.
   * Returns the Three.js scene, camera, and an animation loop function.
   */
  async loadModel(model: Model): Promise<{
    scene: THREE.Scene;
    camera: THREE.Camera;
    getAnimationLoop: () => (deltaTime: number) => void;
  }> {
    if (!this.isToneSetup) {
      await this.setupTone();
    }

    // Reset state
    this.mixers = [];
    this.animationDict = {};
    this.modelAnimationClips = {};
    Tone.getTransport().cancel();

    // Create scene
    this._scene = new THREE.Scene();
    if (model.backgroundColor !== undefined) {
      this._scene.background = new THREE.Color(model.backgroundColor);
    }

    // Set camera
    this._camera = model.camera.threeCamera;

    // Add lights
    model.lights.forEach((light) => {
      this._scene!.add(light.threeObject);
    });

    // Load and add meshes
    model.meshes.forEach((mesh) => {
      this._scene!.add(mesh.threeMesh);

      // Handle parent-child relationships
      if (mesh.parent) {
        const parentObject = this._scene!.getObjectByName(mesh.parent);
        if (parentObject) {
          this._scene!.remove(mesh.threeMesh);
          parentObject.add(mesh.threeMesh);
        } else {
          console.warn(`Parent object ${mesh.parent} not found for ${mesh.name}`);
        }
      }
    });

    // Load all GLTF assets
    const gltfPromises = model.gltfs.map(async (gltf) => {
      await gltf.load();
      this._scene!.add(gltf.threeObject);
      this.modelAnimationClips[gltf.name] = gltf.animations;

      // Handle parent-child relationships
      if (gltf.parent) {
        const parentObject = this._scene!.getObjectByName(gltf.parent);
        if (parentObject) {
          this._scene!.remove(gltf.threeObject);
          parentObject.add(gltf.threeObject);
        } else {
          console.warn(`Parent object ${gltf.parent} not found for ${gltf.name}`);
        }
      }
    });

    await Promise.all(gltfPromises);

    // Set up animations
    model.actions.forEach((action) => {
      let sceneObject: THREE.Object3D | undefined = this._scene!.getObjectByName(action.target);
      if (!sceneObject) {
        if (action.target === this._camera!.name) {
          sceneObject = this._camera!;
        } else {
          console.error(`Could not find object with name ${action.target}`);
          return;
        }
      }
      if (sceneObject) {
        action.addAction(
          this.animationDict,
          this.mixers,
          sceneObject,
          this.modelAnimationClips[action.target]
        );
      }
    });

    // Schedule animation enables on transport
    Object.values(this.animationDict).forEach((animGroup) => {
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

    // Initialize clock and set initial state
    this.clock = new THREE.Clock();
    this.seek(0);

    // Return scene, camera, and animation loop function
    return {
      scene: this._scene!,
      camera: this._camera!,
      getAnimationLoop: () => this.getAnimationLoop(),
    };
  }

  /**
   * Get the animation loop function to be called each frame.
   * Returns a function that takes deltaTime and updates mixers.
   */
  private getAnimationLoop(): (deltaTime: number) => void {
    return (deltaTime: number) => {
      this.mixers.forEach((mixer) => mixer.update(deltaTime));
    };
  }

  /**
   * Resume playback from current time.
   */
  play(): void {
    let currentTime = Tone.getTransport().seconds;
    Object.values(this.animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        if (
          anim.start < currentTime &&
          (currentTime < anim.end || anim.loop === THREE.LoopRepeat)
        ) {
          anim.anim.paused = false;
        }
      });
    });
    Tone.getTransport().start();
    this.isPlaying_ = true;

    // Clear any existing interval
    if (this.positionUpdateInterval !== null) {
      clearInterval(this.positionUpdateInterval);
    }

    // Start position update interval
    this.positionUpdateInterval = window.setInterval(() => {
      // Caller will query currentTime() as needed
    }, 100);
  }

  /**
   * Pause playback at current time.
   */
  pause(): void {
    Tone.getTransport().pause();
    this.isPlaying_ = false;

    if (this.positionUpdateInterval !== null) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }

    Object.values(this.animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        anim.anim.paused = true;
      });
    });
  }

  /**
   * Internal helper: pause and disable all animations, reset to time 0.
   */
  private pauseAndDisableAll(): void {
    if (this.positionUpdateInterval !== null) {
      clearInterval(this.positionUpdateInterval);
      this.positionUpdateInterval = null;
    }

    Object.values(this.animationDict).forEach((animationList) => {
      animationList.forEach((anim) => {
        anim.anim.enabled = false;
        anim.anim.getMixer().setTime(0);
        anim.anim.paused = true;
      });
    });
  }

  /**
   * Seek to arbitrary time.
   * 
   * CRITICAL FRAGILITY: Three.js/Tone.js interaction when paused.
   * Uses anim.anim.time directly instead of getMixer().setTime() because
   * timeScale scaling breaks when paused (timeScale=0).
   * 
   * Disabling animations before seeking and re-enabling after prevents
   * the "door suddenly closing" bug when rewinding to a previously-completed
   * animation. This order matters - do not refactor without isolated testing.
   */
  seek(time: number): void {
    Tone.getTransport().seconds = time;

    this.pauseAndDisableAll();

    Object.entries(this.animationDict).forEach(([_, animationList]) => {
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
            anim.anim.time = anim.end - anim.start;
          } else if (anim.loop === THREE.LoopRepeat) {
            anim.anim.time = (time - anim.start) % (anim.end - anim.start);
          }
          break;
        }

        if (time >= anim.start && time < anim.end) {
          anim.anim.enabled = true;
          anim.anim.time = time - anim.start;
          break;
        }
      }
    });
  }

  /**
   * Stop (rewind to 0 and pause).
   */
  stop(): void {
    Tone.getTransport().seconds = 0.0;
    this.seek(0);
    this.isPlaying_ = false;
  }

  /**
   * Query playback state.
   */
  isPlaying(): boolean {
    return this.isPlaying_;
  }

  /**
   * Get current playback time in seconds.
   */
  currentTime(): number {
    return Tone.getTransport().seconds;
  }
}
