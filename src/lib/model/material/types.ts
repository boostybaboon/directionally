import * as THREE from 'three';

export enum MaterialType {
  MeshStandardMaterial,
}

export type MeshStandardMaterialData = {
  color: number;
}

export interface IPresentableMaterial {
  getMaterial(): THREE.Material;
} 