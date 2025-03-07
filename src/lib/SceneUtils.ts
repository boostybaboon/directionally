import * as THREE from 'three';
import type { Camera, Asset, Action } from './Model';

export class SceneUtils {
  static createCamera(cameraConfig: any): THREE.PerspectiveCamera {
    const camera = new THREE.PerspectiveCamera(
      cameraConfig.fov,
      cameraConfig.aspect,
      cameraConfig.near,
      cameraConfig.far
    );
    // camera.position.set(...cameraConfig.position);
    // camera.lookAt(...cameraConfig.lookAt);
    return camera;
  }

  static addAsset(scene: THREE.Scene, asset: Asset): void {
    let obj;
    switch (asset.type) {
      case 'DirectionalLight':
        obj = new THREE.DirectionalLight(asset.color, asset.intensity);
        //obj.position.set(...asset.position);
        break;
      case 'HemisphereLight':
        obj = new THREE.HemisphereLight(asset.skyColor, asset.groundColor, asset.intensity);
        //obj.position.set(...asset.position);
        break;
      case 'BoxGeometry':
        const geometry = new THREE.BoxGeometry(asset.width, asset.height, asset.depth);
        const material = new THREE.MeshStandardMaterial(asset.material);
        obj = new THREE.Mesh(geometry, material);
        //obj.position.set(...asset.position);
        if (asset.parent) {
          const parent = scene.getObjectByName(asset.parent);
          //parent.add(obj);
        } else {
          scene.add(obj);
        }
        break;
      case 'Object3D':
        obj = new THREE.Object3D();
        obj.name = asset.name;
        //obj.position.set(...asset.position);
        scene.add(obj);
        break;
      // Add more cases as needed
    }
    if (!asset.parent) {
      //scene.add(obj);
    }
  }

  static addAction(
    animationDict: { [key: string]: { anim: THREE.AnimationAction; start: number; end: number }[] },
    mixers: THREE.AnimationMixer[],
    action: Action
  ): void {
    // const target = action.target === 'camera' ? camera : scene.getObjectByName(action.target);
    // const track = new THREE.KeyframeTrack(action.property, action.times, action.values);
    // const clip = new THREE.AnimationClip(action.name, -1, [track]);
    // const mixer = new THREE.AnimationMixer(target);
    // const animAction = mixer.clipAction(clip).setLoop(action.loop, 1);
    // animAction.clampWhenFinished = action.clampWhenFinished;
    // animAction.play();
    // animAction.paused = true;
    // mixers.push(mixer);
    // animationDict[action.name] = [{ anim: animAction, start: action.times[0], end: action.times[action.times.length - 1] }];
  }
}