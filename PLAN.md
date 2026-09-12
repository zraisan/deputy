# Deputy — the browser agent other agents delegate to

> **Claude doesn't browse. It deputizes.**

An agent that lives in your browser and specialises in it. External agents — Claude Code, or
anything speaking A2A — hand it a *goal*. It figures out the site, acts in your real logged-in
session through typed tools, and hands back a structured result. The calling agent never sees
the page.

Inside it, **Graft** is the subsystem that makes this possible: it teaches any website to
describe itself to an agent, by retrofitting the W3C WebMCP standard onto sites that never
implemented it.

---

## 1. The number this project exists for

Both halves measured on this machine, today. Neither is cited.

**Baseline — an agent driving the browser itself** (`bench/BASELINE.md`). Task: search Wikipedia
for "Byzantine Empire", open the article, report the first sentence. Via Playwright MCP, which
sends trimmed accessibility snapshots — the strongest baseline, not a straw man:

| turns | total tokens | cost | wall clock |
|---|---|---|---|
| 9 | **218,135** | **$0.28** | 95 s |

202,310 of those tokens are **cache reads** — every turn re-reads a context that grew by another
snapshot.

**Delegated** — the caller sends a goal (~30 tokens) and receives an artifact (~150):

| | caller tokens | vs baseline |
|---|---|---|
| Deputy | ~180 | **~1,200× less** |

### The argument that actually lands

Cost is the boring half. **Occupancy is the real one:** 218,135 tokens is more than a 200K
context window. The calling agent barely survived *one* trivial browser task — it does not get a
second. Delegation is the difference between one browser task per session and a hundred.

Be honest on stage about the other side: Deputy still thinks. But it thinks over **115-token tool
schemas** (§2) instead of 14K-token snapshots, on Haiku instead of the caller's model. Total system
cost falls a lot; *caller context* falls ~1,200×.

**The claim: the calling agent stops paying for the web.**

---

## 2. What I verified on this machine (measured, not claimed)

Chromium **152.0.7977.64**, today.

| Finding | |
|---|---|
| `document.modelContext` exists behind one flag: `chrome://flags/#enable-webmcp-testing` (`--enable-features=WebMCPTesting`) | ✅ |
| Shape: `registerTool`, `getTools`, `executeTool`, `ontoolchange`. `navigator.modelContext` is **already gone** in 152 | ✅ |
| Declarative tools work: `<form toolname tooldescription toolautosubmit>` + `toolparamdescription` | ✅ |
| Chromium **synthesizes the JSON Schema itself** — `format:date` from `type=date`, `enum`+`anyOf` w/ titles from `<select>`, `required` from the attribute | ✅ |
| **Attributes injected at runtime onto a plain, unmodified form register a real tool.** This is the whole project | ✅ |
| Invoking one **fills and submits the form for real**, `SubmitEvent.agentInvoked === true` | ✅ |
| Page returns a value to the agent via `SubmitEvent.respondWith(Promise)` | ✅ |
| Full `WebMCP` **CDP domain**: `invokeTool`, `cancelInvocation`, events `toolsAdded`/`toolsRemoved`/`toolInvoked`/`toolResponded` | ✅ |
| ISOLATED-world content script can call `getTools()`/`executeTool()` — no `chrome.debugger`, **no yellow banner** | ✅ |
| Claude Code 2.1.269 implements MCP **multi-round-trip** (`inputRequired`), harness-level, max 10 rounds | ✅ |

**Token measurement**, `en.wikipedia.org/wiki/Main_Page`, same page same moment:

| representation | ~tokens |
|---|---|
| full AX tree | 215,495 |
| raw HTML | 62,184 |
| screenshot (PNG) | 57,134 |
| trimmed a11y snapshot *(Playwright MCP sends this)* | 14,170 |
| **Graft tool schemas** | **115** |

123× smaller than the strongest alternative — and computed **once per page**, not re-sent per turn.

### Why this makes the build tractable

Chromium does schema synthesis *and* execution. Graft does not write a schema generator or a form
executor. **It writes six HTML attributes and the browser does the rest.**

---

## 3. Why delegation, and why A2A

Tool-calling and delegation are not stylistic alternatives here — they produce different token
curves. If the caller orchestrates step by step over MCP tools, **its context still grows per
step**; we would have cut the cost of each observation without cutting how many the caller sees.
Delegation is what collapses it. *The protocol choice and the headline number are the same decision.*

A2A is the right semantic model for that: opaque peer agents, goals in and artifacts out, with
`TASK_STATE_INPUT_REQUIRED` and `TASK_STATE_AUTH_REQUIRED` as first-class states. The browser is
*the* environment where "you need to log in" happens constantly, and A2A models it natively.

**But no Anthropic product speaks A2A** — zero mentions in Claude Code's 6,675-line changelog;
issue #4993 closed not-planned. So Deputy serves **two faces on one brain**:

```
Claude Code ──MCP (thin: delegate/status/answer)──┐
                                                  ├──▶ Deputy executor ──▶ browser
Any A2A client ──A2A (agent card + JSON-RPC)──────┘
```

Dual exposure is the norm in the wild — nearly every live agent in `awesome-a2a` serves both a
`/.well-known/agent-card.json` and an `/mcp`. The MCP face is deliberately **thin** (3 tools, not
40) so the caller's context stays flat.

### Theme fit falls out of the architecture

The brief asks for "an agent for a place people already work… meaningfully more useful because of
that context." Deputy lives in the browser and is better *because* of it: your session, your tabs,
the page's own semantics. That is not a UI veneer bolted onto infrastructure — it is the reason the
token number exists.

---

## 4. Architecture

```
packages/
  shared/       types + the wire contract between daemon and extension
  deputyd/      Bun daemon — the brain and both protocol faces
    registry    tabs → tools, live
    sitemap     per-origin capability memory, persisted   ← learns sites
    agent       the loop: goal → tool choice → act → observe → repeat
    a2a         A2A server face (agent card, tasks, streaming)
    mcp         MCP face (delegate_goal, task_status, answer_task)
  extension/    MV3 — Deputy's hands
    sw          reconnecting socket, tab lifecycle
    content     ISOLATED: getTools / executeTool / annotate
    graft       THE RETROFIT ENGINE — pure, unit-tested
```

**Why a daemon, not all-in-extension:** MV3 service workers die after 30s idle and cannot listen on
a port. The daemon holds the A2A/MCP sessions and the agent loop; the extension is a reconnecting
WebSocket *client* with a 20s keepalive (message traffic resets the idle timer, Chrome 116+).

**The agent loop** observes *only* tool schemas and structured results — never screenshots, never
DOM dumps. That is why it is cheap even internally.

**Model:** Haiku 4.5 (`claude-haiku-4-5-20251001`) — schema-constrained tool selection and argument
filling, in the interaction path, called often. Sonnet only if Haiku demonstrably fails the demo task.

### The hard problem: capabilities on pages you haven't visited

The search form is on `/search`; checkout is on `/cart`. The tool you need is usually not on the
page you're standing on. Deputy keeps a **per-origin sitemap** — `origin → {path → tools seen}` —
built up as you browse and persisted. On a goal: match against the current page, else consult
memory, else navigate to a likely entry point and re-observe.

This yields a demo beat worth building for: **the second run of a task is instant, because Deputy
remembers the site.**

*(Approach pending the research still in flight; the sitemap module is designed so its strategy is
swappable behind a stable interface.)*

---

## 5. Method: TDD, and what "tested" means here

Three tiers, because this project straddles a browser:

1. **Unit (`bun test`)** — pure logic, no browser. The Graft naming/annotation engine, sitemap
   matching, registry reconciliation, task state machine. Fast, run constantly. **Write these first.**
2. **Integration against real Chromium (CDP)** — prove annotation → registration → execution on real
   pages. Chromium is the system under test; mocking it would test nothing. Already have the harness.
3. **End-to-end** — `claude -p --output-format json` driving the real daemon, asserting both the
   result *and the token cost*. The token number is a test, not a slide.

**Non-negotiable:** the naming engine gets tests first. It produced `w_index_php_0`/`_1` on Wikipedia
during measurement — duplicate, meaningless names. Bad tool names make a good demo look sloppy, and
this is exactly the kind of logic that regresses silently.

---

## 6. Build order

| Block | Deliverable | Done when |
|---|---|---|
| **A** | Test infra + `shared` types + **Graft naming engine, TDD** | `bun test` green; Wikipedia yields `search_wikipedia`, not `w_index_php_0`; duplicates deduped |
| **B** | Extension skeleton + socket + content script passthrough | Real tools from a real tab appear in the daemon's registry |
| **C** | Graft retrofit live | A site with no WebMCP code yields working tools in a real tab |
| **D** | Agent loop (single-step first) + MCP face | `claude -p` delegates a goal and it happens, token cost asserted |
| **E** | Sitemap memory + multi-step navigation | A goal needing another page works; second run is faster |
| **F** | A2A face + agent card | A non-Claude client delegates to the browser |
| **G** | Consent, failure paths, in-page actuation visibility | Login wall → `input_required`; tab closed mid-call → clean error |
| **H** | Demo build, rehearsal, README, recording | Runs twice cold without touching code |

Cut from the bottom. **A–D is the project**; E is what makes it look intelligent; F is the
"any framework" claim; G is scored under "thoughtful failure handling"; H is insurance.

---

## 7. Landmines (each already cost me something or is verified real)

1. **Unbounded elicitation loop.** `acceptedContent()` returns `undefined` for *both* "declined" and
   "no response arrived" — re-issuing `inputRequired` on undefined loops until the client burns all
   10 rounds and dies. Bound every consent path with an attempt counter in `requestState`. *(Hit this.)*
2. **`ctx.mcpReq.requestState` is an accessor function, not a string.** `.split()` on it throws. *(Hit this.)*
3. **MCP 2026-07-28 wire details:** no `initialize`; every request needs a `_meta` envelope plus
   `Mcp-Method` and `Mcp-Name` headers mirroring the body. *(Hit all three.)*
4. **Don't restart the daemon repeatedly while Claude Code is attached** — subscription reopens are
   rate-limited (5/hour → ~6h backoff). Hot-reload the registry, not the process.
5. **`enable-webmcp-testing` is per-profile.** Fresh profile or different machine = nothing works.
6. **SPAs wipe annotations on re-render.** Re-annotate from a debounced `MutationObserver`; make
   annotation idempotent (skip forms that already carry `toolname`).
7. **Page CSP and Trusted Types** apply to MAIN-world injection. Use `chrome.scripting.executeScript
   ({world:'MAIN', func})`, never an injected `<script src>`/`data:` tag.
8. **`requestState` is attacker-controlled on return** — the SDK says so explicitly and does not sign
   it for you. Ours names a tab, so it is HMAC'd.
9. **Deputy acts as the user on any site.** Bind to 127.0.0.1, validate Origin, and gate consequential
   tools behind consent. A security-minded judge will ask.

---

## 8. Demo

Browser large on screen, terminal small. Nothing is ever typed into the browser.

1. **The baseline, live.** Run the Wikipedia task through Playwright MCP. Put the counter on screen:
   **218,135 tokens, $0.28, 95 seconds.** *"This is the good case — accessibility snapshots, not screenshots."*
2. **The same task, delegated.** One goal in, one artifact out. **~180 tokens.** *"The calling agent
   stopped paying for the web."*
3. **How.** Open a site that never heard of WebMCP. Show `toolname` in DevTools sitting on the site's
   own form. *"We didn't automate this site. We taught it to describe itself — and Chromium generated
   that schema, not us."*
4. **Watch the browser, not the terminal.** The form outlines, fills, submits in the real logged-in session.
5. **It knows the site now.** Run a goal needing a different page. Then run it again — instant.
6. **The handoff.** Hit something only a human can do. `input_required`, resolved by hand, task continues.
7. **Any agent.** A non-Claude client delegates to the same browser. *(If F landed.)*
8. **Close:** *"218,135 tokens to one hundred and eighty. Not a better wrapper around clicking —
   the agent stopped looking at the page at all."*

---

## 9. Setup

```bash
chromium --enable-features=WebMCPTesting          # or chrome://flags/#enable-webmcp-testing
bun install
bun run dev                                        # deputyd on 127.0.0.1:7331
claude mcp add --transport http deputy http://127.0.0.1:7331/mcp
bun test                                           # unit
bun test:chromium                                  # integration against real Chromium
```
