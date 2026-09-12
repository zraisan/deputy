/**
 * Deputy's nervous system.
 *
 * The service worker owns nothing important, deliberately: MV3 kills it after
 * 30s idle, so any state here would be lost. It reconnects to the daemon on
 * every wake, and the daemon reconciles from scratch.
 */
import { KEEPALIVE_MS, type Downstream, type TabEntry, type Upstream } from '../../shared/src/protocol';

const DAEMON = 'ws://127.0.0.1:7331/ext';

let socket: WebSocket | null = null;
let keepalive: ReturnType<typeof setInterval> | undefined;

const send = (msg: Upstream) => {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
};

async function tabState(tabId: number): Promise<TabEntry | null> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { op: 'readTab' });
    if (!res?.ok) return null;
    return { tabId, ...res.state };
  } catch {
    return null; // no content script here (chrome://, the web store, a dead tab)
  }
}

async function reportAllTabs() {
  const tabs = await chrome.tabs.query({});
  const entries: TabEntry[] = [];
  for (const t of tabs) {
    if (t.id == null) continue;
    const state = await tabState(t.id);
    if (state) entries.push(state);
  }
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  send({ t: 'tabs', tabs: entries, activeTabId: active?.id ?? null });
}

async function handle(msg: Downstream) {
  try {
    if (msg.op === 'invoke') {
      const res = await chrome.tabs.sendMessage(msg.tabId, { op: 'invoke', tool: msg.tool, args: msg.args });
      if (!res?.ok) throw new Error(res?.error ?? 'the page did not respond');
      send({ t: 'reply', id: msg.id, ok: true, result: res.result });
      // The action may have changed the page; re-read rather than let the
      // daemon hold a stale tool list.
      const after = await tabState(msg.tabId);
      if (after) send({ t: 'tab', tab: after });
      return;
    }
    if (msg.op === 'fill') {
      const res = await chrome.tabs.sendMessage(msg.tabId, { op: 'fill', ref: msg.ref, value: msg.value });
      if (!res?.ok) throw new Error(res?.error ?? 'the page did not respond');
      send({ t: 'reply', id: msg.id, ok: true, result: res.result });
      return;
    }
    if (msg.op === 'click') {
      const res = await chrome.tabs.sendMessage(msg.tabId, { op: 'click', ref: msg.ref });
      if (!res?.ok) throw new Error(res?.error ?? 'the page did not respond');
      send({ t: 'reply', id: msg.id, ok: true, result: res.result });
      const after = await tabState(msg.tabId);
      if (after) send({ t: 'tab', tab: after });
      return;
    }
    if (msg.op === 'read') {
      const res = await chrome.tabs.sendMessage(msg.tabId, { op: 'read' });
      if (!res?.ok) throw new Error(res?.error ?? 'the page did not respond');
      send({ t: 'reply', id: msg.id, ok: true, result: res.result });
      return;
    }
    if (msg.op === 'annotate') {
      await chrome.tabs.sendMessage(msg.tabId, { op: 'annotate' });
      const after = await tabState(msg.tabId);
      send({ t: 'reply', id: msg.id, ok: true, result: after });
      return;
    }
    if (msg.op === 'navigate') {
      await chrome.tabs.update(msg.tabId, { url: msg.url });
      await new Promise<void>((resolve) => {
        const done = (id: number, info: chrome.tabs.TabChangeInfo) => {
          if (id === msg.tabId && info.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(done);
            resolve();
          }
        };
        chrome.tabs.onUpdated.addListener(done);
        setTimeout(() => { chrome.tabs.onUpdated.removeListener(done); resolve(); }, 15_000);
      });
      const after = await tabState(msg.tabId);
      send({ t: 'reply', id: msg.id, ok: true, result: after });
      return;
    }
    if (msg.op === 'readTabs') {
      await reportAllTabs();
      send({ t: 'reply', id: msg.id, ok: true, result: null });
      return;
    }
  } catch (err) {
    send({ t: 'reply', id: (msg as { id: string }).id, ok: false, error: String(err) });
  }
}

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
  socket = new WebSocket(DAEMON);

  socket.onopen = () => {
    // Traffic on the socket resets the MV3 idle timer (Chrome 116+), so the
    // keepalive keeps this worker alive as a side effect of doing its job.
    keepalive = setInterval(() => send({ t: 'ping' }), KEEPALIVE_MS);
    void reportAllTabs();
  };
  socket.onmessage = (e) => { void handle(JSON.parse(e.data) as Downstream); };
  socket.onclose = () => { clearInterval(keepalive); socket = null; };
  socket.onerror = () => { try { socket?.close(); } catch {} };
}

// Every entry point reconnects: the worker is restarted constantly and this
// top-level code runs again each time.
connect();
chrome.runtime.onStartup.addListener(connect);
chrome.runtime.onInstalled.addListener(connect);

// Belt and braces: an alarm wakes us if the socket died while we were asleep.
chrome.alarms.create('deputy-reconnect', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(() => connect());

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.t === 'tabState' && sender.tab?.id != null) {
    send({ t: 'tab', tab: { tabId: sender.tab.id, ...msg.state }, active: sender.tab.active });
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => send({ t: 'tabGone', tabId }));
chrome.tabs.onActivated.addListener(({ tabId }) => {
  send({ t: 'activeTab', tabId });
  void tabState(tabId).then((s) => { if (s) send({ t: 'tab', tab: s, active: true }); });
});
chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (info.status === 'complete') void tabState(tabId).then((s) => { if (s) send({ t: 'tab', tab: s }); });
});
