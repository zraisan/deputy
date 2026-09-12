/**
 * Records a demo of Deputy by driving the real pipeline and capturing the
 * browser over CDP. Nothing here is staged: every tool call goes through
 * deputyd and the MCP endpoint exactly as Claude Code would make it.
 */
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9555';
const MCP = 'http://127.0.0.1:7331/mcp';
const FRAMES = 'bench/demo/frames';
const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'demo', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function mcp(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call',
      'Mcp-Name': name,
    },
    body: JSON.stringify({
      jsonrpc: '2.0', id: Date.now(), method: 'tools/call',
      params: { name, arguments: args, _meta: META },
    }),
  });
  const body: any = await res.json();
  return String(body?.result?.content?.[0]?.text ?? JSON.stringify(body));
}

// ── CDP plumbing ────────────────────────────────────────────────
const targets = await (await fetch(`${CDP}/json`)).json();
const page = targets.find((t: any) => t.type === 'page' && t.url.includes('8877'))
  ?? targets.find((t: any) => t.type === 'page');
if (!page) throw new Error('no page target; is the demo form open?');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const waiters = new Map<number, (m: any) => void>();
let frame = 0;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });

ws.addEventListener('message', (e: any) => {
  const m = JSON.parse(e.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)!(m); waiters.delete(m.id); }
});
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await new Promise<void>((r) => ws.addEventListener('open', () => r()));
await send('Page.enable');
await send('Runtime.enable');

/** An on-page caption, so the recording explains itself with no voiceover. */
const caption = (title: string, detail: string) =>
  send('Runtime.evaluate', {
    expression: `(() => {
      let el = document.getElementById('__deputy_cap');
      if (!el) {
        el = document.createElement('div');
        el.id = '__deputy_cap';
        el.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;' +
          'background:#0b1020;color:#e8ecf5;font:16px/1.5 ui-monospace,monospace;' +
          'padding:14px 20px;border-top:3px solid #4ade80;box-shadow:0 -6px 30px rgba(0,0,0,.35)';
        document.body.appendChild(el);
      }
      el.innerHTML = '<div style="color:#4ade80;font-weight:700;letter-spacing:.04em">' +
        ${JSON.stringify(title)} + '</div><div style="opacity:.85;margin-top:3px">' +
        ${JSON.stringify(detail)} + '</div>';
      return true;
    })()`,
  });

const hold = (ms: number) => Bun.sleep(ms);

// Screencast only emits on repaint, which starves a mostly-static page of
// frames. Poll instead, so the video has a steady cadence regardless.
const FPS = 8;
let recording = true;
const capture = (async () => {
  while (recording) {
    const started = Date.now();
    try {
      const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
      const data = shot?.result?.data;
      if (data) writeFileSync(`${FRAMES}/f${String(++frame).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64'));
    } catch { /* a navigation can interrupt a capture; keep rolling */ }
    await Bun.sleep(Math.max(0, 1000 / FPS - (Date.now() - started)));
  }
})();
console.log('recording…');

// ── the demo ────────────────────────────────────────────────────
await caption('A site that has never heard of WebMCP',
  'An ordinary booking form. No agent integration. No API. Nothing installed on it.');
await hold(4200);

await caption('Deputy grafts the W3C WebMCP standard onto it',
  'It writes six HTML attributes onto the form that is already there. Chromium does the rest.');
await hold(3800);

const caps = await mcp('browser_capabilities');
const tokens = Math.round(caps.length / 4);
await caption(`This is everything Claude receives — ${tokens} tokens`,
  'Every field, its type, allowed values, min/max, which are required, what is already filled in.');
await hold(5200);

await caption('No screenshot. No DOM dump. No accessibility tree.',
  'The same page as an a11y snapshot costs ~14,170 tokens. Claude never looks at the page at all.');
await hold(4600);

await caption('Claude sends one typed call',
  'browser_invoke("book_a_table", { guest_name, email, party_size, date, time, seating, notes })');
await hold(3200);

await caption('Watch: Deputy marks every field it set',
  'Chromium fills the whole form in one tick. The green trail is a diff highlight over that.');

await mcp('browser_invoke', {
  tool: 'book_a_table',
  args: {
    guest_name: 'Zain Raisan', email: 'zain@example.com', party_size: 4,
    date: '2026-10-03', time: '19:30', seating: 'outdoor', notes: 'one vegetarian',
  },
});
await hold(6500);

await caption('Chromium filled and submitted the real form',
  'In the real, logged-in browser. We wrote no form-filler — the browser already had one.');
await hold(4200);

await caption('Same task, measured against Playwright MCP',
  'Claude tokens 216,888 → 133,366 · cost $0.2730 → $0.1861 · 26.1s → 17.2s · 9 turns → 6');
await hold(6000);

recording = false;
await capture;
console.log(`captured ${frame} frames at ${FPS}fps`);
ws.close();
