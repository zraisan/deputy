/**
 * Bundle entry for the retrofit engine.
 *
 * Exposed on globalThis so it can be evaluated directly into a page — that is
 * how the integration tests drive it, and how the content script will use it.
 */
import { annotateDocument, extractSignals } from './annotate';
import { deriveToolName, dedupeNames, normalizeName, siteLabel } from './naming';

const graft = { annotateDocument, extractSignals, deriveToolName, dedupeNames, normalizeName, siteLabel };
(globalThis as unknown as Record<string, unknown>).__graft = graft;

export { graft };
export * from './annotate';
export * from './naming';
