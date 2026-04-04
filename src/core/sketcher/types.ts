import type * as THREE from 'three';

export type SketcherPart = {
  id: string;
  mesh: THREE.Mesh;
  depth: number;
  centroid: THREE.Vector3;
};

export type SketcherSession = {
  parts: SketcherPart[];
};
