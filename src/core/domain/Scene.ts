import type {
  Vec3,
  CameraConfig,
  LightConfig,
  SetPiece,
  StagedActor,
  SceneAction,
} from './types.js';

export type SceneOptions = {
  duration: number;
  backgroundColor?: number;
  environmentMap?: string;
};

export class Scene {
  readonly name: string;
  readonly duration: number;
  readonly backgroundColor?: number;
  readonly environmentMap?: string;

  camera: CameraConfig = { position: [0, 2, 8], lookAt: [0, 0, 0] };
  readonly lights: LightConfig[] = [];
  readonly set: SetPiece[] = [];
  readonly stagedActors: StagedActor[] = [];
  readonly actions: SceneAction[] = [];

  constructor(name: string, options: SceneOptions) {
    this.name = name;
    this.duration = options.duration;
    this.backgroundColor = options.backgroundColor;
    this.environmentMap = options.environmentMap;
  }

  setCamera(config: CameraConfig): this {
    this.camera = config;
    return this;
  }

  addLight(config: LightConfig): this {
    this.lights.push(config);
    return this;
  }

  addSetPiece(piece: SetPiece): this {
    this.set.push(piece);
    return this;
  }

  /**
   * Stage an actor for this scene (bring them into the cast).
   * Provide startPosition to place them immediately; omit or set offstage:true to keep off-screen.
   */
  stage(actorId: string, options?: Omit<StagedActor, 'actorId'>): this {
    this.stagedActors.push({ actorId, ...options });
    return this;
  }

  addAction(action: SceneAction): this {
    this.actions.push(action);
    return this;
  }
}
