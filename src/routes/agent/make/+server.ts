import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { DeepSeekProvider } from '../../../core/agent/provider.js';
import { describeToDocument } from '../../../core/agent/api.js';

/**
 * AI generation step of `make` (ROADMAP_AI.md AI-3). Runs the LLM server-side —
 * the DeepSeek key never reaches the browser — and returns the generated
 * document. The client then persists + binds it via the core `make` verb.
 */
export const POST: RequestHandler = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as {
    kind?: unknown;
    name?: unknown;
    description?: unknown;
  };

  const kind = body.kind;
  if (kind !== 'character' && kind !== 'setting') {
    return json({ error: 'kind must be "character" or "setting".' }, { status: 400 });
  }
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const description = (typeof body.description === 'string' && body.description.trim())
    ? body.description.trim()
    : name;
  if (!description) {
    return json({ error: 'A name or description is required.' }, { status: 400 });
  }

  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return json({ error: 'No DEEPSEEK_API_KEY configured on the server.' }, { status: 503 });
  }

  try {
    const document = await describeToDocument(new DeepSeekProvider({ apiKey }), kind, description);
    return json({ document });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
};
