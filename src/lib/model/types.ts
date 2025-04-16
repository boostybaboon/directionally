import * as THREE from 'three';

export type JSONValue = string | number | boolean | { [key: string]: JSONValue } | JSONValue[];
export type JSONObject = { [key: string]: JSONValue };

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
};

export type IPresentableAsset = {
  getPresentableAsset(): Promise<[THREE.Object3D, THREE.AnimationClip[]]>;
}; 