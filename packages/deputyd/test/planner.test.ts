import { describe, expect, test } from 'bun:test';
import { HeuristicPlanner, OpenRouterPlanner } from '../src/planner';
import type { DeputyTool } from '../../shared/src/protocol';

const tool = (name: string, description: string, props: string[] = []): DeputyTool => ({
  name, description,
  inputSchema: { type: 'object', properties: Object.fromEntries(props.map((p) => [p, { type: 'string' }])) },
  source: 'grafted', consequential: false,
});

const TOOLS = [
  tool('search_wikipedia', 'Search Wikipedia for an article', ['search']),
  tool('sign_in', 'Sign in to your account', ['email', 'password']),
  tool('book_a_table', 'Book a table at the restaurant', ['party_size', 'date']),
];

describe('HeuristicPlanner — the no-key safety net', () => {
  const p = new HeuristicPlanner();

  test('identifies itself so the daemon can report which brain is running', () => {
    expect(p.name).toMatch(/heuristic/i);
  });

  test('matches a goal to the obviously right tool', async () => {
    const d = await p.choose('search for the Byzantine Empire', TOOLS, { title: 'Wikipedia', url: 'https://w.test' });
    expect(d.kind).toBe('call');
    if (d.kind === 'call') expect(d.tool).toBe('search_wikipedia');
  });

  test('matches on the description, not only the name', async () => {
    const d = await p.choose('I want to reserve a restaurant table', TOOLS, { title: 'x', url: 'y' });
    expect(d.kind).toBe('call');
    if (d.kind === 'call') expect(d.tool).toBe('book_a_table');
  });

  test('gives up rather than guessing when nothing matches', async () => {
    const d = await p.choose('deploy the kubernetes cluster', TOOLS, { title: 'x', url: 'y' });
    expect(d.kind).toBe('give_up');
  });

  test('gives up when there are no tools at all', async () => {
    const d = await p.choose('anything', [], { title: 'x', url: 'y' });
    expect(d.kind).toBe('give_up');
  });

  test('puts the goal text into the single obvious parameter', async () => {
    const d = await p.choose('search for otters', TOOLS, { title: 'x', url: 'y' });
    if (d.kind === 'call') expect(String(d.args.search ?? '')).toContain('otters');
  });

  test('answering without a model says so honestly instead of inventing', async () => {
    const a = await p.answer('what is the price?', 'Widget costs $40', { title: 'x', url: 'y' });
    expect(a.answered).toBe(false);
    expect(a.text).toMatch(/no model|without a model|cannot/i);
  });
});

describe('OpenRouterPlanner — request shaping', () => {
  const capture = () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: 'forty dollars' } }] }), {
        status: 200, headers: { 'content-type': 'application/json' },
      });
    };
    return { calls, fetchImpl: fetchImpl as unknown as typeof fetch };
  };

  test('calls OpenRouter with bearer auth and the configured model', async () => {
    const { calls, fetchImpl } = capture();
    const p = new OpenRouterPlanner({ apiKey: 'sk-test', model: 'test/model', fetchImpl });
    await p.answer('what is the price?', 'Widget costs $40', { title: 'Shop', url: 'https://shop.test' });

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toContain('openrouter.ai');
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(String(calls[0]!.init.body)).model).toBe('test/model');
  });

  test('returns the model answer, trimmed', async () => {
    const { fetchImpl } = capture();
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl });
    const a = await p.answer('price?', 'Widget costs $40', { title: 'x', url: 'y' });
    expect(a.answered).toBe(true);
    expect(a.text).toBe('forty dollars');
  });

  test('truncates a huge page rather than shipping the whole DOM to the model', async () => {
    const { calls, fetchImpl } = capture();
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl, maxPageChars: 500 });
    await p.answer('q', 'x'.repeat(50_000), { title: 't', url: 'u' });
    expect(String(calls[0]!.init.body).length).toBeLessThan(4000);
  });

  test('a failing API degrades to an honest answer, never a crash', async () => {
    const failing = (async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl: failing });
    const a = await p.answer('q', 'page', { title: 't', url: 'u' });
    expect(a.answered).toBe(false);
    expect(a.text).toMatch(/500|failed|error/i);
  });

  test('tool choice asks for JSON and parses it', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"tool":"search_wikipedia","args":{"search":"otters"}}' } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl });
    const d = await p.choose('find otters', TOOLS, { title: 'x', url: 'y' });
    expect(d.kind).toBe('call');
    if (d.kind === 'call') { expect(d.tool).toBe('search_wikipedia'); expect(d.args.search).toBe('otters'); }
  });

  test('a model naming a tool that does not exist is refused, not forwarded', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"tool":"launch_missiles","args":{}}' } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl });
    const d = await p.choose('do it', TOOLS, { title: 'x', url: 'y' });
    expect(d.kind).toBe('give_up');
    if (d.kind === 'give_up') expect(d.reason).toContain('launch_missiles');
  });

  test('a model returning prose instead of JSON degrades rather than throwing', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Sure! I'd use the search tool." } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl });
    const d = await p.choose('find otters', TOOLS, { title: 'x', url: 'y' });
    expect(['give_up', 'call']).toContain(d.kind);
  });

  test('JSON wrapped in a code fence is still parsed', async () => {
    const fetchImpl = (async () => new Response(JSON.stringify({
      choices: [{ message: { content: '```json\n{"tool":"sign_in","args":{"email":"a@b.c"}}\n```' } }],
    }), { status: 200 })) as unknown as typeof fetch;
    const p = new OpenRouterPlanner({ apiKey: 'k', model: 'm', fetchImpl });
    const d = await p.choose('log me in', TOOLS, { title: 'x', url: 'y' });
    expect(d.kind).toBe('call');
    if (d.kind === 'call') expect(d.tool).toBe('sign_in');
  });
});
