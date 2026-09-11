import { describe, it, expect } from 'vitest';
import { renderFountain, createDefaultScriptDocument } from './fountain';
import { compileScriptDocument, resolveSetting } from './fountainCompiler';
import type { ScriptDocument, Beat, ActionBeat, StageSide, StageMark } from './fountain';
import type { CatalogueEntry } from '../catalogue/types.js';

// ── Programmatic fixture builders ────────────────────────────────────────────

function buildDoc(scenes: ScriptDocument['scenes'], cast: string[]): ScriptDocument {
  return { scenes, cast, diagnostics: [] };
}

function act(character: string, verb: ActionBeat['verb'], opts: { side?: StageSide; target?: StageMark; seconds?: number } = {}): ActionBeat {
  return { type: 'action', character, verb, ...opts };
}

function say(character: string, text: string): Beat {
  return { type: 'dialogue', character, text };
}

function scene(heading: string, beats: Beat[]): ScriptDocument['scenes'][0] {
  return { heading, beats };
}

function sceneWithSetting(setting: string, beats: Beat[] = [say('Robot', 'Hi.')]): ScriptDocument['scenes'][0] {
  return { heading: `INT. ${setting} - DAY`, interior: true, setting, timeOfDay: 'DAY', beats };
}

function allBlocks(result: ReturnType<typeof compileScriptDocument>) {
  return (result.scenes[0]?.scene?.blocks ?? []);
}

function actorBlocks(result: ReturnType<typeof compileScriptDocument>) {
  return allBlocks(result).filter((b) => b.type === 'actorBlock');
}

function speakActions(result: ReturnType<typeof compileScriptDocument>) {
  return result.scenes[0].scene.actions.filter((a) => a.type === 'speak');
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('compileScriptDocument', () => {
  it('produces exactly two actors from the default example', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    expect(result.actors).toHaveLength(2);
    expect(result.actors[0].role).toBe('ALPHA');
    expect(result.actors[1].role).toBe('BETA');
  });

  it('produces one scene from the default example', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    expect(result.scenes).toHaveLength(1);
    expect(result.scenes[0].name).toContain('INT. STAGE');
  });

  it('generates enter blocks for both actors', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    const blocks = actorBlocks(result);
    // ALPHA: enter + move. BETA: enter.
    expect(blocks).toHaveLength(3);

    const alphaId = result.actors[0].id;
    const betaId = result.actors[1].id;
    const alphaBlocks = blocks.filter((b) => b.actorId === alphaId);
    const betaBlocks = blocks.filter((b) => b.actorId === betaId);

    expect(alphaBlocks).toHaveLength(2); // enter + move
    expect(betaBlocks).toHaveLength(1);  // enter
  });

  it('generates speak actions from dialogue', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    const speaks = speakActions(result);
    expect(speaks).toHaveLength(2);
  });

  it('handles a pure-action scene with zero dialogue', () => {
    const doc = buildDoc([
      scene('INT. CORRIDOR - NIGHT', [
        act('REN', 'enter', { side: 'left' }),
        act('REN', 'move', { target: 'center' }),
        act('REN', 'hold', { seconds: 3.0 }),
        act('REN', 'exit', { side: 'right' }),
      ]),
    ], ['REN']);

    const result = compileScriptDocument(doc);

    expect(result.actors).toHaveLength(1);
    expect(result.actors[0].role).toBe('REN');
    expect(actorBlocks(result)).toHaveLength(4); // enter + move + hold + exit
    expect(speakActions(result)).toHaveLength(0);
  });

  it('handles a dialogue-heavy scene', () => {
    const doc = buildDoc([
      scene('INT. FLAT - EVENING', [
        act('CASS', 'enter', { side: 'left' }),
        act('JO', 'enter', { side: 'right' }),
        say('CASS', 'You kept the piano.'),
        say('JO', 'Didn\'t have anywhere else.'),
        act('CASS', 'move', { target: 'center' }),
        act('JO', 'hold', { seconds: 2.0 }),
      ]),
    ], ['CASS', 'JO']);

    const result = compileScriptDocument(doc);

    expect(result.actors).toHaveLength(2);
    expect(speakActions(result)).toHaveLength(2);

    const cassBlocks = actorBlocks(result).filter((b) => b.actorId === result.actors[0].id);
    const joBlocks = actorBlocks(result).filter((b) => b.actorId === result.actors[1].id);

    expect(cassBlocks).toHaveLength(2); // enter + move
    expect(joBlocks).toHaveLength(2);   // enter + hold
  });

  it('stages actors offstage when their first beat is enter', () => {
    const doc = createDefaultScriptDocument();
    const result = compileScriptDocument(doc);

    const staged = result.scenes[0].scene.stagedActors;
    // Both ALPHA and BETA start offstage (first beat is enter)
    for (const s of staged) {
      const pos = s.startPosition!;
      // Offstage positions are at x <= -2.76 (left offstage) or x >= +2.76 (right offstage)
      expect(pos[0] < -2.5 || pos[0] > 2.5).toBe(true);
    }
  });

  it('renderFountain produces readable text from structured data', () => {
    const doc = createDefaultScriptDocument();
    const text = renderFountain(doc);

    expect(text).toContain('INT. STAGE - DAY');
    expect(text).toContain('ALPHA');
    expect(text).toContain('enters from stage left');
    expect(text).toContain('BETA');
    expect(text).toContain('enters from stage right');
    expect(text).toContain('We start here.');
    expect(text).toContain('moves to center');
    expect(text).toContain('Copy that.');
  });

  it('renderFountain is deterministic', () => {
    const doc = createDefaultScriptDocument();
    const a = renderFountain(doc);
    const b = renderFountain(doc);
    expect(a).toBe(b);
  });

  it('applies human-scale from catalogue to all staged actors', () => {
    // Cast names must match a real catalogue label ("Robot") to resolve to the
    // scaled-down bundled entry — an unresolved name falls back to the
    // generic-human placeholder (defaultScale 1), so use cast names that
    // actually match the catalogue for this scaling-specific assertion.
    const doc = buildDoc([
      scene('INT. STAGE - DAY', [
        act('Robot', 'enter', { side: 'left' }),
        act('Robot2', 'enter', { side: 'right' }),
      ]),
    ], ['Robot', 'Robot2']);
    const result = compileScriptDocument(doc);

    const robotActor = result.actors.find((a) => a.role === 'Robot')!;
    const staged = result.scenes[0].scene.stagedActors.find((s) => s.actorId === robotActor.id)!;
    expect(staged.startScale).toBeDefined();
    expect(staged.startScale![0]).toBeLessThan(1); // robot should be scaled down
    expect(staged.startScale![0]).toBeGreaterThan(0.1);
  });


  it('resolves a cast name matching a bundled catalogue label (case-insensitive)', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('robot', 'Beep.')])], ['robot']);
    const result = compileScriptDocument(doc);

    expect(result.actors[0].catalogueId).toBe('robot-expressive');
    expect(result.actors[0].placeholder).toBeUndefined();
    expect(result.diagnostics.some((d) => d.level === 'info')).toBe(false);
  });

  it('falls back to the generic-human placeholder for an unresolved cast name', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('BOB', 'Hi.')])], ['BOB']);
    const result = compileScriptDocument(doc);

    expect(result.actors[0].catalogueId).toBe('generic-human');
    expect(result.actors[0].placeholder).toBe(true);
    expect(result.diagnostics.some((d) => d.level === 'info' && d.message.includes('BOB'))).toBe(true);
  });

  it('resolves two cast members distinctly — one real, one placeholder', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [
      say('Robot', 'Beep.'),
      say('BOB', 'Hi.'),
    ])], ['Robot', 'BOB']);
    const result = compileScriptDocument(doc);

    const robotActor = result.actors.find((a) => a.role === 'Robot')!;
    const bobActor = result.actors.find((a) => a.role === 'BOB')!;
    expect(robotActor.placeholder).toBeUndefined();
    expect(bobActor.placeholder).toBe(true);
    expect(robotActor.catalogueId).not.toBe(bobActor.catalogueId);
  });

  it('resolves against user-authored (OPFS) catalogue entries when provided', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('Custom Hero', 'Hi.')])], ['Custom Hero']);
    const userEntry = {
      kind: 'character' as const,
      id: 'user-custom-hero',
      label: 'Custom Hero',
      gltfPath: '/opfs/blob-url',
    };
    const result = compileScriptDocument(doc, [userEntry]);

    expect(result.actors[0].catalogueId).toBe('user-custom-hero');
    expect(result.actors[0].placeholder).toBeUndefined();
  });

  it('resolves a setting matching a bundled set-piece label to the real geometry', () => {
    const doc = buildDoc([sceneWithSetting('Stage Deck')], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.set).toHaveLength(1);
    expect(result.scenes[0].scene.set[0].name).toBe('stage-deck');
    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
    expect(result.diagnostics.some((d) => d.message.includes('placeholder room'))).toBe(false);
  });

  it('resolves a setting case-insensitively', () => {
    const doc = buildDoc([sceneWithSetting('stage deck')], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.set[0].name).toBe('stage-deck');
  });

  it('falls back to a labelled placeholder room for an unmatched setting', () => {
    const doc = buildDoc([sceneWithSetting('CLASSROOM')], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.set).toHaveLength(1);
    expect(result.scenes[0].scene.set[0].name).toBe('placeholder-room');
    expect(result.scenes[0].scene.placeholderSetting).toBe('CLASSROOM');
    expect(result.diagnostics.some((d) => d.level === 'info' && d.message.includes('CLASSROOM'))).toBe(true);
  });

  it('resolves a user-authored (OPFS) set-piece entry with an opfs:// gltfPath', () => {
    const doc = buildDoc([sceneWithSetting('Classroom')], ['Robot']);
    const userEntry: CatalogueEntry = {
      kind: 'set-piece',
      id: 'user-classroom',
      label: 'Classroom',
      gltfPath: 'blob:http://localhost/abc',
      geometry: { type: 'box', width: 1, height: 1, depth: 1 },
      material: { color: 0xffffff },
    };
    const result = compileScriptDocument(doc, [userEntry]);

    expect(result.scenes[0].scene.set[0].name).toBe('user-classroom');
    expect(result.scenes[0].scene.set[0].gltfPath).toBe('opfs://user-classroom');
    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
  });

  it('applies environment and lights from a saved setting set-piece entry', () => {
    const doc = buildDoc([sceneWithSetting('Classroom')], ['Robot']);
    const userEntry: CatalogueEntry = {
      kind: 'set-piece',
      id: 'user-classroom-setting',
      label: 'Classroom',
      compose: [
        { geometry: { type: 'box', width: 1, height: 1, depth: 1 }, material: { color: 0xffffff } },
      ],
      environmentId: 'exterior-sky',
      lights: [{ type: 'hemisphere', id: 'sky', skyColor: 0xffffff, groundColor: 0x444444, intensity: 1 }],
    };
    const result = compileScriptDocument(doc, [userEntry]);

    expect(result.scenes[0].scene.environmentMap).toBe('exterior-sky');
    expect(result.scenes[0].scene.lights).toHaveLength(1);
    expect(result.scenes[0].scene.set.length).toBeGreaterThan(0);
    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
  });

  it('resolves a setting matching an environment label to the environment map', () => {
    const doc = buildDoc([sceneWithSetting('Studio (neutral)')], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.environmentMap).toBe('studio-neutral');
    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
  });

  it('flattens a composite set-piece entry into multiple pieces', () => {
    const doc = buildDoc([sceneWithSetting('Chair')], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
    expect(result.scenes[0].scene.set.length).toBeGreaterThan(1);
  });

  it('does not emit a setting diagnostic when the heading has no setting', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('Robot', 'Beep.')])], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
    expect(result.diagnostics.some((d) => d.message.includes('placeholder room'))).toBe(false);
  });

  it('uses the resolved character\'s walk clip for locomotion beats', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [act('Robot', 'enter', { side: 'left' })])], ['Robot']);
    const result = compileScriptDocument(doc);

    expect(actorBlocks(result)[0].clip).toBe('Walking');
  });

  it('uses the procedural humanoid walk clip for placeholder characters', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [act('ALPHA', 'enter', { side: 'left' })])], ['ALPHA']);
    const result = compileScriptDocument(doc);

    expect(actorBlocks(result)[0].clip).toBe('walk');
  });

  it('falls back to the humanoid walk clip for user entries without walkAnimation', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [act('Custom Hero', 'enter', { side: 'left' })])], ['Custom Hero']);
    const userEntry: CatalogueEntry = {
      kind: 'character',
      id: 'user-custom-hero',
      label: 'Custom Hero',
      gltfPath: '/opfs/blob-url',
    };
    const result = compileScriptDocument(doc, [userEntry]);

    expect(actorBlocks(result)[0].clip).toBe('walk');
  });

  it('compiles multiple scenes with per-scene cast subsets (SCR-3)', () => {
    const doc = buildDoc([
      sceneWithSetting('STAGE', [say('ALPHA', 'Hi.')]),
      sceneWithSetting('PARK', [say('BETA', 'Bye.')]),
    ], ['ALPHA', 'BETA']);
    const result = compileScriptDocument(doc);

    expect(result.scenes).toHaveLength(2);
    expect(result.actors.map((a) => a.role)).toEqual(['ALPHA', 'BETA']);

    const alpha = result.actors.find((a) => a.role === 'ALPHA')!;
    const beta = result.actors.find((a) => a.role === 'BETA')!;
    expect(result.scenes[0].scene.stagedActors.map((s) => s.actorId)).toEqual([alpha.id]);
    expect(result.scenes[1].scene.stagedActors.map((s) => s.actorId)).toEqual([beta.id]);
  });

  it('resolves each scene\'s setting independently (SCR-3)', () => {
    const doc = buildDoc([
      sceneWithSetting('Stage Deck', [say('ALPHA', 'Hi.')]),
      sceneWithSetting('PARK', [say('BETA', 'Bye.')]),
    ], ['ALPHA', 'BETA']);
    const result = compileScriptDocument(doc);

    expect(result.scenes[0].scene.set[0].name).toBe('stage-deck');
    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
    expect(result.scenes[1].scene.set[0].name).toBe('placeholder-room');
    expect(result.scenes[1].scene.placeholderSetting).toBe('PARK');
  });

  it('a cast binding overrides label-match resolution (CAT-3)', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('BOB', 'Hi.')])], ['BOB']);
    const result = compileScriptDocument(doc, [], { cast: { BOB: 'robot-expressive' } });

    expect(result.actors[0].catalogueId).toBe('robot-expressive');
    expect(result.actors[0].placeholder).toBeUndefined();
    expect(result.diagnostics.some((d) => d.kind === 'unresolved-cast')).toBe(false);
  });

  it('a setting binding overrides label-match resolution (CAT-3)', () => {
    const doc = buildDoc([sceneWithSetting('CLASSROOM', [say('Robot', 'Hi.')])], ['Robot']);
    const result = compileScriptDocument(doc, [], { setting: { CLASSROOM: 'stage-deck' } });

    expect(result.scenes[0].scene.set[0].name).toBe('stage-deck');
    expect(result.scenes[0].scene.placeholderSetting).toBeUndefined();
  });

  it('diagnostics carry structured kind + name for unresolved cast names (CAT-4)', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('BOB', 'Hi.')])], ['BOB']);
    const result = compileScriptDocument(doc);

    const castDiag = result.diagnostics.find((d) => d.kind === 'unresolved-cast');
    expect(castDiag).toBeDefined();
    expect(castDiag?.name).toBe('BOB');
  });

  it('diagnostics carry structured kind + name for unresolved settings (CAT-4)', () => {
    const doc = buildDoc([sceneWithSetting('CLASSROOM', [say('Robot', 'Hi.')])], ['Robot']);
    const result = compileScriptDocument(doc);

    const settingDiag = result.diagnostics.find((d) => d.kind === 'unresolved-setting');
    expect(settingDiag).toBeDefined();
    expect(settingDiag?.name).toBe('CLASSROOM');
  });
});

describe('resolveSetting (ambiguity + binding)', () => {
  const userGarden = (id: string, addedAt: number): CatalogueEntry & { userAdded: true; addedAt: number } => ({
    kind: 'set-piece',
    id,
    label: 'GARDEN',
    geometry: { type: 'box', width: 1, height: 1, depth: 1 },
    material: { color: 0x11aa22 },
    userAdded: true as const,
    addedAt,
  });

  it('surfaces ambiguity instead of silently picking the most recent duplicate', () => {
    const older = userGarden('garden-old', 1000);
    const newer = userGarden('garden-new', 2000);
    const resolved = resolveSetting('GARDEN', [older, newer]);
    expect(resolved.kind).toBe('placeholder');
    if (resolved.kind === 'placeholder') expect(resolved.sameLabel).toBe(2);
  });

  it('a unique match resolves and reports a single label match', () => {
    const resolved = resolveSetting('GARDEN', [userGarden('garden-only', 1000)]);
    expect(resolved.kind).toBe('set-piece');
    if (resolved.kind === 'set-piece') {
      expect(resolved.entry.id).toBe('garden-only');
      expect(resolved.sameLabel).toBe(1);
    }
  });

  it('an explicit binding still overrides ambiguity', () => {
    const older = userGarden('garden-old', 1000);
    const newer = userGarden('garden-new', 2000);
    const resolved = resolveSetting('GARDEN', [older, newer], { GARDEN: 'garden-old' });
    expect(resolved.kind).toBe('set-piece');
    if (resolved.kind === 'set-piece') {
      expect(resolved.entry.id).toBe('garden-old');
      expect(resolved.bound).toBe(true);
    }
  });
});

describe('compileScriptDocument (ambiguity + auto-bind)', () => {
  const character = (id: string, label: string): CatalogueEntry => ({
    kind: 'character',
    id,
    label,
    gltfPath: `/models/gltf/${id}.glb`,
  });
  const setPiece = (id: string, label: string): CatalogueEntry => ({
    kind: 'set-piece',
    id,
    label,
    geometry: { type: 'box', width: 1, height: 1, depth: 1 },
    material: { color: 0x11aa22 },
  });

  it('ambiguous cast name yields an ambiguous-cast diagnostic and no auto-bind', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('BOB', 'Hi.')])], ['BOB']);
    const result = compileScriptDocument(doc, [character('bob-a', 'BOB'), character('bob-b', 'BOB')]);
    expect(result.diagnostics.some((d) => d.kind === 'ambiguous-cast' && d.name === 'BOB')).toBe(true);
    expect(result.resolvedBindings.cast.BOB).toBeUndefined();
  });

  it('unique cast label match auto-binds and produces no ambiguity diagnostic', () => {
    const doc = buildDoc([scene('INT. STAGE - DAY', [say('BOB', 'Hi.')])], ['BOB']);
    const result = compileScriptDocument(doc, [character('bob-id', 'BOB')]);
    expect(result.actors[0].catalogueId).toBe('bob-id');
    expect(result.actors[0].placeholder).toBeUndefined();
    expect(result.resolvedBindings.cast.BOB).toBe('bob-id');
    expect(result.diagnostics.some((d) => d.kind === 'ambiguous-cast')).toBe(false);
  });

  it('ambiguous setting name yields an ambiguous-setting diagnostic and no auto-bind', () => {
    const doc = buildDoc([sceneWithSetting('GARDEN', [say('Robot', 'Hi.')])], ['Robot']);
    const result = compileScriptDocument(doc, [setPiece('garden-a', 'GARDEN'), setPiece('garden-b', 'GARDEN')]);
    expect(result.diagnostics.some((d) => d.kind === 'ambiguous-setting' && d.name === 'GARDEN')).toBe(true);
    expect(result.resolvedBindings.setting.GARDEN).toBeUndefined();
  });

  it('unique setting label match auto-binds', () => {
    const doc = buildDoc([sceneWithSetting('GARDEN', [say('Robot', 'Hi.')])], ['Robot']);
    const result = compileScriptDocument(doc, [setPiece('garden-id', 'GARDEN')]);
    expect(result.scenes[0].scene.set[0].name).toBe('garden-id');
    expect(result.resolvedBindings.setting.GARDEN).toBe('garden-id');
  });
});

