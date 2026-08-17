import { describe, it, expect } from 'vitest';
import { tokenizeScript } from './sigilScript.js';
import { compileScriptDocument } from './fountainCompiler.js';
import { storedSceneToModel } from '../storage/storedSceneToModel.js';

/**
 * SCR-3 integration: one sigil buffer with multiple `#` scene breaks flows
 * through tokenize → compile → storedSceneToModel into per-scene Models with
 * disjoint cast subsets and independent set resolution — no DOM required.
 */
describe('multi-scene pipeline (SCR-3)', () => {
  const text = [
    '#INT STAGE DAY',
    '',
    '@ALPHA',
    'Hi.',
    '',
    '#EXT PARK NIGHT',
    '',
    '@BETA',
    'Bye.',
  ].join('\n');

  it('yields per-scene models with disjoint casts', () => {
    const { doc, sceneStartLines } = tokenizeScript(text);
    expect(doc.scenes).toHaveLength(2);
    expect(sceneStartLines).toEqual([1, 6]);

    const compiled = compileScriptDocument(doc);
    const scene0 = storedSceneToModel(compiled.scenes[0].scene, compiled.actors);
    const scene1 = storedSceneToModel(compiled.scenes[1].scene, compiled.actors);

    expect(compiled.actors.map((a) => a.role)).toEqual(['ALPHA', 'BETA']);
    expect(scene0.gltfs.map((g) => g.name)).toEqual([compiled.actors[0].id]);
    expect(scene1.gltfs.map((g) => g.name)).toEqual([compiled.actors[1].id]);
    expect(scene0.speechEntries.map((s) => s.actorId)).toEqual([compiled.actors[0].id]);
    expect(scene1.speechEntries.map((s) => s.actorId)).toEqual([compiled.actors[1].id]);
  });

  it('resolves each scene\'s setting independently', () => {
    const { doc } = tokenizeScript([
      '#INT STAGE DECK DAY',
      '',
      '@ALPHA',
      'Hi.',
      '',
      '#EXT PARK NIGHT',
      '',
      '@BETA',
      'Bye.',
    ].join('\n'));

    const compiled = compileScriptDocument(doc);

    expect(compiled.scenes[0].scene.set[0].name).toBe('stage-deck');
    expect(compiled.scenes[0].scene.placeholderSetting).toBeUndefined();
    expect(compiled.scenes[1].scene.set[0].name).toBe('placeholder-room');
    expect(compiled.scenes[1].scene.placeholderSetting).toBe('PARK');
  });
});
