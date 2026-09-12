/**
 * Integration: Graft annotates a real page in real Chromium, and Chromium
 * registers real, callable WebMCP tools as a result.
 *
 * Chromium is the system under test. It synthesizes every JSON Schema asserted
 * here and performs every form submission — we only write attributes.
 */
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { ChromiumHarness, bundleGraft } from './helpers/chromium';

const FIXTURES = 'packages/extension/test-browser/fixtures';
const h = new ChromiumHarness();
let bundle = '';

beforeAll(async () => {
  bundle = await bundleGraft();
  await h.start(FIXTURES);
});
afterAll(async () => { await h.stop(); });

/** Load a fixture, run the retrofit engine, return what the browser registered. */
async function graft(fixture: string) {
  await h.open(fixture);
  await h.injectGraft(bundle);
  const report = await h.eval<any>('JSON.stringify(globalThis.__graft.annotateDocument(document))')
    .then((s) => JSON.parse(s as string));
  await Bun.sleep(400); // registration is scheduled, not synchronous
  return { report, tools: await h.tools() };
}

describe('the Wikipedia regression, end to end', () => {
  test('both copies of the search form become distinctly named, meaningful tools', async () => {
    const { tools } = await graft('wikipedia-like.html');
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(['search_wikipedia', 'search_wikipedia_2']);
    // The failure this replaced: "w_index_php_0" / "w_index_php_1".
    for (const n of names) expect(n).not.toContain('index');
  });

  test('the tool actually searches when an agent calls it', async () => {
    await graft('wikipedia-like.html');
    const responded = await h.invoke('search_wikipedia', { search: 'Byzantine Empire' });
    expect(responded.status).toBe('Completed');
    expect(String(responded.output)).toContain('Byzantine Empire');

    const subs = await h.eval<any[]>('window.__submissions');
    expect(subs).toHaveLength(1);
    expect(subs[0].data.search).toBe('Byzantine Empire');
    expect(subs[0].agentInvoked).toBe(true); // the page can tell an agent did this
  });
});

describe('schema synthesis — Chromium does the hard part', () => {
  test('types, formats, enums and required-ness are derived from the markup', async () => {
    const { tools } = await graft('booking.html');
    const tool = tools.find((t) => t.name === 'book_a_table');
    expect(tool).toBeDefined();

    const props = tool!.inputSchema.properties as Record<string, any>;
    expect(props.party_size.type).toBe('number');
    expect(props.date.format).toBe('date');
    expect(props.seating.enum).toEqual(['indoor', 'outdoor']);
    expect(tool!.inputSchema.required).toEqual(expect.arrayContaining(['party_size', 'date']));
  });

  test('hidden fields are never exposed as parameters', async () => {
    const { tools } = await graft('booking.html');
    const props = tools.find((t) => t.name === 'book_a_table')!.inputSchema.properties as Record<string, any>;
    expect(props.csrf).toBeUndefined();
  });

  test('labels become parameter descriptions the agent can read', async () => {
    const { tools } = await graft('booking.html');
    const props = tools.find((t) => t.name === 'book_a_table')!.inputSchema.properties as Record<string, any>;
    expect(props.party_size.description).toContain('Party size');
  });
});

describe('naming on a real login form', () => {
  test('prefers the action label over the first field label', async () => {
    const { tools } = await graft('login.html');
    expect(tools.map((t) => t.name)).toContain('sign_in');
  });
});

describe('coexisting with sites that implement WebMCP themselves', () => {
  test("a site's own declared tools survive untouched", async () => {
    const { tools } = await graft('native.html');
    const names = tools.map((t) => t.name);
    expect(names).toContain('native_declared');    // declarative, site-authored
    expect(names).toContain('imperative_declared'); // registerTool, site-authored
  });

  test('a plain form on the same page still gets grafted', async () => {
    const { tools } = await graft('native.html');
    expect(tools.map((t) => t.name)).toContain('send_feedback');
  });

  test('the report distinguishes what we added from what was already there', async () => {
    const { report } = await graft('native.html');
    expect(report.grafted).toEqual(['send_feedback']);
    expect(report.skipped).toContain('native-form');
  });
});

describe('idempotence — SPAs re-render constantly', () => {
  test('annotating twice changes nothing', async () => {
    await h.open('booking.html');
    await h.injectGraft(bundle);
    await h.eval('globalThis.__graft.annotateDocument(document)');
    await Bun.sleep(300);
    const first = (await h.tools()).map((t) => t.name).sort();

    const second = await h.eval<any>('JSON.stringify(globalThis.__graft.annotateDocument(document))')
      .then((s) => JSON.parse(s as string));
    await Bun.sleep(300);
    const after = (await h.tools()).map((t) => t.name).sort();

    expect(after).toEqual(first);
    expect(second.grafted).toEqual([]); // nothing new to do the second time
  });
});
