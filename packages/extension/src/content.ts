/**
 * Deputy's hands, in the page.
 *
 * Runs in the ISOLATED world, which is enough: `document.modelContext` is
 * reachable from here, so we never need `chrome.debugger` and the user never
 * sees the "extension is debugging this browser" banner.
 *
 * Responsibilities: graft tools onto the page, report what the page can do,
 * and execute a tool when the daemon asks.
 */
import { annotateDocument } from './graft/annotate';
import { synthesizeLooseForm } from './graft/synthesize';
import type { DeputyTool, TabEntry } from '../../shared/src/protocol';

type ModelContext = {
  getTools(): Promise<Array<{ name: string; description: string; inputSchema: unknown }>>;
  executeTool(tool: unknown, input: unknown): Promise<unknown>;
  registerTool?(tool: unknown): unknown;
  addEventListener?(type: string, fn: () => void): void;
};

const mc = (): ModelContext | null =>
  (document as unknown as { modelContext?: ModelContext }).modelContext ?? null;

/** Which grafted tools came from forms that change state. */
const consequential = new Set<string>();
/** Tools we synthesized for form-less pages. registerTool rejects duplicates. */
const synthesized = new Set<string>();

function recordConsequential() {
  consequential.clear();
  for (const form of document.querySelectorAll('form[toolname]')) {
    const name = form.getAttribute('toolname');
    // We withhold `toolautosubmit` from state-changing forms, so its absence
    // is exactly the signal that a human should approve this one.
    if (name && !form.hasAttribute('toolautosubmit')) consequential.add(name);
  }
}

async function readTools(): Promise<DeputyTool[]> {
  const ctx = mc();
  if (!ctx?.getTools) return [];
  let raw: Awaited<ReturnType<ModelContext['getTools']>>;
  try { raw = await ctx.getTools(); } catch { return []; }

  const grafted = new Set([
    ...Array.from(document.querySelectorAll('form[toolname]'))
      .filter((f) => f.hasAttribute('tooldescription'))
      .map((f) => f.getAttribute('toolname')!),
    ...synthesized,
  ]);

  return raw.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: typeof t.inputSchema === 'string'
      ? safeParse(t.inputSchema)
      : (t.inputSchema as Record<string, unknown>) ?? {},
    source: grafted.has(t.name) ? ('grafted' as const) : ('native' as const),
    consequential: consequential.has(t.name),
  }));
}

function safeParse(s: string): Record<string, unknown> {
  try { return JSON.parse(s); } catch { return {}; }
}

async function snapshot(): Promise<Omit<TabEntry, 'tabId'>> {
  return {
    title: document.title,
    url: location.href,
    origin: location.origin,
    tools: await readTools(),
    actions: pageActions(),
    values: currentValues(),
  };
}

/** Annotate, then report. Safe to call repeatedly — annotation is idempotent. */
async function graftAndReport(reason: string) {
  try {
    annotateDocument(document);

    // Tier 2: pages with no <form> get a tool built from their loose inputs, so
    // an agent still makes one typed call instead of poking fields one by one.
    const ctx = mc();
    if (ctx?.registerTool) {
      try {
        const report = synthesizeLooseForm(document, (tool) => {
          const name = (tool as { name: string }).name;
          if (synthesized.has(name)) return;   // registerTool rejects duplicates
          synthesized.add(name);
          return ctx.registerTool!(tool);
        });
        if (report.registered.length) {
          console.debug('[deputy] synthesized', report.registered, 'from', report.fields, 'loose inputs');
        }
      } catch (err) {
        console.debug('[deputy] synthesis skipped:', err);
      }
    }

    recordConsequential();
    // Declarative registration is scheduled, not synchronous.
    await new Promise((r) => setTimeout(r, 150));
    chrome.runtime.sendMessage({ t: 'tabState', reason, state: await snapshot() }).catch(() => {});
  } catch (err) {
    chrome.runtime.sendMessage({ t: 'graftError', error: String(err) }).catch(() => {});
  }
}

/**
 * Everything on the page an agent could act on that is NOT part of a grafted
 * form: buttons, links, and standalone controls. Forms become typed tools;
 * these become addressable actions.
 */
function pageActions(): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  let n = 0;
  const seen = new Set<Element>();

  for (const el of document.querySelectorAll<HTMLElement>(
    'button, a[href], [role="button"], [role="link"], [role="tab"], input[type="submit"], ' +
    'input[type="button"], summary, input, select, textarea, [contenteditable="true"]',
  )) {
    if (seen.has(el)) continue;
    seen.add(el);
    // Anything inside a grafted form is already reachable as a tool parameter.
    if (el.closest('form[toolname]')) continue;
    if (!el.checkVisibility?.()) continue;

    const editable =
      el instanceof HTMLInputElement || el instanceof HTMLSelectElement ||
      el instanceof HTMLTextAreaElement || el.isContentEditable;

    // An input's own value is not its name; label it the way a person would.
    const label = (
      el.getAttribute('aria-label') ||
      (el.id ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent : '') ||
      el.closest('label')?.textContent ||
      (editable ? (el as HTMLInputElement).placeholder || (el as HTMLInputElement).name : '') ||
      el.textContent ||
      (el as HTMLInputElement).value ||
      ''
    ).replace(/\s+/g, ' ').trim().slice(0, 80);
    if (!label) continue;

    const ref = `a${++n}`;
    el.setAttribute('data-deputy-ref', ref);
    out.push({
      ref,
      label,
      kind: editable ? 'input' : el.tagName === 'A' ? 'link' : 'button',
      ...(editable
        ? {
            inputType: el instanceof HTMLInputElement ? el.type : el.tagName.toLowerCase(),
            ...((el as HTMLInputElement).value ? { value: String((el as HTMLInputElement).value).slice(0, 60) } : {}),
            ...(el instanceof HTMLSelectElement
              ? { options: Array.from(el.options).map((o) => o.value).slice(0, 20) }
              : {}),
            ...((el as HTMLInputElement).required ? { required: true } : {}),
          }
        : {}),
      ...(el instanceof HTMLAnchorElement && el.href ? { href: el.href } : {}),
      ...(el.hasAttribute('disabled') ? { disabled: true } : {}),
    });
    if (out.length >= 300) break; // collect broadly; the daemon windows and filters for the agent
  }
  return out;
}

/** What the page's fields currently hold, so an agent can see state before changing it. */
function currentValues(): Record<string, Record<string, unknown>> {
  const byForm: Record<string, Record<string, unknown>> = {};
  for (const form of document.querySelectorAll<HTMLFormElement>('form[toolname]')) {
    const name = form.getAttribute('toolname')!;
    const values: Record<string, unknown> = {};
    for (const el of form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input, select, textarea',
    )) {
      if (!el.name || (el instanceof HTMLInputElement && el.type === 'hidden')) continue;
      if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        if (el.checked) values[el.name] = el.value;
        continue;
      }
      if (el.value !== '') values[el.name] = el.value;
    }
    if (Object.keys(values).length) byForm[name] = values;
  }
  return byForm;
}

/**
 * A readable rendering of the page for Deputy's own model. Deliberately plain
 * text: this is for reading, not for acting, and every character costs.
 */
function readableText(): string {
  const clone = document.body?.cloneNode(true) as HTMLElement | undefined;
  if (!clone) return '';
  for (const el of clone.querySelectorAll('script, style, noscript, svg, iframe, template')) el.remove();
  const text = (clone.innerText ?? clone.textContent ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
  return text.slice(0, 40_000);
}



/**
 * Set an input's value so a framework notices.
 *
 * React caches the previous value on the DOM node and compares against it, so a
 * plain `el.value = x` followed by an input event is swallowed — the framework
 * concludes nothing changed and re-renders the old value straight back. Going
 * through the prototype's native setter updates the node underneath that cache,
 * which is what makes controlled components accept the write.
 */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

/**
 * Show what changed.
 *
 * Chromium fills an entire form in one tick, which is the point — but on a
 * screen recording it reads as the page teleporting. So after a tool runs we
 * outline each field whose value actually changed and print the value that was
 * set, revealing them in sequence. The fill is real and instant; this is a diff
 * highlight over it, not a slowed-down re-enactment.
 */
function highlightChanges(before: Map<Element, string>, stepMs = 260) {
  const changed: Array<{ el: HTMLElement; value: string }> = [];
  for (const [el, old] of before) {
    const now = (el as HTMLInputElement).value ?? '';
    if (now !== old && now !== '') changed.push({ el: el as HTMLElement, value: now });
  }
  if (changed.length === 0) return;

  const style = document.createElement('style');
  style.textContent = `
    .__deputy_hit { outline: 3px solid #22c55e !important; outline-offset: 2px;
      background: color-mix(in srgb, #22c55e 12%, transparent) !important;
      transition: outline-color .4s ease, background .4s ease; }
    .__deputy_tag { position: absolute; z-index: 2147483646; transform: translateY(-50%);
      background: #16a34a; color: #fff; font: 600 12px/1 ui-monospace, monospace;
      padding: 5px 8px; border-radius: 5px; white-space: nowrap; pointer-events: none;
      box-shadow: 0 2px 10px rgba(0,0,0,.25); }`;
  document.head.appendChild(style);

  changed.forEach(({ el, value }, i) => {
    setTimeout(() => {
      el.classList.add('__deputy_hit');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });

      const box = el.getBoundingClientRect();
      const tag = document.createElement('div');
      tag.className = '__deputy_tag';
      tag.textContent = `set → ${value.length > 26 ? value.slice(0, 26) + '…' : value}`;
      tag.style.left = `${box.right + window.scrollX + 10}px`;
      tag.style.top = `${box.top + window.scrollY + box.height / 2}px`;
      document.body.appendChild(tag);

      setTimeout(() => {
        el.classList.remove('__deputy_hit');
        tag.remove();
      }, stepMs * changed.length + 1400);
    }, i * stepMs);
  });
  setTimeout(() => style.remove(), stepMs * changed.length + 2600);
}

chrome.runtime.onMessage.addListener((msg, _sender, respond) => {
  if (msg?.op === 'fill') {
    // Everything here is wrapped: if a page's own input listener throws, an
    // unguarded handler never calls respond(), the message channel stays open,
    // and the caller waits out its full timeout. A failure must come back as a
    // failure, fast.
    try {
      const el = document.querySelector<HTMLElement>(`[data-deputy-ref="${CSS.escape(String(msg.ref))}"]`);
      if (!el) {
        respond({ ok: false, error: `No field "${msg.ref}" on this page any more.` });
        return true;
      }
      const value = String(msg.value ?? '');
      const before = new Map<Element, string>([[el, (el as HTMLInputElement).value ?? '']]);

      if (el.isContentEditable) {
        el.focus();
        el.textContent = value;
      } else if (el instanceof HTMLSelectElement) {
        const match = Array.from(el.options).find((o) => o.value === value || o.text === value);
        if (!match) {
          respond({
            ok: false,
            error: `"${value}" is not an option. Allowed: ${Array.from(el.options).map((o) => o.value).join(', ')}.`,
          });
          return true;
        }
        el.value = match.value;
      } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
        const want = value !== 'false' && value !== '' && value !== '0';
        if (el.checked !== want) el.click(); // click, so framework handlers run
      } else {
        setNativeValue(el as HTMLInputElement, value);
      }

      try {
        for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
      } catch { /* the page's own listener threw; the value is still set */ }

      try { highlightChanges(before); } catch { /* cosmetic only */ }
      respond({ ok: true, result: `Set "${msg.ref}" to ${JSON.stringify(value)}.` });
    } catch (err) {
      respond({ ok: false, error: String(err) });
    }
    return true;
  }
  if (msg?.op === 'click') {
    try {
      const el = document.querySelector<HTMLElement>(`[data-deputy-ref="${CSS.escape(String(msg.ref))}"]`);
      if (!el) {
        respond({ ok: false, error: `No action "${msg.ref}" on this page any more.` });
        return true;
      }
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim();
      el.click();
      respond({ ok: true, result: `Clicked "${label}".` });
    } catch (err) {
      respond({ ok: false, error: String(err) });
    }
    return true;
  }
  if (msg?.op === 'read') {
    respond({ ok: true, result: readableText() });
    return true;
  }
  if (msg?.op === 'readTab') {
    graftAndReport('asked').then(async () => respond({ ok: true, state: await snapshot() }));
    return true;
  }
  if (msg?.op === 'invoke') {
    (async () => {
      const ctx = mc();
      if (!ctx) return respond({ ok: false, error: 'This page has no WebMCP context. Is the browser flag enabled?' });
      const before = new Map<Element, string>();
      for (const f of document.querySelectorAll('input, select, textarea')) {
        before.set(f, (f as HTMLInputElement).value ?? '');
      }
      try {
        const tools = await ctx.getTools();
        const tool = tools.find((t) => t.name === msg.tool);
        if (!tool) {
          return respond({ ok: false, error: `"${msg.tool}" is not available on this page any more. The page may have navigated.` });
        }
        // Chromium 152 wants the input as a JSON *string*. Passing the object
        // stringifies to "[object Object]" and fails with
        // "Failed to parse input string as JSON". The spec moved to objects in
        // issue #243; this build predates that, so try the string first and
        // fall back to the object so we keep working when Chromium catches up.
        let result: unknown;
        try {
          result = await ctx.executeTool(tool, JSON.stringify(msg.args ?? {}));
        } catch (first) {
          try {
            result = await ctx.executeTool(tool, (msg.args ?? {}) as unknown);
          } catch {
            throw first;
          }
        }
        highlightChanges(before);
        respond({ ok: true, result });
      } catch (err) {
        respond({ ok: false, error: String(err) });
      }
    })();
    return true;
  }
  if (msg?.op === 'annotate') {
    graftAndReport('requested').then(() => respond({ ok: true }));
    return true;
  }
  return false;
});

// SPAs re-render and wipe attributes; re-graft, but never on every keystroke.
let pending: ReturnType<typeof setTimeout> | undefined;
const scheduleRegraft = (reason: string) => {
  clearTimeout(pending);
  pending = setTimeout(() => void graftAndReport(reason), 400);
};

new MutationObserver((records) => {
  // Only care when structure changed in a way that could add a form.
  for (const r of records) {
    if (r.type === 'childList' && (r.addedNodes.length || r.removedNodes.length)) {
      scheduleRegraft('mutation');
      return;
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

mc()?.addEventListener?.('toolchange', () => scheduleRegraft('toolchange'));
void graftAndReport('load');
