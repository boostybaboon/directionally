import { describe, it, expect } from 'vitest';
import { toolManifest } from './toolManifest.js';

describe('toolManifest', () => {
  const manifest = toolManifest();

  it('exposes all seven verbs', () => {
    expect(manifest.map((t) => t.name)).toEqual([
      'describe_catalogue', 'describe_script', 'describe_definition',
      'create_setting', 'create_character', 'bind', 'make',
    ]);
  });

  it('describe_definition takes an entry id, so a path can be targeted afterwards', () => {
    const definition = manifest.find((t) => t.name === 'describe_definition')!;
    expect(definition.inputSchema.required).toEqual(['id']);
  });

  it('each tool has a name, description, and a JSON-serialisable schema', () => {
    for (const tool of manifest) {
      expect(tool.name).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(JSON.parse(JSON.stringify(tool.inputSchema))).toEqual(tool.inputSchema);
    }
  });

  it('create_setting and create_character reference the authoring schemas', () => {
    const setting = manifest.find((t) => t.name === 'create_setting')!;
    const character = manifest.find((t) => t.name === 'create_character')!;
    expect(setting.inputSchema.required).toContain('parts');
    expect(character.inputSchema.required).toContain('label');
    expect((character.inputSchema.properties as Record<string, unknown>).spec).toBeDefined();
  });

  it('bind and make carry their argument contracts', () => {
    const bind = manifest.find((t) => t.name === 'bind')!;
    expect(bind.inputSchema.required).toEqual(['kind', 'name', 'catalogueId']);
    const make = manifest.find((t) => t.name === 'make')!;
    expect(make.inputSchema.required).toEqual(['kind', 'name', 'document']);
  });
});
