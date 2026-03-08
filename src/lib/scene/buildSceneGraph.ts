import * as THREE from 'three';
import { PerspectiveCameraAsset } from '../model/Camera.js';
import type { Model } from '../Model.js';
import type { AnimationDict } from '../model/Action.js';

export type SceneGraphResult = {
  scene: THREE.Scene;
  /** Playback camera constructed from the Model's authored camera config. */
  camera: THREE.Camera;
  /**
   * The authored vFOV before aspect-ratio adaptation.
   * Stored separately because updateRendererSize() mutates camera.fov on every
   * resize — reading it back would return an already-adapted value, not the
   * authored one.
   */
  authoredFov: number;
  /** Per-actor animation entries, keyed by actor name. */
  animationDict: AnimationDict;
  /** One mixer per GLTF object (shared across all clips for that object). */
  mixers: THREE.AnimationMixer[];
  /** Animation clip names discovered from loaded GLTFs, keyed by object name (actor ID). */
  discoveredClips: Record<string, string[]>;
};

/**
 * Build a Three.js scene graph from a Model.
 *
 * Pure construction — no Tone.js, no TTS, no renderer references.
 * Both the playback canvas and the design canvas call this and receive the same
 * object graph; each canvas then points its own camera and renderer at it.
 *
 * Design-only overlays (gizmos, frustum helpers, path splines) are added to
 * layer 1 after this call returns. The playback camera renders layer 0 only;
 * the editor camera renders all layers.
 */
export async function buildSceneGraph(model: Model): Promise<SceneGraphResult> {
  const scene = new THREE.Scene();
  if (model.backgroundColor !== undefined) {
    scene.background = new THREE.Color(model.backgroundColor);
  }

  const camera = model.camera.threeCamera;
  let authoredFov = 50;
  if (model.camera instanceof PerspectiveCameraAsset) {
    authoredFov = model.camera.fov;
  }

  model.lights.forEach((light) => scene.add(light.threeObject));

  model.meshes.forEach((mesh) => {
    scene.add(mesh.threeMesh);
    if (mesh.parent) {
      const parentObject = scene.getObjectByName(mesh.parent);
      if (parentObject) {
        scene.remove(mesh.threeMesh);
        parentObject.add(mesh.threeMesh);
      } else {
        console.warn(`Parent object ${mesh.parent} not found for ${mesh.name}`);
      }
    }
  });

  // Clip lookup built during GLTF loading; used only to wire up actions below.
  const modelAnimationClips: { [key: string]: THREE.AnimationClip[] } = {};
  const discoveredClips: Record<string, string[]> = {};

  await Promise.all(
    model.gltfs.map(async (gltf) => {
      await gltf.load();
      scene.add(gltf.threeObject);
      modelAnimationClips[gltf.name] = gltf.animations;
      discoveredClips[gltf.name] = gltf.animations.map((a) => a.name);
      if (gltf.parent) {
        const parentObject = scene.getObjectByName(gltf.parent);
        if (parentObject) {
          scene.remove(gltf.threeObject);
          parentObject.add(gltf.threeObject);
        } else {
          console.warn(`Parent object ${gltf.parent} not found for ${gltf.name}`);
        }
      }
    }),
  );

  const animationDict: AnimationDict = {};
  const mixers: THREE.AnimationMixer[] = [];
  // Shared mixer map: all GLTF clips for the same actor use one mixer so they
  // can be crossfaded.
  const actorMixerMap = new Map<string, THREE.AnimationMixer>();

  model.actions.forEach((action) => {
    let sceneObject = scene.getObjectByName(action.target);
    if (!sceneObject) {
      if (action.target === camera.name) {
        sceneObject = camera;
      } else {
        console.error(`Could not find object with name ${action.target}`);
        return;
      }
    }
    action.addAction(
      animationDict,
      mixers,
      sceneObject,
      modelAnimationClips[action.target],
      actorMixerMap,
    );
  });

  return { scene, camera, authoredFov, animationDict, mixers, discoveredClips };
}
