import { Scene, type SceneOptions } from './Scene.js';

/**
 * A named container in the production tree. Groups can nest arbitrarily:
 *   production.addGroup('Act 1').addGroup('Scene i').addScene(...)
 * A production with no need for grouping can call production.addScene() directly.
 * Playback order is depth-first over all descendant leaf Scenes.
 */
export class Group {
  readonly name: string;
  readonly children: Array<Group | Scene> = [];

  constructor(name: string) {
    this.name = name;
  }

  addGroup(name: string): Group {
    const group = new Group(name);
    this.children.push(group);
    return group;
  }

  addScene(name: string, options: SceneOptions): Scene {
    const scene = new Scene(name, options);
    this.children.push(scene);
    return scene;
  }

  /** Depth-first ordered list of all leaf Scenes under this group. */
  getScenes(): Scene[] {
    const scenes: Scene[] = [];
    for (const child of this.children) {
      if (child instanceof Scene) {
        scenes.push(child);
      } else {
        scenes.push(...child.getScenes());
      }
    }
    return scenes;
  }
}
