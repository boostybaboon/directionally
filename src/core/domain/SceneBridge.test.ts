import { describe, it, expect } from 'vitest';
import { Production } from './Production';
import { Scene } from './Scene';
import { sceneToModel } from './SceneBridge';

describe('SceneBridge - SpeakAction', () => {
  it('converts a SpeakAction into a speechEntry on the Model', () => {
    const production = new Production('Test');
    const actor = production.addActor('Robot A', { type: 'gltf', url: '/robot.glb' });

    const scene = new Scene('Test Scene', { duration: 10 });
    scene.addAction({
      type: 'speak',
      actorId: actor.id,
      startTime: 2,
      text: 'Hello, world!',
    });

    const model = sceneToModel(scene, production.actors);

    expect(model.speechEntries).toHaveLength(1);
    expect(model.speechEntries[0].actorId).toBe(actor.id);
    expect(model.speechEntries[0].startTime).toBe(2);
    expect(model.speechEntries[0].text).toBe('Hello, world!');
    expect(model.speechEntries[0].voice).toBeUndefined();
  });

  it('preserves an explicit Kokoro voice ID on a per-line SpeakAction', () => {
    const production = new Production('Test');
    const actor = production.addActor('Robot B', { type: 'gltf', url: '/robot.glb' });

    const scene = new Scene('Test Scene', { duration: 10 });
    scene.addAction({
      type: 'speak',
      actorId: actor.id,
      startTime: 5,
      text: 'My name is Robot B.',
      voice: 'bm_george',
    });

    const model = sceneToModel(scene, production.actors);

    expect(model.speechEntries[0].voice).toBe('bm_george');
  });

  it('does not add SpeakActions to Model.actions (speech is not in the animation pipeline)', () => {
    const production = new Production('Test');
    const actor = production.addActor('Robot', { type: 'gltf', url: '/robot.glb' });

    const scene = new Scene('Test Scene', { duration: 10 });
    scene.addAction({ type: 'speak', actorId: actor.id, startTime: 0, text: 'Hi.' });
    scene.addAction({ type: 'speak', actorId: actor.id, startTime: 3, text: 'Bye.' });

    const model = sceneToModel(scene, production.actors);

    expect(model.speechEntries).toHaveLength(2);
    expect(model.actions).toHaveLength(0);
  });

  it('collects speech entries from multiple actors in order', () => {
    const production = new Production('Test');
    const actorA = production.addActor('Alpha', { type: 'gltf', url: '/robot.glb' });
    const actorB = production.addActor('Beta', { type: 'gltf', url: '/robot.glb' });

    const scene = new Scene('Test Scene', { duration: 20 });
    scene.addAction({ type: 'speak', actorId: actorA.id, startTime: 1, text: 'Line one.' });
    scene.addAction({ type: 'speak', actorId: actorB.id, startTime: 4, text: 'Line two.' });
    scene.addAction({ type: 'speak', actorId: actorA.id, startTime: 8, text: 'Line three.' });

    const model = sceneToModel(scene, production.actors);

    expect(model.speechEntries).toHaveLength(3);
    expect(model.speechEntries[0]).toMatchObject({ actorId: actorA.id, startTime: 1, text: 'Line one.' });
    expect(model.speechEntries[1]).toMatchObject({ actorId: actorB.id, startTime: 4, text: 'Line two.' });
    expect(model.speechEntries[2]).toMatchObject({ actorId: actorA.id, startTime: 8, text: 'Line three.' });
  });

  it('actor-level voice propagates to speech entries; per-line voice overrides it', () => {
    const production = new Production('Test');
    const actorA = production.addActor('Alpha', { type: 'gltf', url: '/robot.glb' }, { voice: 'af_heart' });
    const actorB = production.addActor('Beta',  { type: 'gltf', url: '/robot.glb' }, { voice: 'am_echo' });

    const scene = new Scene('Test Scene', { duration: 20 });
    scene.addAction({ type: 'speak', actorId: actorA.id, startTime: 1, text: 'Hello.' });
    scene.addAction({ type: 'speak', actorId: actorB.id, startTime: 4, text: 'Hi.' });
    // Per-line override with a different Kokoro voice
    scene.addAction({ type: 'speak', actorId: actorA.id, startTime: 8, text: 'Ahem.', voice: 'af_sky' });

    const model = sceneToModel(scene, production.actors);

    expect(model.speechEntries[0].voice).toBe('af_heart');
    expect(model.speechEntries[1].voice).toBe('am_echo');
    // Per-line override takes precedence over actor default
    expect(model.speechEntries[2].voice).toBe('af_sky');
  });

  it('scenes with no SpeakActions produce an empty speechEntries array', () => {
    const scene = new Scene('Empty Scene', { duration: 4 });
    const model = sceneToModel(scene, []);

    expect(model.speechEntries).toEqual([]);
  });
});
