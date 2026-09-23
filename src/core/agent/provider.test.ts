import { describe, it, expect } from 'vitest';
import { DeepSeekProvider } from './provider.js';

function recordingFetch(body: unknown, status = 200): {
  fetch: typeof fetch;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchFn = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    } as Response;
  }) as typeof fetch;
  return { fetch: fetchFn, calls };
}

describe('DeepSeekProvider', () => {
  it('POSTs an OpenAI-wire chat completion and returns the parsed JSON', async () => {
    const { fetch: fetchFn, calls } = recordingFetch({ choices: [{ message: { content: '{"build":0.6}' } }] });
    const provider = new DeepSeekProvider({ apiKey: 'sk-test', fetchFn });

    const result = await provider.generate('system prompt', 'a portly gentleman', { type: 'object' });

    expect(result).toEqual({ build: 0.6 });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.deepseek.com/chat/completions');
    expect(calls[0].init.method).toBe('POST');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');

    const payload = JSON.parse(calls[0].init.body as string);
    expect(payload.model).toBe('deepseek-chat');
    expect(payload.max_tokens).toBe(8192);
    expect(payload.response_format).toEqual({ type: 'json_object' });
    expect(payload.messages[0]).toEqual({ role: 'system', content: 'system prompt' });
    expect(payload.messages[1].role).toBe('user');
    expect(payload.messages[1].content).toContain('a portly gentleman');
    expect(payload.messages[1].content).toContain('{"type":"object"}');
  });

  it('defaults to the DeepSeek host and deepseek-chat model', async () => {
    const { fetch: fetchFn, calls } = recordingFetch({ choices: [{ message: { content: '{}' } }] });
    await new DeepSeekProvider({ apiKey: 'sk-test', fetchFn }).generate('s', 'u', {});
    expect(calls[0].url).toBe('https://api.deepseek.com/chat/completions');
    expect(JSON.parse(calls[0].init.body as string).model).toBe('deepseek-chat');
  });

  it('honours a custom baseUrl and model', async () => {
    const { fetch: fetchFn, calls } = recordingFetch({ choices: [{ message: { content: '{}' } }] });
    await new DeepSeekProvider({ apiKey: 'sk-test', baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-reasoner', fetchFn }).generate('s', 'u', {});
    expect(calls[0].url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(JSON.parse(calls[0].init.body as string).model).toBe('deepseek-reasoner');
  });

  it('strips a markdown code fence before parsing', async () => {
    const body = { choices: [{ message: { content: '```json\n{"build":0.6}\n```' } }] };
    const { fetch: fetchFn } = recordingFetch(body);
    const result = await new DeepSeekProvider({ apiKey: 'sk-test', fetchFn }).generate('s', 'u', {});
    expect(result).toEqual({ build: 0.6 });
  });

  it('extracts a JSON object wrapped in prose', async () => {
    const body = { choices: [{ message: { content: 'Sure! Here you go: {"build":0.6}' } }] };
    const { fetch: fetchFn } = recordingFetch(body);
    const result = await new DeepSeekProvider({ apiKey: 'sk-test', fetchFn }).generate('s', 'u', {});
    expect(result).toEqual({ build: 0.6 });
  });

  it('throws on a non-2xx response', async () => {
    const { fetch: fetchFn } = recordingFetch({ error: { message: 'unauthorized' } }, 401);
    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn }).generate('s', 'u', {}))
      .rejects.toThrow(/DeepSeek request failed \(401\)/);
  });

  it('throws when the response has no message content', async () => {
    const { fetch: fetchFn } = recordingFetch({ choices: [] });
    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn }).generate('s', 'u', {}))
      .rejects.toThrow(/no message content/);
  });

  it('throws when the model returns non-JSON content', async () => {
    const { fetch: fetchFn } = recordingFetch({ choices: [{ message: { content: 'not json' } }] });
    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn }).generate('s', 'u', {}))
      .rejects.toThrow(/non-JSON content/);
  });
/**
 * Responses in order, one per call, so a retry is observable: `'network'` rejects the way a dropped
 * connection does, and the last step repeats if more calls arrive than were scripted.
 */
function scriptedFetch(steps: Array<{ status: number; body?: unknown; retryAfter?: string } | 'network'>): {
  fetch: typeof fetch;
  count: () => number;
} {
  let calls = 0;
  const fetchFn = (async () => {
    const step = steps[Math.min(calls, steps.length - 1)];
    calls += 1;
    if (step === 'network') throw new TypeError('fetch failed');
    const headers = new Map<string, string>();
    if (step.retryAfter) headers.set('retry-after', step.retryAfter);
    return {
      ok: step.status >= 200 && step.status < 300,
      status: step.status,
      headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
      json: async () => step.body ?? {},
      text: async () => JSON.stringify(step.body ?? {}),
    } as Response;
  }) as typeof fetch;
  return { fetch: fetchFn, count: () => calls };
}

function recordingSleep(): { sleepFn: (ms: number) => Promise<void>; delays: number[] } {
  const delays: number[] = [];
  return { sleepFn: async (ms) => { delays.push(ms); }, delays };
}

const OK_REPLY = { status: 200, body: { choices: [{ message: { content: '{"build":0.6}' } }] } };

describe('DeepSeekProvider retries', () => {
  it('retries a rate limit and returns the answer that finally arrives', async () => {
    const { fetch: fetchFn, count } = scriptedFetch([{ status: 429, retryAfter: '1' }, OK_REPLY]);
    const { sleepFn, delays } = recordingSleep();

    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn, sleepFn }).generate('s', 'u', {}))
      .resolves.toEqual({ build: 0.6 });

    expect(count()).toBe(2);
    expect(delays).toEqual([1000]);   // the server's own Retry-After, not the backoff
  });

  it('retries a server error on a growing backoff', async () => {
    const { fetch: fetchFn, count } = scriptedFetch([{ status: 502 }, { status: 503 }, OK_REPLY]);
    const { sleepFn, delays } = recordingSleep();

    await new DeepSeekProvider({ apiKey: 'sk-test', fetchFn, sleepFn, backoffMs: 100 }).generate('s', 'u', {});

    expect(count()).toBe(3);
    expect(delays).toEqual([100, 200]);
  });

  it('retries a dropped connection', async () => {
    const { fetch: fetchFn, count } = scriptedFetch(['network', OK_REPLY]);
    const { sleepFn } = recordingSleep();

    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn, sleepFn }).generate('s', 'u', {}))
      .resolves.toEqual({ build: 0.6 });
    expect(count()).toBe(2);
  });

  it('does not retry a rejected key — the same answer would cost the same money', async () => {
    const { fetch: fetchFn, count } = scriptedFetch([{ status: 401, body: { error: 'unauthorized' } }]);
    const { sleepFn } = recordingSleep();

    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn, sleepFn }).generate('s', 'u', {}))
      .rejects.toThrow(/DeepSeek request failed \(401\)/);
    expect(count()).toBe(1);
  });

  it('gives up after the configured attempts, reporting the last failure', async () => {
    const { fetch: fetchFn, count } = scriptedFetch([{ status: 500 }, { status: 500 }]);
    const { sleepFn, delays } = recordingSleep();

    await expect(new DeepSeekProvider({ apiKey: 'sk-test', fetchFn, sleepFn, attempts: 2, backoffMs: 10 }).generate('s', 'u', {}))
      .rejects.toThrow(/DeepSeek request failed \(500\)/);
    expect(count()).toBe(2);
    expect(delays).toEqual([10]);
  });

  it('caps an unreasonable Retry-After rather than stalling the user behind it', async () => {
    const { fetch: fetchFn } = scriptedFetch([{ status: 429, retryAfter: '600' }, OK_REPLY]);
    const { sleepFn, delays } = recordingSleep();

    await new DeepSeekProvider({ apiKey: 'sk-test', fetchFn, sleepFn }).generate('s', 'u', {});

    expect(delays).toEqual([30_000]);
  });
});

});
