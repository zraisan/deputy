# Graft — a WebMCP polyfill for the entire web

**One line:** a browser extension that grafts agent-callable tools onto *every* website —
sites that implement the WebMCP standard get passed through, sites that never heard of it get
retrofitted — and republishes the union to any MCP client as the tools of your real, logged-in browser.

**The pitch to judges:** WebMCP is a real W3C standard shipping in Chrome. It has one fatal flaw:
it requires every website on earth to add code. Graft removes that requirement. You don't wait for
the web to adopt the standard — you bring the standard to the web.

---

## 0. What I verified on this machine (not claims — measured)

All of the below was run against **Chromium 152.0.7977.64** on this box, today.

| Finding | Status |
|---|---|
| `document.modelContext` exists behind a **single flag**: `chrome://flags/#enable-webmcp-testing` (`--enable-features=WebMCPTesting`) | ✅ verified |
| Shape: `registerTool`, `getTools`, `executeTool`, `ontoolchange`. `navigator.modelContext` is **already gone** in 152 — don't code against it | ✅ verified |
| **Declarative tools work**: `<form toolname tooldescription toolautosubmit>` + `toolparamdescription` on fields | ✅ verified |
| Chromium **synthesizes the JSON Schema itself** — `type:number/multipleOf` from `type=number`, `format:date` from `type=date`, `enum`+`anyOf` w/ titles from `<select>`, `required` from the `required` attribute, descriptions from `toolparamdescription` | ✅ verified |
| **Attributes injected at runtime onto a plain, unmodified form register a real tool** — `WebMCP.toolsAdded` fires, schema synthesized, tool callable | ✅ **verified — this is the whole project** |
| Invoking a declarative tool **fills and submits the form for real**, with `SubmitEvent.agentInvoked === true` | ✅ verified |
| The page can return a value to the agent via `SubmitEvent.respondWith(Promise)` — observed as `toolResponded.output` | ✅ verified |
| A full **`WebMCP` CDP domain** exists: `enable`, `invokeTool(frameId, toolName, input)`, `cancelInvocation`, events `toolsAdded` / `toolsRemoved` / `toolInvoked` / `toolResponded` | ✅ verified |
| An **ISOLATED-world content script** can call `getTools()` / `executeTool()` directly — no `chrome.debugger`, **no yellow "being debugged" banner** | ✅ (Google's own inspector extension does exactly this) |
| `@modelcontextprotocol/server` **2.0.0** + `/express` + `/node` on npm; legacy `sdk` at 1.30.0. Claude Code here is **2.1.269** | ✅ verified |

### The architectural payoff

Because Chromium does schema synthesis *and* execution for declarative tools, the hard parts of
"generate tools for arbitrary sites" are **already implemented inside the browser**. Graft does not
write a schema generator. Graft does not write a form executor. Graft writes **six HTML attributes**
onto the DOM and the browser does the rest.

```
document.querySelector('form#search').setAttribute('toolname', 'search_products')
   ↓  (browser: parse form, synthesize JSON Schema, register tool, fire toolsAdded)
Claude Code: mcp__graft__search_products({ q: "hammer", category: "tools", max_price: 50 })
   ↓  (browser: fill every field, dispatch submit with agentInvoked=true)
Real search executed in your real logged-in session.
```

---

## 1. Why this wins the "agents everywhere, no chat" theme

The extension **has no chat box**. It has no prompt. It isn't an agent you talk to.
It is a *capability layer*: the browser becomes a live, self-describing tool surface.

The demo moment: **you navigate, and the agent's abilities change.** Open a shopping tab and
Claude Code grows `search_products`. Switch to your ticketing tool and those tools vanish and are
replaced. Nobody typed anything into the browser. The interface *is* the browsing.

---

## 1b. The number — measured, not cited

The whole point is that **the page is never serialized to the model.** Not as pixels, and — the part
people miss — not as an accessibility tree either. The a11y snapshot is what *good* browser agents
already use; it's the thing to beat, not the screenshot.

Measured on `en.wikipedia.org/wiki/Main_Page`, same page, same moment, in this Chromium:

| representation | bytes | ~tokens |
|---|---|---|
| full AX tree (`Accessibility.getFullAXTree`) | 861,980 | 215,495 |
| raw HTML | 248,736 | 62,184 |
| screenshot (PNG, 1440×900) | 228,536 | 57,134 |
| trimmed a11y snapshot — *what Playwright MCP sends* | 56,678 | 14,170 |
| **Graft tool schemas** | **461** | **115** |

**123× smaller than the strongest alternative. 1,870× smaller than the full tree.**

And the asymmetry is bigger than the table shows: the 14,170 tokens are **per step** — re-sent every
turn, never deduped. The 115 are **per page, computed once and reused**; each subsequent call carries
only JSON arguments, on the order of 20 tokens.

This is why the architecture avoids screenshots *and* avoids DOM dumps: `browser_delegate`'s planner
input is a handful of JSON schemas plus the page title, not a representation of the page. The browser
already knows what its own forms accept — we ask it, instead of describing the pixels to a model and
asking it to guess.

Pair it with the success-rate evidence and the case is complete: structured/API actions beat
click-and-type by **+24 points on WebArena** (14.8% browsing → 38.9% hybrid), and on WebMall v3 adding
screenshots to a structured observation actually *lowered* success. Cheaper **and** better.

### Known rough edge, found while measuring
The naive name heuristic produced `w_index_php_0` / `w_index_php_1` — derived from the form `action`,
and duplicated because Wikipedia renders its search form twice. **Name derivation and de-duplication
are real build tasks, not polish.** Prefer, in order: `aria-label` → nearest heading → the submit
button's label → the primary field's label → the action path. De-dupe identical schemas per origin.
Bad tool names are the fastest way to make a good demo look sloppy.

---

## 2. Positioning (from the competitive research)

| Prior art | Why Graft is different |
|---|---|
| Playwright MCP / Chrome DevTools MCP / browser-use | Drive a **separate** browser, or attach via CDP with a debugger banner. They give the agent *pixels and a11y trees*; Graft gives it **typed tools**. |
| Browserbase / Steel / Hyperbrowser | Cloud browsers. Solve auth by **copying** your cookies out. Graft never moves credentials — execution happens in the page's own security context. |
| Claude in Chrome, Gemini in Chrome, Comet | Chat sidebars, captive to one vendor. None expose an open tool interface. Anthropic **explicitly declined** to support WebMCP in the Claude Chrome extension (issue #30645, closed "not planned"). Graft fills a gap the vendor said it wouldn't. |
| MCP-B / WebMCP native | Only work on sites that **opted in** — adoption "rounds to zero outside demos". Graft's whole point is the sites that didn't. |
| webmcp-gen, keak-ai/webmcp-core | Offline Playwright crawlers that emit tool definitions as a build artifact. Graft runs **live, in your logged-in tab**, and delegates execution to the browser's native machinery instead of replaying selectors. |

Research also confirms the payoff is real, not aesthetic: on WebArena, **API/structured actions beat
click-and-type by +24 points** (browsing 14.8% → hybrid 38.9%), and structured observation cuts token
cost by an order of magnitude vs. snapshot dumps.

---

## 2b. Scoring against the rubric — and the one risk that could cost us

### The risk, stated plainly

Criterion 1 asks: *"Does the project deliver a working agent inside a place where people already
work, talk, or live?"* Criterion 2 penalises an environment that "mostly serves as a wrapper" (score 2).

As described so far, Graft is **infrastructure**: the agent lives in a terminal and the browser is a
tool provider. A judge can reasonably read that as *"the environment is the terminal; the browser is
plumbing."* That single reading caps us at 2–3 on two criteria.

**The fix is cheap and it is not optional: the agent must be visibly present and visibly acting
*inside the browser*.** Not a chat box — presence. Three things do it:

- **Visible actuation.** When a tool runs, the page shows it: the target form outlines, fields fill
  one by one with a brief stagger, a toast names what just happened and which agent asked. The judge
  *watches the agent work in the environment* instead of reading a terminal result.
- **A live capability surface.** A small always-present indicator: "this page exposes 4 tools" —
  click it to see them, with native ones and grafted ones visually distinguished. The browser becomes
  self-describing to the human too, not just to the model.
- **In-page consent.** The approve/deny chip renders in the page, anchored to the element about to be
  acted on. Control lives where the action lives.

With those, the browser stops being a wrapper and becomes the place the agent lives. Without them we
have a nicely engineered MCP server.

### Per-criterion read

| Criterion | Where we land | What gets us the last point |
|---|---|---|
| **Core Requirements & Functionality** | Strong *if* the walking skeleton lands early and the demo path is rehearsed cold, twice. The 5 is "robust and reliable" — that's rehearsal and graceful degradation, not features. | Detect the flag being off and say so in plain language instead of failing silently. Handle a dead daemon, a closed tab and a re-rendered form without a crash. |
| **Innovation & Theme Alignment** | Our best criterion. The 5 is "a surprising new agent pattern whose central value could not be reproduced in a standalone chatbox" — Graft's value *cannot* exist in a chatbox: it comes from the live logged-in session and the site's own DOM. The surprise is real: **we teach a website to describe itself to an agent, without its cooperation.** | Make the "site that never heard of WebMCP" moment unmissable. Show the injected attributes in DevTools. That's the beat judges will remember. |
| **Technical Execution & Integration** | Good. The rubric's 5 explicitly names "robust orchestration, thoughtful failure handling, and a deeply integrated architecture" — so failure handling is **scored**, not hygiene. Integration depth is genuinely unusual: we're on a W3C standard's native browser machinery and its CDP domain. | Budget real time for failure paths (below). Say out loud that credentials never leave the browser — "data handling" is named in this criterion. |
| **Usefulness & Agentic Experience** | The 5 is "uses context intelligently while remaining clear and controllable". Context = the tab you're actually on. Controllable = the consent chip. | Pick a demo task someone would genuinely want done, not a toy. The tool list changing as you navigate *is* the "uses context intelligently" evidence. |

---

## 3. Architecture — a delegating agent, not a tool server

### The decision that matters

Not "MCP or A2A" — that's transport. The architectural fork is **does the browser side decide, or
only execute?** A tool server that exposes 40 grafted tools makes the browser a *library*, which is
exactly the "environment is a wrapper" reading that caps Criterion 2 at a 2. So the browser decides.

**Claude Code has no native A2A support** — A2A reaches Claude only through third-party wrappers and
MCP bridges. So MCP is the transport. But we take A2A's *task lifecycle* wholesale, because it is the
right model and because "human handoff as a protocol primitive" is documented white space that nothing
in this space has filled.

### The surface: four tools, stable, tiny

```
browser_capabilities(tab?)      → what this tab can do right now (native + grafted), with schemas
browser_delegate(goal, tab?)    → give the browser agent a goal; it picks and runs      ← the headline
browser_invoke(tool, args)      → call one tool precisely, when the caller already knows  ← the escape hatch
browser_resume(task_id, note?)  → continue a task that stopped for a human
```

Four names, unchanging. That alone kills three landmines from §5: no context blowup (the caller never
sees 40 tools), no 64-char name budget, and the `list_changed` rate limit stops mattering because the
tool list barely changes. Capability changes surface through `browser_capabilities`, not through
churning the MCP tool list.

### Human handoff — use MCP's native primitive, don't hand-roll A2A's

**Found while scaffolding, and it settles the A2A question.** MCP's 2026-07-28 revision has
**multi-round-trip (MRTR) handlers**, with runtime support in `@modelcontextprotocol/server` 2.0.0:

```ts
server.registerTool('browser_delegate', { inputSchema }, async (args, ctx) => {
  const ok = acceptedContent<{ confirm: boolean }>(ctx.mcpReq.inputResponses, 'confirm');
  if (!ok) return inputRequired({
    inputRequests: { confirm: inputRequired.elicit({
      message: `Submit the booking form on ${host}?`,
      requestedSchema: { type:'object', properties:{ confirm:{type:'boolean'} }, required:['confirm'] }
    })},
    requestState: sign({ task: 't_7f3a' }),      // opaque, echoed back on retry
  });
  return run(args);
});
```

The client fulfils the embedded request and **retries the call** with `inputResponses` attached. So:

- **`browser_resume` is probably unnecessary** — the retry *is* the resume. Keep it registered as a
  fallback in case Claude Code doesn't support MRTR (see the unknown below), but design for MRTR first.
- **Consent gets two surfaces from one mechanism**: Claude Code's own elicitation UI *and* our in-page
  chip, from the same `inputRequired` return.
- **`inputRequired.elicitUrl()` is the login-wall handoff.** Point the human at the tab's URL —
  *"sign in here, then I'll continue"* — which is precisely the primitive the competitive research
  flagged as missing from the whole category. We get it from the protocol instead of inventing it.

Note the deprecations: the `Task` / `tasks/get` / `TaskStatus` vocabulary is marked *"2025-11-25 wire
vocabulary with no SDK runtime; kept importable for interoperability only."* Don't build on it.
MRTR replaced it.

**Security, flagged by the SDK itself:** `requestState` round-trips through the client and comes back
as attacker-controlled input. If it ever influences authorization or which tab gets acted on, HMAC it.
The SDK explicitly does not do this for you. Ours carries a tab id — so sign it.

> **ANSWERED (hour 1): Claude Code 2.1.269 does implement MRTR.** The harness performs the
> round-trip below the model's level, up to `inputRequired.maxRounds` (10). Verified end to end
> against graftd. Remaining 30-second manual check: confirm an *interactive* session actually shows
> the elicitation prompt to the human (print mode has no human to ask).

**Landmine found while proving it — this would have been a demo-killer.** `acceptedContent()` returns
`undefined` for *both* "the human declined" and "no response came back at all". Re-issuing
`inputRequired` on `undefined` is an infinite loop: the client burns all 10 rounds and the call dies
with `Multi-round-trip request 'tools/call' still required input after 10 rounds`. Every consent path
must bound itself — carry an attempt counter in `requestState` and use `inputResponse()` (the
discriminated view) to tell *declined* from *missing*. graftd's `askConsent()` does this.

Second gotcha: **`ctx.mcpReq.requestState` is an accessor function, not a string** — calling
`.split()` on it throws. With no verify hook configured it returns the raw wire string.

### Which model does what

**The extension uses no model at all — and that is a feature, not a shortcut.** Tool synthesis is
deterministic DOM heuristics; schema generation is Chromium's; execution is Chromium's. Nothing in the
critical path calls an LLM, which is why it is fast, free and repeatable on stage.

A model appears in exactly two optional places: `browser_delegate`'s single-step planner, and Tier 3
distillation. For both, use **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`) — the job is
schema-constrained argument filling, it sits in the interaction path so latency matters, and it is
cheap enough to run on every delegate call.

With no API key present, `browser_delegate` returns ranked candidates instead of failing, and the
calling agent picks. So the intelligence lives in whatever agent you already have, and the demo never
depends on a second key.

### Inside `browser_delegate` — keep it one step, not a loop

Given (goal, the grafted tool schemas for that tab, page title/URL), one Claude API call picks a tool
and fills its arguments. **Single-step planner, not an agent loop** — a loop is where 24-hour projects
die, and the schemas do most of the work a loop would.

**Graceful degradation, and it's load-bearing:** with no API key, `browser_delegate` returns the
ranked candidate tools and their schemas instead of failing. The demo still works, the caller (Claude
Code, which is already an agent) just does the picking. Never let the stage depend on a second API key.

### Stack

```
  Claude Code  ──MCP Streamable HTTP──▶  graftd  (Node, 127.0.0.1:7331)
   any A2A client ──Agent Card + task──▶    │      ← optional second face, §4 stretch
                                          ▲ │
                                          │ │  WebSocket  /ext
                                          │ ▼
                                  MV3 service worker  (tab lifecycle, routing)
                                          ▲ │
                                          │ ▼
                              content script (ISOLATED, <all_urls>)
                                    ├─ passthrough:  document.modelContext.getTools()
                                    ├─ retrofit:     annotate DOM  ──▶ browser registers tools
                                    └─ execute:      document.modelContext.executeTool()
```

Keep the daemon's task model protocol-agnostic. An A2A face — Agent Card at
`/.well-known/agent-card.json` plus a task endpoint — then becomes a serialization concern of about two
hours, not a rewrite. **Build it only if you reach hour 17 ahead of schedule**, and only because it
earns the claim *"any agent, from any framework, can delegate a goal to your browser."* If you build it
without a second client to demo against, it's a bullet point, not a beat — and rehearsal time is worth
more than a bullet point.

**Why a separate daemon and not an MCP server in the extension:** MV3 service workers die after 30s
idle. The daemon holds the MCP session; the extension is a reconnecting WebSocket *client* with a 20s
keepalive (message traffic resets the idle timer — Chrome 116+). Install cost: load unpacked + one
`pnpm dev`. Native messaging would cost a pinned extension ID, an absolute-path host manifest and a
browser restart — not worth it in 24 hours.

### The retrofit engine — two tiers

**Tier 1 — declarative (forms).** Find `<form>`s lacking `toolname`. Derive a name from the nearest
`<h1>`/`<legend>`/`aria-label`/action path. Set `toolname`, `tooldescription`, and
`toolparamdescription` on each control (from `<label for>`, `aria-label`, `placeholder`, `title`).
Omit `toolautosubmit` for anything consequential so the browser focuses the submit button and the
human presses it — consent for free, straight from the spec.

**Tier 2 — imperative (everything else).** Modern SPAs often have no real `<form>`. Inject a MAIN-world
script that calls `document.modelContext.registerTool()` with a hand-rolled `execute` that drives the
DOM (click a ref, type into a ref). Same output surface: everything lands in `getTools()`, so the
daemon can't tell the tiers apart.

**Tier 3 — stretch, only if ahead of schedule.** One-shot LLM distillation: compress the page, ask
Claude for a tool manifest, cache per-origin in `chrome.storage`. Cache it *before* the demo so it's
instant on stage.

## 4. Hour-by-hour (24h)

| Hours | Deliverable | Done when |
|---|---|---|
| **0–1** | Setup. `chrome://flags/#enable-webmcp-testing` → Enabled. pnpm workspace: `packages/graftd`, `packages/extension`. | Chromium launches with the flag; `document.modelContext` is truthy in the console. |
| **1–3** | **Walking skeleton.** graftd serves MCP over HTTP + accepts the extension WebSocket. Ship the four tools as stubs and the task-state enum now — the shape is the architecture. | `claude mcp add --transport http graft http://127.0.0.1:7331/mcp` and Claude Code can call it. **Do not proceed until this works.** |
| **3–5** | **Passthrough.** Content script reads `getTools()`, relays to daemon; `executeTool()` on call. Test against Google's demos (`GoogleChromeLabs/webmcp-tools`). | Claude Code calls a tool a *real WebMCP site* declared. |
| **5–9** | **Tier 1 retrofit.** The annotation engine. This is the core; give it the most time. | Claude Code calls a tool on a site that has no WebMCP code at all. **This is the demo.** |
| **9–12** | **`browser_delegate` + the task lifecycle.** Single-step planner, `input_required` round-trip via `browser_resume`, no-API-key degradation. Then **Tier 2 retrofit** for SPA/button pages if time remains. | A goal in plain language becomes a real form submission; a login wall returns `input_required` instead of failing. |
| **12–14** | **Live tool list + failure paths.** `toolchange` + `chrome.tabs` events → debounced `notify.toolsChanged()`. Scope to the active tab. Names ≤64 chars incl. `mcp__graft__`. **Then the failure work, which is scored:** invocation timeout, schema-validation errors returned as structured MCP errors, tab-closed / daemon-down / flag-off handled with a legible message, re-annotate after re-render. | Switching tabs changes Claude Code's tool list; killing a tab mid-call returns a clean error instead of hanging. |
| **14–17** | **In-page agent presence — do not cut this.** Visible actuation (form outlines, staggered fill, toast naming the caller), the capability indicator (native vs grafted), and the consent chip anchored to the target element. | A judge watching only the browser window can tell an agent is working and can stop it. |
| **17–19** | **Demo build.** Three sites, scripted end to end. Write the exact commands down. | You can run it twice, cold, without touching code. |
| **19–21** | **Polish.** Extension popup listing live tools per tab. README + 60s screen recording **(this is your insurance — record it while things work).** | A stranger could install it. |
| **21–24** | **Buffer + rehearse.** | Slack for the thing that will break. |

### Cut list, in the order you cut them
Tier 3 LLM distillation → Tier 2 imperative → multi-tab scoping (hardcode the active tab) →
the consent chip's "always allow this origin" memory (keep the chip) → the capability indicator's
detail panel (keep the indicator).

**Never cut:** the walking skeleton; Tier 1 retrofit; visible actuation. The first two are the
project, and the third is what makes the browser the environment rather than a wrapper — cutting it
costs more points than any feature it buys time for.

---

## 5. Landmines (each one has sunk somebody)

1. **Don't restart graftd repeatedly while Claude Code is attached.** Claude Code rate-limits
   subscription stream reopens — 3 per 10s, and after 5 reopens in an hour it backs off ~6 hours.
   Lose that and your live-updating tool list — the best part of the demo — is dead until tomorrow.
   Use `/mcp` to reconnect deliberately; build the daemon to hot-reload its registry, not its process.
2. **Tool name budget.** Claude Code exposes `mcp__graft__<tool>` and the API rejects names >64 chars.
   `[A-Za-z0-9_-]` only. Truncate slugs to ~40 chars and keep the ordering deterministic.
3. **Context blowup.** 20 tabs × 15 tools will bury Claude Code. Scope to the active tab by default;
   cap tools per origin; make `graft_list_tabs` the way to reach the others.
4. **SPAs capture `fetch` and re-render.** Annotations get wiped by React re-renders — re-annotate from
   a `MutationObserver`, debounced, and make annotation idempotent (skip forms that already have `toolname`).
5. **Page CSP and Trusted Types** apply to MAIN-world injection (Tier 2). Use
   `chrome.scripting.executeScript({world:'MAIN', func})` — never a `<script src>`/`data:` tag, which CSP blocks.
6. **`enable-webmcp-testing` is a per-profile flag.** If you demo on a different machine or a fresh
   profile, it's off and *nothing works*. Put it in the README and in your pre-demo checklist.
7. **The flag is a testing flag on a moving standard.** The origin trial runs M149–M156 with ship
   target ~M157. You're on 152, inside the window. Fine for a hackathon; say so honestly rather than
   claiming production-readiness.

---

## 6. Demo script (rehearse this exact sequence)

**Framing rule for the whole demo: the browser is the hero, the terminal is the supporting actor.**
Give the browser window the larger share of the screen. Every beat should be legible to someone
watching only the right-hand side.

1. **Cold open, no chat anywhere.** Chromium large on the right, Claude Code small on the left.
   `/mcp` shows `graft` connected with **zero tools**. Empty browser. *"There is no chat box in this
   demo. Nothing gets typed into the browser at any point."*
2. **Standards path.** Open a Google WebMCP demo page. The capability indicator lights up: *4 tools,
   native*. Re-run `/mcp` — the site's own declared tools are Claude's tools.
   *"That's the W3C standard working exactly as designed — for the handful of sites that adopted it."*
3. **The turn — the beat they'll remember.** Open an ordinary site that has never heard of WebMCP.
   The indicator lights up anyway: *3 tools, grafted*. Open DevTools and show `toolname` sitting on
   the site's own `<form>`. *"We didn't automate this site. We taught it to describe itself — and the
   browser generated that schema, not us."*
4. **Use it, and watch the browser.** Ask Claude Code for the task. On screen: the form outlines, the
   fields fill one by one, the toast names the caller, the page submits in the real logged-in session.
   The structured result returns to the terminal. *"No screenshots, no clicking at coordinates. A typed
   call against a schema the browser wrote."*
5. **The theme landing.** Switch tabs. The tool list changes live in `/mcp`. *"Nothing was typed into
   the browser. Browsing is the interface — the agent's abilities are wherever you are."*
6. **The consent beat.** Trigger something consequential. The chip appears anchored to the element;
   deny it once to show the agent is genuinely stoppable, then approve it.
7. **The failure beat — 15 seconds, and it buys a whole criterion.** Close the tab mid-call, or call a
   tool with a bad argument. A clean structured error comes back. *"It fails legibly."*
8. **Close on the number — put the table on screen.** Same Wikipedia page, same moment:
   a screenshot is ~57,000 tokens, the trimmed a11y snapshot that Playwright MCP sends is ~14,000,
   and Graft's schemas are **115** — and ours is computed once per page, not re-sent every turn.
   *"We're not sending a picture of the page. We're not sending the page. The browser already knows
   what its own forms accept — we just ask it."* Then the success rate: structured actions beat
   click-and-type by **+24 points on WebArena**. *"Cheaper and better, and now every site has one."*

### What to say if a judge asks "so is this an agent, or a library?"

*"It's an agent. Claude Code doesn't get a list of forty buttons to press — it hands my browser a goal.
The browser agent is the one that knows what's on screen, what you're logged into, and what this page
can actually do, so it's the one that decides. And when it hits something only you can do — a login, a
purchase confirmation — it doesn't fail, it hands the task back to you and waits."*

Then point at the browser, where something is visibly happening.

## 7. Naming

**Graft** (primary) — you graft a standard onto a host that didn't grow it. Short, concrete, `graftd`
is a good daemon name, and the metaphor explains the project in one word.

Alternates: **Understory** (the layer beneath the canopy), **Handrail** (what the agent holds onto),
**Marginalia** (annotations in the margins of someone else's page).

---

## 8. First commands

```bash
# 1. one-time: enable the flag
chromium --enable-features=WebMCPTesting     # or chrome://flags/#enable-webmcp-testing

# 2. scaffold
pnpm init && pnpm add -w @modelcontextprotocol/server @modelcontextprotocol/express \
                        @modelcontextprotocol/node express ws zod

# 3. once graftd is up
claude mcp add --transport http graft http://127.0.0.1:7331/mcp
```
