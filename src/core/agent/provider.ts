/**
 * Pluggable AI provider adapters (ROADMAP_AI.md AI-0). Each provider turns a
 * system prompt, user prompt, and target JSON schema into a parsed JSON value
 * through one `generate` call. Providers are env-free: they take their key,
 * endpoint, and model as constructor arguments, so the caller (a server route
 * or a test) decides where credentials come from and the browser never holds a
 * key.
 */

export interface AIProvider {
  generate(systemPrompt: string, userPrompt: string, jsonSchema: unknown): Promise<unknown>;
}

export type DeepSeekProviderOptions = {
  /** API key (sent as a Bearer token). */
  apiKey: string;
  /** OpenAI-wire-compatible base URL. Defaults to `https://api.deepseek.com`. */
  baseUrl?: string;
  /** Model id. Defaults to `deepseek-chat`. */
  model?: string;
  /** Maximum output tokens. Defaults to 8192 (large scenes need room). */
  maxTokens?: number;
  /** Attempts per request, including the first. Defaults to 3. */
  attempts?: number;
  /** First backoff delay in ms, doubling per attempt. A `Retry-After` header outranks it. */
  backoffMs?: number;
  /** Injectable delay for tests. Defaults to a real timer. */
  sleepFn?: (ms: number) => Promise<void>;
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
};

/** The failures a second attempt can fix — a spent rate limit, a bad moment on the server, a dropped socket. */
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

/** A server asking for a long wait is asking more than this call is worth; the user is waiting. */
const MAX_RETRY_AFTER_MS = 30_000;

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

/**
 * Parse a model reply as JSON, tolerating a markdown code fence or prose around
 * the object. Throws if no JSON object can be found.
 */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenced) return JSON.parse(fenced[1]);
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object in response');
  }
  return JSON.parse(trimmed.slice(start, end + 1));
}

/**
 * DeepSeekProvider — OpenAI-wire-compatible chat completions using DeepSeek's
 * JSON Output mode (`response_format: { type: 'json_object' }`). That mode
 * cannot take a full JSON schema in `response_format` and requires the word
 * "json" to appear in the message, so the target schema is appended to the user
 * prompt and the reply is parsed as JSON.
 */
export class DeepSeekProvider implements AIProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly attempts: number;
  private readonly backoffMs: number;
  private readonly sleepFn: (ms: number) => Promise<void>;
  private readonly fetchFn: typeof fetch;

  constructor(options: DeepSeekProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
    this.model = options.model ?? 'deepseek-chat';
    this.maxTokens = options.maxTokens ?? 8192;
    this.attempts = Math.max(1, options.attempts ?? 3);
    this.backoffMs = options.backoffMs ?? 400;
    this.sleepFn = options.sleepFn ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generate(systemPrompt: string, userPrompt: string, jsonSchema: unknown): Promise<unknown> {
    const response = await this.request(() => this.fetchFn(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: this.maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: this.withSchema(userPrompt, jsonSchema) },
        ],
        response_format: { type: 'json_object' },
        stream: false,
      }),
    }));

    if (!response.ok) {
      throw new Error(`DeepSeek request failed (${response.status}): ${await response.text()}`);
    }

    const data = (await response.json()) as ChatCompletionResponse;
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('DeepSeek returned no message content');
    }
    try {
      return extractJson(content);
    } catch {
      const preview = content.length > 800
        ? `${content.slice(0, 400)}…[${content.length} chars]…${content.slice(-400)}`
        : content;
      const truncated = /[}\]]\s*$/.test(content.trim()) ? '' : ' — output appears truncated (model token limit)';
      throw new Error(`DeepSeek returned non-JSON content (${content.length} chars)${truncated}: ${preview}`);
    }
  }

  /**
   * Sends the completion, retrying only what a later attempt can fix: a spent rate limit, a bad
   * moment on the server, a dropped connection. A rejected key or a malformed request is the
   * caller's to report — retrying it would pay again to be told the same thing. The response that
   * comes back is unread, so its body is there for the caller to read exactly once.
   */
  private async request(send: () => Promise<Response>): Promise<Response> {
    let lastError: unknown = new Error('DeepSeek request failed: no attempt was made');
    for (let attempt = 1; attempt <= this.attempts; attempt++) {
      try {
        const response = await send();
        if (response.ok || !RETRYABLE_STATUS.has(response.status)) return response;
        lastError = new Error(`DeepSeek request failed (${response.status}): ${await response.text()}`);
        if (attempt < this.attempts) await this.sleepFn(this.waitFor(response, attempt));
      } catch (error) {
        lastError = error;
        if (attempt < this.attempts) await this.sleepFn(this.backoffFor(attempt));
      }
    }
    throw lastError;
  }

  /** How long to wait: the server's own `Retry-After` when it sends one, else the growing backoff. */
  private waitFor(response: Response, attempt: number): number {
    const header = response.headers?.get?.('retry-after');
    const seconds = header ? Number(header) : NaN;
    return Number.isFinite(seconds) && seconds >= 0
      ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
      : this.backoffFor(attempt);
  }

  private backoffFor(attempt: number): number {
    return this.backoffMs * 2 ** (attempt - 1);
  }

  private withSchema(userPrompt: string, jsonSchema: unknown): string {
    return `${userPrompt}\n\nRespond with a single JSON object matching this schema, JSON only (no prose or markdown):\n${JSON.stringify(jsonSchema)}`;
  }
}
