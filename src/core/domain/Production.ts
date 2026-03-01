import type { ActorAsset, ActorVoice } from './types.js';
import { Act } from './Act.js';

export type Actor = {
  id: string;
  name: string;
  asset: ActorAsset;
  /** Default voice for all this actor's lines. Can be overridden per SpeakAction. */
  voice?: ActorVoice;
};

export class Production {
  readonly title: string;
  readonly actors: Actor[] = [];
  readonly acts: Act[] = [];

  private nextActorIndex = 0;

  constructor(title: string) {
    this.title = title;
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

  addAct(name: string): Act {
    const act = new Act(name);
    this.acts.push(act);
    return act;
  }

  /** Convenience: look up an actor by id */
  getActor(id: string): Actor | undefined {
    return this.actors.find((a) => a.id === id);
  }
}
