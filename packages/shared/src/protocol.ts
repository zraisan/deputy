/**
 * The contract between the daemon and the extension.
 *
 * Shared source of truth: both sides import these types, so a change that
 * breaks one side fails to compile on the other.
 */

export type ToolSource = 'native' | 'grafted';

export type DeputyTool = {
  name: string;
  description: string;
  /** JSON Schema, synthesized by Chromium. Opaque to us. */
  inputSchema: Record<string, unknown>;
  source: ToolSource;
  /** Non-GET forms change things; the browser withholds auto-submit for these. */
  consequential: boolean;
};

export type TabEntry = {
  tabId: number;
  title: string;
  url: string;
  origin: string;
  tools: DeputyTool[];
  /** Buttons and links that are not part of a grafted form. */
  actions?: Array<Record<string, unknown>>;
  /** Current field values, keyed by tool name. */
  values?: Record<string, Record<string, unknown>>;
};

/** extension → daemon */
export type Upstream =
  | { t: 'ping' }
  | { t: 'tabs'; tabs: TabEntry[]; activeTabId: number | null }
  | { t: 'tab'; tab: TabEntry; active?: boolean }
  | { t: 'tabGone'; tabId: number }
  | { t: 'activeTab'; tabId: number }
  | { t: 'reply'; id: string; ok: true; result: unknown }
  | { t: 'reply'; id: string; ok: false; error: string };

/** daemon → extension */
export type Downstream =
  | { id: string; op: 'invoke'; tabId: number; tool: string; args: Record<string, unknown> }
  | { id: string; op: 'annotate'; tabId: number }
  | { id: string; op: 'navigate'; tabId: number; url: string }
  | { id: string; op: 'read'; tabId: number }
  | { id: string; op: 'click'; tabId: number; ref: string }
  | { id: string; op: 'fill'; tabId: number; ref: string; value: string }
  | { id: string; op: 'readTabs' };

export const KEEPALIVE_MS = 20_000;
export const CALL_TIMEOUT_MS = 30_000;
