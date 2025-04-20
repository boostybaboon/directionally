import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';


type JSONValue = string | number | boolean | { [key: string]: JSONValue } | JSONValue[];

type JSONObject = { [key: string]: JSONValue };

export enum CameraType {
  PerspectiveCamera,
  // other camera types...
}

export abstract class CameraAsset {
  abstract get threeCamera(): THREE.Camera;
}

export class PerspectiveCameraAsset extends CameraAsset {
  private _threeCamera: THREE.PerspectiveCamera;
  private _position: THREE.Vector3;
  private _lookAt: THREE.Vector3;
  
  constructor(
    public readonly name: string,
    public fov: number,
    public aspect: number,
    public readonly near: number,
    public readonly far: number,
    position: THREE.Vector3,
    lookAt: THREE.Vector3
  ) {
    super();
    this._threeCamera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this._threeCamera.name = name;
    
    this._position = position.clone();
    this._lookAt = lookAt.clone();
    
    this._threeCamera.position.copy(this._position);
    this._threeCamera.lookAt(this._lookAt);
  }

  get threeCamera(): THREE.PerspectiveCamera {
    return this._threeCamera;
  }

  get position(): THREE.Vector3 {
    return this._position;
  }

  get lookAt(): THREE.Vector3 {
    return this._lookAt;
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeCamera.position.copy(position);
  }

  updateLookAt(lookAt: THREE.Vector3): void {
    this._lookAt.copy(lookAt);
    this._threeCamera.lookAt(lookAt);
  }

  updateFov(fov: number): void {
    this.fov = fov;
    this._threeCamera.fov = fov;
    this._threeCamera.updateProjectionMatrix();
  }

  updateAspect(aspect: number): void {
    this.aspect = aspect;
    this._threeCamera.aspect = aspect;
    this._threeCamera.updateProjectionMatrix();
  }
}

export enum AssetType {
  DirectionalLight,
  HemisphereLight,
  SpotLight,
  Mesh,
  Group,
  GLTF,
}

export type Asset = {
  type: AssetType;
  name: string;
  config: JSONObject;
  parent?: string;  // Optional name of parent asset
};

export type IPresentableAsset = {
  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]>;
  getParentName?(): string | undefined;  // Optional method to get parent name
}

export type DirectionalLightData = {
  color: number;
  intensity: number;
  position: [number, number, number];
}


export class DirectionalLightPresenter implements IPresentableAsset {
  name: string;
  config: DirectionalLightData;
  parent?: string;

  constructor(name: string, config: DirectionalLightData, parent?: string) {
    this.name = name;
    this.config = config;
    this.parent = parent;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const light = new THREE.DirectionalLight(this.config.color, this.config.intensity);
      light.position.set(...this.config.position);
      light.name = this.name;
      resolve([light, []]);
    });
  }

  getParentName(): string | undefined {
    return this.parent;
  }
}

export type HemisphereLightData = {
  skyColor: number;
  groundColor: number;
  intensity: number;
  position: [number, number, number];
}

export type SpotLightData = {
  color: number;
  intensity: number;
  position: [number, number, number];
  target: [number, number, number];
  angle: number;
  penumbra: number;
  decay: number;
}

export class HemisphereLightPresenter implements IPresentableAsset {
  name: string;
  config: HemisphereLightData;
  parent?: string;

  constructor(name: string, config: HemisphereLightData, parent?: string) {
    this.name = name;
    this.config = config;
    this.parent = parent;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const light = new THREE.HemisphereLight(this.config.skyColor, this.config.groundColor, this.config.intensity);
      light.position.set(...this.config.position);
      light.name = this.name;
      resolve([light, []]);
    });
  }  

  getParentName(): string | undefined {
    return this.parent;
  }
}

export class SpotLightPresenter implements IPresentableAsset {
  name: string;
  config: SpotLightData;
  parent?: string;

  constructor(name: string, config: SpotLightData, parent?: string) {
    this.name = name;
    this.config = config;
    this.parent = parent;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const light = new THREE.SpotLight(
        this.config.color,
        this.config.intensity,
        0, // distance (0 for infinite)
        this.config.angle,
        this.config.penumbra,
        this.config.decay
      );
      light.position.set(...this.config.position);
      light.target.position.set(...this.config.target);
      light.name = this.name;
      resolve([light, []]);
    });
  }

  getParentName(): string | undefined {
    return this.parent;
  }
}

export enum GeometryType {
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
}

export enum MaterialType {
  MeshStandardMaterial,
}

export type BoxGeometryData = {
  width: number;
  height: number;
  depth: number;
}

export type SphereGeometryData = {
  radius: number;
  widthSegments: number;
  heightSegments: number;
}

export type PlaneGeometryData = {
  width: number;
  height: number;   
}

export type MeshStandardMaterialData = {
  color: number;
}

export type MeshData = {
  geometryType: GeometryType;
  geometry: JSONObject;
  materialType: MaterialType;
  material: JSONObject;
  position: [number, number, number];
  //TODO - don't use euler angles
  rotation: [number, number, number];
}

export type GLTFData = {
  url: string;
  position: [number, number, number];
  rotation: [number, number, number];
}

export interface IPresentableGeometry {
  getGeometry(): THREE.BufferGeometry;
}

export class BoxGeometryPresenter implements IPresentableGeometry {
  config: BoxGeometryData;

  constructor(config: BoxGeometryData) {
    this.config = config;
  }

  getGeometry(): THREE.BufferGeometry {
    return new THREE.BoxGeometry(this.config.width, this.config.height, this.config.depth);
  }
}

export class SphereGeometryPresenter implements IPresentableGeometry {
  config: SphereGeometryData;

  constructor(config: SphereGeometryData) {
    this.config = config;
  }

  getGeometry(): THREE.BufferGeometry {
    return new THREE.SphereGeometry(
      this.config.radius,
      this.config.widthSegments,
      this.config.heightSegments
    );
  }
}

export class PlaneGeometryPresenter implements IPresentableGeometry {
  config: PlaneGeometryData;

  constructor(config: PlaneGeometryData) {
    this.config = config;
  }

  getGeometry(): THREE.BufferGeometry {
    return new THREE.PlaneGeometry(this.config.width, this.config.height);
  }
}

export interface IPresentableMaterial {
  getMaterial(): THREE.Material;
}

export class MeshStandardMaterialPresenter implements IPresentableMaterial {
  config: MeshStandardMaterialData;

  constructor(config: MeshStandardMaterialData) {
    this.config = config;
  }

  getMaterial(): THREE.Material {
    return new THREE.MeshStandardMaterial({ color: this.config.color });
  }
}

export const geometryPresenters: { [key: string]: new (data: any) => IPresentableGeometry } = {
  [GeometryType.BoxGeometry]: BoxGeometryPresenter,
  [GeometryType.SphereGeometry]: SphereGeometryPresenter,
  [GeometryType.PlaneGeometry]: PlaneGeometryPresenter,
  // Add other geometry types and their presenters here
};

export const materialPresenters: { [key: string]: new (data: any) => IPresentableMaterial } = {
  [MaterialType.MeshStandardMaterial]: MeshStandardMaterialPresenter,
  // Add other material types and their presenters here
};

export class MeshPresenter implements IPresentableAsset {
  name: string;
  config: MeshData;
  parent?: string;

  constructor(name: string, config: MeshData, parent?: string) {
    this.name = name;
    this.config = config;
    this.parent = parent;
  }

  getParentName(): string | undefined {
    return this.parent;
  }

  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    return new Promise((resolve) => {
      const geometryPresenterClass = geometryPresenters[this.config.geometryType];
      const geometryPresenter = new geometryPresenterClass(this.config.geometry);
      const geometry = geometryPresenter.getGeometry();

      const materialPresenterClass = materialPresenters[this.config.materialType];
      const materialPresenter = new materialPresenterClass(this.config.material);
      const material = materialPresenter.getMaterial();

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...this.config.position);
      mesh.rotation.set(...this.config.rotation);
      mesh.name = this.name;

      resolve([mesh, []]);
    });
  }
}

export class GTLFPresenter implements IPresentableAsset {
  name: string;
  config: GLTFData;
  parent?: string;

  constructor(name: string, config: GLTFData, parent?: string) {
    this.name = name;
    this.config = config;
    this.parent = parent;
  }

  async getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]> {
    const loader = new GLTFLoader();
    const model = new THREE.Object3D(); // Fallback to an empty Object3D
    
    try {
      const gltf = await loader.loadAsync(this.config.url);
      const model = gltf.scene;
      const animations = gltf.animations;
      model.name = this.name;
      model.position.set(...this.config.position);
      model.rotation.set(...this.config.rotation);
      return [model, animations];
    } catch (error) {
      console.error('Failed to load model:', error);
      return [new THREE.Object3D(), []]; // Fallback to an empty Object3D if the model fails to load
    }
  }

  getParentName(): string | undefined {
    return this.parent;
  }
}

export const assetPresenters: { [key: string]: new (name: string, data: any, parent?: string) => IPresentableAsset } = {
  [AssetType.DirectionalLight]: DirectionalLightPresenter,
  [AssetType.HemisphereLight]: HemisphereLightPresenter,
  [AssetType.SpotLight]: SpotLightPresenter,
  [AssetType.Mesh]: MeshPresenter,
  [AssetType.GLTF]: GTLFPresenter,
  // Add other asset types and their presenters here
};

export enum LoopStyle {
  LoopRepeat,
  LoopOnce,
  //LoopPingPong, TODO - implement this, but by reversing the KeyframeTrack data, not by using the THREE.LoopPingPong constant
  //as it's hard to correctly set a pingponged animation to time t and have it start correctly
}

export enum KeyframeTrackType {
  NumberKeyframeTrack,
  VectorKeyframeTrack,
  QuaternionKeyframeTrack,
}

export type NumberKeyframeTrackData = {
  property: string;
  times: number[];
  values: number[];
}

export type VectorKeyframeTrackData = {
  property: string;
  times: number[];
  values: number[];
}

export type QuaternionKeyframeTrackData = {
  property: string;
  times: number[];
  values: number[];
}

export type KeyframeTrackData = NumberKeyframeTrackData | VectorKeyframeTrackData | QuaternionKeyframeTrackData;

export interface IPresentableKeyframeTrack {
  getKeyframeTrack(): THREE.KeyframeTrack;
}

export class NumberKeyframeTrackPresenter implements IPresentableKeyframeTrack {
  config: NumberKeyframeTrackData;

  constructor(config: NumberKeyframeTrackData) {
    this.config = config;
  }

  getKeyframeTrack(): THREE.KeyframeTrack {
    return new THREE.NumberKeyframeTrack(this.config.property, this.config.times, this.config.values);
  }
}

export class VectorKeyframeTrackPresenter implements IPresentableKeyframeTrack {
  config: VectorKeyframeTrackData;

  constructor(config: VectorKeyframeTrackData) {
    this.config = config;
  }

  getKeyframeTrack(): THREE.KeyframeTrack {
    return new THREE.VectorKeyframeTrack(this.config.property, this.config.times, this.config.values);
  }
}

export class QuaternionKeyframeTrackPresenter implements IPresentableKeyframeTrack {
  config: QuaternionKeyframeTrackData;

  constructor(config: QuaternionKeyframeTrackData) {
    this.config = config;
  }

  getKeyframeTrack(): THREE.KeyframeTrack {
    return new THREE.QuaternionKeyframeTrack(this.config.property, this.config.times, this.config.values, THREE.InterpolateLinear);
  }
}

export const keyframeTrackPresenters: { [key: string]: new (data: any) => IPresentableKeyframeTrack } = {
  [KeyframeTrackType.NumberKeyframeTrack]: NumberKeyframeTrackPresenter,
  [KeyframeTrackType.VectorKeyframeTrack]: VectorKeyframeTrackPresenter,
  [KeyframeTrackType.QuaternionKeyframeTrack]: QuaternionKeyframeTrackPresenter,
  // Add other keyframe track types and their presenters here
};

export const loopStyles: { [key: string]: THREE.AnimationActionLoopStyles } = {
  [LoopStyle.LoopRepeat]: THREE.LoopRepeat,
  [LoopStyle.LoopOnce]: THREE.LoopOnce,
};

export enum ActionType {
  Keyframe,
  GLTF,
}

export type Action = {
  type: ActionType;
  name: string;
  target: string;
  config: JSONObject;
}

export type KeyframeActionData = {
  keyframeTrackType: KeyframeTrackType;
  keyframeTrackData: JSONObject;
  loop: LoopStyle;
  repetitions: number;
  clampWhenFinished: boolean;
  startTime: number;
}

export type GLTFActionData = {
  animationName: string;
  startTime: number;
}

export type AnimationDict = {
  [key: string]: {
    anim: THREE.AnimationAction;
    start: number;
    end: number;
    loop: THREE.AnimationActionLoopStyles;
    repetitions: number;
  }[];
};

export type IPresentableAction = {
  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void;
}

//this is all a bit confused - config is within the action later passed to addAction
//TODO sort out this confusion
//TODO in fact to handle the different key frame track types (number, vector, quaternion) 
//we further need to get the right presenter for the keyframe track type
export class KeyframeActionPresenter implements IPresentableAction {
  name: string;
  config: KeyframeActionData;

  constructor(name: string, config: KeyframeActionData) {
    this.name = name;
    this.config = config;
  }

  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void {
    const keyframeTrackPresenterClass = keyframeTrackPresenters[this.config.keyframeTrackType];
    const keyframeTrackPresenter = new keyframeTrackPresenterClass(this.config.keyframeTrackData);
    const keyframeTrack = keyframeTrackPresenter.getKeyframeTrack();

    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const clip = new THREE.AnimationClip(this.name, -1, [keyframeTrack]);
    const animAction = mixer.clipAction(clip);

    animAction.loop = loopStyles[this.config.loop];
    animAction.repetitions = this.config.repetitions;
    animAction.clampWhenFinished = this.config.clampWhenFinished;
    animAction.play();
    animAction.paused = true;

    const animationDictKey = target.name+'_'+this.config.keyframeTrackData.property;

    if (!animationDict[animationDictKey]) {
      animationDict[animationDictKey] = [];
    }

    animationDict[animationDictKey].push({
      anim: animAction,
      start: this.config.startTime,
      end: this.config.startTime + clip.duration,
      loop: loopStyles[this.config.loop],
      repetitions: this.config.repetitions,
    });
  }
}

export class GLTFActionPresenter implements IPresentableAction {
  name: string;
  config: GLTFActionData;

  constructor(name: string, config: GLTFActionData) {
    this.name = name;
    this.config = config;
  }

  addAction(
    animationDict: AnimationDict, 
    mixers: THREE.AnimationMixer[], 
    target: THREE.Object3D, 
    action: Action,
    meshAnimationClips: THREE.AnimationClip[],
  ): void {
    const mixer = new THREE.AnimationMixer(target);
    mixers.push(mixer);

    const clip = meshAnimationClips.find((meshClip) => meshClip.name === this.config.animationName);

    if (clip) {
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = false;
      action.play();

      const animationDictKey = target.name+'_'+this.config.animationName;

      if (!animationDict[animationDictKey]) {
        animationDict[animationDictKey] = [];
      }

      animationDict[animationDictKey].push({
        anim: action,
        //TODO - what to really do about start and end times given definition in the clip and the action model??
        start: this.config.startTime,
        end: clip.duration,
        loop: THREE.LoopRepeat,
        repetitions: Infinity
      });
    }
    else {
      console.error('Animation not found:', this.config.animationName);
    }
  }
}

export const actionPresenters: { [key: string]: new (name: string, data: any) => IPresentableAction } = {
  [ActionType.Keyframe]: KeyframeActionPresenter,
  [ActionType.GLTF]: GLTFActionPresenter,
  // Add other action types and their presenters here
};

export class Model {
  camera: CameraAsset;
  assets: Asset[];
  actions: Action[];
  backgroundColor?: number;

  constructor(camera: CameraAsset, sceneElements: Asset[], animations: Action[], backgroundColor?: number) {
    this.camera = camera;
    this.assets = sceneElements;
    this.actions = animations;
    this.backgroundColor = backgroundColor;
  }
}