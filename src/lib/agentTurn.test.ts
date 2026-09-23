import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from '../core/sketcher/CartoonSketcher.js';
import { SketcherDocument } from '../core/sketcher/SketcherDocument.js';
import { AI_CONVENTION, toAIDraft } from '../core/sketcher/aiDraft.js';
import type { AIDraft } from '../core/sketcher/aiDraft.js';
import { summariseDiff, isEmptyDiff, planEditTurn, applyEditTurn } from './agentTurn.js';
import type { DocumentDiff } from '../core/sketcher/applyDraft.js';

const EMPTY_DIFF: DocumentDiff = {
  add: [], remove: [], update: [], addRefs: [], removeRefs: [], moveRefs: [],
  groups: { create: [], dissolve: [], join: [], leave: [] },
  lights: { add: [], remove: [], update: [] },
  overrideRefs: [],
  orderChanged: false,
};

function session() {
  const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
  const document = new SketcherDocument(sketcher);
  return { sketcher, document };
}

describe('summariseDiff', () => {
  it('says nothing changed when nothing changed', () => {
    expect(summariseDiff(EMPTY_DIFF)).toEqual([]);
    expect(isEmptyDiff(EMPTY_DIFF)).toBe(true);
  });

  it('names what arrives and counts what moves', () => {
    const diff: DocumentDiff = {
      ...EMPTY_DIFF,
      add: [
        { content: { id: 'a', kind: 'primitive', name: 'Box', label: 'Desk', color: 0 }, transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
        { content: { id: 'b', kind: 'primitive', name: 'Box', label: 'Chair', color: 0 }, transform: { position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } },
      ],
      moveRefs: [{ id: 'lamp', transform: { position: [1, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] } }],
      groups: { create: [{ name: 'row', members: ['a', 'b'] }], dissolve: [], join: [], leave: [] },
      lights: { add: [], remove: [], update: [{ type: 'point', id: 'key', color: 0, intensity: 5, position: [0, 2, 0] }] },
      overrideRefs: [{ id: 'chair-1', overrides: [{ path: 'seat', op: 'remove' }] }],
      environment: { id: 'interior-night' },
    };

    expect(summariseDiff(diff)).toEqual([
      'Add Desk, Chair',
      'Move 1 instance',
      'Change the dressing on 1 instance',
      'Group 2 nodes as "row"',
      'Change the light key',
      'Set the environment to interior-night',
    ]);
    expect(isEmptyDiff(diff)).toBe(false);
  });
});

describe('an AI turn', () => {
  it('plans the diff without touching the session', async () => {
    const { sketcher } = session();
    const box = sketcher.insertPrimitive('Box')!;
    // A primitive rests on the floor, so the resting height is the box's own, not zero.
    const restingY = sketcher.getSession().parts[0].mesh.position.y;

    const plan = await planEditTurn(sketcher, 'raise the box', [], async () => {
      const { aiDraft } = toAIDraft(sketcher.toDocument());
      return {
        ...aiDraft,
        parts: [{ ...aiDraft.parts[0], position: [0, 3, 0] as [number, number, number] }],
      };
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.turn.summary.length).toBeGreaterThan(0);
    // Planning is a read: the session is exactly as it was, and the box has not moved.
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].mesh.position.y).toBeCloseTo(restingY);
    expect(box.id).toBe(sketcher.getSession().parts[0].id);
  });

  it('applies an accepted turn as one undoable step', async () => {
    const { sketcher, document } = session();
    sketcher.insertPrimitive('Box');
    const before = document.canUndo;

    const plan = await planEditTurn(sketcher, 'add a second box', [], async () => {
      const { aiDraft } = toAIDraft(sketcher.toDocument());
      return {
        ...aiDraft,
        parts: [
          aiDraft.parts[0],
          { id: 'extra', name: 'Extra', kind: 'primitive', shape: 'box', size: [1, 1, 1], position: [2, 0.5, 0], rotation: [0, 0, 0], color: 0xffffff },
        ],
      } as AIDraft;
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    document.execute(applyEditTurn(sketcher, plan.turn));

    expect(sketcher.getSession().parts).toHaveLength(2);
    document.undo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(before).toBe(false);
  });

  it('lands a scene-sized answer where the model put it, through the path the panel uses', async () => {
    const { sketcher, document } = session();
    const names = ['Floor', 'Back Wall', 'Counter', 'Sink', 'Stove', 'Fridge', 'Table'];
    const answer = {
      convention: AI_CONVENTION,
      parts: names.map((name, i) => ({
        id: `k${i}`, name, kind: 'primitive' as const,
        position: [i * 2, 0.5, 0] as [number, number, number],
        rotation: [0, 0, 0] as [number, number, number],
        color: 0xccbbaa,
      })),
    };

    const plan = await planEditTurn(sketcher, 'build a kitchen', [], async () => answer as AIDraft);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.turn.summary[0]).toContain('Floor');

    document.execute(applyEditTurn(sketcher, plan.turn));

    // What the person approved is what they get: seven parts, each where the draft put it. Group
    // membership is asserted in the diff suite, where a member's local position is the group's
    // business rather than the placement's.
    expect(sketcher.getSession().parts.map((p) => p.mesh.position.x))
      .toEqual([0, 2, 4, 6, 8, 10, 12]);
  });

  it('reports a failed turn instead of throwing, so the panel has something to show', async () => {
    const { sketcher } = session();

    const plan = await planEditTurn(sketcher, 'do something', [], async () => {
      throw new Error('No DEEPSEEK_API_KEY configured on the server.');
    });

    expect(plan).toEqual({ ok: false, error: 'No DEEPSEEK_API_KEY configured on the server.' });
  });

  it('reads the session with the convention the grammar expects', async () => {
    const { sketcher } = session();
    sketcher.insertPrimitive('Sphere');
    let sent: unknown;

    await planEditTurn(sketcher, 'anything', [], async (draft) => {
      sent = draft;
      return draft;
    });

    expect((sent as AIDraft).convention).toBe(AI_CONVENTION);
    expect((sent as AIDraft).parts).toHaveLength(1);
  });
});
