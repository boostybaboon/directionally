import * as THREE from 'three';

type JSONValue = string | number | boolean | { [key: string]: JSONValue } | JSONValue[];

type JSONObject = { [key: string]: JSONValue };

export enum CameraType {
  PerspectiveCamera,
  // other camera types...
}

export type Camera = {
  type: CameraType;
  name: string;
  config: JSONObject;
}

export type PerspectiveCameraData = {
  fov: number;
  aspect: number; 
  near: number;
  far: number;
  position: [number, number, number];
  lookAt: [number, number, number];
}

interface IPresentableCamera {
  getPresentableCamera(): THREE.Camera;
}

export class PerspectiveCameraPresenter implements IPresentableCamera {
  name: string;
  config: PerspectiveCameraData;

  constructor(name: string, config: PerspectiveCameraData) {
    this.name = name;
    this.config = config;
  }

  getPresentableCamera(): THREE.Camera {
    const camera = new THREE.PerspectiveCamera(
      this.config.fov,
      this.config.aspect,
      this.config.near,
      this.config.far
    );
    camera.name = this.name;
    camera.position.set(...this.config.position);
    camera.lookAt(...this.config.lookAt);

    return camera;
  }
}

export const cameraPresenters: { [key: string]: new (name: string, data: any) => IPresentableCamera } = {
  [CameraType.PerspectiveCamera]: PerspectiveCameraPresenter,
  // Add other camera types and their presenters here
};

export enum AssetType {
  DirectionalLight,
  HemisphereLight,
  SpotLight,
  Mesh,
  Group,
}

export type Asset = {
  type: AssetType;
  name: string;
  config: JSONObject;
};

export type IPresentableAsset = {
  getPresentableAsset(): THREE.Object3D;
}

export type DirectionalLightData = {
  color: number;
  intensity: number;
  position: [number, number, number];
}


export class DirectionalLightPresenter implements IPresentableAsset {
  name: string;
  config: DirectionalLightData;

  constructor(name: string, config: DirectionalLightData) {
    this.name = name;
    this.config = config;
  }

  getPresentableAsset(): THREE.Object3D {
    const light = new THREE.DirectionalLight(this.config.color, this.config.intensity);
    light.position.set(...this.config.position);
    light.name = this.name;
    return light;
  }
}

export type HemisphereLightData = {
  skyColor: number;
  groundColor: number;
  intensity: number;
  position: [number, number, number];
}

export class HemisphereLightPresenter implements IPresentableAsset {
  name: string;
  config: HemisphereLightData;

  constructor(name: string, config: HemisphereLightData) {
    this.name = name;
    this.config = config;
  }

  getPresentableAsset(): THREE.Object3D {
    const light = new THREE.HemisphereLight(this.config.skyColor, this.config.groundColor, this.config.intensity);
    light.position.set(...this.config.position);
    light.name = this.name;
    return light;
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

  constructor(name: string, config: MeshData) {
    this.name = name;
    this.config = config;
  }

  getPresentableAsset(): THREE.Object3D {
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

    return mesh;
  }
}

export const assetPresenters: { [key: string]: new (name: string, data: any) => IPresentableAsset } = {
  [AssetType.DirectionalLight]: DirectionalLightPresenter,
  [AssetType.HemisphereLight]: HemisphereLightPresenter,
  [AssetType.Mesh]: MeshPresenter,
  // Add other asset types and their presenters here
};

export enum LoopStyles {
  LoopRepeat,
  LoopOnce,
  LoopPingPong,
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
    console.log(this.config);
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
    return new THREE.QuaternionKeyframeTrack(this.config.property, this.config.times, this.config.values);
  }
}

export const keyframeTrackPresenters: { [key: string]: new (data: any) => IPresentableKeyframeTrack } = {
  [KeyframeTrackType.NumberKeyframeTrack]: NumberKeyframeTrackPresenter,
  [KeyframeTrackType.VectorKeyframeTrack]: VectorKeyframeTrackPresenter,
  [KeyframeTrackType.QuaternionKeyframeTrack]: QuaternionKeyframeTrackPresenter,
  // Add other keyframe track types and their presenters here
};

export const loopStyles: { [key: string]: THREE.AnimationActionLoopStyles } = {
  [LoopStyles.LoopRepeat]: THREE.LoopRepeat,
  [LoopStyles.LoopOnce]: THREE.LoopOnce,
  [LoopStyles.LoopPingPong]: THREE.LoopPingPong,
};

export type Action = {
  name: string;
  target: string;
  keyframeTrackType: KeyframeTrackType;
  keyframeTrackData: KeyframeTrackData;
  loop: LoopStyles;
  clampWhenFinished: boolean;
};

export class Model {
  camera: Camera;
  assets: Asset[];
  actions: Action[];

  constructor(camera: Camera, sceneElements: Asset[], animations: Action[]) {
    this.camera = camera;
    this.assets = sceneElements;
    this.actions = animations;
  }
}