/**
 * Point Deputy at a spread of real sites and report what it makes of each.
 * The goal is to find where it produces nothing, or something useless — those
 * are the bugs worth having.
 */
const MCP = 'http://127.0.0.1:7331/mcp';
const META = {
  'io.modelcontextprotocol/protocolVersion': '2026-07-28',
  'io.modelcontextprotocol/clientInfo': { name: 'sweep', version: '1' },
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
  return String(b?.result?.content?.[0]?.text ?? JSON.stringify(b?.error ?? b));
}

const SITES: Array<[string, string]> = [
  ['DuckDuckGo (search)', 'https://duckduckgo.com/'],
  ['Wikipedia (search + settings)', 'https://en.wikipedia.org/wiki/Main_Page'],
  ['GitHub (search, React)', 'https://github.com/search'],
  ['Hacker News (login form)', 'https://news.ycombinator.com/login'],
  ['npm (search)', 'https://www.npmjs.com/'],
  ['MDN (search)', 'https://developer.mozilla.org/en-US/'],
  ['W3C HTML form spec demo', 'https://www.w3schools.com/html/html_forms.asp'],
  ['Stack Overflow (search)', 'https://stackoverflow.com/'],
];

const rows: string[] = [];
for (const [label, url] of SITES) {
  try {
    await mcp('browser_navigate', { url });
    await Bun.sleep(2500);
    const raw = await mcp('browser_capabilities', { actionLimit: 3 });
    let tools: any[] = [];
    let actions = 0;
    let total = 0;
    try {
      const tabs = JSON.parse(raw);
      for (const t of tabs) {
        if (!t.url?.includes(new URL(url).hostname.replace('www.', ''))) continue;
        tools = t.tools ?? [];
        actions = (t.actions ?? []).length;
        const m = String(t.actionsTruncated ?? '').match(/of (\d+)/);
        total = m ? Number(m[1]) : actions;
      }
    } catch { /* keep going */ }

    const summary = tools.length
      ? tools.map((t) => `${t.name}(${Object.keys(t.inputSchema?.properties ?? {}).length}f/${t.source})`).join(' ')
      : '— none —';
    rows.push(`${label.padEnd(32)} tools: ${summary.padEnd(46)} actions: ${total}  ~${Math.round(raw.length / 4)} tok`);
    console.log(rows.at(-1));
  } catch (err) {
    rows.push(`${label.padEnd(32)} ERROR ${err}`);
    console.log(rows.at(-1));
  }
}
console.log('\n--- summary ---');
console.log(rows.join('\n'));
