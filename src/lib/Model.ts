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
    public readonly near: number,
    public readonly far: number,
    position: THREE.Vector3,
    lookAt: THREE.Vector3
  ) {
    super();
    this._threeCamera = new THREE.PerspectiveCamera(fov, 1, near, far); // Default aspect of 1
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
}

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
};

export abstract class LightAsset {
  abstract get threeLight(): THREE.Light;
}

export class DirectionalLightAsset extends LightAsset {
  private _threeLight: THREE.DirectionalLight;
  private _position: THREE.Vector3;
  
  constructor(
    public readonly name: string,
    public color: number,
    public intensity: number,
    position: THREE.Vector3
  ) {
    super();
    this._threeLight = new THREE.DirectionalLight(color, intensity);
    this._threeLight.name = name;
    
    this._position = position.clone();
    this._threeLight.position.copy(this._position);
  }

  get threeLight(): THREE.DirectionalLight {
    return this._threeLight;
  }

  get position(): THREE.Vector3 {
    return this._position;
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeLight.position.copy(position);
  }

  updateColor(color: number): void {
    this.color = color;
    this._threeLight.color.setHex(color);
  }

  updateIntensity(intensity: number): void {
    this.intensity = intensity;
    this._threeLight.intensity = intensity;
  }
}

export class HemisphereLightAsset extends LightAsset {
  private _threeLight: THREE.HemisphereLight;
  private _position: THREE.Vector3;
  
  constructor(
    public readonly name: string,
    public skyColor: number,
    public groundColor: number,
    public intensity: number,
    position: THREE.Vector3
  ) {
    super();
    this._threeLight = new THREE.HemisphereLight(skyColor, groundColor, intensity);
    this._threeLight.name = name;
    
    this._position = position.clone();
    this._threeLight.position.copy(this._position);
  }

  get threeLight(): THREE.HemisphereLight {
    return this._threeLight;
  }

  get position(): THREE.Vector3 {
    return this._position;
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeLight.position.copy(position);
  }

  updateSkyColor(color: number): void {
    this.skyColor = color;
    this._threeLight.color.setHex(color);
  }

  updateGroundColor(color: number): void {
    this.groundColor = color;
    this._threeLight.groundColor.setHex(color);
  }

  updateIntensity(intensity: number): void {
    this.intensity = intensity;
    this._threeLight.intensity = intensity;
  }
}

export class SpotLightAsset extends LightAsset {
  private _threeLight: THREE.SpotLight;
  private _position: THREE.Vector3;
  private _target: THREE.Vector3;
  
  constructor(
    public readonly name: string,
    public color: number,
    public intensity: number,
    public angle: number,
    public penumbra: number,
    public decay: number,
    position: THREE.Vector3,
    target: THREE.Vector3
  ) {
    super();
    this._threeLight = new THREE.SpotLight(
      color,
      intensity,
      0, // distance (0 for infinite)
      angle,
      penumbra,
      decay
    );
    this._threeLight.name = name;
    
    this._position = position.clone();
    this._target = target.clone();
    
    this._threeLight.position.copy(this._position);
    this._threeLight.target.position.copy(this._target);
  }

  get threeLight(): THREE.SpotLight {
    return this._threeLight;
  }

  get position(): THREE.Vector3 {
    return this._position;
  }

  get target(): THREE.Vector3 {
    return this._target;
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeLight.position.copy(position);
  }

  updateTarget(target: THREE.Vector3): void {
    this._target.copy(target);
    this._threeLight.target.position.copy(target);
  }

  updateColor(color: number): void {
    this.color = color;
    this._threeLight.color.setHex(color);
  }

  updateIntensity(intensity: number): void {
    this.intensity = intensity;
    this._threeLight.intensity = intensity;
  }

  updateAngle(angle: number): void {
    this.angle = angle;
    this._threeLight.angle = angle;
  }

  updatePenumbra(penumbra: number): void {
    this.penumbra = penumbra;
    this._threeLight.penumbra = penumbra;
  }

  updateDecay(decay: number): void {
    this.decay = decay;
    this._threeLight.decay = decay;
  }
}

export class Model {
  camera: CameraAsset;
  meshes: MeshAsset[];
  gltfs: GLTFAsset[];
  actions: Action[];
  lights: LightAsset[];
  backgroundColor?: number;

  constructor(
    camera: CameraAsset, 
    meshes: MeshAsset[] = [],
    gltfs: GLTFAsset[] = [],
    actions: Action[] = [], 
    lights: LightAsset[] = [],
    backgroundColor?: number
  ) {
    this.camera = camera;
    this.meshes = meshes;
    this.gltfs = gltfs;
    this.actions = actions;
    this.lights = lights;
    this.backgroundColor = backgroundColor;
  }
}

export abstract class GeometryAsset {
    abstract get threeGeometry(): THREE.BufferGeometry;
}

export class BoxGeometryAsset extends GeometryAsset {
    private _threeGeometry: THREE.BoxGeometry;
    
    constructor(
        public readonly width: number,
        public readonly height: number,
        public readonly depth: number
    ) {
        super();
        this._threeGeometry = new THREE.BoxGeometry(width, height, depth);
    }

    get threeGeometry(): THREE.BoxGeometry {
        return this._threeGeometry;
    }
}

export class SphereGeometryAsset extends GeometryAsset {
    private _threeGeometry: THREE.SphereGeometry;
    
    constructor(
        public readonly radius: number,
        public readonly widthSegments: number = 32,
        public readonly heightSegments: number = 32
    ) {
        super();
        this._threeGeometry = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
    }

    get threeGeometry(): THREE.SphereGeometry {
        return this._threeGeometry;
    }
}

export class PlaneGeometryAsset extends GeometryAsset {
    private _threeGeometry: THREE.PlaneGeometry;
    
    constructor(
        public readonly width: number,
        public readonly height: number
    ) {
        super();
        this._threeGeometry = new THREE.PlaneGeometry(width, height);
    }

    get threeGeometry(): THREE.PlaneGeometry {
        return this._threeGeometry;
    }
}

export abstract class MaterialAsset {
    abstract get threeMaterial(): THREE.Material;
}

export class MeshStandardMaterialAsset extends MaterialAsset {
    private _threeMaterial: THREE.MeshStandardMaterial;
    
    constructor(
        public readonly color: number,
        public readonly emissive?: number,
        public readonly metalness?: number,
        public readonly roughness?: number
    ) {
        super();
        this._threeMaterial = new THREE.MeshStandardMaterial();
        this._threeMaterial.color.setHex(color);
        
        if (emissive !== undefined) {
            this._threeMaterial.emissive.setHex(emissive);
        }
        if (metalness !== undefined) {
            this._threeMaterial.metalness = metalness;
        }
        if (roughness !== undefined) {
            this._threeMaterial.roughness = roughness;
        }
    }

    get threeMaterial(): THREE.MeshStandardMaterial {
        return this._threeMaterial;
    }
}

export class MeshAsset {
    private _threeMesh: THREE.Mesh;
    private _position: THREE.Vector3;
    private _rotation: THREE.Euler;
    private _parent?: string;
    
    constructor(
        public readonly name: string,
        geometry: GeometryAsset,
        material: MaterialAsset,
        position: THREE.Vector3,
        rotation: THREE.Euler,
        parent?: string
    ) {
        this._threeMesh = new THREE.Mesh(geometry.threeGeometry, material.threeMaterial);
        this._threeMesh.name = name;
        
        this._position = position.clone();
        this._rotation = rotation.clone();
        
        this._threeMesh.position.copy(this._position);
        this._threeMesh.rotation.copy(this._rotation);
        
        this._parent = parent;
    }

    get threeMesh(): THREE.Mesh {
        return this._threeMesh;
    }

    get position(): THREE.Vector3 {
        return this._position;
    }

    get rotation(): THREE.Euler {
        return this._rotation;
    }

    get parent(): string | undefined {
        return this._parent;
    }

    updatePosition(position: THREE.Vector3): void {
        this._position.copy(position);
        this._threeMesh.position.copy(position);
    }

    updateRotation(rotation: THREE.Euler): void {
        this._rotation.copy(rotation);
        this._threeMesh.rotation.copy(rotation);
    }
}

export class GLTFAsset {
  private _threeObject: THREE.Object3D;
  private _animations: THREE.AnimationClip[];
  private _position: THREE.Vector3;
  private _rotation: THREE.Euler;
  private _parent?: string;
  
  constructor(
    public readonly name: string,
    public readonly url: string,
    position: THREE.Vector3,
    rotation: THREE.Euler,
    parent?: string
  ) {
    this._threeObject = new THREE.Object3D();
    this._threeObject.name = name;
    this._animations = [];
    this._position = position.clone();
    this._rotation = rotation.clone();
    this._parent = parent;
    
    this._threeObject.position.copy(this._position);
    this._threeObject.rotation.copy(this._rotation);
  }

  get threeObject(): THREE.Object3D {
    return this._threeObject;
  }

  get animations(): THREE.AnimationClip[] {
    return this._animations;
  }

  get position(): THREE.Vector3 {
    return this._position;
  }

  get rotation(): THREE.Euler {
    return this._rotation;
  }

  get parent(): string | undefined {
    return this._parent;
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    try {
      const gltf = await loader.loadAsync(this.url);
      this._threeObject = gltf.scene;
      this._animations = gltf.animations;
      this._threeObject.name = this.name;
      this._threeObject.position.copy(this._position);
      this._threeObject.rotation.copy(this._rotation);
    } catch (error) {
      console.error('Failed to load GLTF model:', error);
      // Keep the fallback empty Object3D
    }
  }

  updatePosition(position: THREE.Vector3): void {
    this._position.copy(position);
    this._threeObject.position.copy(position);
  }

  updateRotation(rotation: THREE.Euler): void {
    this._rotation.copy(rotation);
    this._threeObject.rotation.copy(rotation);
  }
}