import { describe, it, expect } from 'vitest';
import { buildWorkflow1 } from './buildWorkflow1';
import { getScenes } from '../storage/types';
import type { StoredProduction, StoredGroup, NamedScene } from '../storage/types';
import type { ActorBlock, SpeakAction } from '../domain/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function isGroup(node: StoredGroup | NamedScene): node is StoredGroup {
  return (node as StoredGroup).type === 'group';
}

/** Minimal blank production matching what ProductionStore.create() produces. */
function freshProduction(): StoredProduction {
  return {
    id: 'test',
    name: 'The Robot Play',
    createdAt: 1000,
    modifiedAt: 1000,
    actors: [],
    tree: [],
    activeSceneId: undefined,
    script: [],
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Workflow 1 — happy path integration', () => {
  it('builds the production without throwing', () => {
    expect(() => buildWorkflow1(freshProduction())).not.toThrow();
  });

  it('Part B: 2 actors, Alpha and Beta, Robot Expressive', () => {
    const result = buildWorkflow1(freshProduction());
    expect(result.actors).toHaveLength(2);
    expect(result.actors!.map(a => a.role)).toEqual(['Alpha', 'Beta']);
    expect(result.actors!.every(a => a.catalogueId === 'robot-expressive')).toBe(true);
  });

  it('Part C: 5 scenes in DFS order', () => {
    const result = buildWorkflow1(freshProduction());
    const names = getScenes(result.tree ?? []).map(s => s.name);
    expect(names).toEqual(['Prologue', 'The Encounter', 'The Chase', 'The Confrontation', 'Resolution']);
  });

  it('Part C: root has one top-level scene (Prologue) and two act groups', () => {
    const result = buildWorkflow1(freshProduction());
    const tree = result.tree ?? [];
    const groups = tree.filter(isGroup) as StoredGroup[];
    const rootScenes = tree.filter(n => !isGroup(n)) as NamedScene[];
    expect(rootScenes).toHaveLength(1);
    expect(rootScenes[0].name).toBe('Prologue');
    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe('Act 1');
    expect(groups[1].name).toBe('Act 2');
  });

  it('Part C: Act 1 holds The Encounter then The Chase', () => {
    const result = buildWorkflow1(freshProduction());
    const act1 = (result.tree ?? []).find(n => isGroup(n) && (n as StoredGroup).name === 'Act 1') as StoredGroup;
    expect(act1.children.map(c => (c as NamedScene).name)).toEqual(['The Encounter', 'The Chase']);
  });

  it('Part C: Act 2 holds The Confrontation then Resolution', () => {
    const result = buildWorkflow1(freshProduction());
    const act2 = (result.tree ?? []).find(n => isGroup(n) && (n as StoredGroup).name === 'Act 2') as StoredGroup;
    expect(act2.children.map(c => (c as NamedScene).name)).toEqual(['The Confrontation', 'Resolution']);
  });

  it('Parts D-F: every scene has both actors staged', () => {
    const result = buildWorkflow1(freshProduction());
    for (const ns of getScenes(result.tree ?? [])) {
      expect(ns.scene.stagedActors).toHaveLength(2);
    }
  });

  it('Parts D-F: every scene has at least 2 speak actions', () => {
    const result = buildWorkflow1(freshProduction());
    for (const ns of getScenes(result.tree ?? [])) {
      const speaks = ns.scene.actions.filter(a => a.type === 'speak');
      expect(speaks.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('Parts D-F: every scene has a non-zero computed duration', () => {
    const result = buildWorkflow1(freshProduction());
    for (const ns of getScenes(result.tree ?? [])) {
      expect(ns.scene.duration).toBeGreaterThan(0);
    }
  });

  it('Part D: Prologue opens with Alpha greeting Beta', () => {
    const result = buildWorkflow1(freshProduction());
    const prologue = getScenes(result.tree ?? []).find(ns => ns.name === 'Prologue')!;
    const speaks = prologue.scene.actions.filter(a => a.type === 'speak') as SpeakAction[];
    expect(speaks[0].text).toBe('Beta, we meet at last.');
    expect(speaks[1].text).toBe('Indeed, Alpha. I have been waiting.');
  });

  it('Part F: The Confrontation has 3 speak actions', () => {
    const result = buildWorkflow1(freshProduction());
    const confrontation = getScenes(result.tree ?? []).find(ns => ns.name === 'The Confrontation')!;
    const speaks = confrontation.scene.actions.filter(a => a.type === 'speak');
    expect(speaks).toHaveLength(3);
  });

  it('Part E step 36: The Encounter has an Alpha walking block from t=0 to t=2', () => {
    const result = buildWorkflow1(freshProduction());
    const encounter = getScenes(result.tree ?? []).find(ns => ns.name === 'The Encounter')!;
    const blocks = (encounter.scene.blocks ?? []).filter(b => b.type === 'actorBlock') as ActorBlock[];
    expect(blocks).toHaveLength(1);
    const block = blocks[0];
    expect(block.clip).toBe('Walking');
    expect(block.startTime).toBe(0);
    expect(block.endTime).toBe(2);
    expect(block.startPosition).toEqual([-2, 0, 2]);
    expect(block.endPosition).toEqual([0, 0, 2]);
  });
});
