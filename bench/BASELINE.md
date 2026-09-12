# Baseline measurement — an agent driving a browser step by step

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
