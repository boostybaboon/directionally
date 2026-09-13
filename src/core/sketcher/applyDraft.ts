import type { Object3D } from 'three';
import type { CartoonSketcher } from './CartoonSketcher.js';
import type { SketcherCommand } from './SketcherCommand.js';
import type { PartDraft, SketcherDraft } from './types.js';

/**
 * applyDraft — the app-side id-diff + apply step of an AI edit (ROADMAP_API.md
 * P0). The AI returns a whole new draft; this diffs it against the live session
 * by stable part id and applies only what changed, as one undoable command.
 *
 * v1 applies primitives only for *added* parts; unchanged sketch/lathe parts are
 * left untouched by the diff (same id + same data → no-op). Transforms are set as
 * world-space local values, correct for ungrouped parts (group-aware world→local
 * conversion is a follow-up alongside the group/node-model work).
 */

export type DraftDiff = {
  add: PartDraft[];
  remove: string[];
  update: PartDraft[];
};

const EPS = 1e-6;

function vecEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return false;
  return true;
}

function partEquals(a: PartDraft, b: PartDraft): boolean {
  return a.kind === b.kind
    && a.name === b.name
    && (a.label ?? null) === (b.label ?? null)
    && a.color === b.color
    && vecEquals(a.position, b.position)
    && vecEquals(a.quaternion, b.quaternion)
    && vecEquals(a.scale, b.scale);
}

/** Diff two drafts by stable part id. Pure — no Three.js runtime. */
export function diffDraft(current: SketcherDraft, target: SketcherDraft): DraftDiff {
  const currentById = new Map(current.parts.map((p) => [p.id, p]));
  const targetById = new Map(target.parts.map((p) => [p.id, p]));
  const add: PartDraft[] = [];
  const update: PartDraft[] = [];
  const remove: string[] = [];

  for (const t of target.parts) {
    const c = currentById.get(t.id);
    if (!c) add.push(t);
    else if (!partEquals(c, t)) update.push(t);
  }
  for (const c of current.parts) {
    if (!targetById.has(c.id)) remove.push(c.id);
  }
  return { add, remove, update };
}

function setTransform(mesh: Object3D, p: PartDraft): void {
  mesh.position.set(p.position[0], p.position[1], p.position[2]);
  mesh.quaternion.set(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3]);
  mesh.scale.set(p.scale[0], p.scale[1], p.scale[2]);
}

/**
 * Build a command that reconciles the live session with `target`. Execute it via
 * `SketcherDocument.execute()` so the whole AI turn is one undoable step.
 */
export function applyDraftCommand(sketcher: CartoonSketcher, target: SketcherDraft): SketcherCommand {
  const diff = diffDraft(sketcher.toDraft(), target);
  return {
    label: `AI edit (${diff.add.length} add, ${diff.update.length} update, ${diff.remove.length} remove)`,
    execute() {
      for (const id of diff.remove) sketcher.removePart(id);

      for (const p of diff.update) {
        const part = sketcher.getSession().parts.find((x) => x.id === p.id);
        if (!part) continue;
        setTransform(part.mesh, p);
        part.label = p.label;
        sketcher.setPartColor(p.id, p.color);
      }

      for (const p of diff.add) {
        if (p.kind !== 'primitive') continue; // sketch/lathe add deferred
        const part = sketcher.insertPrimitive(p.name);
        if (!part) continue;
        setTransform(part.mesh, p);
        part.label = p.label;
        sketcher.setPartColor(part.id, p.color);
      }
    },
  };
}
