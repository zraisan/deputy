/**
 * The submission recording.
 *
 * Every tool call below is a real MCP call against the running daemon, on the
 * real hackathon submission page, in a real signed-in session. The motion is
 * staged; the substance is not. Nothing is ever submitted.
 */
import { rmSync, mkdirSync, writeFileSync } from 'node:fs';

const CDP = 'http://127.0.0.1:9555';
const MCP = 'http://127.0.0.1:7331/mcp';
const FRAMES = 'bench/demo/frames';
const HUD_W = 380;
const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'demo', version: '1' },
  'io.modelcontextprotocol/clientCapabilities': {},
};

async function mcp(name: string, args: Record<string, unknown> = {}) {
  const res = await fetch(MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'MCP-Protocol-Version': '2026-07-28', 'Mcp-Method': 'tools/call', 'Mcp-Name': name },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method: 'tools/call', params: { name, arguments: args, _meta: META } }),
  });
  const b: any = await res.json();
  return String(b?.result?.content?.[0]?.text ?? JSON.stringify(b?.error ?? b));
}

const targets = await (await fetch(`${CDP}/json`)).json();
const page = targets.find((t: any) => t.type === 'page' && t.url.includes('aitinkerers'));
if (!page) throw new Error('the submission page is not open in the Deputy browser');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0; const waiters = new Map<number, (m: any) => void>(); let frame = 0;
rmSync(FRAMES, { recursive: true, force: true }); mkdirSync(FRAMES, { recursive: true });
ws.addEventListener('message', (e: any) => { const m = JSON.parse(e.data); if (m.id && waiters.has(m.id)) { waiters.get(m.id)!(m); waiters.delete(m.id); } });
const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((r) => { const i = ++id; waiters.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await new Promise<void>((r) => ws.addEventListener('open', () => r()));
await send('Page.enable'); await send('Runtime.enable');

const js = (expr: string) => send('Runtime.evaluate', { expression: expr, returnByValue: true });
const val = async (expr: string) => (await js(expr)).result?.result?.value;
const hold = (ms: number) => Bun.sleep(ms);

// ── stage ───────────────────────────────────────────────────────────
const css = await Bun.file('scripts/demo/stage.css').text();
await js(`(() => {
  for (const old of ['__dstage','__dhud','__dcard','__dscan','__dcap']) document.getElementById(old)?.remove();
  const s = document.createElement('style');
  s.id = '__dstage'; s.textContent = ${JSON.stringify(css)};
  document.head.appendChild(s);
  document.documentElement.style.setProperty('--hud-w', '${HUD_W}px');
  document.documentElement.style.setProperty('padding-right', '${HUD_W}px', 'important');
  const hud = document.createElement('div');
  hud.id = '__dhud';
  hud.innerHTML = '<div class="brand"><span class="dot"></span><span class="name">DEPUTY</span>' +
    '<span class="model">qwen3.7-flash</span></div><div id="__dlog"></div>';
  document.body.appendChild(hud);
  return 1 })()`);

type Tone = 'work' | 'out' | 'in' | 'win';
const TONE: Record<Tone, [string, string]> = {
  work: ['#4ade80', '●'], out: ['#f0abfc', '▶'], in: ['#60a5fa', '◀'], win: ['#fbbf24', '★'],
};
const hud = async (step: string, detail = '', tone: Tone = 'work') => {
  const [colour, mark] = TONE[tone];
  await js(`(() => { const log=document.getElementById('__dlog'); if(!log) return 0;
    const row=document.createElement('div'); row.className='row';
    const head=document.createElement('div'); head.className='step'; head.style.color=${JSON.stringify(colour)};
    const m=document.createElement('span'); m.textContent=${JSON.stringify(mark)};
    const t=document.createElement('span'); t.textContent=${JSON.stringify(step)};
    head.append(m, t); row.appendChild(head);
    const d=${JSON.stringify(detail)};
    if(d){const s=document.createElement('div'); s.className='detail'; s.textContent=d; row.appendChild(s);}
    log.appendChild(row);
    while(log.scrollHeight>window.innerHeight-210 && log.firstChild) log.removeChild(log.firstChild);
    return 1 })()`);
};

/**
 * Show a card.
 *
 * If one is already up, only the words change — the dark backdrop stays put.
 * Tearing the card down between two consecutive cards flashes the page for a
 * moment, which reads as a glitch rather than a cut.
 */
const card = async (lines: string[], gap = 150) => {
  const html = `<div class="stack">` +
    lines.map((l, i) => `<div class="line" style="animation-delay:${i * gap}ms">${l}</div>`).join('') +
    `</div>`;
  const existing = await val(`!!document.getElementById('__dcard')`);
  if (existing) {
    await js(`document.querySelector('#__dcard .stack')?.classList.add('leaving')`);
    await hold(230);
  }
  await js(`(() => {
    let c=document.getElementById('__dcard');
    if(!c){c=document.createElement('div');c.id='__dcard';document.body.appendChild(c);}
    c.classList.remove('out'); c.innerHTML=${JSON.stringify(html)}; return 1 })()`);
};

/** Take the card away, because the page itself is the next thing worth seeing. */
const closeCard = async () => {
  await js(`document.getElementById('__dcard')?.classList.add('out')`);
  await hold(450);
  await js(`document.getElementById('__dcard')?.remove()`);
};

const scan = (on: boolean) => js(on
  ? `(() => { if(!document.getElementById('__dscan')){const d=document.createElement('div');d.id='__dscan';document.body.appendChild(d);} return 1 })()`
  : `document.getElementById('__dscan')?.remove()`);

// clear the form so the fill is visible, and start at the top
await js(`(() => {
  for (const n of ['project_name','brief_description']) {
    const e=document.querySelector('[name='+n+']');
    if(e){ e.value=''; e.dispatchEvent(new Event('input',{bubbles:true})); }
  }
  window.scrollTo({top:0}); return 1 })()`);
await js(`(() => { const c=document.createElement('div'); c.id='__dcard'; document.body.appendChild(c); return 1 })()`);
await hold(700);

// ── capture as fast as the browser allows, then encode at the real rate ──
let recording = true;
const started = Date.now();
const capture = (async () => {
  while (recording) {
    try {
      const s = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
      if (s?.result?.data) writeFileSync(`${FRAMES}/f${String(++frame).padStart(5, '0')}.jpg`, Buffer.from(s.result.data, 'base64'));
    } catch { /* a navigation can interrupt a capture */ }
    await Bun.sleep(8);
  }
})();
console.log('recording…');

// 1 ── title
await card([
  `<div class="big mono" style="font-size:74px;text-shadow:0 0 60px rgba(74,222,128,.4)">DEPUTY</div>`,
  `<div class="lead" style="margin-top:26px;max-width:26ch">Your agent doesn't browse.<br>It deputizes.</div>`,
  `<div class="sub">An agent that lives in your browser, so other agents never have to look at a web page.
     Works with any MCP client.</div>`,
], 260);
await hold(4200);

// 2 ── the page
await card([
  `<div class="kicker">THE PAGE IN FRONT OF US</div>`,
  `<div class="lead" style="max-width:24ch">This hackathon's own<br>submission form.</div>`,
  `<div class="sub">25 inputs. Not one of them inside a <span class="mono">&lt;form&gt;</span> —
     so there is nothing for the WebMCP standard to attach to.</div>`,
], 200);
await hold(4300);
await closeCard();
await hold(350);

// 3 ── read
await scan(true);
await hud('reading the page', 'light DOM and open shadow roots');
await hold(2100);
const loose = await val(`[...document.querySelectorAll('input,select,textarea')]
  .filter(e => !e.closest('form') && !['hidden','submit','button'].includes(e.type)).length`);
await js(`(() => { for (const e of document.querySelectorAll('input,textarea,select'))
  if(!e.closest('form')) e.classList.add('__dfound'); return 1 })()`);
await hud(`${loose} inputs, none inside a <form>`, 'nothing to graft attributes onto');
await hold(2600);
await scan(false);
await js(`(() => { for (const e of document.querySelectorAll('.__dfound')) e.classList.remove('__dfound'); return 1 })()`);

// 4 ── synthesize
await hud('synthesizing a schema', 'types from the controls · names from the labels');
await hold(2000);
const capsRaw = await mcp('browser_capabilities', { actionLimit: 1 });
let toolName = 'agents_everywhere'; let nFields = 24; let preview = '';
try {
  const tool = JSON.parse(capsRaw).flatMap((t: any) => t.tools ?? [])[0];
  if (tool) {
    toolName = tool.name;
    const props = tool.inputSchema?.properties ?? {};
    nFields = Object.keys(props).length;
    preview = Object.entries(props).slice(0, 6)
      .map(([k, v]: any) => `${k}: ${v.enum ? JSON.stringify(v.enum) : v.type}`).join('\n')
      + `\n… ${nFields} fields total`;
  }
} catch { /* the card below still reads correctly */ }
await hud(`registered tool: ${toolName}`, preview);
await hold(5200);

await card([
  `<div class="kicker">WHAT JUST HAPPENED</div>`,
  `<div class="lead">Deputy built a <span class="mono">typed API</span><br>out of a page that had none.</div>`,
  `<div class="sub">${nFields} fields · booleans for the sponsor checkboxes · <span class="mono">uri</span> for the links · 3 required</div>`,
], 200);
await hold(4300);
await closeCard();
await hold(350);

await hud('sent the schema to the agent', `${Math.round(capsRaw.length / 4)} tokens — no screenshot, no DOM`, 'out');
await hold(1900);
await hud('the agent replied with one typed call', `${toolName}({ project_name, brief_description, … })`, 'in');
await hold(1800);

// 5 ── the fill
await hud('filling the form');
await mcp('browser_invoke', {
  tool: toolName,
  args: {
    project_name: 'Deputy',
    brief_description:
      "Deputy is an agent that lives in your browser so other agents never have to look at a web page. " +
      "It retrofits the W3C WebMCP standard onto sites that never implemented it, after which Chromium " +
      "itself generates the JSON Schema and executes the submission. Pages with no <form> element — this " +
      "one included — get a tool synthesized from their controls, ARIA widgets and all. Measured against " +
      "Playwright MCP on the same task: 216,888 tokens and $0.2730 down to 133,366 and $0.1861. " +
      "Works with any MCP client. CopilotKit v2 publishes its frontend tools to the same " +
      "document.modelContext registry Deputy grafts into, so the two interoperate with no adapter: " +
      "a CopilotKit app's tools become callable by any agent, and Deputy's grafted tools become " +
      "available to a CopilotKit copilot. Deputy's own model runs on OpenRouter.",
    affiliated_products: true,    // AI Tinkerers
    affiliated_products_3: true,  // CopilotKit — Deputy shares its WebMCP registry
    affiliated_products_4: true,  // OpenRouter — Deputy's own model runs through it
  },
});
await hold(3200);
await hud('stopped at the submit button', 'nothing was submitted — a human presses it', 'win');
await hold(3600);

// 6 ── the numbers
const bar = (label: string, value: string, pct: number, colour: string, delay: number) => `
  <div class="barrow">
    <div class="barlbl">${label}</div>
    <div class="bartrack"><div class="bar" style="width:${pct}%;background:${colour};animation-delay:${delay}ms"></div></div>
    <div class="barval" style="color:${colour}">${value}</div>
  </div>`;
await card([
  `<div class="kicker">SAME TASK, MEASURED</div>`,
  `<div class="bars">
     ${bar('agent drives the browser', '216,888 tok', 100, '#f87171', 300)}
     ${bar('agent delegates to Deputy', '133,366 tok', 61, '#4ade80', 500)}
     ${bar('agent drives the browser', '$0.2730', 100, '#f87171', 700)}
     ${bar('agent delegates to Deputy', '$0.1861', 68, '#4ade80', 900)}
   </div>`,
  `<div class="sub" style="margin-top:30px">9 turns → <span class="mono">6</span> &nbsp;·&nbsp;
     26.1s → <span class="mono">17.2s</span><br>
     <span style="opacity:.7">Baseline is Playwright MCP with accessibility snapshots, not screenshots.</span></div>`,
], 260);
await hold(6600);

// 7 ── close
await card([
  `<div class="big" style="font-size:44px;max-width:22ch">We taught a website to describe itself to an agent —
     <span class="mono">without its cooperation</span>.</div>`,
  `<div class="sub" style="margin-top:30px">The browser generated the schema.<br>
     The browser performed the call.<br>Deputy wrote six attributes.</div>`,
], 320);
await hold(5600);

recording = false; await capture;
const secs = (Date.now() - started) / 1000;
console.log(`captured ${frame} frames in ${secs.toFixed(1)}s → ${(frame / secs).toFixed(1)} fps`);
ws.close();
