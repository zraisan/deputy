import { describe, expect, test } from 'bun:test';
import { extractTools, looksLikeAgentEndpoint, frameworkOf } from '../src/graft/inapp';

describe('spotting an in-app agent endpoint', () => {
  test('recognises CopilotKit and friends', () => {
    for (const u of ['/api/copilotkit', 'https://x.test/api/copilotkit', '/api/chat', '/api/agent/run', '/ag-ui']) {
      expect(looksLikeAgentEndpoint(u)).toBe(true);
    }
  });
  test('ignores ordinary traffic', () => {
    for (const u of ['/api/products', '/static/main.js', '/graphql']) {
      expect(looksLikeAgentEndpoint(u)).toBe(false);
    }
  });
});

describe('extracting declared tools', () => {
  test('reads CopilotKit v1 actions with a parameter list', () => {
    // Shape CopilotKit posts to its runtime: parameters as an array.
    const payload = {
      messages: [{ role: 'user', content: 'hi' }],
      actions: [{
        name: 'setTheme',
        description: 'Change the application theme',
        parameters: [
          { name: 'theme', type: 'string', description: 'Theme to use', required: true, enum: ['light', 'dark'] },
          { name: 'persist', type: 'boolean', description: 'Remember it' },
        ],
      }],
    };
    const [tool] = extractTools(payload, 'CopilotKit');
    expect(tool!.name).toBe('setTheme');
    expect(tool!.description).toBe('Change the application theme');
    const props = tool!.inputSchema.properties as any;
    expect(props.theme).toEqual({ type: 'string', description: 'Theme to use', enum: ['light', 'dark'] });
    expect(props.persist.type).toBe('boolean');
    expect(tool!.inputSchema.required).toEqual(['theme']);
  });

  test('reads a JSON-Schema style tool untouched', () => {
    const payload = { tools: [{ name: 'search', description: 'Search', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }] };
    const [tool] = extractTools(payload);
    expect(tool!.inputSchema).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
  });

  test('finds tools nested anywhere in the payload', () => {
    const payload = { data: { runtime: { config: { actions: [{ name: 'deep', description: 'd', parameters: [] }] } } } };
    expect(extractTools(payload).map((t) => t.name)).toEqual(['deep']);
  });

  test('never returns the same tool twice', () => {
    const a = { name: 'dup', description: 'd', parameters: [] };
    expect(extractTools({ actions: [a], tools: [a] })).toHaveLength(1);
  });

  test('ignores payloads with no tools at all', () => {
    expect(extractTools({ messages: [{ role: 'user', content: 'hello' }] })).toEqual([]);
  });

  test('survives junk without throwing', () => {
    for (const junk of [null, undefined, 42, 'string', [], {}]) {
      expect(() => extractTools(junk)).not.toThrow();
    }
  });

  test('does not recurse forever on a deep structure', () => {
    let deep: any = { name: 'buried', description: 'd', parameters: [] };
    for (let i = 0; i < 40; i++) deep = { nested: deep };
    expect(() => extractTools(deep)).not.toThrow();
  });
});

describe('naming the framework', () => {
  test('identifies CopilotKit from the url', () => {
    expect(frameworkOf('https://x.test/api/copilotkit', '{}')).toBe('CopilotKit');
  });
  test('identifies CopilotKit from the body when the url is generic', () => {
    expect(frameworkOf('/api/chat', '{"copilotkit":{"version":"1"}}')).toBe('CopilotKit');
  });
  test('falls back to a neutral label', () => {
    expect(frameworkOf('/api/chat', '{"messages":[]}')).toBe('in-app agent');
  });
});

describe('a parameter is not a tool', () => {
  // Measured on a real CopilotKit payload: a two-action manifest produced six
  // tools, because every parameter has a name and a description too.
  const payload = {
    actions: [
      { name: 'refundOrder', description: 'Refund an order', parameters: [
        { name: 'orderId', type: 'string', description: 'The order to refund', required: true },
        { name: 'reason', type: 'string', description: 'Why' },
      ] },
      { name: 'setRange', description: 'Change range', parameters: [
        { name: 'range', type: 'string', description: 'Range', required: true, enum: ['7d', '30d'] },
      ] },
    ],
  };

  test('returns only the actions', () => {
    expect(extractTools(payload).map((t) => t.name)).toEqual(['refundOrder', 'setRange']);
  });

  test('the parameters survive inside their tool schema', () => {
    const [refund] = extractTools(payload);
    expect(Object.keys(refund!.inputSchema.properties as object)).toEqual(['orderId', 'reason']);
    expect(refund!.inputSchema.required).toEqual(['orderId']);
  });

  test('an object with a name and description but no schema is ignored', () => {
    expect(extractTools({ thing: { name: 'notATool', description: 'just a field', type: 'string' } })).toEqual([]);
  });
});
