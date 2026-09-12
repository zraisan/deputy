# Deputy

**Claude doesn't browse. It deputizes.**

Deputy is an agent that lives in your browser and specialises in it. Other agents — Claude Code, or
anything that speaks MCP — stop driving the browser themselves and start asking Deputy instead. It
knows the page, it's already signed into your sessions, and it hands back a sentence or a result
rather than a screenshot.

The page never enters the calling agent's context.

---

## The problem

Ask Claude Code to look something up in a browser and it takes a screenshot, or dumps the
accessibility tree, and reads it. We measured that on this machine:

> **216,888 tokens and $0.27** to fill in one booking form.
> **218,135 tokens and 95 seconds** to look up one Wikipedia article.

That's via Playwright MCP — the *good* path, sending trimmed accessibility snapshots rather than
images. 202,310 of those tokens are cache reads: every turn re-reads a context that grew by another
snapshot. The agent barely survived one trivial browser task.

## What Deputy does instead

Websites already know what they can do. A `<form>` knows its fields are a date, a party size, and a
seating preference. That knowledge is thrown away, and then a language model is asked to infer it
back from a picture.

Deputy stops throwing it away. It retrofits the **W3C WebMCP standard** onto sites that never
implemented it — writing six HTML attributes onto the page's own forms — and then **Chromium itself**
generates the JSON Schema and executes the submission. We wrote no schema generator and no form
executor. The browser already had both.

| representation of one Wikipedia page | ~tokens |
|---|---|
| full accessibility tree | 215,495 |
| screenshot | 57,134 |
| trimmed a11y snapshot *(what Playwright MCP sends)* | 14,170 |
| **Deputy's tool schemas** | **115** |
| **Deputy's answer to a question** | **~40** |

**123× smaller than the strongest alternative** — and computed once per page, not re-sent every turn.

## What the calling agent sees

Five tools. They never change as you browse, so the caller's context stays flat.

| tool | what it does |
|---|---|
| `browser_capabilities` | the page's full contract — typed schemas, current values, clickable actions |
| `browser_ask` | **ask a question about a page; Deputy reads it and answers** |
| `browser_invoke` | run one of those tools — fills and submits the real form |
| `browser_click` | click a button or link by ref |
| `browser_navigate` | open a URL and report what appeared there |
| `delegate_goal` | hand over a goal and let Deputy choose |

`browser_ask` is the one that replaces screenshots. Claude asks *"what's today's featured article?"*;
Deputy reads the live page with its own model and returns two sentences. **Measured: 1.96 seconds.**

## Two agents, two models

Deputy isn't Claude with extra steps. It runs its own model — `qwen/qwen3.7-flash` via OpenRouter —
because reading a page and picking a form is not work that needs a frontier model. Claude Code does
the thinking; Deputy does the browsing. That's the agent-to-agent split, and you can watch both
halves work.

With no API key at all, Deputy falls back to a keyword planner and still works. The demo never
depends on a second key being up.

---

## Results

Task: fill a 7-field booking form (text, email, number, date, time, `<select>`, textarea) and submit
it. Same prompt, same data, both through `claude -p`. Both succeeded.

| | Claude + Playwright MCP | Claude + Deputy | |
|---|---|---|---|
| turns | 9 | **6** | |
| Claude tokens | 216,888 | **133,366** | **1.63× fewer** |
| Deputy's own model | — | 1 call · **$0.000014** | |
| **total cost** | **$0.2730** | **$0.1861** | **1.47× cheaper** |
| wall clock | 26.1 s | **17.2 s** | **1.52× faster** |

**Both sides are counted.** Deputy runs its own model and it is not free — it made one Qwen call
costing fourteen millionths of a dollar against Claude's $0.19. The win survives full accounting.

Deputy's whole view of that form — every field, type, allowed values, min/max, what is required and
what is currently filled in — is **611 tokens**.

### The finding worth reading twice

`browser_capabilities` first returned tool **names only**, to keep the payload small. The agent had
to probe for parameter names: **246,003 tokens**. Returning full schemas: **155,774**. Adding *more*
still — current values, plus every button and link with a clickable ref: **133,366, 6 turns**.

**~5× more data made the task 1.8× cheaper.** Every probe costs more than the context that would
have prevented it.

### Long pages are windowed, not truncated

Wikipedia's main page has 263 clickable things. Deputy returns 25 of them **and says so** —
`"Showing 1-25 of 263"` — with two ways to reach the rest: `actionQuery` to filter by label, or
`actionOffset` to page. Searching `"Contact"` returns refs `a8`, `a257`, `a258` — items far beyond
the window. Nothing is silently dropped.

The baseline got the accessibility-snapshot path, not just screenshots, so **the comparison is
deliberately conservative**. Full method: [`bench/RESULTS.md`](bench/RESULTS.md).

## Run it

```bash
bun install
cp .env.example .env      # add OPENROUTER_API_KEY (optional — it degrades without one)
bun run dev               # daemon + a Chromium carrying the extension
claude mcp add --transport http deputy http://127.0.0.1:7331/mcp
```

Then ask Claude Code for something in the browser. `bun run kill-browsers` stops the test browser.

```bash
bun test              # 69 unit tests, never launches a browser
bun run test:browser  # 10 integration tests against real Chromium
```

## How it's built

```
Claude Code ──MCP──▶ deputyd (Bun) ──WebSocket──▶ extension (MV3) ──▶ Chromium's own WebMCP
                       │                             │
                       ├─ registry: tabs → tools     ├─ graft: annotate forms
                       ├─ tasks: A2A-shaped states   ├─ content: getTools / executeTool
                       └─ planner: qwen via OpenRouter
```

The daemon exists because an MV3 service worker dies after 30 seconds idle and cannot listen on a
port. The content script runs in the ISOLATED world, so Deputy never needs `chrome.debugger` and the
user never sees the "extension is debugging this browser" banner.

Design notes and invariants: [`ARCHITECTURE.md`](ARCHITECTURE.md). Build plan: [`PLAN.md`](PLAN.md).

## What's real and what isn't

**Real, tested, running:** the retrofit engine (31 tests, 10 of them against live Chromium), tool
naming, the tab registry, the task lifecycle, the extension, the daemon, and every number above.

**Not built:** the A2A protocol face. Deputy's task model already uses A2A's vocabulary —
`input_required` and `auth_required`, because a browser agent hits login walls constantly — and the
wire format is fully specced out, but no Anthropic product speaks A2A, so MCP got the remaining time.
Multi-page navigation memory is designed in `ARCHITECTURE.md §8` and not built.

**Pulled before shipping:** `browser_fill` (set one field by ref) and `browser_click` are implemented
end to end but their round trip times out and I could not find why in the time available — the refs
exist in the DOM and `browser_read` succeeds over the identical path. A tool that hangs for 30 s is
worse than a tool that isn't there, so they are not registered. The code is in the tree.

**Known limits:** requires `chrome://flags/#enable-webmcp-testing` (WebMCP is in origin trial through
Chrome 156). Tier 1 grafting needs real `<form>` elements, so SPAs that fake forms with div handlers
get nothing yet. Names derived from unlabelled forms are still weak — Wikipedia's appearance controls
became `automatic` and `small`.

## One thing worth knowing

Every bug that mattered was found by running it, not by reading it. `executeTool` in Chromium 152
wants its arguments as a JSON *string*; passing an object stringifies to `[object Object]` and fails.
That cost a full run — 19 turns, 452,165 tokens — of Claude patiently working around a broken tool.
It's in `bench/RESULTS.md §3` with the others.
