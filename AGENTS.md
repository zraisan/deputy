# AGENTS.md

Instructions for AI coding agents working in this repository.
Deputy is itself an agent tool, so the codebase has opinions about how agents should behave.

## What this project is

Deputy makes a web page describe itself to an agent. It retrofits the W3C **WebMCP** standard onto
sites that never implemented it, so that **Chromium** generates the JSON Schema and executes the
form submission — we write six HTML attributes and get out of the way.

Read `ARCHITECTURE.md` before changing anything. It documents the invariants and why the module
boundaries fall where they do.

## Layout

```
packages/shared/      the daemon↔extension wire contract (types only)
packages/deputyd/     Bun daemon: MCP face, tab registry, task lifecycle, planner
packages/extension/   MV3 extension: service worker, content script, the graft engine
  src/graft/naming.ts      PURE. Tool-name derivation. Unit-tested, no DOM.
  src/graft/annotate.ts    Tier 1 — writes WebMCP attributes onto real <form>s
  src/graft/synthesize.ts  Tier 2 — builds a tool from loose inputs and ARIA widgets
  src/graft/inapp.ts       Tier 0 — reads tools an in-app copilot already declared
scripts/              build, dev, demo recording, the real-site sweep
bench/                measurements, with method. Numbers here are reproducible.
```

## Commands

```bash
bun test              # unit tests. MUST NOT launch a browser. Fast, run constantly.
bun run test:browser  # integration against real Chromium. Kills strays before and after.
bun run dev           # daemon + a Chromium carrying the extension
bun run build:ext     # rebuild the extension into packages/extension/dist
bun scripts/sweep.ts  # point Deputy at 8 real sites and see what it makes of each
```

## Rules that matter here

**Never launch a browser from a unit test.** An earlier leak of headless Chromiums put a laptop into
swap. Browser tests live in `test-browser/` and only run under `bun run test:browser`, which kills
strays on both sides. The harness caps the browser and reaps on every exit path.

**Do not mock Chromium.** It generates the JSON Schema and performs the submission — those are the
behaviours under test. A mock would assert our beliefs about the browser rather than its behaviour.

**Keep `naming.ts` pure.** It is where correctness lives and where regressions hide. DOM access
belongs in `annotate.ts` / `synthesize.ts`.

**Tool identity must be stable.** The same form must derive the same name across re-annotation, or
the agent's tool list churns on every SPA re-render.

**Annotation is idempotent** and never overwrites a site's own WebMCP tools.

**The page never crosses the wire to the calling agent.** No screenshots, no DOM dumps, no
accessibility trees — goals in, structured artifacts out. This invariant is the entire result in
`docs/measurements.md`; breaking it makes the project pointless.

**Send complete context, not clever compression.** Measured three times: withholding schemas to keep
payloads small made tasks *more* expensive, because the agent had to probe for what we withheld.
246,003 → 155,774 → 133,366 tokens as we sent progressively more.

**Every consent path must be bounded.** `acceptedContent()` returns `undefined` for both "declined"
and "no answer arrived"; re-issuing `inputRequired` on undefined loops until the client burns its
round limit and the call dies.

## Testing style

Test names state the behaviour, not the function. Where a test exists because something broke in
the wild, say so in a comment — `naming.test.ts` and `graft.test.ts` both carry the measurement that
produced them. Assert the *contract*, not the implementation.

## Browser quirks this depends on

- `executeTool(tool, input)` in Chromium 152 wants `input` as a **JSON string**. An object
  stringifies to `[object Object]` and throws `Failed to parse input string as JSON`.
- Declarative tool registration is **scheduled, not synchronous** — read `getTools()` after a tick.
- `document.modelContext` only; `navigator.modelContext` was removed in 152.
- Requires `chrome://flags/#enable-webmcp-testing`.

## When you change something

Run `bun test` and `bun run test:browser`. Update `ARCHITECTURE.md` if you move a boundary or change
an invariant — it is a living document, not a write-once one. If you change what an agent receives,
re-run `bun scripts/sweep.ts` against real sites; that is how the empty-form, duplicate-form and
ARIA-widget bugs were all found.
