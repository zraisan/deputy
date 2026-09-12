import { describe, expect, test } from 'bun:test';
import { Registry } from '../src/registry';
import type { DeputyTool, TabEntry } from '../../shared/src/protocol';

const tool = (name: string, over: Partial<DeputyTool> = {}): DeputyTool => ({
  name, description: `the ${name} tool`, inputSchema: { type: 'object' },
  source: 'grafted', consequential: false, ...over,
});
const tab = (tabId: number, over: Partial<TabEntry> = {}): TabEntry => ({
  tabId, title: `Tab ${tabId}`, url: `https://site${tabId}.test/page`,
  origin: `https://site${tabId}.test`, tools: [tool('search')], ...over,
});

describe('tracking tabs', () => {
  test('starts empty', () => {
    const r = new Registry();
    expect(r.tabs()).toEqual([]);
    expect(r.activeTab()).toBeNull();
  });

  test('upsert adds then replaces, never duplicates', () => {
    const r = new Registry();
    r.upsert(tab(1));
    r.upsert(tab(1, { title: 'Renamed' }));
    expect(r.tabs()).toHaveLength(1);
    expect(r.tabs()[0]!.title).toBe('Renamed');
  });

  test('reconcile replaces the whole world', () => {
    const r = new Registry();
    r.upsert(tab(1));
    r.reconcile([tab(2), tab(3)], 3);
    expect(r.tabs().map((t) => t.tabId)).toEqual([2, 3]);
    expect(r.activeTab()?.tabId).toBe(3);
  });

  test('removing the active tab clears active rather than dangling', () => {
    const r = new Registry();
    r.reconcile([tab(1), tab(2)], 2);
    r.remove(2);
    expect(r.activeTab()).toBeNull();
    expect(r.tabs()).toHaveLength(1);
  });

  test('removing a non-active tab leaves active alone', () => {
    const r = new Registry();
    r.reconcile([tab(1), tab(2)], 2);
    r.remove(1);
    expect(r.activeTab()?.tabId).toBe(2);
  });
});

describe('resolving which tab to act on', () => {
  test('defaults to the active tab', () => {
    const r = new Registry();
    r.reconcile([tab(1), tab(2)], 2);
    expect(r.resolve().tabId).toBe(2);
  });

  test('an explicit id wins over active', () => {
    const r = new Registry();
    r.reconcile([tab(1), tab(2)], 2);
    expect(r.resolve(1).tabId).toBe(1);
  });

  test('explains itself when there is no tab at all', () => {
    expect(() => new Registry().resolve()).toThrow(/no .*tab/i);
  });

  test('explains itself when the named tab is gone', () => {
    const r = new Registry();
    r.reconcile([tab(1)], 1);
    expect(() => r.resolve(99)).toThrow(/99/);
  });

  test('falls back to a lone tab when none is marked active', () => {
    const r = new Registry();
    r.reconcile([tab(7)], null);
    expect(r.resolve().tabId).toBe(7);
  });
});

describe('finding tools', () => {
  test('finds a tool on the resolved tab', () => {
    const r = new Registry();
    r.reconcile([tab(1, { tools: [tool('book_a_table')] })], 1);
    expect(r.findTool('book_a_table')!.tool.name).toBe('book_a_table');
  });

  test('returns null for an unknown tool rather than throwing', () => {
    const r = new Registry();
    r.reconcile([tab(1)], 1);
    expect(r.findTool('nope')).toBeNull();
  });

  test('prefers the active tab when two tabs expose the same tool name', () => {
    const r = new Registry();
    r.reconcile([
      tab(1, { tools: [tool('search')] }),
      tab(2, { tools: [tool('search')] }),
    ], 2);
    expect(r.findTool('search')!.tab.tabId).toBe(2);
  });
});

describe('summarising for the planner', () => {
  test('a summary stays small — this is the whole point of the project', () => {
    const r = new Registry();
    r.reconcile([tab(1), tab(2), tab(3)], 1);
    // Generous ceiling; a page snapshot would be 14,000+ tokens.
    expect(JSON.stringify(r.summary()).length).toBeLessThan(2000);
  });

  test('the summary marks which tab is active', () => {
    const r = new Registry();
    r.reconcile([tab(1), tab(2)], 2);
    expect(r.summary().find((s) => s.tabId === 2)!.active).toBe(true);
    expect(r.summary().find((s) => s.tabId === 1)!.active).toBe(false);
  });

  test('the summary names tools without dragging their schemas along', () => {
    const r = new Registry();
    r.reconcile([tab(1, { tools: [tool('search'), tool('book')] })], 1);
    const s = r.summary()[0]!;
    expect(s.tools).toEqual(['search', 'book']);
    expect(JSON.stringify(s)).not.toContain('inputSchema');
  });
});

describe('change detection', () => {
  test('reports a version that moves only when something changed', () => {
    const r = new Registry();
    const v0 = r.version();
    r.upsert(tab(1));
    const v1 = r.version();
    expect(v1).not.toBe(v0);
    r.upsert(tab(1)); // identical payload
    expect(r.version()).toBe(v1);
  });

  test('a changed tool list moves the version', () => {
    const r = new Registry();
    r.upsert(tab(1));
    const before = r.version();
    r.upsert(tab(1, { tools: [tool('search'), tool('login')] }));
    expect(r.version()).not.toBe(before);
  });
});
