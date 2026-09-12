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
  for (const group of Array.from(doc.querySelectorAll<HTMLElement>('[role="radiogroup"]'))) {
    const options = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
    if (options.length === 0) continue;
    options.forEach((o) => claimed.add(o));
    claimed.add(group);
    out.push({ kind: 'radiogroup', el: group, label: ariaLabelOf(group), options });
  }
  for (const box of Array.from(doc.querySelectorAll<HTMLElement>('[role="listbox"], [role="combobox"]'))) {
    const options = Array.from(box.querySelectorAll<HTMLElement>('[role="option"]'));
    if (options.length === 0) continue;
    options.forEach((o) => claimed.add(o));
    claimed.add(box);
    out.push({ kind: 'listbox', el: box, label: ariaLabelOf(box), options });
  }
  // Loose radios that were never wrapped in a radiogroup: group them by their container.
  const looseRadios = Array.from(doc.querySelectorAll<HTMLElement>('[role="radio"]')).filter((r) => !claimed.has(r));
  const byParent = new Map<HTMLElement, HTMLElement[]>();
  for (const r of looseRadios) {
    const parent = (r.parentElement ?? r) as HTMLElement;
    byParent.set(parent, [...(byParent.get(parent) ?? []), r]);
  }
  for (const [parent, options] of byParent) {
    options.forEach((o) => claimed.add(o));
    out.push({ kind: 'radiogroup', el: parent, label: ariaLabelOf(parent), options });
  }
  for (const cb of Array.from(doc.querySelectorAll<HTMLElement>('[role="checkbox"]'))) {
    if (claimed.has(cb)) continue;
    claimed.add(cb);
    out.push({ kind: 'checkbox', el: cb, label: optionLabel(cb) || ariaLabelOf(cb) });
  }
  for (const tb of Array.from(doc.querySelectorAll<HTMLElement>('[contenteditable="true"], [role="textbox"]'))) {
    if (claimed.has(tb) || tb.closest('input, textarea')) continue;
    claimed.add(tb);
    out.push({ kind: 'textbox', el: tb, label: ariaLabelOf(tb) });
  }

  // Then the genuine form controls Tier 1 did not already take.
  for (const el of Array.from(doc.querySelectorAll<Control>('input, select, textarea'))) {
    if (claimed.has(el)) continue;
    if (el.closest('form[toolname]')) continue;
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

const ariaChecked = (el: HTMLElement) => el.getAttribute('aria-checked') === 'true';

async function applyWidget(w: Widget, raw: unknown) {
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
        await new Promise((r) => setTimeout(r, 90));
      }
      return `Filled ${set.length} field(s): ${set.join(', ')}. Nothing was submitted — review and submit yourself.`;
    },
  };

  registerTool(tool);
  return { registered: [name], fields: widgets.length };
}
