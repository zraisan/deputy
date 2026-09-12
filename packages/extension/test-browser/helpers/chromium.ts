/**
 * Integration harness: a real Chromium with WebMCP enabled.
 *
 * Chromium is the system under test here — it synthesizes the JSON Schema and
 * executes the form submission. Mocking it would test nothing of value, so
 * these tests drive the real browser over CDP.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export type RegisteredTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export class ChromiumHarness {
  private static live = new Set<ChromiumHarness>();
  private static armed = false;
  private static armGlobalCleanup(h: ChromiumHarness) {
    ChromiumHarness.live.add(h);
    if (ChromiumHarness.armed) return;
    ChromiumHarness.armed = true;
    const reap = () => { for (const x of ChromiumHarness.live) x.stopSync(); };
    process.on('exit', reap);
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
      process.on(sig, () => { reap(); process.exit(130); });
    }
    process.on('uncaughtException', (e) => { reap(); throw e; });
  }

  /** Synchronous best-effort teardown, safe to call from an exit handler. */
  stopSync() {
    try { if (this.proc?.pid) process.kill(-this.proc.pid, 'SIGKILL'); } catch {}
    try { this.server?.stop(true); } catch {}
    ChromiumHarness.live.delete(this);
  }

  private proc?: ChildProcess;
  private ws?: WebSocket;
  private server?: ReturnType<typeof Bun.serve>;
  private nextId = 0;
  private waiters = new Map<number, (m: any) => void>();
  private profile = '';
  events: any[] = [];

  async start(fixtureDir: string, port = 0) {
    this.server = Bun.serve({
      port,
      hostname: '127.0.0.1',
      fetch: (req) => {
        const name = new URL(req.url).pathname.replace(/^\//, '') || 'index.html';
        const path = join(fixtureDir, name);
        if (!existsSync(path)) return new Response('not found', { status: 404 });
        return new Response(readFileSync(path), { headers: { 'content-type': 'text/html; charset=utf-8' } });
      },
    });

    // Fixed, greppable marker so scripts/kill-browsers.sh can always find strays.
    this.profile = mkdtempSync(join(tmpdir(), 'deputy-test-profile-'));
    const debugPort = 9400 + Math.floor(Math.random() * 500);
    this.proc = spawn('chromium', [
      '--headless=new', '--no-sandbox',
      `--remote-debugging-port=${debugPort}`,
      `--user-data-dir=${this.profile}`,
      '--enable-features=WebMCPTesting',
      // Resource ceiling. An earlier leak of these put the machine into swap;
      // a test browser has no business holding a normal browser's footprint.
      '--no-zygote',
      '--renderer-process-limit=1',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
      '--js-flags=--max-old-space-size=256',
      'about:blank',
    ], { stdio: 'ignore', detached: true });

    // Cleanup on every exit path, not just a clean afterAll. A timed-out or
    // crashed test run must not orphan a browser.
    ChromiumHarness.armGlobalCleanup(this);

    for (let i = 0; i < 80; i++) {
      try { await fetch(`http://127.0.0.1:${debugPort}/json/version`); break; }
      catch { await Bun.sleep(250); }
    }
    const target = await (await fetch(`http://127.0.0.1:${debugPort}/json/new?about:blank`, { method: 'PUT' })).json();
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    this.ws.addEventListener('message', (e: any) => {
      const m = JSON.parse(e.data);
      if (m.id && this.waiters.has(m.id)) { this.waiters.get(m.id)!(m); this.waiters.delete(m.id); }
      else if (m.method) this.events.push(m);
    });
    await new Promise<void>((r) => this.ws!.addEventListener('open', () => r()));
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('WebMCP.enable');
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    return new Promise((resolve) => {
      const id = ++this.nextId;
      this.waiters.set(id, resolve);
      this.ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Navigate to a fixture and wait for it to settle. */
  async open(fixture: string) {
    this.events = [];
    await this.send('Page.navigate', { url: `http://127.0.0.1:${this.server!.port}/${fixture}` });
    await Bun.sleep(700);
  }

  async eval<T = unknown>(expression: string): Promise<T> {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.result?.exceptionDetails) {
      throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluation threw');
    }
    return r.result?.result?.value as T;
  }

  /** Evaluate the bundled graft engine in the page. The bundle self-assigns globalThis.__graft. */
  async injectGraft(bundledSource: string) {
    await this.eval(bundledSource);
    const ok = await this.eval<boolean>('typeof globalThis.__graft === "object"');
    if (!ok) throw new Error('graft bundle did not expose globalThis.__graft');
  }

  /** What the browser itself says is registered right now. */
  async tools(): Promise<RegisteredTool[]> {
    const raw = await this.eval<string>(`(async () => {
      const mc = document.modelContext;
      if (!mc?.getTools) return '[]';
      const list = await mc.getTools();
      return JSON.stringify(list.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: typeof t.inputSchema === 'string' ? JSON.parse(t.inputSchema) : t.inputSchema,
      })));
    })()`);
    return JSON.parse(raw ?? '[]');
  }

  async frameId(): Promise<string> {
    const tree = await this.send('Page.getFrameTree');
    return tree.result.frameTree.frame.id;
  }

  /** Invoke through the browser's own WebMCP machinery, as a real agent would. */
  async invoke(toolName: string, input: Record<string, unknown>) {
    const before = this.events.length;
    const res = await this.send('WebMCP.invokeTool', { frameId: await this.frameId(), toolName, input });
    if (res.error) throw new Error(res.error.message);
    for (let i = 0; i < 40; i++) {
      const responded = this.events.slice(before).find((e) => e.method === 'WebMCP.toolResponded');
      if (responded) return responded.params;
      await Bun.sleep(100);
    }
    throw new Error(`no toolResponded for ${toolName}`);
  }

  async stop() {
    try { this.ws?.close(); } catch {}
    this.stopSync();
    try { rmSync(this.profile, { recursive: true, force: true }); } catch {}
  }
}

/** Bundle a source module to a single IIFE-ish string we can drop into a page. */
export async function bundleGraft(): Promise<string> {
  const out = await Bun.build({
    entrypoints: ['packages/extension/src/graft/index.ts'],
    target: 'browser',
    format: 'iife',
    minify: false,
  });
  if (!out.success) throw new AggregateError(out.logs, 'graft bundle failed');
  return await out.outputs[0]!.text();
}
