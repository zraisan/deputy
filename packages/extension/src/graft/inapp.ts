/**
 * Tier 0: tools the page already declared to its own in-app agent.
 *
 * A growing number of apps ship an embedded copilot — CopilotKit, Vercel AI SDK,
 * assistant-ui — and every one of them makes the app author write exactly what
 * Deputy spends its time inferring: a tool name, a description, a parameter
 * schema. That work is already done and it is better than anything we could
 * synthesize, because a human wrote it on purpose.
 *
 * The catch is that those definitions live in a React context we cannot reach
 * from an isolated content script. But they do not stay there: the app posts
 * them to its own runtime endpoint on the first turn. So we read them off the
 * wire — no cooperation from the app, which is the whole premise.
 */

export type InAppTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Which framework it came from, for reporting. */
  origin: string;
};

/** Endpoints that carry an in-app agent's tool manifest. */
const KNOWN_ENDPOINTS = [
  /\/api\/copilotkit/i,
  /\/copilotkit/i,
  /\/api\/chat$/i,
  /\/api\/agent/i,
  /\/ag-ui/i,
];

export const looksLikeAgentEndpoint = (url: string) => KNOWN_ENDPOINTS.some((re) => re.test(url));

/**
 * Pull tool definitions out of a request body, whatever shape the framework
 * chose. Deliberately forgiving: these payloads are undocumented and change,
 * so we look for the shape rather than a specific schema version.
 */
export function extractTools(payload: unknown, origin = 'in-app agent'): InAppTool[] {
  const found: InAppTool[] = [];
  const seen = new Set<string>();

  /**
   * A tool carries a schema; a *parameter* is just a name, a description and a
   * primitive type. Without this distinction the recursion registers every
   * argument as a tool of its own — measured on a CopilotKit payload, one
   * two-tool manifest produced six tools.
   */
  const looksLikeTool = (v: any): boolean =>
    v && typeof v === 'object' &&
    typeof v.name === 'string' && v.name.length > 0 &&
    (Array.isArray(v.parameters) || isSchemaObject(v.parameters) || isSchemaObject(v.inputSchema) || isSchemaObject(v.jsonSchema));

  /** CopilotKit v1 uses `parameters: [{name, type, description, required}]`. */
  const fromParameterList = (params: any[]): Record<string, unknown> => {
    const properties: Record<string, unknown> = {};
    const required: string[] = [];
    for (const p of params) {
      if (!p || typeof p.name !== 'string') continue;
      const type = String(p.type ?? 'string').toLowerCase();
      properties[p.name] = {
        type: ['string', 'number', 'boolean', 'object', 'array'].includes(type) ? type : 'string',
        ...(p.description ? { description: String(p.description) } : {}),
        ...(Array.isArray(p.enum) ? { enum: p.enum } : {}),
      };
      if (p.required) required.push(p.name);
    }
    return { type: 'object', properties, ...(required.length ? { required } : {}) };
  };

  const isSchemaObject = (v: any): boolean =>
    !!v && typeof v === 'object' && !Array.isArray(v) &&
    (v.type === 'object' || typeof v.properties === 'object');

  const visit = (node: any, depth = 0) => {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) { for (const item of node) visit(item, depth + 1); return; }
    if (typeof node !== 'object') return;

    if (looksLikeTool(node) && !seen.has(node.name)) {
      const schema =
        node.inputSchema ??
        node.jsonSchema ??
        (Array.isArray(node.parameters) ? fromParameterList(node.parameters) : node.parameters) ??
        { type: 'object', properties: {} };
      // A "tool" with no describable input is usually a chat message, not a tool.
      if (typeof schema === 'object') {
        seen.add(node.name);
        found.push({
          name: String(node.name),
          description: String(node.description ?? `Action "${node.name}" declared by this page`),
          inputSchema: schema as Record<string, unknown>,
          origin,
        });
      }
      // Its parameters are arguments, not tools. Do not descend into them.
      return;
    }
    for (const value of Object.values(node)) visit(value, depth + 1);
  };

  visit(payload);
  return found;
}

/** Guess which framework we are looking at, purely for a legible report. */
export function frameworkOf(url: string, body: string): string {
  if (/copilotkit/i.test(url) || /copilotkit/i.test(body.slice(0, 2000))) return 'CopilotKit';
  if (/ag-ui/i.test(url)) return 'AG-UI';
  if (/"toolInvocations"|"experimental_attachments"/.test(body.slice(0, 2000))) return 'Vercel AI SDK';
  return 'in-app agent';
}
