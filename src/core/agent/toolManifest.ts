import { SET_PIECE_JSON_SCHEMA } from '../setting/authoringApi.js';
import { CHARACTER_JSON_SCHEMA } from '../character/authoringApi.js';

/**
 * A provider-neutral tool definition: the verb name, a human description, and
 * the JSON Schema of its arguments. `inputSchema` maps directly to OpenAI's
 * `function.parameters` or Anthropic's `input_schema` — the caller wraps the
 * list in whichever provider's tool/response_format envelope it uses.
 */
export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const NO_ARGS_SCHEMA: Record<string, unknown> = { type: 'object', properties: {}, additionalProperties: false };

const BIND_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'name', 'catalogueId'],
  properties: {
    kind: { type: 'string', enum: ['cast', 'setting'] },
    name: { type: 'string' },
    catalogueId: { type: ['string', 'null'] },
  },
};

const MAKE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'name', 'document'],
  properties: {
    kind: { type: 'string', enum: ['setting', 'character'] },
    name: { type: 'string' },
    document: { type: 'object', description: 'The full spec — see the create_setting / create_character schemas.' },
  },
};

/**
 * The authoring surface expressed as tool definitions (API-4): the grammar an
 * AI agent is handed, derived read-only from the existing authoring schemas
 * (SET_PIECE_JSON_SCHEMA / CHARACTER_JSON_SCHEMA) plus small argument contracts.
 */
export function toolManifest(): ToolDefinition[] {
  return [
    { name: 'describe_catalogue', description: 'List catalogue entries (id, label, kind, isSetting, summary).', inputSchema: NO_ARGS_SCHEMA },
    { name: 'describe_script', description: 'Describe the production cast + settings with resolution status (bound/ambiguous/unresolved).', inputSchema: NO_ARGS_SCHEMA },
    { name: 'create_setting', description: 'Create (and persist) a scenery/setting from a validated document.', inputSchema: SET_PIECE_JSON_SCHEMA },
    { name: 'create_character', description: 'Create (and persist) a spec-backed character from a validated document.', inputSchema: CHARACTER_JSON_SCHEMA },
    { name: 'bind', description: 'Point a script name (cast or setting) at a catalogue id.', inputSchema: BIND_SCHEMA },
    { name: 'make', description: 'Ensure an asset exists (create-or-resume) and bind a script name to it — one call.', inputSchema: MAKE_SCHEMA },
  ];
}
