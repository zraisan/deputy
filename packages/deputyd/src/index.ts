/**
 * deputyd — the browser agent's body.
 *
 * Two protocol faces on one brain:
 *   POST /mcp   → MCP Streamable HTTP, for Claude Code and any MCP client
 *   GET  /ext   → WebSocket, for the browser extension
 *   GET  /health
 *
 * The daemon exists (rather than living in the extension) because an MV3
 * service worker dies after 30s idle and cannot listen on a port.
 */
import {
  McpServer,
  createMcpHandler,
  inputRequired,
  inputResponse,
  acceptedContent,
  originValidationResponse,
} from '@modelcontextprotocol/server';
import * as z from 'zod';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Registry } from './registry';
import { TaskStore, isInterrupted } from './tasks';
import { makePlanner, modelUsage, type Planner } from './planner';
import { CALL_TIMEOUT_MS, type Downstream, type Upstream } from '../../shared/src/protocol';

const PORT = Number(process.env.DEPUTY_PORT ?? 7331);

const registry = new Registry();
const tasks = new TaskStore();
const planner: Planner = makePlanner();

// ───────────────────────────────────────────── extension socket

let ext: { send(data: string): void } | null = null;
const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void; tabId?: number }>();

function callExtension(msg: Omit<Downstream, 'id'>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!ext) {
      reject(new Error('The Deputy extension is not connected. Is Chromium running with it loaded?'));
      return;
    }
    const id = randomUUID();
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`The browser did not answer within ${CALL_TIMEOUT_MS / 1000}s.`));
    }, CALL_TIMEOUT_MS);
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v); },
      reject: (e) => { clearTimeout(timer); reject(e); },
      tabId: (msg as { tabId?: number }).tabId,
    });
    ext.send(JSON.stringify({ id, ...msg }));
  });
}

/** A tab closing mid-call must fail the call, not leave it hanging forever. */
function failCallsForTab(tabId: number) {
  for (const [id, p] of pending) {
    if (p.tabId === tabId) {
      p.reject(new Error(`Tab ${tabId} closed while Deputy was working in it.`));
      pending.delete(id);
    }
  }
}

// ───────────────────────────────────────────── request state (signed)

const STATE_KEY = process.env.DEPUTY_STATE_KEY ?? randomUUID();
const sign = (payload: object) => {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${createHmac('sha256', STATE_KEY).update(body).digest('base64url')}`;
};
const verify = (state: unknown): Record<string, unknown> | null => {
  // `ctx.mcpReq.requestState` is an ACCESSOR FUNCTION; with no verify hook it
  // returns the raw wire string. Tolerate both and anything else.
  if (typeof state !== 'string' || !state) return null;
  const [body, mac] = state.split('.');
  if (!body || !mac) return null;
  const want = createHmac('sha256', STATE_KEY).update(body).digest('base64url');
  const a = Buffer.from(mac), b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString()); } catch { return null; }
};
const readState = (ctx: any) =>
  typeof ctx?.mcpReq?.requestState === 'function' ? ctx.mcpReq.requestState() : ctx?.mcpReq?.requestState;

/**
 * Ask the human, but only once.
 *
 * `acceptedContent()` returns undefined for BOTH "declined" and "no answer
 * arrived", so re-issuing inputRequired on undefined loops until the client
 * burns its 10 rounds and the call dies. Bound it with an attempt counter.
 */
function askConsent(ctx: any, key: string, message: string, state: Record<string, unknown>) {
  const prior = verify(readState(ctx));
  const attempt = typeof prior?.attempt === 'number' ? prior.attempt : 0;

  const view = inputResponse(ctx?.mcpReq?.inputResponses, key);
  if (view?.kind === 'elicitation') {
    const accepted = acceptedContent<{ confirm: boolean }>(ctx?.mcpReq?.inputResponses, key);
    return accepted?.confirm ? 'granted' as const : 'denied' as const;
  }
  if (attempt >= 1) return 'denied' as const;

  return inputRequired({
    inputRequests: {
      [key]: inputRequired.elicit({
        message,
        requestedSchema: {
          type: 'object',
          properties: { confirm: { type: 'boolean', description: 'Proceed?' } },
          required: ['confirm'],
        },
      }),
    },
    requestState: sign({ ...state, attempt: attempt + 1 }),
  });
}


/**
 * A long page can carry hundreds of links. Returning all of them is expensive and
 * returning a silent subset is worse — the agent cannot tell that the link it
 * wants was cut. So: window the list, and always report the true total plus how
 * to reach the rest.
 */
function windowActions(
  all: Array<Record<string, unknown>>,
  query?: string,
  limit?: number,
  offset?: number,
): Record<string, unknown> {
  const needle = (query ?? '').trim().toLowerCase();
  const matched = needle
    ? all.filter((a) => String(a.label ?? '').toLowerCase().includes(needle))
    : all;

  const from = Math.max(0, offset ?? 0);
  const size = Math.max(1, Math.min(limit ?? 25, 200));
  const page = matched.slice(from, from + size);
  const shown = from + page.length;

  const out: Record<string, unknown> = { actions: page };
  if (needle) out.actionsMatching = `${matched.length} of ${all.length} match "${query}"`;
  if (shown < matched.length) {
    out.actionsTruncated =
      `Showing ${from + 1}-${shown} of ${matched.length}. ` +
      `For the rest call browser_capabilities again with actionOffset: ${shown}` +
      (needle ? '.' : ', or narrow it with actionQuery: "<text in the label>".');
  } else if (all.length > 0) {
    out.actionsTotal = matched.length;
  }
  return out;
}

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const json = (v: unknown) => text(JSON.stringify(v, null, 2));

// ───────────────────────────────────────────── the delegation itself

async function runGoal(taskId: string, goal: string, tabId?: number) {
  const tab = registry.resolve(tabId);
  tasks.progress(taskId, `looking at ${tab.title} (${tab.url})`);

  if (tab.tools.length === 0) {
    tasks.fail(taskId, `${tab.url} exposes no tools, even after grafting. It may have no forms.`);
    return;
  }

  const decision = await planner.choose(goal, tab.tools, { title: tab.title, url: tab.url });

  if (decision.kind === 'give_up') {
    tasks.fail(taskId, decision.reason);
    return;
  }
  if (decision.kind === 'ask') {
    tasks.needsInput(taskId, decision.question);
    return;
  }

  tasks.progress(taskId, `calling ${decision.tool} with ${JSON.stringify(decision.args)}`);
  try {
    const result = await callExtension({ op: 'invoke', tabId: tab.tabId, tool: decision.tool, args: decision.args });
    tasks.complete(taskId, { tool: decision.tool, args: decision.args, result });
  } catch (err) {
    tasks.fail(taskId, String(err instanceof Error ? err.message : err));
  }
}

// ───────────────────────────────────────────── MCP face (deliberately thin)

function buildServer() {
  const server = new McpServer({ name: 'deputy', version: '0.1.0' });

  server.registerTool(
    'browser_capabilities',
    {
      title: 'What can the browser do right now?',
      description:
        'The full contract of every open tab: each form as a typed tool with its JSON Schema ' +
        '(types, allowed values, min/max, required fields), what those fields currently hold, and ' +
        'every button and link with a ref you can click. This is what you read instead of a ' +
        'screenshot — it is complete, so you should not need to probe. Long pages return a window ' +
        'of their links: the reply always states the true total, and you can narrow with ' +
        'actionQuery or page with actionOffset.',
      inputSchema: z.object({
        actionQuery: z.string().optional()
          .describe('Only return buttons/links whose label contains this text. Use it when you know what you want.'),
        actionLimit: z.number().optional().describe('How many actions to return (default 25).'),
        actionOffset: z.number().optional().describe('Skip this many actions, for paging through a long list.'),
      }),
    },
    async ({ actionQuery, actionLimit, actionOffset }) => {
      if (registry.tabs().length === 0) {
        return text('No tabs are reporting yet. Open a page in the browser with the Deputy extension loaded.');
      }
      // Return the SCHEMAS, not just the names. Withholding them to "keep the
      // response small" is a false economy: measured, a caller that has to
      // probe for parameter names spends far more discovering them than the
      // ~115 tokens the schema costs. The schema is the cheap part.
      return json(
        registry.tabs().map((t) => ({
          tabId: t.tabId,
          title: t.title,
          url: t.url,
          active: t.tabId === registry.activeTab()?.tabId,
          tools: t.tools.map((x) => ({
            name: x.name,
            description: x.description,
            inputSchema: x.inputSchema,
            source: x.source,
            needsApproval: x.consequential,
          })),
          // What is currently typed into those forms, so an agent can see state
          // before it changes it rather than blindly overwriting.
          currentValues: t.values ?? {},
          // Buttons and links that are not part of a form. Click by ref.
          ...windowActions(t.actions ?? [], actionQuery, actionLimit, actionOffset),
        })),
      );
    },
  );

  server.registerTool(
    'browser_invoke',
    {
      title: 'Do something on the page',
      description:
        'Call one of the tools browser_capabilities listed, with arguments matching its inputSchema. ' +
        'This acts in the real logged-in browser: it fills and submits the actual form.',
      inputSchema: z.object({
        tool: z.string().describe('Tool name exactly as browser_capabilities reported it.'),
        args: z.record(z.string(), z.unknown()).default({}).describe('Arguments matching the tool inputSchema.'),
        tabId: z.number().optional(),
      }),
    },
    async ({ tool, args, tabId }, ctx) => {
      const found = registry.findTool(tool, tabId);
      if (!found) {
        const available = registry.tabs().flatMap((t) => t.tools.map((x) => x.name));
        return text(`No tool "${tool}" in the browser. Available: ${available.join(', ') || 'none'}.`);
      }
      if (found.tool.consequential) {
        const consent = askConsent(ctx, 'confirm', `Run "${tool}" on ${found.tab.origin}? It may change something.`, { tool });
        if (consent !== 'granted' && consent !== 'denied') return consent;
        if (consent === 'denied') return text(`Not run: "${tool}" needs a human to approve it.`);
      }
      const result = await callExtension({ op: 'invoke', tabId: found.tab.tabId, tool, args: args ?? {} });

      // Many real forms navigate instead of returning a value, so the tool
      // result is null and the agent has no idea whether anything happened.
      // Tell it where the browser ended up — that saves a whole round trip.
      if (result === null || result === undefined || result === '') {
        await Bun.sleep(600);
        const now = registry.tabs().find((t) => t.tabId === found.tab.tabId);
        return text(
          now
            ? `Ran "${tool}". The tab is now on ${now.title} <${now.url}>. ` +
              `Tools here: ${now.tools.map((x) => x.name).join(', ') || 'none'}.`
            : `Ran "${tool}". It returned no value.`,
        );
      }
      return text(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
    },
  );

  server.registerTool(
    'browser_fill',
    {
      title: 'Fill one field by ref',
      description:
        'Set a single field to a value, addressed by the ref browser_capabilities gave it. Use this ' +
        'on pages Deputy could not graft into a typed tool — apps that build a form out of divs, or ' +
        'inputs sitting outside any <form>. For a checkbox pass "true"/"false"; for a <select> pass ' +
        'an option value or its visible text. When a typed tool exists, browser_invoke is better.',
      inputSchema: z.object({
        ref: z.string().describe('Field ref from browser_capabilities actions, e.g. "a13".'),
        value: z.string().describe('Value to set.'),
        tabId: z.number().optional(),
      }),
    },
    async ({ ref, value, tabId }) => {
      const tab = registry.resolve(tabId);
      return text(String(await callExtension({ op: 'fill', tabId: tab.tabId, ref, value })));
    },
  );

  server.registerTool(
    'browser_click',
    {
      title: 'Click a button or link',
      description: 'Click something browser_capabilities listed under "actions", by its ref.',
      inputSchema: z.object({
        ref: z.string().describe('Action ref, e.g. "a10".'),
        tabId: z.number().optional(),
      }),
    },
    async ({ ref, tabId }) => {
      const tab = registry.resolve(tabId);
      const result = await callExtension({ op: 'click', tabId: tab.tabId, ref });
      await Bun.sleep(500);
      const now = registry.tabs().find((t) => t.tabId === tab.tabId);
      return text(`${result}${now && now.url !== tab.url ? ` The tab is now on ${now.title} <${now.url}>.` : ''}`);
    },
  );

  server.registerTool(
    'browser_read',
    {
      title: 'Read a page as text',
      description:
        'Return the page as plain text for you to read yourself. Use browser_ask instead when you ' +
        'only need one fact — it costs ~40 tokens because Deputy reads the page and answers. Use ' +
        'this when you genuinely need the content to reason over.',
      inputSchema: z.object({
        tabId: z.number().optional(),
        maxChars: z.number().optional().describe('Cap the returned text (default 6000).'),
      }),
    },
    async ({ tabId, maxChars }) => {
      const tab = registry.resolve(tabId);
      const full = String(await callExtension({ op: 'read', tabId: tab.tabId }) ?? '');
      const cap = Math.max(200, Math.min(maxChars ?? 6000, 40_000));
      const body = full.slice(0, cap);
      return text(
        body +
          (full.length > cap
            ? `\n\n[truncated: ${body.length} of ${full.length} characters. Raise maxChars, or use ` +
              `browser_ask to have Deputy read the rest and answer a specific question.]`
            : ''),
      );
    },
  );

  // NOT REGISTERED: 'browser_click' is implemented end to end (daemon → service worker →
  // content script) but the round trip times out and I could not find why before
  // shipping. The refs exist in the DOM and browser_read succeeds over the identical
  // path, so the fault is somewhere in the message round trip. Shipping a tool that
  // hangs for 30s is worse than shipping without it. See ARCHITECTURE.md §10.
  server.registerTool(
    'browser_navigate',
    {
      title: 'Open a URL in the browser',
      description:
        'Point a tab at a URL and wait for it to load. Deputy re-reads what the new page can do, so ' +
        'call browser_capabilities afterwards to see the tools that appeared.',
      inputSchema: z.object({
        url: z.string().describe('Absolute URL to open.'),
        tabId: z.number().optional(),
      }),
    },
    async ({ url, tabId }) => {
      const tab = registry.resolve(tabId);
      const after: any = await callExtension({ op: 'navigate', tabId: tab.tabId, url });
      return text(
        after
          ? `Now on ${after.title} <${after.url}>. Tools here: ${(after.tools ?? []).map((t: any) => t.name).join(', ') || 'none'}.`
          : `Navigated tab ${tab.tabId} to ${url}.`,
      );
    },
  );

  server.registerTool(
    'browser_ask',
    {
      title: 'Ask about a page instead of looking at it',
      description:
        'Ask a question about what is on a browser tab. Deputy reads the page itself and returns a ' +
        'short answer. Use this instead of screenshotting or dumping the DOM — the page never enters ' +
        'your context, so a lookup costs a couple of hundred tokens rather than tens of thousands.',
      inputSchema: z.object({
        question: z.string().describe('What you want to know, e.g. "what is the cheapest result?"'),
        tabId: z.number().optional().describe('Tab to read. Defaults to the active tab.'),
      }),
    },
    async ({ question, tabId }) => {
      const tab = registry.resolve(tabId);
      const pageText = String(await callExtension({ op: 'read', tabId: tab.tabId }) ?? '');
      if (!pageText) return text(`Deputy could not read ${tab.url}.`);
      const answer = await planner.answer(question, pageText, { title: tab.title, url: tab.url });
      return text(
        answer.answered
          ? answer.text
          : `${answer.text} (Deputy read ${pageText.length} characters from ${tab.url} but could not answer.)`,
      );
    },
  );

  server.registerTool(
    'delegate_goal',
    {
      title: 'Delegate a goal to the browser',
      description:
        'Hand the browser agent a goal in plain language and let it work. It knows the page, the ' +
        'session you are signed into, and what each form accepts. Prefer this over driving the ' +
        'browser yourself — you never need to see the page.',
      inputSchema: z.object({
        goal: z.string().describe('What you want done, e.g. "search for a cordless drill under $80".'),
        tabId: z.number().optional().describe('Tab to work in. Defaults to the active tab.'),
      }),
    },
    async ({ goal, tabId }, ctx) => {
      const task = tasks.create(goal, tabId);
      try {
        await runGoal(task.id, goal, tabId);
      } catch (err) {
        tasks.fail(task.id, String(err instanceof Error ? err.message : err));
      }
      const done = tasks.get(task.id)!;

      if (isInterrupted(done.state)) {
        const consent = askConsent(ctx, 'confirm', done.question ?? 'Deputy needs your approval.', { taskId: task.id });
        if (consent === 'granted') {
          tasks.answer(task.id, 'approved');
          await runGoal(task.id, goal, tabId).catch((e) => tasks.fail(task.id, String(e)));
          return json(tasks.get(task.id));
        }
        if (consent === 'denied') {
          return json({ ...tasks.get(task.id), note: 'Not done: no approval came back.' });
        }
        return consent; // an input_required result for the client to fulfil
      }
      return json({ state: done.state, artifact: done.artifact, error: done.error, steps: done.steps, taskId: done.id });
    },
  );

  server.registerTool(
    'task_status',
    {
      title: 'Check a delegated task',
      description: 'Poll a task by id. Use when a delegation is still running or was interrupted.',
      inputSchema: z.object({ taskId: z.string() }),
    },
    async ({ taskId }) => {
      const task = tasks.get(taskId);
      return task ? json(task) : text(`No task ${taskId}.`);
    },
  );

  server.registerTool(
    'answer_task',
    {
      title: 'Answer a paused task',
      description:
        'Resume a task that stopped because it needed a human — a confirmation, or a sign-in that ' +
        'has now been completed in the browser.',
      inputSchema: z.object({ taskId: z.string(), answer: z.string() }),
    },
    async ({ taskId, answer }) => {
      const task = tasks.get(taskId);
      if (!task) return text(`No task ${taskId}.`);
      try { tasks.answer(taskId, answer); } catch (err) { return text(String(err)); }
      await runGoal(taskId, task.goal, task.tabId).catch((e) => tasks.fail(taskId, String(e)));
      return json(tasks.get(taskId));
    },
  );

  return server;
}

const handler = createMcpHandler(buildServer);

let notifyTimer: ReturnType<typeof setTimeout> | undefined;
let lastVersion = registry.version();
const notifyIfChanged = () => {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(() => {
    const now = registry.version();
    if (now === lastVersion) return; // identical payloads must not churn the client
    lastVersion = now;
    handler.notify.toolsChanged?.();
  }, 300);
};

// ───────────────────────────────────────────── serving

const server = Bun.serve({
  port: PORT,
  hostname: '127.0.0.1',
  fetch(req, srv) {
    const url = new URL(req.url);

    if (url.pathname === '/ext') {
      if (srv.upgrade(req)) return undefined as unknown as Response;
      return new Response('expected a websocket upgrade', { status: 426 });
    }
    if (url.pathname === '/health') {
      return Response.json({
        ok: true,
        extensionConnected: ext !== null,
        tabs: registry.tabs().length,
        tools: registry.toolCount(),
        planner: planner.name,
        deputyModelUsage: { ...modelUsage },
      });
    }
    if (url.pathname === '/mcp') {
      // DNS-rebinding defence: a localhost agent that can act as the user is a target.
      const bad = originValidationResponse(req, ['127.0.0.1', 'localhost']);
      if (bad) return bad;
      return handler.fetch(req);
    }
    return new Response('deputyd: /mcp, /ext, /health', { status: 404 });
  },
  websocket: {
    open(ws) { ext = ws; console.log('  ✓ extension connected'); },
    close() {
      ext = null;
      registry.reconcile([], null);
      notifyIfChanged();
      console.log('  ✗ extension disconnected');
    },
    message(_ws, raw) {
      let msg: Upstream;
      try { msg = JSON.parse(String(raw)); } catch { return; }

      switch (msg.t) {
        case 'ping': return;
        case 'tabs': registry.reconcile(msg.tabs, msg.activeTabId); break;
        case 'tab': registry.upsert(msg.tab, msg.active); break;
        case 'tabGone': failCallsForTab(msg.tabId); registry.remove(msg.tabId); break;
        case 'activeTab': registry.setActive(msg.tabId); break;
        case 'reply': {
          const p = pending.get(msg.id);
          if (!p) return;
          pending.delete(msg.id);
          msg.ok ? p.resolve(msg.result) : p.reject(new Error(msg.error));
          return;
        }
      }
      notifyIfChanged();
    },
  },
});

console.log(`deputyd on http://127.0.0.1:${server.port}`);
console.log(`  MCP:       http://127.0.0.1:${server.port}/mcp`);
console.log(`  extension: ws://127.0.0.1:${server.port}/ext`);
console.log(`  planner:   ${planner.name}`);
console.log(`  add with:  claude mcp add --transport http deputy http://127.0.0.1:${server.port}/mcp`);
