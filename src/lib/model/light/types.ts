import * as THREE from 'three';

export type DirectionalLightData = {
  color: number;
  intensity: number;
  position: [number, number, number];
}

export type HemisphereLightData = {
  skyColor: number;
  groundColor: number;
  intensity: number;
  position: [number, number, number];
} 