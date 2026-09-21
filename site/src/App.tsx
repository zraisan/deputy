import { useState, type ReactNode } from 'react';
import Inspector from '@/components/Inspector';
import { Code } from '@/components/Code';
import { ArrowIcon, BadgeMark, GitHubIcon, WarnIcon } from '@/components/Icons';

const GH = 'https://github.com/zraisan/deputy';
const MEASUREMENTS = `${GH}/blob/master/docs/measurements.md`;

const wrap = 'mx-auto w-full max-w-[1200px] px-5 sm:px-8';

function Section({ id, children, className = '' }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`scroll-mt-6 border-t border-line-soft ${className}`}>
      <div className={`${wrap} pt-20 pb-16 sm:pt-28 sm:pb-24`}>{children}</div>
    </section>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="max-w-[20ch] text-[2rem] leading-[1.05] font-[560] tracking-[-0.03em] sm:text-[2.75rem]">{children}</h2>;
}

function Lede({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`mt-5 max-w-[64ch] text-[17px] leading-[1.65] text-muted ${className}`}>{children}</p>;
}

function C({ children }: { children: ReactNode }) {
  return <code className="rounded-[4px] bg-raised px-1.5 py-0.5 font-mono text-[0.86em] text-ink">{children}</code>;
}

/** A DevTools pane: tab bar on top, content below. */
function Pane({ tabs, aside, children, className = '' }: { tabs: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-panel ${className}`}>
      <div className="flex h-9 items-center gap-4 border-b border-line px-3 text-[12px] text-dim">
        {tabs}
        {aside && <span className="ml-auto truncate font-mono text-[11.5px]">{aside}</span>}
      </div>
      {children}
    </div>
  );
}
const ActiveTab = ({ children }: { children: ReactNode }) => (
  <span className="flex h-full items-center border-b-2 border-accent text-ink">{children}</span>
);

function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex items-center gap-1.5 font-mono text-[12px] text-dim hover:text-accent">
      {children}<ArrowIcon width={12} height={12} />
    </a>
  );
}

/* ── numbers ─────────────────────────────────────────────── */

const RUNS = [
  { name: 'Claude + Playwright MCP', short: 'Playwright MCP', turns: 9, tokens: 216888, cost: '$0.2730', time: '26.1 s', deputy: false },
  { name: 'Claude + Deputy', short: 'Deputy', turns: 6, tokens: 133366, cost: '$0.1861', time: '17.2 s', deputy: true },
];

// Row for row, the "Filling one form" card at the end of docs/deputy-demo.mp4.
// Extra figures are fine elsewhere; these must never be framed differently from the video.
const ONE_FORM = [
  { what: 'A screenshot', turns: 'one look per field', rereads: '57,134 tok', deputy: false },
  { what: 'An accessibility snapshot', turns: '9', rereads: '14,170 tok', deputy: false },
  { what: 'Element refs', turns: '1 snapshot + 7 actions', rereads: 'the whole context', deputy: false },
  { what: 'Deputy, a typed schema', turns: '1 call', rereads: '611 tok, once', deputy: true },
];

const fmt = (n: number) => n.toLocaleString('en-US');

function Bar({ value, max, deputy }: { value: number; max: number; deputy: boolean }) {
  const pct = Math.max((value / max) * 100, 0.35);
  return (
    <div className="h-2.5 w-full min-w-[120px] rounded-[2px] bg-line-soft">
      <div className={`h-full rounded-[2px] ${deputy ? 'bg-accent' : 'bg-[#6f7480]'}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Numbers() {
  const th = 'h-8 px-3 text-left text-[12px] font-normal text-dim whitespace-nowrap';
  const td = 'px-3 py-2.5 whitespace-nowrap';
  return (
    <Section id="numbers">
      <div className="grid grid-cols-1 gap-x-16 gap-y-6 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <H2>What it costs</H2>
          <Lede>
            Filling one seven-field form, same prompt both ways, both succeeded. The baseline is
            Playwright MCP using accessibility snapshots rather than screenshots, so the comparison
            is deliberately conservative.
          </Lede>
        </div>
      </div>

      <Pane
        className="mt-12"
        tabs={<ActiveTab>Network</ActiveTab>}
        aside="booking form · 7 fields"
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13.5px] tnum">
            <thead className="border-b border-line-soft">
              <tr>
                <th className={th}>Name</th><th className={`${th} hidden sm:table-cell`}>Status</th><th className={`${th} text-right`}>Turns</th>
                <th className={`${th} text-right`}>Claude tokens</th><th className={`${th} text-right`}>Cost</th>
                <th className={`${th} text-right`}>Time</th><th className={`${th} hidden w-[34%] sm:table-cell`}>Tokens</th>
              </tr>
            </thead>
            <tbody>
              {RUNS.map((r) => (
                <tr key={r.name} className={`border-b border-line-soft last:border-0 ${r.deputy ? 'bg-accent/[0.05]' : ''}`}>
                  <td className={`${td} ${r.deputy ? 'text-ink font-medium' : 'text-muted'}`}><span className="sm:hidden">{r.short}</span><span className="hidden sm:inline">{r.name}</span></td>
                  <td className={`${td} hidden font-mono text-[12.5px] text-muted sm:table-cell`}>succeeded</td>
                  <td className={`${td} text-right font-mono`}>{r.turns}</td>
                  <td className={`${td} text-right font-mono ${r.deputy ? 'text-accent' : ''}`}>{fmt(r.tokens)}</td>
                  <td className={`${td} text-right font-mono`}>{r.cost}</td>
                  <td className={`${td} text-right font-mono`}>{r.time}</td>
                  <td className={`${td} hidden sm:table-cell`}><Bar value={r.tokens} max={RUNS[0]!.tokens} deputy={r.deputy} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-[#161719] px-3 py-2 font-mono text-[12px] text-dim">
          <span className="text-ink">1.63× fewer Claude tokens · 1.47× cheaper · 1.52× faster</span>
          <span>Deputy&rsquo;s own model: 1 call, $0.000014</span>
          <span className="sm:ml-auto"><Source href={MEASUREMENTS}>measurements.md §1</Source></span>
        </div>
      </Pane>

      <div className="mt-20 grid grid-cols-1 gap-x-16 gap-y-8 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <h3 className="text-[1.375rem] leading-tight font-[560] tracking-[-0.02em]">Filling one form</h3>
          <p className="mt-3 text-[15px] leading-[1.65] text-muted">
            Ref-based tools send the least per page, about 158 tokens. They just send it seven more
            times, and a turn re-reads everything before it.
          </p>
          <p className="mt-4"><Source href={MEASUREMENTS}>measurements.md</Source></p>
        </div>
        <div className="overflow-x-auto lg:col-span-8">
          <table className="w-full border-collapse text-[14.5px] tnum">
            <thead>
              <tr className="border-b border-line">
                <th className="py-2 pr-4 text-left text-[12px] font-normal text-dim">What the agent works from</th>
                <th className="py-2 pr-4 text-left text-[12px] font-normal text-dim">Agent turns</th>
                <th className="py-2 pr-3 text-right text-[12px] font-normal text-dim">What each turn re-reads</th>
              </tr>
            </thead>
            <tbody>
              {ONE_FORM.map((r) => (
                <tr key={r.what} className={`border-b border-line-soft ${r.deputy ? 'bg-accent/[0.05]' : ''}`}>
                  <td className={`py-3.5 pr-4 ${r.deputy ? 'pl-3 font-medium text-ink' : 'text-muted'}`}>{r.what}</td>
                  <td className={`py-3.5 pr-4 font-mono text-[13.5px] ${r.deputy ? 'text-accent' : 'text-ink'}`}>{r.turns}</td>
                  <td className={`py-3.5 pr-3 text-right font-mono text-[13.5px] whitespace-nowrap ${r.deputy ? 'text-accent' : 'text-ink'}`}>{r.rereads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-20 max-w-[64ch] border-t border-line-soft pt-8">
        <h3 className="text-[1.375rem] leading-tight font-[560] tracking-[-0.02em]">More data made it cheaper</h3>
        <p className="mt-3 text-[16px] leading-[1.65] text-muted">
          <C>browser_capabilities</C> first returned tool names only, to keep the payload small.
          The agent had to probe for parameter names: <b className="font-mono font-normal text-ink">246,003</b> tokens.
          Full schemas: <b className="font-mono font-normal text-ink">155,774</b>. Adding current values and every
          clickable action on top: <b className="font-mono font-normal text-accent">133,366</b>, in six turns.
          Every probe an agent is forced to make costs more than the context that would have prevented it.
        </p>
      </div>
    </Section>
  );
}

/* ── tiers ───────────────────────────────────────────────── */

const TIERS = [
  {
    id: 'declared',
    file: 'examples/copilotkit.html',
    title: 'Tools the app already declared',
    body: 'Apps with an embedded copilot publish their frontend tools to the same registry. A CopilotKit app’s actions become callable by any agent, with no adapter.',
    code: `// What the CopilotKit app registered for its own copilot
{ name: "refundOrder", description: "Refund a customer order by its id",
  parameters: [{ name: "orderId", type: "string", required: true }, …] }

// v2 apps publish useFrontendTool(...) to document.modelContext.
// Either way, Deputy lists refundOrder in browser_capabilities.`,
  },
  {
    id: 'forms',
    file: 'examples/booking.html',
    title: 'Real form elements',
    body: 'Four attributes, and the browser generates the JSON Schema and executes the submission natively.',
    code: `<form toolname="book_a_table" tooldescription="Book a table on …">
  <input name="party_size" type="number" min="1" max="12"
         toolparamdescription="Party size">

// Chromium, not Deputy, turns that into:
"party_size": { "type": "number", "minimum": 1, "maximum": 12 }`,
  },
  {
    id: 'synth',
    file: 'examples/aria-form.html',
    title: 'Everything else',
    body: 'No form element? Deputy synthesizes the tool from the page’s controls, including ARIA widgets. Measured on a Google-Forms-shaped page: 1 field captured before, 5 of 5 after.',
    code: `<div role="radiogroup">      →  "enum"
<div role="checkbox">        →  "boolean"
<div role="listbox">         →  "enum"
<div contenteditable="true"> →  "string"

// It also queries across open shadow roots.`,
  },
];

function Tiers() {
  const [active, setActive] = useState(1);
  const tier = TIERS[active]!;
  return (
    <Section id="how">
      <div className="grid grid-cols-1 gap-x-16 gap-y-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <H2>How it works</H2>
        </div>
        <div className="lg:col-span-7">
          <p className="max-w-[64ch] text-[17px] leading-[1.65] text-muted lg:mt-2">
            A <C>&lt;form&gt;</C> already knows its fields are a required date, a number between 1
            and 12, a dropdown with three options. We throw that away rendering to pixels, then pay a
            model to infer it back from a picture. There is a W3C standard that fixes this,{' '}
            <b className="font-medium text-ink">WebMCP</b>, shipping in Chromium. Almost nobody has
            adopted it. Deputy adopts it on their behalf.
          </p>
          <p className="mt-4 max-w-[64ch] text-[17px] leading-[1.65] text-muted">
            We wrote no schema generator and no form filler. The browser already had both. Three
            tiers cover the whole web.
          </p>
        </div>
      </div>

      <Pane className="mt-12" tabs={<><ActiveTab>Sources</ActiveTab></>} aside="document.modelContext">
        <div className="grid grid-cols-1 md:grid-cols-[260px_1fr]">
          <div role="tablist" aria-label="Tiers" aria-orientation="vertical" className="flex flex-col gap-1 border-b border-line p-2 md:border-r md:border-b-0">
            {TIERS.map((t, i) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={i === active}
                aria-controls={`panel-${t.id}`}
                onClick={() => setActive(i)}
                onKeyDown={(e) => {
                  if (['ArrowDown', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setActive((active + 1) % TIERS.length); }
                  if (['ArrowUp', 'ArrowLeft'].includes(e.key)) { e.preventDefault(); setActive((active + TIERS.length - 1) % TIERS.length); }
                }}
                tabIndex={i === active ? 0 : -1}
                className={`w-full rounded-md px-3 py-2 text-left transition-colors ${
                  i === active ? 'bg-raised text-ink' : 'text-muted hover:bg-raised/60 hover:text-ink'
                }`}
              >
                <span className="block font-mono text-[11.5px] text-dim">{t.file}</span>
                <span className="mt-0.5 block text-[14px]">{t.title}</span>
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panel-${tier.id}`} aria-labelledby={`tab-${tier.id}`} className="min-w-0 p-5 sm:p-7">
            <h3 className="text-[1.375rem] leading-tight font-[560] tracking-[-0.02em]">{tier.title}</h3>
            <p className="mt-2 max-w-[60ch] text-[15.5px] leading-[1.65] text-muted">{tier.body}</p>
            <div className="mt-6 rounded-lg border border-line-soft bg-ground p-4 sm:p-5">
              <Code code={tier.code} />
            </div>
          </div>
        </div>
      </Pane>
    </Section>
  );
}

/* ── install ─────────────────────────────────────────────── */

function Prompt({ lines }: { lines: string[] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-lg border border-line bg-panel px-4 py-3 font-mono text-[13px] leading-[1.7]">
      {lines.map((l) => (
        <div key={l} className="whitespace-pre"><span className="select-none text-accent">›&nbsp;</span>{l}</div>
      ))}
    </div>
  );
}

function Install() {
  const steps: { title: string; body: ReactNode }[] = [
    {
      title: 'Enable WebMCP',
      body: <>Open <C>chrome://flags/#enable-webmcp-testing</C>, set it to Enabled and restart. Chromium or Chrome 152+.</>,
    },
    {
      title: 'Build the extension',
      body: <Prompt lines={[`git clone ${GH}`, 'cd deputy && bun install && bun run build:ext']} />,
    },
    {
      title: 'Load it',
      body: <>At <C>chrome://extensions</C>, enable Developer mode, choose <i>Load unpacked</i>, and pick <C>packages/extension/dist</C>.</>,
    },
    {
      title: 'Start the daemon and connect an agent',
      body: (
        <>
          <Prompt lines={['bun run dev', 'claude mcp add --transport http deputy http://127.0.0.1:7331/mcp']} />
          <p className="mt-3">
            Any MCP client works: Codex (<C>codex mcp add deputy --url …/mcp</C>), Cursor, VS Code and the rest take the same URL (
            <a className="text-ink underline decoration-line hover:decoration-accent" href={`${GH}#run-it`}>config for each</a>
            ). Deputy&rsquo;s own reasoning is optional: set <C>OPENROUTER_API_KEY</C> in <C>.env</C>, or leave it
            unset and it falls back to a keyword planner.
          </p>
        </>
      ),
    },
  ];

  return (
    <Section id="install">
      <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <H2>Install</H2>
          <div className="mt-6 flex gap-3 rounded-lg border border-wait/25 bg-wait/[0.06] p-4 text-[14.5px] leading-[1.6] text-[#efe2b4]">
            <WarnIcon className="mt-0.5 shrink-0 text-wait" />
            <p>
              <b className="font-medium text-wait">Developer preview.</b> Deputy is not on the Chrome Web
              Store yet, and it needs a browser flag because WebMCP is still in origin trial. Expect to
              use a terminal.
            </p>
          </div>
        </div>
        <ol className="space-y-9 lg:col-span-8">
          {steps.map((s, i) => (
            <li key={s.title} className="grid grid-cols-[2rem_1fr] gap-x-3">
              <span className="pt-0.5 font-mono text-[13px] text-accent tnum">{i + 1}</span>
              <div className="min-w-0 text-[16px] leading-[1.65] text-muted">
                <h3 className="text-[17px] font-medium text-ink">{s.title}</h3>
                <div className="mt-1.5">{s.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </Section>
  );
}

/* ── page ────────────────────────────────────────────────── */

export default function App() {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-ink">
        Skip to content
      </a>

      <header className={`${wrap} flex h-14 items-center gap-6`}>
        <a href="#" className="flex items-center gap-2.5 text-[17px] font-[600] tracking-[-0.01em]">
          <BadgeMark width={22} height={22} />
          Deputy
        </a>
        <nav aria-label="Primary" className="ml-auto flex items-center gap-5 text-[14px] text-muted sm:gap-7">
          <a href="#numbers" className="hidden hover:text-ink sm:inline">Numbers</a>
          <a href="#how" className="hidden hover:text-ink sm:inline">How it works</a>
          <a href="#install" className="hover:text-ink">Install</a>
          <a href={GH} className="flex items-center gap-2 hover:text-ink"><GitHubIcon />GitHub</a>
        </nav>
      </header>

      <main id="main">
        <div className={`${wrap} pt-8 pb-20 sm:pt-8 sm:pb-28`}>
          <div className="grid grid-cols-1 gap-x-16 gap-y-7 lg:grid-cols-12 lg:items-end">
            <h1 className="max-w-[14ch] text-[2.75rem] leading-[0.98] font-[580] tracking-[-0.038em] sm:text-[3.75rem] lg:col-span-7 lg:text-[3.6rem]">
              Agents shouldn&rsquo;t have to look at websites.
            </h1>
            <div className="lg:col-span-5 lg:pb-2">
              <p className="max-w-[46ch] text-[17px] leading-[1.6] text-muted sm:text-[18px]">
                Deputy lives in your browser and hands any agent a typed API for whatever page you
                are on. No screenshots, no DOM dumps, no accessibility trees. The page never enters the
                calling agent&rsquo;s context.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                <a href="#install" className="inline-flex h-11 items-center rounded-lg bg-accent px-5 text-[15px] font-[600] text-accent-ink transition-[filter] hover:brightness-110 active:brightness-95">
                  Install the developer preview
                </a>
                <a href={GH} className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-5 text-[15px] font-[500] text-ink transition-colors hover:border-[#4a4d54] hover:bg-raised">
                  <GitHubIcon />View source
                </a>
              </div>
            </div>
          </div>

          <div className="mt-7 sm:mt-8">
            <Inspector />
          </div>
        </div>

        <Section>
          <div className="grid grid-cols-1 gap-x-16 gap-y-6 lg:grid-cols-12">
            <div className="lg:col-span-5"><H2>See it work</H2></div>
            <p className="max-w-[62ch] text-[17px] leading-[1.65] text-muted lg:col-span-7 lg:mt-2">
              The recorded run. An ordinary product form with no <C>&lt;form&gt;</C> element, its
              controls built from divs with ARIA roles. Deputy synthesizes a ten-field typed tool from it,
              sends the agent 758 tokens of schema, and fills the form from a single call.
            </p>
          </div>
          <Pane className="mt-12" tabs={<ActiveTab>Recorder</ActiveTab>} aside="deputy-demo.mp4 · 1:00">
            <video
              controls
              preload="metadata"
              poster="deputy-still.png"
              src="deputy-demo.mp4"
              className="block aspect-[1280/632] w-full bg-black"
            />
          </Pane>
        </Section>

        <Numbers />
        <Tiers />

        <Section>
          <div className="grid grid-cols-1 gap-x-16 gap-y-10 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7">
              <H2>It never submits for you</H2>
              <Lede>
                Deputy withholds WebMCP&rsquo;s auto-submit attribute from any state-changing form, so the
                browser focuses the submit button and waits for a human. That is consent enforced by the
                platform, not by a check we could forget to write. It runs in the browser you are already
                logged into, inside the page&rsquo;s own security context: no cookies are copied, no session
                state leaves your machine, and no &ldquo;debugging this browser&rdquo; banner, because Deputy never
                attaches a debugger.
              </Lede>
            </div>
            <div className="lg:col-span-5">
              <Pane tabs={<ActiveTab>Elements</ActiveTab>} aside="method=&quot;post&quot;">
                <div className="bg-[#fbfaf7] px-6 py-7">
                  <span className="inline-block rounded-md bg-[#11aa66] px-4 py-2 text-[14px] font-semibold text-white outline-2 outline-offset-2 outline-[#1a73e8]">
                    Reserve table
                  </span>
                </div>
                <Code
                  className="border-t border-line px-4 py-3"
                  code={`<form toolname="book_a_table" method="post">
  <!-- toolautosubmit withheld -->`}
                />
              </Pane>
            </div>
          </div>
        </Section>

        <Install />
      </main>

      <footer className="border-t border-line bg-panel">
        <div className={`${wrap} flex flex-col gap-2 py-5 font-mono text-[12.5px] text-dim sm:flex-row sm:items-center sm:gap-6`}>
          <span>MIT licensed · <a className="text-muted hover:text-accent" href={GH}>Source on GitHub</a></span>
          <span className="sm:ml-auto">
            Demo music: &ldquo;Deep Haze&rdquo; by Kevin MacLeod (incompetech.com),{' '}
            <a className="text-muted hover:text-accent" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>
          </span>
        </div>
      </footer>
    </>
  );
}
