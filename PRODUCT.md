# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: hackathon judges evaluating the project in a few minutes. They need to understand the
mechanism, believe it is real, and see that it was measured rather than asserted.

Secondary (evidence: README, install docs): developers who wire Deputy into an MCP client —
Claude Code, Cursor, VS Code, or their own agent — and are comfortable with a terminal.

## Product Purpose

Deputy is an agent that lives in the user's browser. An MCP client stops driving the browser
itself and asks Deputy instead; Deputy hands back a typed API for whatever page is open and
performs the call in the user's real, logged-in session. The page never enters the calling agent's
context: no screenshot, no DOM, no accessibility tree.

Success on the landing page: a visitor understands, from the first screen, that Deputy turns a web
page into a typed tool call.

## Positioning

Deputy retrofits the W3C WebMCP standard onto sites that never adopted it. It writes four HTML
attributes onto a page's own `<form>`, and Chromium itself generates the JSON Schema and executes the
submission. Where there is no `<form>`, it synthesizes the tool from ARIA widgets and controls
(radiogroup → enum, checkbox → boolean, listbox → enum, contenteditable → string).

Adjacent tools (Playwright MCP, PinchTab) give an agent a better map of the page. Deputy gives it a
typed API: a seven-field form is one validated call, not seven targeted actions.

## Operating Context

- Chromium/Chrome 152+ with `chrome://flags/#enable-webmcp-testing` enabled (origin trial).
- A Bun daemon (`deputyd`, 127.0.0.1:7331) exposes one streamable-HTTP MCP endpoint; an MV3
  extension connects to it over WebSocket.
- Deputy's own reasoning uses `qwen/qwen3.7-flash` via OpenRouter; with no key it falls back to a
  keyword planner.
- Three tiers: tools an app already declared (e.g. CopilotKit `useFrontendTool`), real form elements,
  and synthesized tools for everything else.

## Capabilities and Constraints

- Six MCP tools: `browser_capabilities`, `browser_invoke`, `browser_ask`, `browser_read`,
  `browser_navigate`, `delegate_goal`.
- Never auto-submits state-changing forms: the browser focuses the submit button and waits for a
  human. Execution stays in the page's own security context; no cookies are copied.
- Developer preview: not on the Chrome Web Store; installation needs a terminal and a browser flag.
- Not built: A2A wire format, multi-page navigation memory. A live Google Form is untested.

## Brand Commitments

- Name: Deputy.
- The green accent and a dark theme are binding (confirmed by the user).
- Voice (evidence: README): plain, first-person plural, specific numbers, states limits openly,
  no hype.

## Evidence on Hand

- `docs/measurements.md`: filling a 7-field form, Claude + Playwright MCP vs Claude + Deputy —
  216,888 vs 133,366 tokens, $0.2730 vs $0.1861, 9 vs 6 turns, 26.1 s vs 17.2 s. Per observation:
  a11y snapshot 14,170 tokens; Deputy on a form page 611 tokens; typed schemas alone 115.
- `docs/deputy-demo.mp4` (1:00), `docs/deputy-still.png`, `docs/youtube-thumbnail.png`.
- Tests: unit and browser integration suites in the repo.
- Absent, never to be fabricated: users, customers, testimonials, press, pricing, Web Store listing.

## Product Principles

1. Show the mechanism, not a claim about it.
2. Every number is measured and linked to its method.
3. Say what is not built.
4. The agent makes one typed call; anything that hands per-step cost back to the caller is a regression.
