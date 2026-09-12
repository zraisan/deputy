# Deputy — Architecture

Living document. Updated at every block boundary, not at the end.
**Last updated:** Submission. Running end to end: Claude Code → deputyd → extension → real Chromium.
69 unit + 10 integration tests green.

`PLAN.md` says *what and why*. This says *how the parts fit and what they promise each other*.

---

## 1. The shape in one picture

```
┌─ callers ──────────────────┐
│ Claude Code   ──MCP────┐   │   thin face: 3 tools, flat context
│ Any A2A client──A2A────┤   │   peer face: goals in, artifacts out
└────────────────────────┼───┘
                         ▼
┌─ deputyd (Bun, 127.0.0.1:7331) ───────────────────────────┐
│  agent/     the loop: goal → choose tool → act → observe  │
│  registry/  tabId → tools, live                           │
│  sitemap/   origin → {path → tools}, persisted            │
│  a2a/       agent card, task lifecycle, streaming         │
│  mcp/       delegate_goal · task_status · answer_task     │
└───────────────────────────┬───────────────────────────────┘
                            │ WebSocket /ext  (daemon is server)
                            ▼
┌─ extension (MV3) ─────────────────────────────────────────┐
│  sw/        reconnecting socket, tab lifecycle, routing   │
│  content/   ISOLATED world: getTools · executeTool        │
│  graft/     THE RETROFIT ENGINE (pure core, DOM edge)     │
└───────────────────────────┬───────────────────────────────┘
                            ▼
                    Chromium's own WebMCP
             (schema synthesis + form execution)
```

**The load-bearing idea:** Chromium already synthesizes JSON Schema from a form and already executes
the submission. Graft does not reimplement either. It writes six HTML attributes and the browser does
the rest. Everything else here is plumbing around that fact.

---

## 2. Why the boundaries fall where they do

| Boundary | Reason |
|---|---|
| Daemon separate from extension | MV3 service workers die after 30 s idle and **cannot listen on a port**. The daemon owns long-lived protocol sessions and the agent loop; the extension is a reconnecting client. |
| Agent loop in the daemon, not the extension | It needs an API key, retries, and to survive the service worker dying mid-task. |
| Graft split into pure core + DOM edge | The naming logic is where correctness lives and where regressions hide, so it is pure and unit-tested. DOM reading is tested against real Chromium. |
| Content script in ISOLATED world | `getTools()`/`executeTool()` are reachable from ISOLATED, so we avoid `chrome.debugger` and its "being debugged" banner entirely. MAIN world is needed only for Tier 2. |
| One brain, two protocol faces | No Anthropic product speaks A2A, so MCP is required for the Claude demo; A2A is the honest model for delegation. Both call the same executor. |

---

## 3. Module contracts

### `graft/` — the retrofit engine

Pure core, DOM edge. The core is what gets unit tests.

```ts
// naming.ts — PURE. No DOM. Fully unit-tested.
type FormSignals = {
  ariaLabel?, heading?, submitLabel?, primaryFieldLabel?, action?, hostname?: string
}
deriveToolName(signals: FormSignals): string   // stable, legal, ≤40 chars
dedupeNames(names: string[]): string[]         // first-come names never move
normalizeName(raw: string): string
siteLabel(hostname?: string): string
```

**Contract:** `deriveToolName` always returns `/^[a-z][a-z0-9_]{0,63}$/`. It never returns the empty
string. Given identical signals it returns an identical name — tool identity must be stable across
re-annotation, or the agent's tool list churns on every SPA re-render.

**Signal priority:** human-written labels compete on *specificity* (multi-word beats one-word; a
non-generic word beats a generic verb), ties break toward the label describing the **action** over
one describing a field. The form `action` URL is consulted only when no human label exists at all —
it is machine-facing and produced `w_index_php_0` on Wikipedia when trusted.

```ts
// annotate.ts — DOM edge. Integration-tested against real Chromium.
extractSignals(form: HTMLFormElement): FormSignals
annotateDocument(doc: Document): AnnotationReport
```

**Contract:** `annotateDocument` is **idempotent** — a form already carrying `toolname` is skipped,
whether Graft wrote it or the site did. A site that implements WebMCP itself must come through
untouched. Running it twice must not change the registered tool set.

### Daemon ↔ extension wire (WebSocket `/ext`)

Daemon is the server; the extension dials in and re-dials on every service-worker wake.

```
extension → daemon
  { t:'ping' }                                  every 20s; also resets the SW idle timer
  { t:'tabs',  tabs: TabEntry[], activeTabId }  full reconcile, sent on connect
  { t:'tab',   tab: TabEntry, active?: bool }   one tab changed
  { t:'tabGone', tabId }
  { t:'activeTab', tabId }
  { id, ok:true,  result }                      reply to a daemon call
  { id, ok:false, error }

daemon → extension
  { id, op:'invoke',   tabId, tool, args }
  { id, op:'annotate', tabId }
  { id, op:'navigate', tabId, url }

TabEntry = { tabId, title, url, origin, tools: GraftTool[] }
GraftTool = { name, description, inputSchema, source:'native'|'grafted', consequential?: bool }
```

**Contract:** every daemon→extension call carries an `id` and gets exactly one reply. Calls time out
at 30 s daemon-side. A tab closing mid-call **rejects** the pending call rather than leaving it
hanging — a hung tool call is worse than a failed one.

### MCP face — deliberately thin

Three tools, stable names, never churning. This is what keeps the caller's context flat; exposing the
grafted tools directly would reintroduce the very cost the project exists to remove.

| tool | purpose |
|---|---|
| `delegate_goal(goal, tabId?)` | hand over a goal; returns an artifact or an `input_required` |
| `task_status(taskId)` | poll a long-running delegation |
| `answer_task(taskId, answer)` | resume one that stopped for a human |

Consequential actions round-trip through MCP's native multi-round-trip flow (`inputRequired`).

### A2A face

Agent Card at `/.well-known/agent-card.json`, JSON-RPC task methods. Skills are derived from open
tabs, so the card is generated per request. Task states map directly:

| situation | A2A state |
|---|---|
| working | `TASK_STATE_WORKING` |
| needs a human decision | `TASK_STATE_INPUT_REQUIRED` |
| hit a login wall | `TASK_STATE_AUTH_REQUIRED` |

---

## 4. Invariants — break these and the project stops being the project

1. **The page never crosses the wire to the caller.** No screenshots, no DOM, no a11y trees. Only
   goals in and structured artifacts out. This invariant *is* the 218,135 → ~180 token result.
2. **The agent loop observes schemas, not pages.** Even internally. 115 tokens per page, not 14,000.
3. **Tool identity is stable.** Same form, same name, across re-annotation and re-navigation.
4. **Annotation is idempotent and never overwrites a site's own tools.**
5. **Credentials never leave the browser.** Execution happens in the page's own security context;
   the daemon holds no cookies and copies no session state.
6. **Every consent path is bounded.** `acceptedContent()` returns `undefined` for both *declined* and
   *no answer*, so an unbounded retry loops until the client burns its 10 rounds and dies.
7. **`requestState` is attacker-controlled on return.** It names a tab, so it is HMAC-signed.

---

## 5. Test strategy

| tier | runner | what it proves | speed |
|---|---|---|---|
| unit | `bun test` | naming, dedup, sitemap matching, task state machine | ms |
| integration | `bun test` + real Chromium over CDP | annotation → registration → execution | seconds |
| end-to-end | `claude -p --output-format json` | a real client delegates; **token cost asserted** | ~minute |

Chromium is never mocked: it synthesizes the schema and performs the submission, so a mock would
assert our beliefs about it rather than its behaviour. The token budget is a **test**, not a slide —
if delegation stops being cheap, a test fails.

---

## 6. Build status

| block | scope | state |
|---|---|---|
| A | test infra, naming engine, Chromium harness | ✅ 21 tests |
| B | extension: SW, content script, popup, build | ✅ running in real Chromium |
| C | Graft retrofit engine | ✅ 10 integration tests + live on real Wikipedia |
| D | daemon, MCP face, planner | ✅ 5 tools live; Qwen via OpenRouter |
| G | consent, failure paths | ✅ bounded consent, HMAC'd state, tab-close rejects pending calls |
| H | measurement, README | ✅ `docs/measurements.md` |
| E | sitemap / multi-page navigation | ❌ designed (§8), not built |
| F | A2A protocol face | ❌ not built — task vocabulary is A2A's, wire format is not |

### The tool surface as shipped

`browser_capabilities` · `browser_ask` · `browser_invoke` · `browser_click` · `browser_navigate` ·
`delegate_goal` (+ `task_status`, `answer_task` for interrupted tasks).

`browser_capabilities` returns the page's whole contract: each form as a typed tool with its JSON
Schema (types, enums, min/max, required), what those fields currently hold, and every button and
link with a clickable ref. Long lists are **windowed with the true total stated**, filterable by
`actionQuery` and pageable by `actionOffset` — an agent is always told what it is not being shown.

**`browser_capabilities` returns full JSON Schemas, not names.** It originally returned names only,
to keep the payload small. That was wrong and the measurement proved it: the agent had to probe for
parameter names, costing 246,003 tokens. Returning the schemas — 583 tokens for a 7-field form —
dropped the same task to 155,774 tokens and 7 turns. **Sending more data made it 1.6× cheaper.**
Cheap, complete context beats clever compression.

### Chromium quirks this build depends on

- `executeTool(tool, input)` in Chromium 152 wants `input` as a **JSON string**. Passing an object
  stringifies to `[object Object]` and throws `Failed to parse input string as JSON`. The content
  script sends a string first and falls back to an object, so it keeps working when Chromium adopts
  the object form (webmcp#243).
- Declarative registration is **scheduled, not synchronous** — read `getTools()` after a tick.
- `document.modelContext` only; `navigator.modelContext` is already gone in 152.

### What the integration tests actually prove

Against real Chromium 152, not mocks:

- Two identical Wikipedia search forms become `search_wikipedia` and `search_wikipedia_2` — the
  `w_index_php_0` regression cannot return without a test failing.
- Invoking a grafted tool **fills and submits the real form**, and the page observes
  `SubmitEvent.agentInvoked === true`.
- Chromium synthesizes `type: number`, `format: date`, and `enum` from a `<select>` — asserted, so if
  the browser changes this under us we find out immediately.
- Hidden fields never become parameters.
- A site's own declared tools (declarative *and* `registerTool`) survive untouched while a plain form
  beside them still gets grafted.
- Annotating twice changes nothing — the SPA re-render case.

### Consent is enforced by the browser, not by our intentions

`isConsequential()` treats non-GET forms as state-changing and **withholds `toolautosubmit`**. Chromium
then focuses the submit button and waits for a human instead of submitting. A GET form — a search —
auto-submits. This is consent we get from the platform rather than a check we could forget to write.

### Test-browser safety

An earlier leak of headless Chromiums put this machine into swap. Now: unit tests
(`bun test`) can never spawn a browser — browser tests live in `test-browser/` and run only under
`bun run test:browser`, which kills strays before and after. The harness caps the browser
(`--no-zygote`, `--renderer-process-limit=1`, 256 MB heap), tags its profile `deputy-test-profile-*`
so strays are always greppable, and reaps on `exit`/`SIGINT`/`SIGTERM`/`uncaughtException` rather
than only on a clean `afterAll`.

## 7. Open questions

- **Cross-page capability discovery** — research landed; design in §8 below. Not yet built.
- **Tier 2 (no-`<form>` SPAs)** — imperative `registerTool` from the MAIN world, driving the DOM.
  Scoped after Tier 1 works end to end.
- **Does an interactive Claude Code session render the elicitation prompt?** MRTR round-trips are
  confirmed; print mode has no human to ask, so this needs a 30-second manual check.

---

## 8. Cross-page capability discovery (design, from research)

The tool you need usually is not on the page you are standing on. Nothing in the platform solves
this: Chrome's own docs say *"clients and browsers must visit a site directly to know if it has
callable tools,"* and WebMCP registrations die with the document. `llms.txt` has ~10% adoption,
is docs-site shaped, and Google ignores it. Agent manifests (A2A cards, Google's `ard.json`) describe
*agents*, not websites. **So the per-origin tool graph is the missing layer, and building it is the
interesting part of this project.**

### SiteGraph — persisted per origin in the daemon

```
nodes[urlPattern] = { title, tools: GraftTool[], navLinks: [{label, hrefPattern}], lastSeen }
edges = [{ from, via, to }]
workflows[goalTemplate] = [{ node, tool, argBindings }]   // written only after a success
```

Loop: **plan** (goal + a ≤2K-token graph summary → target node, or "explore") → **navigate** (replay a
known edge; else follow a nav link *by its label*) → **act** (call the tool) → **verify** (post-condition
on URL pattern or page state) → on success, append a workflow.

Evidence this is the right shape: WebNavigator (arXiv 2603.20366) names this exact failure
"topological blindness" and fixes it with an offline BFS interaction graph plus shortest-path replay
at **zero LLM tokens**; Agent Workflow Memory (ICML 2025) reports +24.6%/+51.1% relative success from
inducing reusable workflows; SkillMigrator (arXiv 2606.17645) gets 8–10% fewer LLM calls at matched
success by keying skills on **layout structure and semantic element descriptions** rather than
selectors. The last point is the sharpest: an HMT ablation drops 39.7% → 12.4% when semantic element
descriptions are swapped for raw identifiers. **Never key anything on a CSS selector.**

Known traps: content created mid-task is not in the graph (keep the site's own search box as an
escape hatch); URL patterns with ids (`/product/123`) must be normalized or the graph explodes; SPA
route changes fire no navigation event (hash the page structure, not the URL); tools die with the
document, so re-read `getTools()` on every commit.

## 9. Model routing (from research)

| step | model | why |
|---|---|---|
| plan / tool selection | **Sonnet 5, `effort: "low"`** | Haiku 4.5's knowledge cutoff (Feb 2025) predates WebMCP entirely; Sonnet 5 takes a tunable `effort` and Anthropic's own data says model tier beats token budget on web tasks |
| micro-steps (did the filter apply? extract the artifact) | **Haiku 4.5** | 0.72 s TTFT, 77.6 tok/s |

Traps: Sonnet 5 **400s** on `temperature`/`top_p`/`top_k`; Haiku 4.5 **400s** on `effort` (it takes
`budget_tokens` only); caches are model-scoped, so never share a cached prefix between the two.

The loop runs in the **daemon**, not the extension — it needs the API key off `chrome.storage` (which
is unencrypted), must survive the service worker dying mid-task, and Chrome kills a service worker
whose `fetch()` takes over 30 s, which a reasoning call can easily exceed.

---

## 10. Unfinished: fill-by-ref and click-by-ref

`browser_fill` and `browser_click` let an agent act on pages Deputy cannot graft into a typed tool —
apps that fake a form out of divs, where there is no `<form>` for WebMCP to attach to. That is
Deputy's biggest coverage gap and these were the fix.

They are implemented across all three layers (daemon tool → service worker route → content-script
handler), and the groundwork works: on a `<form>`-less page, `browser_capabilities` correctly reports
`tools: none` alongside refs `a1 (input text)`, `a2 (input select, options [all, books, tools])`,
`a3 (button)`. The `data-deputy-ref` attributes are verifiably present in the live DOM.

But the round trip times out at 30 s and the cause was not found before shipping. Ruled out:
the handler order in the built bundle is correct; the `Downstream` union carries the op; the refs
exist; and `browser_read` completes over the identical daemon → socket → service worker →
content-script path. The fault is somewhere in the message round trip for these two ops specifically.

**They are not registered as tools.** A tool that hangs for thirty seconds costs an agent far more
than a capability it never had — the same lesson the measurements taught about probing. The code
stays in the tree for whoever picks this up.

### Where the idea came from

PinchTab (github.com/pinchtab/pinchtab, 10.3k stars, Go) solves an adjacent problem — browser control
for agents without screenshots, via an accessibility tree with element refs, ~800 tokens per page.
Its `fill <ref>` and `text` commands are the direct inspiration for `browser_fill` and `browser_read`.

The distinction worth keeping clear: PinchTab hands the agent a better **map** of the page. Deputy
hands it a **typed API** — a seven-field form becomes one validated call rather than seven
ref-targeted actions, and Chromium performs the submission natively because the form was retrofitted
into a real WebMCP tool. `browser_fill` exists for the pages where that retrofit is impossible.

---

## 11. Tier 2: pages with no `<form>`

Tier 1 writes attributes onto a real `<form>` and lets Chromium synthesize the schema and perform
the submission. Large parts of the web have no `<form>` at all — Google Forms, React apps, anything
that wires divs to click handlers. Those pages got nothing.

**Tier 2 builds the tool itself.** It reads whatever controls exist, synthesizes the same shape of
JSON Schema Chromium would have produced, and registers it through `document.modelContext.registerTool`.
The agent cannot tell the tiers apart — one typed call either way. That equivalence is the point:
falling back to "click this ref, then type into that one" would hand the per-step cost straight back
to the caller, which is the thing the project exists to remove.

### ARIA widgets are most of the problem

A query for `input, select, textarea` is not enough. Google Forms and most design systems build
choices out of `div`s:

| on screen | actually |
|---|---|
| multiple choice | `role="radiogroup"` wrapping `role="radio"` |
| checkboxes | `role="checkbox"` |
| dropdown | `role="listbox"` wrapping `role="option"` |
| paragraph answer | `contenteditable` / `role="textbox"` |

Measured on a Google-Forms-shaped page before the fix: **1 field out of 4**. After collecting ARIA
widgets alongside real controls: **5 of 5**, verified from the live DOM —

```
text input     : "Ada Lovelace"
contenteditable: "Deputy turns any page into a typed tool."
radio checked  : TypeScript=true, Python=false, Go=false     ← exclusive, correct
checkboxes     : OpenRouter=true, Claude=true
```

Setting them is its own problem. A radio group is set by **clicking** the matching option, not by
assigning a value — the page's own handler is what updates `aria-checked` and any framework state
behind it. Real inputs go through the prototype's native `value` setter, because React caches the
previous value on the node and swallows a plain assignment.

### Proven on the real thing

The hackathon's own submission page — 25 inputs, **none inside a `<form>`** — becomes
`agents_everywhere`, a 24-field typed tool: booleans for the nine sponsor checkboxes, `uri` for the
video and social links, and `project_name`, `brief_description`, `social_post_proof_1` correctly
marked required.

**Untested:** a live Google Form. The fixture replicates its DOM patterns and passes, but Google
serves a heavily obfuscated page and may differ in ways the fixture does not capture. Treat Google
Forms as likely-working, not verified.

---

## 12. Tier 0: tools the app already wrote

Before grafting a form or synthesizing from loose inputs, check whether the page has already declared
its capabilities to its own embedded copilot.

CopilotKit's `useCopilotAction` (v2: `useFrontendTool`), the Vercel AI SDK and assistant-ui all make
an app author write a tool name, a description and a parameter schema. That is strictly better input
than anything inferred from the DOM, because a human wrote it deliberately and knows what the action
means.

**Getting at it.** Those registrations live in a React context, unreachable from an isolated content
script, and walking the fiber tree would break on every framework release. But the app *sends* them:
CopilotKit posts its `actions` array to `/api/copilotkit` on the first turn. So a MAIN-world script
installed at `document_start` patches `fetch` and `XMLHttpRequest.send`, watches for known agent
endpoints, and reads the manifest as it goes past. The request is forwarded untouched — this is a
read, not an interception.

`extractTools()` is deliberately shape-driven rather than schema-versioned, because these payloads
are undocumented and change: it walks the body looking for anything with a name and a schema, and
normalizes CopilotKit's `parameters: [{name, type, required}]` array into JSON Schema.

**The distinction that took a bug to find:** a tool carries a schema; a *parameter* is a name, a
description and a primitive type. Without separating them the recursion registers every argument as
its own tool — measured on a real CopilotKit payload, a two-action manifest produced six tools.

### The three tiers, in order of preference

| tier | source | why it ranks here |
|---|---|---|
| **0** | the app's own copilot manifest | a human wrote the description on purpose |
| **1** | a real `<form>` + WebMCP attributes | Chromium generates the schema and executes |
| **2** | loose inputs and ARIA widgets | inferred, but still one typed call |

All three surface identically through `browser_capabilities`. The agent never needs to know which
tier a tool came from.

---

## 13. CopilotKit: a shared registry, not an adapter

`@copilotkit/core` contains a `WebMCPRegistry` whose `sync(desired)` reconciles an app's frontend
tools against `document.modelContext`, registering each with `registerTool` and unregistering by
aborting its signal. `getWebMCPModelContext()` is simply `document.modelContext ?? null`.

That is the same registry Deputy grafts into. **No adapter is required in either direction**, which
is the strongest form an integration can take:

- A CopilotKit v2 app's tools arrive in `document.modelContext` with **live handlers**, so Deputy
  reports them as `source: "native"` and they execute for real through `executeTool`. The existing
  integration test `a site's own declared tools survive untouched` already covers exactly this path —
  it asserts that a tool registered by the page via `registerTool` survives grafting and stays callable.
- Deputy's grafted tools land in the same place CopilotKit reads from, so a CopilotKit copilot
  inherits them.

CopilotKit **v1** predates this. Its actions never reach the DOM; they are POSTed to
`/api/copilotkit` as a `parameters: [{name, type, required}]` array. Deputy's MAIN-world reader picks
that manifest up in passing and normalizes it to JSON Schema (§12). Read-only — the declaration is
surfaced, execution stays with the app's own copilot.

**The general lesson:** the retrofit is a bridge to a standard, not to a vendor. Anything that speaks
`document.modelContext` — CopilotKit today, more later — interoperates with Deputy by construction.
