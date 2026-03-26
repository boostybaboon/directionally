import type { ActorAsset, ActorVoice, Vec3 } from './types.js';
import { Group } from './Group.js';
import type { Scene, SceneOptions } from './Scene.js';

export type Actor = {
  id: string;
  name: string;
  asset: ActorAsset;
  /** Default voice for all this actor's lines. Can be overridden per SpeakAction. */
  voice?: ActorVoice;
  /**
   * Euler XYZ rotation (radians) applied to the model when no authored startRotation
   * exists. Corrects models whose forward axis differs from +Z. Also baked into every
   * computed facing-track quaternion so direction-of-travel is accurate.
   */
  defaultRotation?: Vec3;
  /** Emissive tint as a 24-bit RGB integer. Applied to cloned materials after load. */
  tint?: number;
};

export class Production {
  readonly title: string;
  readonly actors: Actor[] = [];

  /** Root of the production tree. Authors interact via addGroup/addScene shortcuts. */
  readonly root: Group;

  private nextActorIndex = 0;

  constructor(title: string) {
    this.title = title;
    this.root = new Group(title);
  }

  /**
   * Register an actor at the production level.
   * Actors are reused across scenes; the returned Actor carries an id for referencing in scenes.
   */
  addActor(name: string, asset: ActorAsset, options?: { voice?: ActorVoice }): Actor {
    const id = `actor_${this.nextActorIndex++}_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const actor: Actor = { id, name, asset, voice: options?.voice };
    this.actors.push(actor);
    return actor;
  }

  /** Add a named group (act, episode, section…) directly under the root. */
  addGroup(name: string): Group {
    return this.root.addGroup(name);
  }

  /** Add a scene directly under the root (no grouping needed). */
  addScene(name: string, options: SceneOptions): Scene {
    return this.root.addScene(name, options);
  }

  /** Depth-first ordered list of all leaf Scenes across the whole production. */
  getScenes(): Scene[] {
    return this.root.getScenes();
  }

  /** Convenience: look up an actor by id. */
  getActor(id: string): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }
}
