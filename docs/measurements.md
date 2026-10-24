# Measurements

Every number in the README comes from here, all measured on one Linux machine with Chromium.

Sections 0 to 0c (2026-10-14 to 2026-10-23) were measured with the full Deputy. Sections 1 onward were taken on
2026-09-12 with Chromium 152 and this repository's code, and are reproducible with the commands
shown. Reproducible, not cited.

## 0. A busy page (2026-10-14)

Measured with the full Deputy (the version on the Chrome Web Store), not this open-source build;
the benchmark harness lives with the full version. These are the figures in the launch film
([on YouTube](https://www.youtube.com/watch?v=NTdMDONeU1c)). Claude Sonnet in Claude Code (`claude -p`), the same prompt for both,
one Linux machine with Chromium. Playwright MCP 0.0.82, on accessibility snapshots, not
screenshots. Medians of 3; every counted run passed.

Task: an admin page with 400 orders and 100 links. Filter the orders to status Refunded, placed
on or after 2026-08-01, and count the matches.

| dashboard-filter (400 orders) | Playwright MCP | Deputy | |
|---|---|---|---|
| agent turns | 10 | **3** | |
| Claude tokens | 245,250 | **72,632** | **3.4× fewer** |
| page data to the agent (chars) | 46,640 | **7,269** | **6.4× less** |
| total cost | $0.189 | **$0.072** | **2.6× cheaper** |

Why the gap grows: every call to Claude re-reads the whole conversation. Context per call in the
median runs (thousands of tokens): Playwright 19.2, 21.1, 22.1, **44.6**, 45.3, 45.5, 46.3;
Deputy 21.9, 24.8, 25.7. The jump is one snapshot of the dashboard (22,556 tokens) that every
later call reads again.

A seven-field booking form, same setup: Playwright MCP 107,392 tokens, $0.080; Deputy 68,551
tokens, $0.064. The page is small, so the gap is smaller.

Wall clock is not reported: the machine was under heavy unrelated load during part of these runs.
Two of the first three Deputy booking-form runs failed because the extension lost its connection to
the hub; three later runs passed and are the ones counted.

## 0b. Against Vercel's agent-browser (2026-10-22)

Measured with the full Deputy (the version on the Chrome Web Store), not this open-source build;
the benchmark harness and its results live with the full version.
Claude Sonnet in Claude Code, Chromium 154, the same two tasks as section 0. agent-browser 0.39.1
ships as a command-line tool and a skill, not an MCP server, so its runs could use Bash limited to
`agent-browser` commands, were attached over CDP to their own warm Chromium, and were told to start
the way its docs say (`agent-browser skills get core`). Deputy's approval card waited 0 s instead
of 45 s, because nobody was at the page to answer it; the agent then pressed submit, as the task
asks. Medians of 3; all 12 runs passed.

| | agent-browser | Deputy | |
|---|---|---|---|
| dashboard-filter: turns | 11 | **3** | |
| dashboard-filter: Claude tokens | 271,172 | **72,756** | **3.7× fewer** |
| dashboard-filter: cost | $0.115 | **$0.072** | **1.6× cheaper** |
| booking-form: turns | 7 | **3** | |
| booking-form: Claude tokens | 155,200 | **68,683** | **2.3× fewer** |
| booking-form: cost | $0.084 | **$0.065** | **1.3× cheaper** |
| total cost, all 12 runs | $0.611 | **$0.448** | |

Part of agent-browser's tokens is its usage guide, which the agent loads first as the docs advise;
a run that skipped it would be cheaper and less reliable. Wall clock is not compared: agent-browser's
times varied from 30 s to 224 s on the same task, which says more about the machine than the tool.
Playwright CLI was not measured.

## 0c. Eight real sites (2026-10-23)

`bun scripts/sweep.ts` against the full Deputy's dev build (Chromium 154, WebMCP flag on). What
Deputy offers the agent on each page's first load:

| site | typed tools | clickable actions | ~tokens for the agent |
|---|---|---|---|
| DuckDuckGo | search, and a "switch to DuckDuckGo" sign-up | 124 | 597 |
| Wikipedia | search, plus four appearance settings with poor names (`skin_client_pref_…`) | 268 | 1,487 |
| GitHub search | search | 13 | 329 |
| Hacker News login | log in, create account | 1 | 368 |
| npm | search packages | 28 | 325 |
| MDN | none: its search lives in a dialog that opens on click | 79 | 210 |
| W3C form demo | the demo's forms, in the page and in its two example frames | 250 | 2,286 |
| Stack Overflow | search, question filters, sign up, each listed three times | 197 | 3,912 |

Faults this showed. Fixed on 2026-10-24: Stack Overflow loads two copies of itself in frames, and
Deputy listed their forms again under `_frame56` and `_frame64` names; it now offers each form once
(search, filters, sign-up). MDN: clicking Search opens a dialog, and Deputy now offers its box as
`search_mozilla` by the agent's next call (it was named after the page heading, and only appeared
one action later). Still open: Wikipedia's appearance settings get names from their field ids, not
from the label shown on the page. Also fixed on 2026-10-24: `browser_navigate` gave up on Stack
Overflow after 30 s while its ads kept loading, and on a first visit reported Cloudflare's "Just a
moment..." check as the page. It now answers once the real page is usable, in 3.6 to 3.9 s
(Deputy's page script runs when the document is parsed, frames are read in parallel, and a bot
check is waited out), with every wait capped at 18 s.

## 0d. A fresh clone of the open-source version (2026-10-23)

`git clone https://github.com/zraisan/deputy`, then the README's own steps and nothing else:
`bun install` (82 packages, under a second), `cp .env.example .env`, `bun run dev` with a new
browser profile. The extension connected to the daemon by itself; an MCP client listed the tools and
opened a real form page (httpbin's order form) without errors. The README said the agent gets "the same six tools"; the open-source version offers 10, and the README now says so (2026-10-24).

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
