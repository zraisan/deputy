import Aurora from '@/components/Aurora';
import BlurText from '@/components/BlurText';
import CountUp from '@/components/CountUp';
import SpotlightCard from '@/components/SpotlightCard';
import AnimatedContent from '@/components/AnimatedContent';

const GH = 'https://github.com/zraisan/deputy';

function Section({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="border-t border-white/10 py-16 sm:py-20">
      <div className="mx-auto w-full max-w-4xl px-5">{children}</div>
    </section>
  );
}

function Tier({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <SpotlightCard
      className="h-full rounded-2xl border border-white/10 bg-[#0b1424] p-6"
      spotlightColor="rgba(74, 222, 128, 0.16)"
    >
      <div className="font-mono text-[11px] tracking-[0.16em] text-accent">{n}</div>
      <h3 className="mt-2 text-base font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-muted">{children}</p>
    </SpotlightCard>
  );
}

export default function App() {
  return (
    <>
      {/* ── hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 h-[560px] opacity-70">
          <Aurora colorStops={['#1b6b3a', '#4ade80', '#1d4ed8']} amplitude={0.9} blend={0.6} speed={0.6} />
        </div>

        <div className="relative mx-auto w-full max-w-4xl px-5">
          <nav className="flex items-center gap-3 py-7">
            <span className="h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_16px_#4ade80]" />
            <b className="font-mono text-sm tracking-[0.24em] text-accent">DEPUTY</b>
            <span className="ml-auto flex gap-6 text-sm text-muted">
              <a href="#how" className="hover:text-ink">How it works</a>
              <a href="#install" className="hover:text-ink">Install</a>
              <a href={GH} className="hover:text-ink">GitHub</a>
            </span>
          </nav>

          <header className="pt-10 pb-20 sm:pt-16 sm:pb-28">
            <BlurText
              text="Agents shouldn't have to look at websites."
              animateBy="words"
              delay={90}
              className="max-w-[17ch] text-4xl font-extrabold leading-[1.08] tracking-[-0.035em] sm:text-6xl"
            />
            <AnimatedContent distance={40} duration={0.9} delay={0.5}>
              <p className="mt-7 max-w-[54ch] text-lg text-muted sm:text-xl">
                Deputy lives in your browser and hands other agents a typed API for whatever page
                you are on. No screenshots, no DOM dumps, no accessibility trees. The page never
                enters the calling agent&rsquo;s context.
              </p>
              <div className="mt-9 flex flex-wrap gap-3">
                <a href="#install"
                   className="rounded-xl bg-gradient-to-b from-[#4ade80] to-[#2fb763] px-6 py-3.5 text-[15px] font-semibold text-[#052312] shadow-[0_10px_26px_rgba(74,222,128,0.26)] transition hover:brightness-110">
                  Install the developer preview
                </a>
                <a href={GH}
                   className="rounded-xl border border-white/15 px-6 py-3.5 text-[15px] font-semibold transition hover:border-white/35">
                  View source
                </a>
              </div>
            </AnimatedContent>
          </header>
        </div>
      </div>

      {/* ── demo ─────────────────────────────────────────── */}
      <Section>
        <AnimatedContent distance={50} duration={0.9}>
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">See it work</h2>
          <p className="mt-2 max-w-[62ch] text-muted">
            An ordinary product form with no <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">&lt;form&gt;</code> element,
            its controls built from divs with ARIA roles. Deputy synthesizes a ten-field typed tool
            from it and fills it from a single call.
          </p>
          <video
            controls preload="metadata" poster="deputy-still.png" src="deputy-demo.mp4"
            className="mt-7 w-full rounded-2xl border border-white/10 shadow-[0_24px_70px_rgba(0,0,0,0.5)]"
          />
        </AnimatedContent>
      </Section>

      {/* ── numbers ──────────────────────────────────────── */}
      <Section>
        <AnimatedContent distance={50} duration={0.9}>
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">What it costs</h2>
          <p className="mt-2 max-w-[62ch] text-muted">
            Filling one seven-field form, same prompt both ways, both succeeded. The baseline is
            Playwright MCP using accessibility snapshots rather than screenshots, so the comparison
            is deliberately conservative.
          </p>

          <div className="mt-9 grid gap-4 sm:grid-cols-3">
            {/* `was` is a preformatted string: running toLocaleString on the cents
                integer produced "$0.2,730". Display and animation are separate now. */}
            {[
              { label: 'tokens',      was: '216,888', from: 216888, to: 133366, sep: ',', pre: '' },
              { label: 'cost, USD',   was: '$0.2730', from: 2730,   to: 1861,   sep: '',  pre: '$0.' },
              { label: 'agent turns', was: '9',       from: 9,      to: 6,      sep: '',  pre: '' },
            ].map((m) => (
              <div key={m.label} className="rounded-2xl border border-white/10 bg-card p-6">
                <div className="font-mono text-[11px] uppercase tracking-[0.16em] text-dim">{m.label}</div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-mono text-sm text-warn line-through">{m.was}</span>
                  <span className="text-dim">&rarr;</span>
                </div>
                <div className="mt-1 font-mono text-3xl font-extrabold text-accent sm:text-4xl">
                  {m.pre}
                  {/* direction="down" starts at `to` and animates to `from`, i.e. it settles on
                      the BASELINE. Default "up" runs from -> to, which counts downward here
                      because from > to, and lands on Deputy's number. */}
                  <CountUp from={m.from} to={m.to} duration={1} separator={m.sep} />
                </div>
              </div>
            ))}
          </div>

          <p className="mt-7 max-w-[64ch] text-muted">
            Per observation on the same page, an accessibility snapshot costs{' '}
            <b className="text-ink">14,170 tokens</b>. Deputy&rsquo;s typed schema costs{' '}
            <b className="text-accent">611</b>, computed once and reused. Method and raw numbers are in{' '}
            <a className="text-accent hover:underline" href={`${GH}/blob/master/docs/measurements.md`}>measurements.md</a>.
          </p>
        </AnimatedContent>
      </Section>

      {/* ── how ──────────────────────────────────────────── */}
      <Section id="how">
        <AnimatedContent distance={50} duration={0.9}>
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">How it works</h2>
          <p className="mt-2 max-w-[64ch] text-muted">
            A <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">&lt;form&gt;</code> already
            knows its fields are a required date, a number between 1 and 12, a dropdown with three
            options. We throw that away rendering to pixels, then pay a model to infer it back from
            a picture. There is a W3C standard that fixes this, <b className="text-ink">WebMCP</b>,
            shipping in Chromium. Almost nobody has adopted it. Deputy adopts it on their behalf.
          </p>

          <pre className="mt-7 overflow-x-auto rounded-2xl border border-white/10 bg-[#070d1b] p-5 font-mono text-[13px] leading-relaxed text-[#cfe0ff]">
<span className="text-dim">{'<!-- Deputy writes four attributes onto the page’s own form -->'}</span>{'\n'}
{'<form '}<b className="text-accent">toolname</b>{'="request_a_demo" '}<b className="text-accent">tooldescription</b>{'="…">\n'}
{'  <input name="team_size" '}<b className="text-accent">toolparamdescription</b>{'="Team size">\n\n'}
<span className="text-dim">{'// …and Chromium itself generates the schema and performs the call'}</span>{'\n'}
{'{ "team_size": { "type": "string", "enum": ["1-10", "11-50", "51-200"] },\n'}
{'  "when":      { "type": "string", "format": "date" } }'}
          </pre>

          <p className="mt-7 max-w-[64ch] text-muted">
            We wrote no schema generator and no form filler. The browser already had both. Three
            tiers cover the whole web:
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <Tier n="TIER 0" title="Tools the app already declared">
              Apps with an embedded copilot publish their frontend tools to the same registry. A
              CopilotKit app&rsquo;s actions become callable by any agent, with no adapter.
            </Tier>
            <Tier n="TIER 1" title="Real form elements">
              Four attributes, and the browser generates the JSON Schema and executes the
              submission natively.
            </Tier>
            <Tier n="TIER 2" title="Everything else">
              No form element? Deputy synthesizes the tool from the page&rsquo;s controls, including
              ARIA widgets: a radiogroup becomes an enum, a checkbox a boolean, contenteditable a
              string.
            </Tier>
          </div>
        </AnimatedContent>
      </Section>

      {/* ── install ──────────────────────────────────────── */}
      <Section id="install">
        <AnimatedContent distance={50} duration={0.9}>
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">Install</h2>

          <div className="mt-5 rounded-2xl border border-warn/30 bg-warn/[0.07] p-5 text-sm text-[#ffd9d9]">
            <b className="text-[#ffb4b4]">Developer preview.</b> Deputy is not on the Chrome Web
            Store yet, and it needs a browser flag because WebMCP is still in origin trial. Expect
            to use a terminal.
          </div>

          <ol className="mt-7 list-decimal space-y-5 pl-5 text-muted marker:text-dim">
            <li>
              <b className="text-ink">Enable WebMCP.</b> Open{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">chrome://flags/#enable-webmcp-testing</code>,
              set it to Enabled and restart. Chromium or Chrome 152+.
            </li>
            <li>
              <b className="text-ink">Build the extension.</b>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-[#070d1b] p-4 font-mono text-[13px] text-[#cfe0ff]">{`git clone ${GH}
cd deputy && bun install && bun run build:ext`}</pre>
            </li>
            <li>
              <b className="text-ink">Load it.</b> At{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">chrome://extensions</code>,
              enable Developer mode, choose <i>Load unpacked</i>, and pick{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">packages/extension/dist</code>.
            </li>
            <li>
              <b className="text-ink">Start the daemon and connect an agent.</b>
              <pre className="mt-2 overflow-x-auto rounded-xl border border-white/10 bg-[#070d1b] p-4 font-mono text-[13px] text-[#cfe0ff]">{`bun run dev
claude mcp add --transport http deputy http://127.0.0.1:7331/mcp`}</pre>
              Any MCP client works. Deputy&rsquo;s own reasoning is optional: set{' '}
              <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">OPENROUTER_API_KEY</code>{' '}
              in <code className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[0.9em]">.env</code>, or leave
              it unset and it falls back to a keyword planner.
            </li>
          </ol>
        </AnimatedContent>
      </Section>

      {/* ── consent ──────────────────────────────────────── */}
      <Section>
        <AnimatedContent distance={50} duration={0.9}>
          <h2 className="text-2xl font-extrabold tracking-[-0.025em] sm:text-3xl">It never submits for you</h2>
          <p className="mt-2 max-w-[64ch] text-muted">
            Deputy withholds WebMCP&rsquo;s auto-submit attribute from any state-changing form, so
            the browser focuses the submit button and waits for a human. That is consent enforced by
            the platform, not by a check we could forget to write. Execution happens in the
            page&rsquo;s own security context: no cookies are copied, no session state leaves your
            machine.
          </p>
        </AnimatedContent>
      </Section>

      <footer className="border-t border-white/10 py-12">
        <div className="mx-auto w-full max-w-4xl px-5 text-sm text-dim">
          <p>MIT licensed. <a className="text-muted hover:underline" href={GH}>Source on GitHub</a>.</p>
          <p className="mt-2">
            Demo music: &ldquo;Deep Haze&rdquo; by Kevin MacLeod (incompetech.com),{' '}
            <a className="text-muted hover:underline" href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.
          </p>
        </div>
      </footer>
    </>
  );
}
