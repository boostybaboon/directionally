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
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  fetchFn?: typeof fetch;
};

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
  private readonly fetchFn: typeof fetch;

  constructor(options: DeepSeekProviderOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://api.deepseek.com').replace(/\/$/, '');
    this.model = options.model ?? 'deepseek-chat';
    this.maxTokens = options.maxTokens ?? 8192;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async generate(systemPrompt: string, userPrompt: string, jsonSchema: unknown): Promise<unknown> {
    const response = await this.fetchFn(`${this.baseUrl}/chat/completions`, {
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
    });

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
      throw new Error(`DeepSeek returned non-JSON content (${content.length} chars): ${preview}`);
    }
  }

  private withSchema(userPrompt: string, jsonSchema: unknown): string {
    return `${userPrompt}\n\nRespond with a single JSON object matching this schema, JSON only (no prose or markdown):\n${JSON.stringify(jsonSchema)}`;
  }
}
