/**
 * What the browser can do, right now.
 *
 * The registry is deliberately the *only* place tab state lives, and it holds
 * schemas rather than pages. `summary()` is what the planner sees — keeping it
 * small is not an optimisation, it is the project's reason to exist.
 */
import type { DeputyTool, TabEntry } from '../../shared/src/protocol';

export type TabSummary = {
  tabId: number;
  title: string;
  url: string;
  active: boolean;
  tools: string[];
};

export class Registry {
  private byId = new Map<number, TabEntry>();
  private active: number | null = null;
  private stamp = '0';

  private touch() {
    // A content hash, not a counter: the extension re-sends a tab on every
    // event, and an identical payload must not churn the MCP tool list or
    // wake the planner.
    const material = JSON.stringify({
      active: this.active,
      tabs: [...this.byId.values()]
        .sort((a, b) => a.tabId - b.tabId)
        .map((t) => ({ id: t.tabId, u: t.url, ti: t.title, to: t.tools.map((x) => x.name + ':' + x.source) })),
    });
    this.stamp = Bun.hash(material).toString(36);
  }

  version(): string { return this.stamp; }

  reconcile(tabs: TabEntry[], activeTabId: number | null) {
    this.byId = new Map(tabs.map((t) => [t.tabId, t]));
    this.active = activeTabId != null && this.byId.has(activeTabId) ? activeTabId : null;
    this.touch();
  }

  upsert(tab: TabEntry, active?: boolean) {
    this.byId.set(tab.tabId, tab);
    if (active) this.active = tab.tabId;
    this.touch();
  }

  remove(tabId: number) {
    this.byId.delete(tabId);
    if (this.active === tabId) this.active = null;
    this.touch();
  }

  setActive(tabId: number) {
    if (this.byId.has(tabId)) { this.active = tabId; this.touch(); }
  }

  tabs(): TabEntry[] { return [...this.byId.values()].sort((a, b) => a.tabId - b.tabId); }

  activeTab(): TabEntry | null {
    return this.active != null ? this.byId.get(this.active) ?? null : null;
  }

  /** Which tab a call should act on. Throws with something a human can act on. */
  resolve(tabId?: number): TabEntry {
    if (tabId != null) {
      const found = this.byId.get(tabId);
      if (!found) {
        throw new Error(
          `Tab ${tabId} is not open, or Deputy cannot see it. Open tabs: ${
            this.tabs().map((t) => t.tabId).join(', ') || 'none'
          }.`,
        );
      }
      return found;
    }
    const active = this.activeTab();
    if (active) return active;
    const all = this.tabs();
    if (all.length === 1) return all[0]!; // unambiguous, so don't be pedantic
    if (all.length === 0) throw new Error('There is no open tab for Deputy to act on. Open a page first.');
    throw new Error(
      `No tab is active. Name one explicitly: ${all.map((t) => `${t.tabId} (${t.title})`).join(', ')}.`,
    );
  }

  /** Active tab wins a name collision; otherwise first match by tab id. */
  findTool(name: string, tabId?: number): { tab: TabEntry; tool: DeputyTool } | null {
    const ordered = tabId != null
      ? [this.byId.get(tabId)].filter(Boolean) as TabEntry[]
      : [this.activeTab(), ...this.tabs()].filter(Boolean) as TabEntry[];
    for (const tab of ordered) {
      const tool = tab.tools.find((t) => t.name === name);
      if (tool) return { tab, tool };
    }
    return null;
  }

  /** The planner's whole view of the browser. Names only — schemas on demand. */
  summary(): TabSummary[] {
    return this.tabs().map((t) => ({
      tabId: t.tabId,
      title: t.title,
      url: t.url,
      active: t.tabId === this.active,
      tools: t.tools.map((x) => x.name),
    }));
  }

  toolCount(): number {
    return this.tabs().reduce((n, t) => n + t.tools.length, 0);
  }
}
