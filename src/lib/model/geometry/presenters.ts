import * as THREE from 'three';
import type { IPresentableGeometry, BoxGeometryData, SphereGeometryData, PlaneGeometryData } from './types';
import { GeometryType } from './types';

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

export const geometryPresenters: { [key: string]: new (data: any) => IPresentableGeometry } = {
  [GeometryType.BoxGeometry]: BoxGeometryPresenter,
  [GeometryType.SphereGeometry]: SphereGeometryPresenter,
  [GeometryType.PlaneGeometry]: PlaneGeometryPresenter,
  // Add other geometry types and their presenters here
}; 