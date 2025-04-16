import * as THREE from 'three';

export enum GeometryType {
  BoxGeometry,
  SphereGeometry,
  PlaneGeometry,
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

export interface IPresentableGeometry {
  getGeometry(): THREE.BufferGeometry;
} 