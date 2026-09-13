import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { CartoonSketcher } from './CartoonSketcher.js';
import { SketcherDocument } from './SketcherDocument.js';
import { diffDraft, applyDraftCommand } from './applyDraft.js';
import type { PartDraft, SketcherDraft } from './types.js';

beforeAll(() => {
  vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => new THREE.Texture());
});

function part(id: string, overrides: Partial<PartDraft> = {}): PartDraft {
  return {
    id, kind: 'primitive', name: 'Box', position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], color: 0xffffff,
    ...overrides,
  };
}

function draft(parts: PartDraft[]): SketcherDraft {
  return { version: 2, parts, joints: [] };
}

describe('diffDraft', () => {
  it('detects adds, updates, and removals', () => {
    const d = diffDraft(
      draft([part('a'), part('b', { position: [1, 0, 0] })]),
      draft([part('a'), part('b', { position: [2, 0, 0] }), part('c')]),
    );
    expect(d.add.map((p) => p.id)).toEqual(['c']);
    expect(d.update.map((p) => p.id)).toEqual(['b']);
    expect(d.remove).toEqual([]);
  });

  it('treats unchanged parts as no-ops, tolerating float noise', () => {
    const d = diffDraft(
      draft([part('a', { quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] })]),
      draft([part('a', { quaternion: [0, Math.SQRT1_2 + 1e-9, 0, Math.SQRT1_2] })]),
    );
    expect(d.update).toEqual([]);
    expect(d.add).toEqual([]);
    expect(d.remove).toEqual([]);
  });

  it('flags a part absent from the target as a removal', () => {
    const d = diffDraft(draft([part('a'), part('b')]), draft([part('a')]));
    expect(d.remove).toEqual(['b']);
  });
});

describe('applyDraftCommand', () => {
  it('applies add/update as one undoable step', () => {
    const sketcher = new CartoonSketcher(new THREE.Scene(), new THREE.PerspectiveCamera());
    const doc = new SketcherDocument(sketcher);

    const seed = sketcher.insertPrimitive('Box')!;
    seed.mesh.position.set(0, 0.5, 0);
    const seedId = seed.id;

    const target = draft([
      part(seedId, { position: [5, 0.5, 0], color: seed.color }),
      part('new-box', { position: [1, 0.5, 0], color: seed.color }),
    ]);

    doc.execute(applyDraftCommand(sketcher, target));

    const parts = sketcher.getSession().parts;
    expect(parts).toHaveLength(2);
    expect(parts.find((p) => p.id === seedId)!.mesh.position.x).toBeCloseTo(5);
    expect(parts.some((p) => p.id !== seedId)).toBe(true);

    doc.undo();
    expect(sketcher.getSession().parts).toHaveLength(1);
    expect(sketcher.getSession().parts[0].id).toBe(seedId);
  });
});
