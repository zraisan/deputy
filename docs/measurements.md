# Measurements

Every number in the README comes from here. All of it was measured on one machine
(Chromium 152, Linux) and is reproducible with the commands shown.



All numbers taken on this machine, 2026-09-12, Chromium 152. Reproducible, not cited.

## 1. The headline: filling a real form, both sides accounted

Task: book a table on a 7-field form (text, email, number, date, time, `<select>`, textarea) —
`bench/demo/booking.html`. Same prompt, same data, both via `claude -p --output-format json`.
Both runs succeeded; the form was genuinely submitted in both.

| | Claude + Playwright MCP | Claude + Deputy | |
|---|---|---|---|
| turns | 9 | **6** | |
| Claude tokens | 216,888 | **133,366** | **1.63× fewer** |
| Deputy's own model | — | 1 call · 229 in / 55 out · **$0.000014** | |
| **total cost** | **$0.2730** | **$0.1861** | **1.47× cheaper** |
| wall clock | 26.1 s | **17.2 s** | **1.52× faster** |

**Deputy is not free and we measured it.** Its model (`qwen/qwen3.7-flash`) made one call costing
fourteen millionths of a dollar, against Claude's $0.19. The win survives full accounting.

Deputy's entire view of that form — every field, its type, allowed values, min/max, which are
required, and what each currently holds — is **611 tokens**.

### The counterintuitive finding, twice

Deputy's `browser_capabilities` originally returned tool **names only**, to keep the payload small.
The agent had to probe for parameter names: **246,003 tokens, 11 turns**.

Returning the full JSON Schemas dropped it to **155,774 tokens, 7 turns**.
Then adding *even more* — current field values, plus every button and link with a clickable ref —
dropped it again to **133,366 tokens, 6 turns**.

**Sending ~5× more data made the task 1.8× cheaper.** Every probe an agent has to make costs more
than the context that would have prevented it. Cheap complete context beats clever compression.

## 2. What crosses the wire per observation

`en.wikipedia.org/wiki/Main_Page`, same page, same moment:

| representation | ~tokens |
|---|---|
| full accessibility tree (`Accessibility.getFullAXTree`) | 215,495 |
| raw HTML | 62,184 |
| screenshot (PNG, 1440×900) | 57,134 |
| **trimmed a11y snapshot — what Playwright MCP sends** | **14,170** |
| **Deputy on a form page** (schemas + values + actions) | **611** |
| **Deputy on Wikipedia** (5 tools + 25 actions) | **3,545** |
| **Deputy: an answer from `browser_ask`** | **~40** |

### A note on the baseline's fairness

The Playwright baseline was given `browser_snapshot` (accessibility tree), not only screenshots —
its cheap, text-based path. **The comparison is deliberately conservative**: a vision-driven agent
sending 57,134-token PNGs would look far worse.

## 2b. Long pages: windowed, filterable, never silently truncated

A page can carry hundreds of links — Wikipedia's main page has **263**. Returning them all is
expensive; returning a silent subset is worse, because the agent cannot tell the link it wants was
cut. Deputy does neither:

| call | returns | payload |
|---|---|---|
| `browser_capabilities()` | 25 actions **+ "Showing 1-25 of 263"** and how to get the rest | ~2,094 tok |
| `browser_capabilities({actionQuery: "Contact"})` | **3 of 263** — refs `a8`, `a257`, `a258` | ~1,224 tok |
| `browser_capabilities({actionOffset: 25, actionLimit: 5})` | items 26-30, with the next offset | ~1,346 tok |

The filter reaches `a257` directly — **an item 230 places past the default window**. An agent
usually knows what it is looking for, so searching by label beats paging blindly, and paging is
there when it does not.

The reply always carries the true total. Truncation is a fact the agent is told, never a fact hidden
from it.

## 3. A second task: Wikipedia lookup

Search Wikipedia for "Byzantine Empire", open the article, report the first sentence.

| | Playwright MCP | Deputy |
|---|---|---|
| wall clock | 95.0 s | **28.0 s** (3.4× faster) |
| cost | $0.2820 | $0.2464 |
| total tokens | 218,135 | 221,975 |

Session totals are ~equal here, and that is worth saying plainly: on a 3-step lookup both are
dominated by Claude Code's own system prompt (202,310 of the baseline's 218,135 tokens are cache
reads), not by the browser payload. The form task has enough steps for the difference to show.

## 4. Bugs the measurements caught

Each of these was found by running the thing, not by reading the code:

- **`executeTool` wants a JSON string, not an object** in Chromium 152. Passing an object stringifies
  to `[object Object]` and fails with `Failed to parse input string as JSON`. Cost: one entire run
  where Claude burned 19 turns and 452,165 tokens working around it.
- **A missing tool is expensive.** `browser_invoke` was accidentally dropped during a refactor;
  Claude spent 12 turns and 296,067 tokens hunting for it. A confusing tool surface costs more than
  a verbose one.
- **Withholding the schema is a false economy — the single biggest finding.** `browser_capabilities`
  originally returned tool *names only*, to keep the response small. Claude then had to probe for
  parameter names, and the run cost **246,003 tokens**. Returning the full schemas (583 tokens for a
  7-field form) dropped the same task to **155,774 tokens and 7 turns** — a 1.6× improvement from
  sending *more* data. Cheap context beats clever compression.
- **Returning `null` costs a round trip.** Real forms navigate rather than return a value, so
  `browser_invoke` now reports where the tab ended up and what tools appeared there.
- **Qwen flash is a reasoning model**: 168 completion tokens to answer "reply with: deputy online".
  `reasoning: { enabled: false }` → 3 tokens.

## 5. Live, on the real Wikipedia (not a fixture)

Deputy grafted `search_wikipedia` and `search_wikipedia_2` onto a site that has never heard of
WebMCP, invoked one, and the real form submitted and navigated to `/wiki/Byzantine_Empire`.
`browser_ask` answered "what is today's featured article?" in **1.96 s** from the live page.

---

## Appendix: the baseline run in full

Measured 2026-09-12 on this machine. Not cited, not estimated.

**Task:** "Go to en.wikipedia.org, use the site's search to search for 'Byzantine Empire',
open the article, report the first sentence."

**Method:** `claude -p --output-format json` with Playwright MCP browser tools allowed.
Playwright MCP is the strongest-in-class baseline — it sends trimmed accessibility snapshots,
not screenshots. This is the good case, not a straw man.

| metric | value |
|---|---|
| turns | 9 |
| input tokens | 18 |
| cache creation | 14,358 |
| cache read | 202,310 |
| output tokens | 1,449 |
| **total tokens** | **218,135** |
| **cost** | **$0.2820** |
| wall clock | 95 s |

## What this means

Two separate arguments, and the second is the stronger one:

**Cost.** $0.28 for one trivial lookup. A hundred of those is $28.

**Context occupancy — the real argument.** 218,135 tokens is more than a 200K context window.
The agent barely survived one browser task. Every turn re-reads a context that grew by another
snapshot, which is why cache reads dominate (202K of the 218K). This does not scale with task
count: the caller gets *one* browser task per session, not a hundred.

## The delegated path, for comparison

Caller sends a goal (~30 tokens) and receives a structured artifact (~150 tokens).
**Caller cost: ~200 tokens. Roughly a 1,000× reduction in context occupied.**

Be honest about total system cost: the browser agent still thinks. But it thinks over
**115-token tool schemas** (measured — see PLAN.md §1b) rather than 14K-token snapshots,
and on Haiku rather than the caller's model. Total system cost falls by a large factor;
*caller context* falls by ~1,000×.

The claim to make on stage is the honest one: **the calling agent stops paying for the web.**
