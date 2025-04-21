import * as THREE from 'three';

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