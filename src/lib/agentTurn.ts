import { describeSession } from '../core/agent/api.js';
import { fromAIDraft } from '../core/sketcher/aiDraft.js';
import type { AIDraft } from '../core/sketcher/aiDraft.js';
import { applyDraftCommand, diffDocument } from '../core/sketcher/applyDraft.js';
import type { DocumentDiff } from '../core/sketcher/applyDraft.js';
import type { CartoonSketcher } from '../core/sketcher/CartoonSketcher.js';
import { requestDraftEdit } from './agentClient.js';

/**
 * One AI turn, from the instruction to the diff it would apply — before it applies anything.
 *
 * The loop's shape is deliberate: the model answers with a whole draft, and the app diffs it against
 * the live session. That diff is the thing a person can be shown and can refuse, and applying it
 * through `SketcherDocument.execute()` is what makes the accepted turn a single undoable step.
 */
export type EditTurn = {
  instruction: string;
  /** The draft the model answered with — what applying the turn replays. */
  draft: AIDraft;
  /** The handle-to-identity map read before the turn, so parts it left alone stay the same parts. */
  idMap: Record<string, string>;
  diff: DocumentDiff;
  /** The diff in words: what the person is being asked to accept. */
  summary: string[];
};

export type EditTurnPlan =
  | { ok: true; turn: EditTurn }
  | { ok: false; error: string };

/** Keep a summary line short: three names, then a count. */
function namesOf(labels: string[]): string {
  if (labels.length <= 3) return labels.join(', ');
  return `${labels.slice(0, 3).join(', ')} and ${labels.length - 3} more`;
}

/** The diff in words — what changed, in the terms the outliner uses. */
export function summariseDiff(diff: DocumentDiff): string[] {
  const lines: string[] = [];
  const label = (p: { content: { label?: string; name: string } }) => p.content.label ?? p.content.name;

  if (diff.add.length > 0) lines.push(`Add ${namesOf(diff.add.map(label))}`);
  if (diff.addRefs.length > 0) lines.push(`Add ${namesOf(diff.addRefs.map((r) => r.name ?? r.ref ?? 'an instance'))}`);
  if (diff.update.length > 0) lines.push(`Change ${namesOf(diff.update.map(label))}`);
  if (diff.moveRefs.length > 0) lines.push(`Move ${diff.moveRefs.length} instance${diff.moveRefs.length === 1 ? '' : 's'}`);
  const removed = diff.remove.length + diff.removeRefs.length;
  if (removed > 0) lines.push(`Remove ${removed} node${removed === 1 ? '' : 's'}`);
  for (const group of diff.groups.create) {
    lines.push(`Group ${group.members.length} node${group.members.length === 1 ? '' : 's'}${group.name ? ` as "${group.name}"` : ''}`);
  }
  for (const join of diff.groups.join) {
    lines.push(`Add ${join.members.length} node${join.members.length === 1 ? '' : 's'} to group "${join.group}"`);
  }
  for (const leave of diff.groups.leave) {
    lines.push(`Take ${leave.members.length} node${leave.members.length === 1 ? '' : 's'} out of group "${leave.group}"`);
  }
  if (diff.groups.dissolve.length > 0) lines.push(`Dissolve ${diff.groups.dissolve.length} group${diff.groups.dissolve.length === 1 ? '' : 's'}`);
  return lines;
}

/** True when the model answered with no change at all — a real answer, and worth saying so. */
export function isEmptyDiff(diff: DocumentDiff): boolean {
  return diff.add.length === 0
    && diff.remove.length === 0
    && diff.update.length === 0
    && diff.addRefs.length === 0
    && diff.removeRefs.length === 0
    && diff.moveRefs.length === 0
    && diff.groups.create.length === 0
    && diff.groups.dissolve.length === 0
    && diff.groups.join.length === 0
    && diff.groups.leave.length === 0;
}

/**
 * Prepare one turn: read the session as a draft, ask for the whole new draft, diff it against the
 * session, and stop. Nothing has changed when this returns — applying is a separate, deliberate call.
 *
 * `edit` is injected so the loop can be exercised without a provider or a server.
 */
export async function planEditTurn(
  sketcher: CartoonSketcher,
  instruction: string,
  history: string[] = [],
  edit: (draft: unknown, instruction: string, history: string[]) => Promise<unknown> = requestDraftEdit,
): Promise<EditTurnPlan> {
  try {
    const before = sketcher.toDocument();
    const { aiDraft, idMap } = describeSession(before);
    const draft = (await edit(aiDraft, instruction, history)) as AIDraft;
    // An untrusted draft is clamped where it becomes a document, so a malformed answer degrades to a
    // smaller diff rather than an exception. The whole step is inside the guard rather than only the
    // request: a failure anywhere in planning has to be reportable, or the panel waits forever.
    const diff = diffDocument(before, fromAIDraft(draft, idMap));
    return { ok: true, turn: { instruction, draft, idMap, diff, summary: summariseDiff(diff) } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Apply an accepted turn: the whole AI turn as one command, so one undo takes it back.
 */
export function applyEditTurn(sketcher: CartoonSketcher, turn: EditTurn) {
  return applyDraftCommand(sketcher, turn.draft, turn.idMap);
}
