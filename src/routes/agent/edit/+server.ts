import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { DeepSeekProvider } from '../../../core/agent/provider.js';
import { editToDocument } from '../../../core/agent/api.js';
import type { AIDraft } from '../../../core/sketcher/aiDraft.js';

/**
 * The LLM step of an AI edit (ROADMAP_API.md): a draft and an instruction in, the whole new draft out.
 * Runs server-side so the provider key never reaches the browser, and returns a draft rather than a
 * patch — the app's id-diff is what turns the difference into edits, as one undoable step.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    draft?: unknown;
    instruction?: unknown;
    history?: unknown;
  };

  const instruction = typeof body.instruction === 'string' ? body.instruction.trim() : '';
  if (instruction === '') {
    return json({ error: 'An instruction is required.' }, { status: 400 });
  }
  if (typeof body.draft !== 'object' || body.draft === null) {
    return json({ error: 'A draft is required.' }, { status: 400 });
  }
  const history = Array.isArray(body.history)
    ? body.history.filter((line): line is string => typeof line === 'string')
    : [];

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: 'No DEEPSEEK_API_KEY configured on the server.' }, { status: 503 });
  }

  try {
    const provider = new DeepSeekProvider({ apiKey });
    return json({ draft: await editToDocument(provider, body.draft as AIDraft, instruction, history) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
};
