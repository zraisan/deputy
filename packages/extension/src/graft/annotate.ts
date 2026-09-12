/**
 * The retrofit engine: teach a page to describe itself.
 *
 * We do not generate JSON Schema and we do not execute forms. Chromium does
 * both, natively, for any <form> carrying the declarative WebMCP attributes.
 * This module's entire job is to decide which forms deserve to be tools and
 * what to call them — then write six attributes and get out of the way.
 */
import { deriveToolName, dedupeNames, type FormSignals } from './naming';

export type AnnotationReport = {
  /** Names of tools we added on this pass. Empty on a repeat pass. */
  grafted: string[];
  /** Identifiers of forms we deliberately left alone (the site declared them). */
  skipped: string[];
};

const TOOL_NAME_ATTR = 'toolname';
const TOOL_DESC_ATTR = 'tooldescription';
const PARAM_DESC_ATTR = 'toolparamdescription';
const AUTOSUBMIT_ATTR = 'toolautosubmit';

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const text = (el: Element | null | undefined): string =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

function controlsOf(form: HTMLFormElement): Control[] {
  return Array.from(form.querySelectorAll<Control>('input, select, textarea')).filter((el) => {
    if (!el.name) return false;
    if (el instanceof HTMLInputElement && ['hidden', 'submit', 'button', 'reset', 'image'].includes(el.type)) {
      return false;
    }
    return true;
  });
}

/** The accessible-ish name of a control, preferring what a human wrote for a human. */
function labelFor(el: Control, doc: Document): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();

  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const joined = labelledBy.split(/\s+/).map((id) => text(doc.getElementById(id))).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  if (el.id) {
    const explicit = doc.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (text(explicit)) return text(explicit);
  }
  const wrapping = el.closest('label');
  if (text(wrapping)) return text(wrapping);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.placeholder?.trim()) return el.placeholder.trim();
  }
  if (el.title?.trim()) return el.title.trim();
  return el.name;
}

function submitLabelOf(form: HTMLFormElement): string {
  const submit = form.querySelector('button[type="submit"], input[type="submit"], button:not([type])');
  if (!submit) return '';
  if (submit instanceof HTMLInputElement) return submit.value.trim();
  return text(submit);
}

/**
 * A heading only counts when it is *inside* the form or explicitly associated.
 * Scanning backwards through the document for the nearest heading looks helpful
 * and isn't: on Wikipedia the nearest preceding heading of the footer search box
 * is "Welcome to Wikipedia", which would name the search tool after the page.
 */
function headingOf(form: HTMLFormElement, doc: Document): string {
  const legend = form.querySelector('legend');
  if (text(legend)) return text(legend);

  const inner = form.querySelector('h1, h2, h3, h4, h5, h6');
  if (text(inner)) return text(inner);

  const labelledBy = form.getAttribute('aria-labelledby');
  if (labelledBy) {
    const joined = labelledBy.split(/\s+/).map((id) => text(doc.getElementById(id))).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  return '';
}

export function extractSignals(form: HTMLFormElement, doc: Document = form.ownerDocument): FormSignals {
  const controls = controlsOf(form);
  return {
    ariaLabel: form.getAttribute('aria-label') ?? undefined,
    heading: headingOf(form, doc) || undefined,
    submitLabel: submitLabelOf(form) || undefined,
    primaryFieldLabel: controls.length ? labelFor(controls[0]!, doc) : undefined,
    action: form.getAttribute('action') ?? undefined,
    hostname: doc.location?.hostname ?? undefined,
  };
}

/**
 * A GET form asks a question; a POST form usually changes something. We let the
 * browser auto-submit the former and deliberately withhold `toolautosubmit` from
 * the latter, which makes Chromium focus the submit button and wait for a human.
 * That is consent enforced by the browser rather than by our own good intentions.
 */
function isConsequential(form: HTMLFormElement): boolean {
  return (form.getAttribute('method') ?? 'get').toLowerCase() !== 'get';
}

function describe(form: HTMLFormElement, name: string, doc: Document): string {
  const host = doc.location?.hostname ?? 'this site';
  const readable = name.replace(/_/g, ' ');
  const fields = controlsOf(form).map((c) => labelFor(c, doc)).filter(Boolean);
  const tail = fields.length ? ` Accepts: ${fields.slice(0, 8).join(', ')}.` : '';
  return `${readable.charAt(0).toUpperCase()}${readable.slice(1)} on ${host}.${tail}`;
}

export function annotateDocument(doc: Document): AnnotationReport {
  const forms = Array.from(doc.querySelectorAll('form'));
  const report: AnnotationReport = { grafted: [], skipped: [] };

  // Idempotence: anything already carrying a toolname is either the site's own
  // declaration or our previous pass. Both must survive untouched, or an SPA
  // re-render would churn the agent's tool list on every keystroke.
  const pending: HTMLFormElement[] = [];
  const taken = new Set<string>();
  for (const form of forms) {
    const existing = form.getAttribute(TOOL_NAME_ATTR);
    if (existing) {
      taken.add(existing);
      report.skipped.push(form.id || existing);
    } else {
      pending.push(form as HTMLFormElement);
    }
  }
  if (pending.length === 0) return report;

  const derived = pending.map((form) => deriveToolName(extractSignals(form, doc)));
  // Dedupe against names already on the page as well as against each other.
  const names = dedupeNames([...taken, ...derived]).slice(taken.size);

  pending.forEach((form, i) => {
    const name = names[i]!;
    form.setAttribute(TOOL_NAME_ATTR, name);
    form.setAttribute(TOOL_DESC_ATTR, describe(form, name, doc));
    if (!isConsequential(form)) form.setAttribute(AUTOSUBMIT_ATTR, '');

    for (const control of controlsOf(form)) {
      if (control.hasAttribute(PARAM_DESC_ATTR)) continue;
      control.setAttribute(PARAM_DESC_ATTR, labelFor(control, doc));
    }
    report.grafted.push(name);
  });

  return report;
}
