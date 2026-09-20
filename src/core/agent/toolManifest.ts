import { AI_DRAFT_JSON_SCHEMA } from '../sketcher/aiDraftSchema.js';
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

const DEFINITION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: {
    id: { type: 'string', description: 'A set-piece entry id from describe_catalogue.' },
  },
};

const EDIT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['draft', 'instruction'],
  properties: {
    draft: { type: 'object', description: 'The current draft, exactly as describe_session returned it.' },
    instruction: { type: 'string', description: 'What to change, in the author’s words.' },
    history: { type: 'array', items: { type: 'string' }, description: 'Earlier instructions, oldest first.' },
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
 * (AI_DRAFT_JSON_SCHEMA / CHARACTER_JSON_SCHEMA) plus small argument contracts.
 */
export function toolManifest(): ToolDefinition[] {
  return [
    { name: 'describe_catalogue', description: 'List catalogue entries (id, label, kind, isSetting, summary).', inputSchema: NO_ARGS_SCHEMA },
    { name: 'describe_script', description: 'Describe the production cast + settings with resolution status (bound/ambiguous/unresolved).', inputSchema: NO_ARGS_SCHEMA },
    {
      name: 'describe_definition',
      description: 'Describe what one catalogue Definition is made of: every node with the path an override addresses, its name, kind, world placement and absolute size, plus the instances it references, its lights and its environment. describe_catalogue says what exists; this says what is inside one of them.',
      inputSchema: DEFINITION_SCHEMA,
    },
    {
      name: 'describe_session',
      description: 'The live session as an AI Draft, with the handle-to-identity map an edit needs to apply its answer: pass that map back with the edited draft so a part left alone stays the same part.',
      inputSchema: NO_ARGS_SCHEMA,
    },
    {
      name: 'edit',
      description: 'Change a scene draft from an instruction: give the current draft and what to change, get the whole new draft back. Keep every id, name, group and placement you are not asked to change.',
      inputSchema: EDIT_SCHEMA,
    },
    { name: 'create_setting', description: 'Create (or update) a scenery set from an AI Draft document; the draft becomes the set\'s tree document.', inputSchema: AI_DRAFT_JSON_SCHEMA },
    { name: 'create_character', description: 'Create (and persist) a spec-backed character from a validated document.', inputSchema: CHARACTER_JSON_SCHEMA },
    { name: 'bind', description: 'Point a script name (cast or setting) at a catalogue id.', inputSchema: BIND_SCHEMA },
    { name: 'make', description: 'Ensure an asset exists (create-or-resume) and bind a script name to it — one call.', inputSchema: MAKE_SCHEMA },
  ];
}
