import { describe, expect, test } from 'bun:test';
import { deriveToolName, dedupeNames, normalizeName, type FormSignals } from '../src/graft/naming';

const sig = (s: Partial<FormSignals>): FormSignals => ({ hostname: 'example.com', ...s });

describe('normalizeName', () => {
  test('lowercases and snake_cases', () => {
    expect(normalizeName('Search Wikipedia')).toBe('search_wikipedia');
  });
  test('strips punctuation and collapses separators', () => {
    expect(normalizeName("Sign in — it's free!")).toBe('sign_in_it_s_free');
  });
  test('trims leading and trailing underscores', () => {
    expect(normalizeName('  /search/  ')).toBe('search');
  });
  test('caps length at 40 without trailing underscore', () => {
    const out = normalizeName('a'.repeat(60));
    expect(out.length).toBeLessThanOrEqual(40);
    expect(out.endsWith('_')).toBe(false);
  });
  test('never emits characters outside [a-z0-9_]', () => {
    expect(normalizeName('Ünïcødé ✨ Formulär')).toMatch(/^[a-z0-9_]*$/);
  });
  test('empty input yields empty string, not underscores', () => {
    expect(normalizeName('!!!')).toBe('');
  });
});

describe('deriveToolName — the Wikipedia regression', () => {
  // Measured on en.wikipedia.org: the naive action-based heuristic produced
  // "w_index_php_0" and "w_index_php_1". Both meaningless, and duplicated.
  test('prefers a specific field label over a generic submit label', () => {
    expect(deriveToolName(sig({
      submitLabel: 'Search',
      primaryFieldLabel: 'Search Wikipedia',
      action: '/w/index.php',
      hostname: 'en.wikipedia.org',
    }))).toBe('search_wikipedia');
  });

  test('never falls back to the action path when any human label exists', () => {
    const name = deriveToolName(sig({ submitLabel: 'Search', action: '/w/index.php', hostname: 'en.wikipedia.org' }));
    expect(name).not.toContain('index');
    expect(name).not.toContain('php');
  });
});

describe('deriveToolName — signal priority', () => {
  test('aria-label on the form wins outright', () => {
    expect(deriveToolName(sig({
      ariaLabel: 'Book a table',
      heading: 'Restaurant',
      submitLabel: 'Go',
    }))).toBe('book_a_table');
  });

  test('a specific submit label beats a specific field label', () => {
    // "Sign in" describes the action; "Email address" only describes an input.
    expect(deriveToolName(sig({
      submitLabel: 'Sign in',
      primaryFieldLabel: 'Email address',
    }))).toBe('sign_in');
  });

  test('heading is used when there is no aria-label', () => {
    expect(deriveToolName(sig({ heading: 'Create an account', submitLabel: 'Submit' })))
      .toBe('create_an_account');
  });

  test('a generic one-word action gets qualified by the site', () => {
    expect(deriveToolName(sig({ submitLabel: 'Search', hostname: 'shop.example.co.uk' })))
      .toBe('search_example');
  });

  test('www is not treated as the site name', () => {
    expect(deriveToolName(sig({ submitLabel: 'Go', hostname: 'www.github.com' })))
      .toBe('go_github');
  });

  test('falls back to the action path only as a last resort', () => {
    expect(deriveToolName(sig({ action: '/checkout/confirm' }))).toBe('checkout_confirm');
  });

  test('degrades to a stable generic name when there is no signal at all', () => {
    expect(deriveToolName(sig({}))).toBe('form_example');
  });

  test('output is always a legal MCP tool name fragment', () => {
    for (const s of [
      sig({ ariaLabel: '✨✨✨' }),
      sig({ submitLabel: '→' }),
      sig({ action: 'https://x.test/a b c?q=1&r=2' }),
      sig({}),
    ]) {
      expect(deriveToolName(s)).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });
});

describe('dedupeNames', () => {
  test('leaves distinct names alone', () => {
    expect(dedupeNames(['search', 'login'])).toEqual(['search', 'login']);
  });
  test('suffixes collisions from the second occurrence', () => {
    // Wikipedia renders its search form twice; both derive the same name.
    expect(dedupeNames(['search_wikipedia', 'search_wikipedia']))
      .toEqual(['search_wikipedia', 'search_wikipedia_2']);
  });
  test('handles three-way collisions', () => {
    expect(dedupeNames(['f', 'f', 'f'])).toEqual(['f', 'f_2', 'f_3']);
  });
  test('does not collide a suffixed name with a real one', () => {
    expect(dedupeNames(['f', 'f', 'f_2'])).toEqual(['f', 'f_2', 'f_2_2']);
  });
  test('keeps names within the length cap after suffixing', () => {
    const long = 'x'.repeat(40);
    for (const n of dedupeNames([long, long])) expect(n.length).toBeLessThanOrEqual(40);
  });
});

describe('field labels name data, not actions', () => {
  // Measured on w3schools: three separate forms became first_name / firstname / fname.
  test('a field-derived name is prefixed with the submit verb', () => {
    expect(deriveToolName(sig({ submitLabel: 'Submit', primaryFieldLabel: 'First name' })))
      .toBe('submit_first_name');
  });

  test('a specific submit label still wins outright', () => {
    expect(deriveToolName(sig({ submitLabel: 'Sign in', primaryFieldLabel: 'Email address' })))
      .toBe('sign_in');
  });

  test('no doubling when the field label already starts with the verb', () => {
    expect(deriveToolName(sig({ submitLabel: 'Search', primaryFieldLabel: 'Search Wikipedia' })))
      .toBe('search_wikipedia');
  });

  test('a field-derived name survives with no submit label at all', () => {
    expect(deriveToolName(sig({ primaryFieldLabel: 'Coupon code' }))).toBe('coupon_code');
  });
});
