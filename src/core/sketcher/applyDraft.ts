import type { Object3D } from 'three';
import type { CartoonSketcher } from './CartoonSketcher.js';
import type { SketcherCommand } from './SketcherCommand.js';
import { collectPartNodes } from './documentTree.js';
import type { PlacedPart, SetDocument } from './documentTree.js';
import type { Transform } from './transform.js';

/**
 * applyDraft — the app-side id-diff + apply step of an AI edit (ROADMAP_API.md
 * P0). The AI returns a whole new document; this diffs it against the live
 * session's document by stable part id and applies only what changed, as one
 * undoable command.
 *
 * v1 applies primitives only for *added* parts; unchanged sketch/lathe parts are
 * left untouched by the diff (same id + same data → no-op). Transforms are local
 * (relative to the parent group); the world→local conversion from the AI Draft
 * happens in `fromAIDraft` before this diff runs.
 */

export type DocumentDiff = {
  add: PlacedPart[];
  remove: string[];
  update: PlacedPart[];
};

const EPS = 1e-6;

function vecEquals(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > EPS) return false;
  return true;
}

function transformEquals(a: Transform, b: Transform): boolean {
  return vecEquals(a.position, b.position)
    && vecEquals(a.quaternion, b.quaternion)
    && vecEquals(a.scale, b.scale);
}

function partEquals(a: PlacedPart, b: PlacedPart): boolean {
  const ac = a.content;
  const bc = b.content;
  return ac.kind === bc.kind
    && ac.name === bc.name
    && (ac.label ?? null) === (bc.label ?? null)
    && ac.color === bc.color
    && transformEquals(a.transform, b.transform);
}

/** Every part leaf as a body + transform pair, in tree order. */
function placedParts(doc: SetDocument): PlacedPart[] {
  return collectPartNodes(doc).map((node) => ({ content: node.content, transform: node.transform }));
}

/** Diff two documents by stable part id. Pure — no Three.js runtime. */
export function diffDocument(current: SetDocument, target: SetDocument): DocumentDiff {
  const currentById = new Map(placedParts(current).map((p) => [p.content.id, p]));
  const targetById = new Map(placedParts(target).map((p) => [p.content.id, p]));
  const add: PlacedPart[] = [];
  const update: PlacedPart[] = [];
  const remove: string[] = [];

  for (const t of targetById.values()) {
    const c = currentById.get(t.content.id);
    if (!c) add.push(t);
    else if (!partEquals(c, t)) update.push(t);
  }
  for (const c of currentById.values()) {
    if (!targetById.has(c.content.id)) remove.push(c.content.id);
  }
  return { add, remove, update };
}

function setTransform(mesh: Object3D, t: Transform): void {
  mesh.position.set(t.position[0], t.position[1], t.position[2]);
  mesh.quaternion.set(t.quaternion[0], t.quaternion[1], t.quaternion[2], t.quaternion[3]);
  mesh.scale.set(t.scale[0], t.scale[1], t.scale[2]);
}

/**
 * Build a command that reconciles the live session with `target`. Execute it via
 * `SketcherDocument.execute()` so the whole AI turn is one undoable step.
 */
export function applyDocumentCommand(sketcher: CartoonSketcher, target: SetDocument): SketcherCommand {
  const diff = diffDocument(sketcher.toDocument(), target);
  return {
    label: `AI edit (${diff.add.length} add, ${diff.update.length} update, ${diff.remove.length} remove)`,
    execute() {
      for (const id of diff.remove) sketcher.removePart(id);

      for (const p of diff.update) {
        const part = sketcher.getSession().parts.find((x) => x.id === p.content.id);
        if (!part) continue;
        setTransform(part.mesh, p.transform);
        part.label = p.content.label;
        sketcher.setPartColor(p.content.id, p.content.color);
      }

      for (const p of diff.add) {
        if (p.content.kind !== 'primitive') continue; // sketch/lathe add deferred
        const part = sketcher.insertPrimitive(p.content.name);
        if (!part) continue;
        setTransform(part.mesh, p.transform);
        part.label = p.content.label;
        sketcher.setPartColor(part.id, p.content.color);
      }
    },
  };
}
