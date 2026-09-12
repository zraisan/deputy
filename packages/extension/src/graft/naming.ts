/**
 * Tool-name derivation for grafted forms.
 *
 * A form on a page carries several human-written labels. Which one makes the
 * best tool name is not obvious: measuring on Wikipedia, the naive "use the
 * form action" heuristic produced `w_index_php_0` and `w_index_php_1` — both
 * meaningless and colliding. An agent choosing between tools reads these names,
 * so a bad one is a correctness problem, not a cosmetic one.
 *
 * Pure module: no DOM. Signal extraction lives in `signals.ts` and is tested
 * against real Chromium.
 */

export const MAX_NAME_LENGTH = 40;

export type FormSignals = {
  /** aria-label on the <form> itself. Most deliberate, so most trusted. */
  ariaLabel?: string;
  /** Nearest enclosing <legend> or preceding heading. */
  heading?: string;
  /** Text of the submit control — usually names the action ("Sign in"). */
  submitLabel?: string;
  /** Label of the first meaningful field — often names the subject ("Search Wikipedia"). */
  primaryFieldLabel?: string;
  /** The form's action URL or path. Last resort: rarely meant for humans. */
  action?: string;
  /** Host of the page, used to qualify otherwise-generic names. */
  hostname?: string;
};

/**
 * Verbs that describe *any* form. On their own they make a useless tool name,
 * so a name that reduces to one of these gets qualified by the site.
 */
const GENERIC = new Set([
  'search', 'submit', 'go', 'ok', 'send', 'continue', 'next', 'save', 'done',
  'start', 'update', 'add', 'post', 'enter', 'find', 'filter', 'sort', 'apply',
  'form', 'query', 'run',
]);

/** Second-level suffixes that are part of the public suffix, not the site name. */
const SLD = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu', 'mil']);

export function normalizeName(input: string): string {
  const stripped = (input ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // drop combining marks: ü → u, é → e
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return truncate(stripped, MAX_NAME_LENGTH);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max).replace(/_+$/, '');
}

/** "shop.example.co.uk" → "example"; "www.github.com" → "github". */
export function siteLabel(hostname?: string): string {
  const parts = (hostname ?? '').split('.').filter(Boolean).filter((p) => p !== 'www');
  if (parts.length === 0) return '';
  if (parts.length === 1) return normalizeName(parts[0]!);
  const last = parts[parts.length - 1]!;
  const secondLast = parts[parts.length - 2]!;
  // e.g. "co.uk" / "com.au": the real name is one segment further left.
  if (last.length === 2 && SLD.has(secondLast) && parts.length >= 3) {
    return normalizeName(parts[parts.length - 3]!);
  }
  return normalizeName(secondLast);
}

/**
 * Higher is more specific. Multi-word labels say more than one-word ones, and a
 * label that isn't a generic verb says more than one that is.
 */
function specificity(normalized: string): number {
  if (!normalized) return -1;
  const words = normalized.split('_').filter(Boolean);
  return (words.length >= 2 ? 2 : 0) + (GENERIC.has(normalized) ? 0 : 1);
}

function pathOf(action: string): string {
  const noQuery = action.split(/[?#]/)[0] ?? '';
  const afterHost = noQuery.replace(/^[a-z]+:\/\/[^/]+/i, '');
  return afterHost || noQuery;
}

export function deriveToolName(signals: FormSignals): string {
  // Human-written labels compete on specificity; ties break toward the label
  // that describes the *action* rather than a field.
  const candidates = [signals.ariaLabel, signals.heading, signals.submitLabel, signals.primaryFieldLabel]
    .map((raw, priority) => ({ name: normalizeName(raw ?? ''), priority }))
    .filter((c) => c.name.length > 0);

  let chosen = '';
  if (candidates.length > 0) {
    candidates.sort((a, b) => specificity(b.name) - specificity(a.name) || a.priority - b.priority);
    chosen = candidates[0]!.name;
  } else if (signals.action) {
    // Machine-facing, so only consulted when no human wrote anything usable.
    chosen = normalizeName(pathOf(signals.action));
  }

  const site = siteLabel(signals.hostname);
  if (!chosen) chosen = 'form';
  // "search" alone is true of half the web; "search_wikipedia" identifies something.
  if (site && GENERIC.has(chosen)) chosen = `${chosen}_${site}`;

  chosen = truncate(chosen, MAX_NAME_LENGTH);
  if (!chosen) chosen = site ? `form_${site}` : 'form';
  if (/^[0-9]/.test(chosen)) chosen = truncate(`f_${chosen}`, MAX_NAME_LENGTH);
  return chosen;
}

/**
 * Make every name unique within a page, preserving first-come names so a tool's
 * identity is stable across re-annotation. (Wikipedia renders its search form
 * twice; both derive the same name.)
 */
export function dedupeNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((base) => {
    if (!seen.has(base)) { seen.add(base); return base; }
    for (let i = 2; ; i++) {
      const suffix = `_${i}`;
      const candidate = truncate(base, MAX_NAME_LENGTH - suffix.length) + suffix;
      if (!seen.has(candidate)) { seen.add(candidate); return candidate; }
    }
  });
}
