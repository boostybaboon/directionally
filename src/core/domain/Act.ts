import { Scene, type SceneOptions } from './Scene.js';

export class Act {
  readonly name: string;
  readonly scenes: Scene[] = [];

  constructor(name: string) {
    this.name = name;
  }

  addScene(name: string, options: SceneOptions): Scene {
    const scene = new Scene(name, options);
    this.scenes.push(scene);
    return scene;
  }
}
