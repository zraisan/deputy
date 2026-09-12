/**
 * Runs in the page's MAIN world, at document_start.
 *
 * An app with an embedded copilot posts its registered tools to its own runtime
 * endpoint. Those definitions are hand-written by the app author — better names,
 * better descriptions and better schemas than anything we could infer from the
 * DOM. We read them off the wire as the app sends them, and hand them to the
 * isolated content script.
 *
 * Read-only: the request is passed through untouched.
 */
import { looksLikeAgentEndpoint, extractTools, frameworkOf } from './graft/inapp';

const CHANNEL = '__deputy_inapp';
const announced = new Set<string>();

function report(url: string, body: string) {
  try {
    const payload = JSON.parse(body);
    const framework = frameworkOf(url, body);
    const tools = extractTools(payload, framework).filter((t) => !announced.has(t.name));
    if (tools.length === 0) return;
    for (const t of tools) announced.add(t.name);
    window.postMessage({ [CHANNEL]: true, framework, tools }, '*');
  } catch { /* not JSON, or not a manifest — nothing to do */ }
}

const originalFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  try {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (looksLikeAgentEndpoint(url) && typeof init?.body === 'string') report(url, init.body);
  } catch { /* never let instrumentation break the page */ }
  return originalFetch.call(this, input as RequestInfo, init);
};

const originalOpen = XMLHttpRequest.prototype.open;
const originalSend = XMLHttpRequest.prototype.send;
XMLHttpRequest.prototype.open = function (method: string, url: string, ...rest: unknown[]) {
  (this as XMLHttpRequest & { __deputyUrl?: string }).__deputyUrl = String(url);
  return originalOpen.apply(this, [method, url, ...rest] as never);
};
XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
  try {
    const url = (this as XMLHttpRequest & { __deputyUrl?: string }).__deputyUrl ?? '';
    if (looksLikeAgentEndpoint(url) && typeof body === 'string') report(url, body);
  } catch { /* as above */ }
  return originalSend.call(this, body as never);
};
