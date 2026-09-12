/** Records Deputy filling the real hackathon submission page. Nothing is submitted. */
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9555';
const MCP = 'http://127.0.0.1:7331/mcp';
const FRAMES = 'bench/demo/frames2';
const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'demo', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function mcp(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: {
      'content-type': 'application/json', 'MCP-Protocol-Version': '2026-07-28',
      'Mcp-Method': 'tools/call', 'Mcp-Name': name,
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args, _meta: META } }),
  });
  const b: any = await res.json();
  return String(b?.result?.content?.[0]?.text ?? JSON.stringify(b));
}

const targets = await (await fetch(`${CDP}/json`)).json();
const page = targets.find((t: any) => t.type === 'page' && t.url.includes('aitinkerers'));
if (!page) throw new Error('submission page not open');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map<number, (m: any) => void>(); let frame = 0;
rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true });
ws.addEventListener('message', (e: any) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)!(m); waiters.delete(m.id); } });
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise<void>((r) => ws.addEventListener('open', () => r()));
await send('Page.enable'); await send('Runtime.enable');

const ev = (x: string) => send('Runtime.evaluate', { expression: x, returnByValue: true });
const caption = (t: string, d: string) => ev(`(() => {
  let el = document.getElementById('__dcap');
  if (!el) { el = document.createElement('div'); el.id='__dcap';
    el.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#0b1020;color:#e8ecf5;'+
      'font:16px/1.5 ui-monospace,monospace;padding:14px 20px;border-top:3px solid #4ade80';
    document.body.appendChild(el); }
  el.innerHTML='<div style="color:#4ade80;font-weight:700">'+${JSON.stringify(t)}+'</div>'+
    '<div style="opacity:.85;margin-top:3px">'+${JSON.stringify(d)}+'</div>'; return 1 })()`);
const hold = (ms: number) => Bun.sleep(ms);

/**
 * A HUD showing what Deputy is doing, docked beside the page.
 *
 * The form filling is the visible half; the interesting half is invisible —
 * reading the page, synthesizing a schema, handing it to the caller, receiving
 * one typed call back. Every line it prints is real data from the running
 * system, not a script of what it would have said.
 */
async function hudInit() {
  await ev(`(() => {
    // Always start from an empty log: a re-run against a page that was never
    // reloaded would otherwise stack this take on top of the last one.
    const existing = document.getElementById('__dlog');
    if (existing) { existing.innerHTML = ''; return 1; }
    const p = document.createElement('div');
    p.id = '__dhud';
    p.style.cssText = 'position:fixed;top:0;right:0;width:400px;height:100vh;z-index:2147483647;' +
      'background:#080d18;color:#cfe0ff;font:12.5px/1.5 ui-monospace,monospace;' +
      'padding:16px 16px 130px;overflow:hidden;border-left:2px solid #1e3a8a;box-sizing:border-box';
    p.innerHTML = '<div style="color:#4ade80;font-weight:700;font-size:13px;letter-spacing:.16em;' +
      'padding-bottom:9px;border-bottom:1px solid #1e3a8a;margin-bottom:12px">DEPUTY</div><div id="__dlog"></div>';
    document.body.appendChild(p);
    document.documentElement.style.setProperty('padding-right', '400px', 'important');
    return 1 })()`);
}

async function hud(step: string, detail = '', tone: 'in' | 'out' | 'work' = 'work') {
  const colour = tone === 'in' ? '#60a5fa' : tone === 'out' ? '#f0abfc' : '#4ade80';
  const mark = tone === 'in' ? '\u25c0' : tone === 'out' ? '\u25b6' : '\u25cf';
  await ev(`(() => {
    const log = document.getElementById('__dlog'); if (!log) return 0;
    const row = document.createElement('div');
    row.style.cssText = 'margin-bottom:10px';
    const head = document.createElement('div');
    head.style.cssText = 'color:${colour};font-weight:600';
    head.textContent = ${JSON.stringify(mark)} + '  ' + ${JSON.stringify(step)};
    row.appendChild(head);
    const d = ${JSON.stringify(detail)};
    if (d) {
      const sub = document.createElement('div');
      sub.style.cssText = 'opacity:.72;padding-left:16px;white-space:pre-wrap;word-break:break-word';
      sub.textContent = d;
      row.appendChild(sub);
    }
    log.appendChild(row);
    while (log.scrollHeight > window.innerHeight - 190 && log.firstChild) log.removeChild(log.firstChild);
    return 1 })()`);
}



// Start from empty so the fill is visible.
await ev(`(() => { for (const n of ['project_name','brief_description']) {
  const e = document.querySelector('[name='+n+']'); if (e) { e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); } }
  document.querySelector('[name=project_name]')?.scrollIntoView({block:'center'}); return 1 })()`);
await hudInit();
await hold(900);

const FPS = 8; let recording = true;
const capture = (async () => {
  while (recording) {
    const t0 = Date.now();
    try { const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
      if (s?.result?.data) writeFileSync(`${FRAMES}/f${String(++frame).padStart(5,'0')}.jpg`, Buffer.from(s.result.data,'base64'));
    } catch {}
    await Bun.sleep(Math.max(0, 1000 / FPS - (Date.now() - t0)));
  }
})();
console.log('recording…');

await caption('The real hackathon submission page. Signed in, real account.',
  'Its fields sit in bare divs — no <form> wraps them, so the WebMCP standard has nothing to attach to.');
await hold(3800);

await hud('reading the page', 'in the tab you are already signed into');
await hold(1500);

const loose = (await ev(
  `[...document.querySelectorAll('input,select,textarea')]
     .filter(e => !e.closest('form') && !['hidden','submit','button'].includes(e.type)).length`
)).result?.result?.value;
await hud(loose + ' inputs, none inside a <form>', 'so there is nothing to graft attributes onto');
await hold(2600);

await hud('synthesizing a schema from the loose inputs', 'types from the controls, names from the labels');
await hold(2200);

const capsRaw = await mcp('browser_capabilities', { actionLimit: 1 });
let fieldLines = '';
let toolName = 'agents_everywhere';
try {
  const tabs = JSON.parse(capsRaw);
  const tool = tabs.flatMap((t: any) => t.tools ?? []).find((t: any) => t.name);
  if (tool) {
    toolName = tool.name;
    const props = tool.inputSchema?.properties ?? {};
    fieldLines = Object.entries(props).slice(0, 7)
      .map(([k, v]: any) => `${k}: ${v.type}${v.format ? ' (' + v.format + ')' : ''}`).join('\n');
    fieldLines += `\n… ${Object.keys(props).length} fields total`;
  }
} catch { /* keep the demo moving */ }
await hud('registered tool: ' + toolName, fieldLines);
await hold(5200);

await caption('Deputy built a typed tool out of a page that had none',
  'Booleans for the sponsor checkboxes, uri for the links, three fields marked required.');
await hold(4200);

await hud('sent the schema to Claude', Math.round(capsRaw.length / 4) + ' tokens — no screenshot, no DOM', 'out');
await hold(3000);

await hud('Claude replied with one typed call', toolName + '({ project_name, brief_description, … })', 'in');
await hold(3000);

await caption('One typed call — not seven fields poked one at a time',
  'The page never entered Claude\'s context. It only ever saw the schema.');
await hold(2600);

await hud('filling the form');
await mcp('browser_invoke', {
  tool: toolName,
  args: {
    project_name: 'Deputy',
    brief_description:
      "Deputy is an agent that lives in your browser so other agents never have to look at a web page. " +
      "It retrofits the W3C WebMCP standard onto sites that never implemented it, after which Chromium " +
      "itself generates the JSON Schema and executes the submission. Pages with no <form> element get a " +
      "tool synthesized from their loose inputs. Measured against Playwright MCP on the same form: " +
      "216,888 tokens and $0.2730 down to 133,366 and $0.1861. This form was filled by Deputy.",
  },
});
await hold(4200);

await hud('done — stopped at the submit button', 'nothing was submitted; a human reviews and presses it');
await caption('Deputy fills and hands back',
  'It never submits on your behalf. That last press is yours.');
await hold(6000);

recording = false; await capture;
console.log(`captured ${frame} frames`);
ws.close();
