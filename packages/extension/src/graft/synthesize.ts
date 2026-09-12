/**
 * Tier 2: a typed tool for pages that have no <form>.
 *
 * Tier 1 writes attributes onto a real <form> and lets Chromium do the work.
 * Plenty of the web has no <form> at all — Google Forms, React apps, anything
 * that wires divs to click handlers. Those pages get nothing from Tier 1.
 *
 * So we build the tool ourselves: read the loose controls, synthesize the same
 * shape of JSON Schema Chromium would have produced, and register it through
 * `document.modelContext.registerTool`. The agent cannot tell the difference —
 * one typed call either way — which is the point. Falling back to "click this,
 * then type that" would hand the cost back to the caller.
 */
import { deriveToolName, dedupeNames, normalizeName } from './naming';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const SKIP_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file']);

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

function labelOf(el: Control | HTMLElement): string {
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;

  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const joined = by.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  if (el.id) {
    const lab = clean(document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent);
    if (lab) return lab;
  }
  const wrap = clean(el.closest('label')?.textContent);
  if (wrap) return wrap;

  const ph = clean((el as HTMLInputElement).placeholder);
  if (ph) return ph;

  // Many app forms put the question in a heading above the input.
  const container = el.closest('[role="listitem"], li, fieldset, section, div');
  const heading = clean(container?.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"],legend')?.textContent);
  if (heading) return heading;

  return clean((el as HTMLInputElement).name) || clean(el.id) || 'field';
}

/** The same schema shape Chromium synthesizes for a declarative form. */
function schemaFor(el: Control): Record<string, unknown> {
  const description = labelOf(el).slice(0, 120);

  if (el instanceof HTMLSelectElement) {
    const options = Array.from(el.options).filter((o) => o.value !== '');
    return {
      type: 'string',
      enum: options.map((o) => o.value),
      anyOf: options.map((o) => ({ type: 'string', const: o.value, title: clean(o.text) })),
      description,
    };
  }
  if (el instanceof HTMLTextAreaElement) return { type: 'string', description };

  const input = el as HTMLInputElement;
  switch (input.type) {
    case 'checkbox':
      return { type: 'boolean', description };
    case 'number':
    case 'range': {
      const out: Record<string, unknown> = { type: 'number', description };
      if (input.min !== '') out.minimum = Number(input.min);
      if (input.max !== '') out.maximum = Number(input.max);
      if (input.step !== '' && input.step !== 'any') out.multipleOf = Number(input.step);
      return out;
    }
    case 'date':
      return { type: 'string', format: 'date', description: `${description} (YYYY-MM-DD)` };
    case 'time':
      return { type: 'string', format: 'time', description: `${description} (HH:MM)` };
    case 'email':
      return { type: 'string', format: 'email', description };
    case 'url':
      return { type: 'string', format: 'uri', description };
    default: {
      const out: Record<string, unknown> = { type: 'string', description };
      if (input.maxLength > 0) out.maxLength = input.maxLength;
      if (input.pattern) out.pattern = input.pattern;
      return out;
    }
  }
}

function keyFor(el: Control, taken: Set<string>): string {
  let base = normalizeName(clean((el as HTMLInputElement).name) || clean(el.id) || labelOf(el)) || 'field';
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;
  taken.add(key);
  return key;
}

/** React and friends cache the previous value on the node; go through the native setter. */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function applyValue(el: Control, raw: unknown) {
  const value = raw === null || raw === undefined ? '' : String(raw);
  if (el instanceof HTMLSelectElement) {
    const match = Array.from(el.options).find((o) => o.value === value || clean(o.text) === value);
    if (match) el.value = match.value;
  } else if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) {
    const want = raw === true || value === 'true' || value === '1' || value === 'yes';
    if (el.checked !== want) el.click(); // click so the framework's own handler runs
    return;
  } else {
    el.focus();
    setNativeValue(el as HTMLInputElement, value);
  }
  for (const type of ['input', 'change']) el.dispatchEvent(new Event(type, { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}


/**
 * ARIA widgets, the other half of the web.
 *
 * Google Forms, and most design systems, build choices out of divs:
 * `role="radiogroup"` around `role="radio"`, standalone `role="checkbox"`,
 * `role="listbox"` around `role="option"`, `contenteditable` for long text.
 * None of those are form controls, so a query for `input, select, textarea`
 * finds nothing — measured on a Google-Forms-shaped page, it caught 1 field
 * out of 4.
 *
 * A Widget is whatever we can describe and set, real control or not.
 */

/**
 * Query across open shadow roots.
 *
 * `document.querySelectorAll` stops at every shadow boundary, so a page built
 * from web components looks empty. MDN's homepage is the clean example: zero
 * forms and zero inputs in the light DOM, 18 open shadow roots, and the search
 * box inside one of them. Anything a user can see and type into should be
 * reachable, wherever the page chose to put it.
 *
 * Closed roots are genuinely unreachable — nothing to be done about those.
 */
export function deepQueryAll<T extends Element = Element>(root: ParentNode, selector: string): T[] {
  const found: T[] = [];
  const seenRoots = new Set<ParentNode>();

  const walk = (node: ParentNode) => {
    if (seenRoots.has(node)) return;
    seenRoots.add(node);
    found.push(...Array.from(node.querySelectorAll<T>(selector)));
    for (const el of Array.from(node.querySelectorAll('*'))) {
      const shadow = (el as HTMLElement).shadowRoot;
      if (shadow) walk(shadow);
    }
  };
  walk(root);
  return found;
}

/** `closest` does not cross shadow boundaries either; climb through the hosts. */
function deepClosest(el: Element, selector: string): Element | null {
  let node: Element | null = el;
  while (node) {
    const hit = node.closest(selector);
    if (hit) return hit;
    const root = node.getRootNode();
    node = root instanceof ShadowRoot ? (root.host as Element) : null;
  }
  return null;
}

type Widget =
  | { kind: 'control'; el: Control; label: string }
  | { kind: 'radiogroup'; el: HTMLElement; label: string; options: HTMLElement[] }
  | { kind: 'checkbox'; el: HTMLElement; label: string }
  | { kind: 'listbox'; el: HTMLElement; label: string; options: HTMLElement[] }
  | { kind: 'textbox'; el: HTMLElement; label: string };

const optionLabel = (el: Element) =>
  clean(el.getAttribute('data-value') || el.getAttribute('aria-label') || el.textContent) || 'option';

function ariaLabelOf(el: HTMLElement): string {
  const by = el.getAttribute('aria-labelledby');
  if (by) {
    const joined = by.split(/\s+/).map((id) => clean(document.getElementById(id)?.textContent)).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const container = el.closest('[role="listitem"], li, fieldset, section, div');
  const heading = clean(container?.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"],legend,.t')?.textContent);
  return heading || 'field';
}

/** Everything on the page an agent could set, whether or not it is a form control. */
function collectWidgets(doc: Document): Widget[] {
  const out: Widget[] = [];
  const claimed = new Set<Element>();

  // Composites first, so their children are not also collected individually.
  for (const group of Array.from(deepQueryAll<HTMLElement>(doc, '[role="radiogroup"]'))) {
    const options = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
    if (options.length === 0) continue;
    options.forEach((o) => claimed.add(o));
    claimed.add(group);
    out.push({ kind: 'radiogroup', el: group, label: ariaLabelOf(group), options });
  }
  for (const box of Array.from(deepQueryAll<HTMLElement>(doc, '[role="listbox"], [role="combobox"]'))) {
    const options = Array.from(box.querySelectorAll<HTMLElement>('[role="option"]'));
    if (options.length === 0) continue;
    options.forEach((o) => claimed.add(o));
    claimed.add(box);
    out.push({ kind: 'listbox', el: box, label: ariaLabelOf(box), options });
  }
  // Loose radios that were never wrapped in a radiogroup: group them by their container.
  const looseRadios = Array.from(deepQueryAll<HTMLElement>(doc, '[role="radio"]')).filter((r) => !claimed.has(r));
  const byParent = new Map<HTMLElement, HTMLElement[]>();
  for (const r of looseRadios) {
    const parent = (r.parentElement ?? r) as HTMLElement;
    byParent.set(parent, [...(byParent.get(parent) ?? []), r]);
  }
  for (const [parent, options] of byParent) {
    options.forEach((o) => claimed.add(o));
    out.push({ kind: 'radiogroup', el: parent, label: ariaLabelOf(parent), options });
  }
  for (const cb of Array.from(deepQueryAll<HTMLElement>(doc, '[role="checkbox"]'))) {
    if (claimed.has(cb)) continue;
    claimed.add(cb);
    out.push({ kind: 'checkbox', el: cb, label: optionLabel(cb) || ariaLabelOf(cb) });
  }
  for (const tb of Array.from(deepQueryAll<HTMLElement>(doc, '[contenteditable="true"], [role="textbox"]'))) {
    if (claimed.has(tb) || tb.closest('input, textarea')) continue;
    claimed.add(tb);
    out.push({ kind: 'textbox', el: tb, label: ariaLabelOf(tb) });
  }

  // Then the genuine form controls Tier 1 did not already take.
  for (const el of Array.from(deepQueryAll<Control>(doc, 'input, select, textarea'))) {
    if (claimed.has(el)) continue;
    if (deepClosest(el, 'form[toolname]')) continue;
    if (el instanceof HTMLInputElement && SKIP_TYPES.has(el.type)) continue;
    if (el.disabled || (el as HTMLInputElement).readOnly) continue;
    if (!el.checkVisibility?.()) continue;
    out.push({ kind: 'control', el, label: labelOf(el) });
  }
  return out.filter((w) => (w.el as HTMLElement).checkVisibility?.() !== false);
}

function schemaForWidget(w: Widget): Record<string, unknown> {
  const description = w.label.slice(0, 120);
  switch (w.kind) {
    case 'control': return schemaFor(w.el);
    case 'checkbox': return { type: 'boolean', description };
    case 'textbox': return { type: 'string', description };
    case 'radiogroup':
    case 'listbox': {
      const labels = w.options.map(optionLabel);
      return {
        type: 'string',
        enum: labels,
        anyOf: labels.map((l) => ({ type: 'string', const: l, title: l })),
        description,
      };
    }
  }
}


/**
 * Mark a field as Deputy sets it.
 *
 * The whole point of a typed call is that it lands in one shot, but a person
 * watching needs to see which field just changed — otherwise a filled form
 * reads as the page teleporting. Each control is outlined as its value is
 * written, and scrolled into view so the change is never off-screen.
 */
const HIGHLIGHT_STYLE_ID = '__deputy_fill_style';

function ensureHighlightStyle(doc: Document) {
  if (doc.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent =
    '@keyframes __deputyPulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,.55)}' +
    '70%{box-shadow:0 0 0 12px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}' +
    '.__deputy_writing{outline:2.5px solid #22c55e!important;outline-offset:3px;border-radius:6px;' +
    'background:rgba(34,197,94,.10)!important;animation:__deputyPulse 1s ease-out;' +
    'transition:outline-color .5s ease,background .5s ease}';
  doc.head.appendChild(style);
}

function markWriting(el: HTMLElement) {
  try {
    ensureHighlightStyle(el.ownerDocument);
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('__deputy_writing');
    setTimeout(() => el.classList.remove('__deputy_writing'), 1600);
  } catch { /* cosmetic only; never fail a fill over it */ }
}

const ariaChecked = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true';

async function applyWidget(w: Widget, raw: unknown) {
  markWriting(w.el as HTMLElement);
  if (w.kind === 'control') { applyValue(w.el, raw); return; }

  const value = raw === null || raw === undefined ? '' : String(raw);
  if (w.kind === 'textbox') {
    w.el.focus();
    w.el.textContent = value;
    for (const t of ['input', 'change']) w.el.dispatchEvent(new Event(t, { bubbles: true }));
    w.el.dispatchEvent(new Event('blur', { bubbles: true }));
    return;
  }
  if (w.kind === 'checkbox') {
    const want = raw === true || value === 'true' || value === '1' || value === 'yes';
    if (ariaChecked(w.el) !== want) w.el.click(); // click, so the page's own handler runs
    return;
  }
  // radiogroup / listbox: pick the option whose label matches, then click it.
  const match =
    w.options.find((o) => optionLabel(o) === value) ??
    w.options.find((o) => optionLabel(o).toLowerCase() === value.toLowerCase()) ??
    w.options.find((o) => optionLabel(o).toLowerCase().includes(value.toLowerCase()));
  if (match && !ariaChecked(match)) match.click();
}

export type SynthReport = { registered: string[]; fields: number };

/**
 * Register one imperative tool covering every control that Tier 1 could not
 * reach. One tool per page rather than per cluster: an agent filling a form
 * wants a single call, and a page with two unrelated input groups is rare
 * enough not to pay for.
 */
export function synthesizeLooseForm(
  doc: Document,
  registerTool: (tool: Record<string, unknown>) => unknown,
): SynthReport {
  const widgets = collectWidgets(doc);
  if (widgets.length === 0) return { registered: [], fields: 0 };

  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  const bound = new Map<string, Widget>();
  const taken = new Set<string>();

  for (const w of widgets) {
    if (w.kind === 'control' && w.el instanceof HTMLInputElement && w.el.type === 'radio'
        && w.el.name && bound.has(normalizeName(w.el.name))) continue;
    const key = w.kind === 'control'
      ? keyFor(w.el, taken)
      : (() => {
          let base = normalizeName(w.label) || w.kind;
          let k = base;
          for (let i = 2; taken.has(k); i++) k = `${base}_${i}`;
          taken.add(k);
          return k;
        })();
    properties[key] = schemaForWidget(w);
    bound.set(key, w);
    if (w.kind === 'control' && (w.el as HTMLInputElement).required) required.push(key);
    if (w.el.getAttribute?.('aria-required') === 'true') required.push(key);
  }

  const title = clean(doc.querySelector('h1,[role="heading"]')?.textContent) || doc.title;
  const name = dedupeNames([
    deriveToolName({ heading: title, hostname: doc.location?.hostname, action: doc.location?.pathname }),
  ])[0]!;

  const ariaCount = widgets.filter((w) => w.kind !== 'control').length;
  const tool = {
    name,
    description:
      `Fill the ${title || 'form'} on ${doc.location?.hostname}. No <form> wraps these fields, so ` +
      `Deputy synthesized this tool from ${widgets.length} controls` +
      (ariaCount ? ` (${ariaCount} of them ARIA widgets, not form elements)` : '') +
      `. Accepts: ${Object.keys(properties).slice(0, 12).join(', ')}.`,
    inputSchema: { type: 'object', properties, ...(required.length ? { required: [...new Set(required)] } : {}) },
    async execute(args: Record<string, unknown>) {
      const set: string[] = [];
      for (const [key, value] of Object.entries(args ?? {})) {
        const w = bound.get(key);
        if (!w || value === undefined) continue;
        await applyWidget(w, value);
        set.push(key);
        // Deliberately paced. Frameworks settle between writes, and a person
        // watching can actually see each field take its value — an instant
        // form-fill reads as the page teleporting.
        await new Promise((r) => setTimeout(r, 240));
      }
      return `Filled ${set.length} field(s): ${set.join(', ')}. Nothing was submitted — review and submit yourself.`;
    },
  };

  registerTool(tool);
  return { registered: [name], fields: widgets.length };
}
