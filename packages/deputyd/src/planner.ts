/**
 * Deputy's own brain.
 *
 * Two jobs, both deliberately narrow:
 *   answer() — read the page here and hand back a sentence, so the calling
 *              agent never has to look at the page at all.
 *   choose() — pick one tool from a list and fill its arguments.
 *
 * Note the trade this makes: page text goes to OpenRouter (cheap, fast), and
 * only the distilled answer reaches the caller. The page never enters the
 * caller's context, which is the entire point of the project.
 */
import type { DeputyTool } from '../../shared/src/protocol';

export type PageContext = { title: string; url: string };

export type Decision =
  | { kind: 'call'; tool: string; args: Record<string, unknown> }
  | { kind: 'ask'; question: string }
  | { kind: 'give_up'; reason: string };

export type Answer = { answered: boolean; text: string };

/** Every model call Deputy makes, so its own cost is measurable and not merely asserted. */
export const modelUsage = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  costUsd: 0,
  reset() { this.calls = 0; this.promptTokens = 0; this.completionTokens = 0; this.costUsd = 0; },
};

export interface Planner {
  readonly name: string;
  choose(goal: string, tools: DeputyTool[], page: PageContext): Promise<Decision>;
  answer(question: string, pageText: string, page: PageContext): Promise<Answer>;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'to', 'in', 'on', 'at', 'my', 'me', 'i', 'want',
  'please', 'can', 'you', 'would', 'like', 'and', 'is', 'it', 'this', 'that', 'with',
]);

const words = (s: string): string[] =>
  s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOPWORDS.has(w));

/**
 * No key, no network, no failure mode. The demo must never depend on an API
 * being up, so this is always the fallback rather than an error path.
 */
export class HeuristicPlanner implements Planner {
  readonly name = 'heuristic (no model configured)';

  async choose(goal: string, tools: DeputyTool[], _page: PageContext): Promise<Decision> {
    if (tools.length === 0) {
      return { kind: 'give_up', reason: 'This page exposes no tools, so there is nothing to call.' };
    }
    const goalWords = new Set(words(goal));
    let best: { tool: DeputyTool; score: number } | null = null;

    for (const tool of tools) {
      const haystack = new Set(words(`${tool.name} ${tool.description}`));
      let score = 0;
      for (const w of goalWords) if (haystack.has(w)) score++;
      if (!best || score > best.score) best = { tool, score };
    }
    if (!best || best.score === 0) {
      return {
        kind: 'give_up',
        reason: `Nothing on this page matches "${goal}". Available: ${tools.map((t) => t.name).join(', ')}.`,
      };
    }

    // Put the goal into the one obvious slot; with several slots, refuse to guess.
    const props = ((best.tool.inputSchema as any)?.properties ?? {}) as Record<string, unknown>;
    const keys = Object.keys(props);
    const args: Record<string, unknown> = {};
    if (keys.length === 1) args[keys[0]!] = goal;
    return { kind: 'call', tool: best.tool.name, args };
  }

  async answer(_question: string, _pageText: string, _page: PageContext): Promise<Answer> {
    return {
      answered: false,
      text: 'Deputy has no model configured, so it cannot read the page for you. Set OPENROUTER_API_KEY.',
    };
  }
}

export class OpenRouterPlanner implements Planner {
  readonly name: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxPageChars: number;
  private readonly fallback = new HeuristicPlanner();

  constructor(opts: {
    apiKey: string;
    model: string;
    fetchImpl?: typeof fetch;
    maxPageChars?: number;
  }) {
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxPageChars = opts.maxPageChars ?? 24_000;
    this.name = `openrouter ${opts.model}`;
  }

  private async complete(system: string, user: string): Promise<{ ok: true; text: string } | { ok: false; text: string }> {
    try {
      const res = await this.fetchImpl('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': process.env.OPENROUTER_SITE_NAME ?? 'Deputy',
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0,
          // Qwen flash is a reasoning model and will happily spend 168 tokens
          // thinking about a two-word answer. We are picking a tool from a list,
          // not proving a theorem — turn it off and leave room if a provider
          // ignores the switch.
          reasoning: { enabled: false },
          max_tokens: 2000,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
      });
      if (!res.ok) {
        return { ok: false, text: `Deputy's model call failed (HTTP ${res.status}).` };
      }
      const body: any = await res.json();
      const u = body?.usage ?? {};
      modelUsage.calls += 1;
      modelUsage.promptTokens += Number(u.prompt_tokens ?? 0);
      modelUsage.completionTokens += Number(u.completion_tokens ?? 0);
      modelUsage.costUsd += Number(u.cost ?? 0);
      console.log(
        `  [deputy model] call #${modelUsage.calls}  ` +
        `${u.prompt_tokens ?? 0} in / ${u.completion_tokens ?? 0} out  $${Number(u.cost ?? 0).toFixed(6)}`,
      );
      const text = String(body?.choices?.[0]?.message?.content ?? '').trim();
      if (!text) return { ok: false, text: 'Deputy\'s model returned an empty response.' };
      return { ok: true, text };
    } catch (err) {
      return { ok: false, text: `Deputy's model call failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async answer(question: string, pageText: string, page: PageContext): Promise<Answer> {
    const clipped = pageText.slice(0, this.maxPageChars);
    const res = await this.complete(
      'You read a web page and answer one question about it. Answer in one or two short sentences. ' +
        'Use only what the page says. If the page does not answer it, say so plainly.',
      `Page: ${page.title} <${page.url}>\n\n---\n${clipped}\n---\n\nQuestion: ${question}`,
    );
    return { answered: res.ok, text: res.text };
  }

  async choose(goal: string, tools: DeputyTool[], page: PageContext): Promise<Decision> {
    if (tools.length === 0) {
      return { kind: 'give_up', reason: 'This page exposes no tools, so there is nothing to call.' };
    }
    const catalogue = tools.map((t) => ({
      name: t.name, description: t.description, inputSchema: t.inputSchema,
    }));

    const res = await this.complete(
      'Pick exactly one tool to satisfy the goal and fill its arguments from the goal text. ' +
        'Reply with JSON only: {"tool":"<name>","args":{...}}. Arguments must match the tool\'s ' +
        'inputSchema. If no tool fits, reply {"tool":null,"reason":"<why>"}.',
      `Page: ${page.title} <${page.url}>\n\nTools:\n${JSON.stringify(catalogue, null, 1)}\n\nGoal: ${goal}`,
    );
    // A model outage must not make Deputy useless — fall back to keywords.
    if (!res.ok) return this.fallback.choose(goal, tools, page);

    const parsed = parseJsonish(res.text);
    if (!parsed) return this.fallback.choose(goal, tools, page);
    if (!parsed.tool) {
      return { kind: 'give_up', reason: String(parsed.reason ?? 'No tool on this page fits that goal.') };
    }
    // Never forward a tool the browser does not actually have.
    if (!tools.some((t) => t.name === parsed.tool)) {
      return {
        kind: 'give_up',
        reason: `Deputy's model picked "${parsed.tool}", which this page does not expose. Available: ${
          tools.map((t) => t.name).join(', ')
        }.`,
      };
    }
    return { kind: 'call', tool: String(parsed.tool), args: (parsed.args ?? {}) as Record<string, unknown> };
  }
}

/** Models fence their JSON, prepend apologies, and append explanations. Cope. */
function parseJsonish(text: string): { tool?: string | null; args?: unknown; reason?: unknown } | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], text, text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const v = JSON.parse(c.trim());
      if (v && typeof v === 'object') return v as Record<string, unknown>;
    } catch { /* next */ }
  }
  return null;
}

export function makePlanner(): Planner {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return new HeuristicPlanner();
  return new OpenRouterPlanner({ apiKey, model: process.env.OPENROUTER_MODEL ?? 'qwen/qwen3.7-flash' });
}
