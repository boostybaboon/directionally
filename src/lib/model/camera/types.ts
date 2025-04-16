import * as THREE from 'three';
import type { JSONObject } from '../types';

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
  near: number;
  far: number;
  position: [number, number, number];
  lookAt: [number, number, number];
}

export interface IPresentableCamera {
  getPresentableCamera(aspect?: number): THREE.Camera;
} 