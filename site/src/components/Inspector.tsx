import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BackIcon, ForwardIcon, PauseIcon, PlayIcon, PuzzleIcon, ReloadIcon } from './Icons';

/*
 * The hero: a replay of Deputy on a reservation form, shown the way a developer
 * would watch it happen — in DevTools. One clock drives every pane.
 */

const TICK_MS = 90;
const STEPS = [
  { at: 0, label: 'Page loads', status: 'reading the page' },
  { at: 14, label: 'Deputy grafts', status: 'writing attributes' },
  { at: 62, label: 'Chromium builds the schema', status: '1 tool registered' },
  { at: 100, label: 'An agent calls it', status: 'browser_invoke' },
  { at: 150, label: 'Waits for a human', status: 'waiting for a human' },
] as const;
const END = 158;

const HOST = 'acme-travel.example';
const DESCRIPTION = `Book a table on ${HOST}. Accepts: Full name, Email address, Party size, …`;

type Field = {
  name: string; label: string; attrs: string; tag: 'input' | 'select' | 'textarea';
  value: string; empty?: string; wide?: boolean;
};
const FIELDS: Field[] = [
  { name: 'guest_name', label: 'Full name', tag: 'input', attrs: ' required', value: 'Ada Lovelace' },
  { name: 'email', label: 'Email address', tag: 'input', attrs: ' type="email" required', value: 'ada@example.com' },
  { name: 'party_size', label: 'Party size', tag: 'input', attrs: ' type="number" min="1" max="12" required', value: '4' },
  { name: 'date', label: 'Date of booking', tag: 'input', attrs: ' type="date" required', value: '2026-10-02', empty: 'yyyy-mm-dd' },
  { name: 'time', label: 'Preferred time', tag: 'input', attrs: ' type="time" required', value: '19:30', empty: '--:--' },
  { name: 'seating', label: 'Seating preference', tag: 'select', attrs: '', value: 'Outdoor — terrace', empty: 'Indoor' },
  { name: 'notes', label: 'Dietary notes', tag: 'textarea', attrs: '', value: 'One vegetarian', wide: true },
];

const GRAFT_AT = (i: number) => 16 + i * 5; // i=0 toolname, 1 tooldescription, 2.. per field
const FILL_AT = (i: number) => 108 + i * 5;

const SCHEMA: ReactNode[] = [
  <>{'{'}</>,
  <>  <K>name</K>: <S>book_a_table</S>,</>,
  <>  <K>description</K>: <S>{DESCRIPTION}</S>,</>,
  <>  <K>inputSchema</K>: {'{'} <K>type</K>: <S>object</S>, <K>properties</K>: {'{'}</>,
  <>    <K>guest_name</K>: {'{'} <K>type</K>: <S>string</S> {'}'},</>,
  <>    <K>email</K>: {'{'} <K>type</K>: <S>string</S> {'}'},</>,
  <>    <K>party_size</K>: {'{'} <K>type</K>: <S>number</S>, <K>minimum</K>: <N>1</N>, <K>maximum</K>: <N>12</N> {'}'},</>,
  <>    <K>date</K>: {'{'} <K>type</K>: <S>string</S>, <K>format</K>: <S>date</S> {'}'},</>,
  <>    <K>time</K>: {'{'} <K>type</K>: <S>string</S> {'}'},</>,
  <>    <K>seating</K>: {'{'} <K>type</K>: <S>string</S>, <K>enum</K>: [<S>indoor</S>, <S>outdoor</S>, <S>bar</S>] {'}'},</>,
  <>    <K>notes</K>: {'{'} <K>type</K>: <S>string</S> {'}'}</>,
  <>  {'}'},</>,
  <>  <K>required</K>: [<S>guest_name</S>, <S>email</S>, <S>party_size</S>, <S>date</S>, <S>time</S>] {'}'}</>,
  <>{'}'}</>,
];
const SCHEMA_AT = (i: number) => 64 + i * 2.5;

function K({ children }: { children: ReactNode }) { return <span className="text-attr">"{children}"</span>; }
function S({ children }: { children: ReactNode }) { return <span className="text-value">"{children}"</span>; }
function N({ children }: { children: ReactNode }) { return <span className="text-num">{children}</span>; }
function Tag({ children }: { children: ReactNode }) { return <span className="text-tag">{children}</span>; }

function Attrs({ text }: { text: string }) {
  const parts = [...text.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g)];
  return (
    <>
      {parts.map((m, i) => (
        <span key={i}> <span className="text-attr">{m[1]}</span>{m[2] !== undefined && <>=<span className="text-value">"{m[2]}"</span></>}</span>
      ))}
    </>
  );
}

function Graft({ name, value }: { name: string; value: string }) {
  return (
    <span className="dom-flash px-0.5">
      {' '}<span className="text-accent">{name}</span>=<span className="text-[#bdf5d1]">"{value}"</span>
    </span>
  );
}

// Every pane line is exactly 20px, so a followed pane never shows half a line under its header.
const line = 'leading-5';

function usePrefersReducedMotion() {
  const [reduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  return reduced;
}

export default function Inspector() {
  const reduced = usePrefersReducedMotion();
  const [t, setT] = useState(reduced ? END : 0);
  const [playing, setPlaying] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tree = useRef<HTMLDivElement>(null);
  const schema = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  // Start once the window is on screen; never under reduced motion.
  useEffect(() => {
    if (reduced || !root.current) return;
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting && !started.current) { started.current = true; setPlaying(true); }
    }, { rootMargin: '0px 0px -30% 0px' });
    io.observe(root.current);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setT((v) => {
        if (v >= END) { setPlaying(false); return END; }
        return v + 1;
      });
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [playing]);

  // While running, follow the newest line inside each pane (never the page). Once it
  // settles, both panes return to the top, where the form's own graft and the tool's name are.
  useEffect(() => {
    const top = () => {
      if (tree.current) tree.current.scrollTop = 0;
      if (schema.current) schema.current.scrollTop = 0;
    };
    if (!playing) { top(); return; }
    if (tree.current && t >= 14 && t < 62) tree.current.scrollTop = tree.current.scrollHeight;
    if (schema.current && t >= 62) schema.current.scrollTop = schema.current.scrollHeight;
  }, [t, playing]);

  const step = STEPS.reduce((acc, s, i) => (t >= s.at ? i : acc), 0);
  const done = t >= END;
  const shown = (at: number) => t >= at;
  const grafted = [0, 1, ...FIELDS.map((_, i) => i + 2)].filter((i) => shown(GRAFT_AT(i))).length;
  const filling = FIELDS.findIndex((_, i) => !shown(FILL_AT(i))) - 1;
  const waiting = step === 4;

  const jump = (i: number) => {
    started.current = true;
    setPlaying(false);
    setT(i < STEPS.length - 1 ? STEPS[i + 1]!.at - 1 : END);
  };
  const toggle = () => {
    started.current = true;
    if (done) { setT(0); setPlaying(true); return; }
    setPlaying((p) => !p);
  };

  const statusText = step === 1 ? `wrote ${grafted} of ${FIELDS.length + 2} attributes` : STEPS[step]!.status;

  return (
    <figure ref={root} className="m-0">
      <div
        role="group"
        aria-label="Replay: Deputy turns a reservation form into one typed tool call"
        className="overflow-hidden rounded-xl border border-line bg-panel shadow-[0_30px_80px_-20px_rgb(0_0_0/0.7),0_2px_0_0_rgb(255_255_255/0.03)_inset]"
      >
        {/* tab strip */}
        <div aria-hidden className="flex h-8 items-end gap-2 bg-[#0d0e10] px-3 select-none">
          <div className="flex h-[26px] min-w-0 max-w-[260px] items-center gap-2 rounded-t-lg bg-raised px-3 text-[12px] text-ink">
            <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm bg-[#11aa66] text-[8px] font-bold text-white">A</span>
            <span className="truncate">Acme Travel — Reservations</span>
          </div>
        </div>
        {/* toolbar + omnibox */}
        <div aria-hidden className="flex items-center gap-1.5 border-b border-line bg-raised px-2.5 py-1 text-dim select-none">
          <BackIcon /><ForwardIcon className="opacity-50" /><ReloadIcon />
          <div className="mx-1.5 flex h-7 min-w-0 flex-1 items-center rounded-full bg-[#121316] px-3 font-mono text-[12px] text-muted">
            <span className="truncate"><span className="text-dim">https://</span>{HOST}/reserve</span>
          </div>
          <span className={`grid h-7 w-7 place-items-center rounded-full transition-colors duration-500 ${step >= 1 ? 'text-accent' : 'text-dim'}`}>
            <PuzzleIcon />
          </span>
        </div>

        {/* the site itself — light, because the site is */}
        <div className="bg-[#fbfaf7] px-4 py-3 text-[#1d1d1b] sm:px-8">
          <div className="flex items-baseline justify-between gap-4">
            <div className="text-[16px] font-semibold tracking-tight">Book a table</div>
            <div className="text-[12.5px] font-semibold tracking-tight text-[#11794b]">Acme Travel</div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 md:grid-cols-4">
            {FIELDS.map((f, i) => {
              const filled = shown(FILL_AT(i));
              const typing = playing && i === filling + 1 && step === 3 && !filled;
              return (
                <div key={f.name} className={`min-w-0 ${f.wide ? 'col-span-2' : ''}`}>
                  <span className="block truncate text-[11px] font-semibold text-[#3b3b38]">{f.label}</span>
                  <span
                    className={`mt-0.5 flex h-7 items-center truncate rounded-md border bg-white px-2 text-[12.5px] transition-colors duration-300 ${
                      filled ? 'border-[#9bd8b6] text-[#1d1d1b]' : 'border-[#d4d2cc] text-[#6f6e69]'
                    } ${typing ? 'caret' : ''}`}
                  >
                    {filled ? f.value : (f.empty ?? '')}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-md bg-[#11aa66] px-4 py-1 text-[13px] font-semibold text-white transition-[outline-color,outline-offset] duration-300 ${
                waiting ? 'outline-2 outline-offset-2 outline-[#1a73e8]' : 'outline-2 outline-offset-0 outline-transparent'
              }`}
            >
              Reserve table
            </span>
            <span
              className={`rounded-md bg-[#2b2410] px-2.5 py-0.5 text-[12px] text-wait transition-opacity duration-500 ${waiting ? 'opacity-100' : 'opacity-0'}`}
              aria-hidden={!waiting}
            >
              Chromium focused the button. Nothing is sent until a person presses it.
            </span>
          </div>
        </div>

        {/* docked DevTools */}
        <div className="border-t border-line bg-panel">
          <div className="flex h-9 items-center gap-4 border-b border-line px-3 text-[12px] text-dim">
            <span aria-hidden className="flex h-full items-center border-b-2 border-accent text-ink select-none">Elements</span>
            <span aria-hidden className="hidden h-full cursor-default items-center select-none sm:flex">Console</span>
            <span className="ml-auto flex min-w-0 items-center gap-2 font-mono text-[11.5px]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${waiting ? 'bg-wait' : 'bg-accent'}`} />
              <span className="truncate"><span className="text-muted">deputy</span> · <span className={waiting ? 'text-wait' : 'text-ink'}>{statusText}</span></span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[1.15fr_1fr]">
            {/* Elements tree */}
            <div ref={tree} className={`h-[220px] overflow-auto border-line px-3 py-2.5 font-mono text-[12px] ${line} md:h-[180px] md:border-r md:py-0`}>
              <div className="whitespace-pre-wrap break-words pl-4 -indent-4 md:whitespace-pre md:break-normal md:pl-0 md:indent-0">
                <Tag>&lt;form</Tag><Attrs text={` id="booking" action="/reserve" method="post"`} />
                {shown(GRAFT_AT(0)) && <Graft name="toolname" value="book_a_table" />}
                {shown(GRAFT_AT(1)) && <Graft name="tooldescription" value={DESCRIPTION} />}
                <Tag>&gt;</Tag>
              </div>
              {FIELDS.map((f, i) => (
                <div key={f.name} className="whitespace-pre-wrap break-words pl-8 -indent-4 md:whitespace-pre md:break-normal md:pl-4 md:indent-0">
                  <Tag>&lt;{f.tag}</Tag><Attrs text={` name="${f.name}"${f.attrs}`} />
                  {shown(GRAFT_AT(i + 2)) && <Graft name="toolparamdescription" value={f.label} />}
                  <Tag>&gt;</Tag>{f.tag !== 'input' && <><span className="text-dim">…</span><Tag>&lt;/{f.tag}&gt;</Tag></>}
                </div>
              ))}
              <div className="whitespace-pre pl-4">
                <Tag>&lt;button</Tag><Attrs text=' type="submit"' /><Tag>&gt;</Tag>Reserve table<Tag>&lt;/button&gt;</Tag>
              </div>
              <div><Tag>&lt;/form&gt;</Tag></div>
            </div>

            {/* schema pane */}
            <div className="flex h-[220px] min-w-0 flex-col border-t border-line md:h-[180px] md:border-t-0">
              <div className="flex h-8 shrink-0 items-center gap-4 border-b border-line-soft px-3 text-[12px] text-dim">
                <span className="text-ink">Tool schema</span>
                <span className="ml-auto truncate font-mono text-[11px]">generated by Chromium</span>
              </div>
              <div ref={schema} className={`min-h-0 flex-1 overflow-auto px-3 font-mono text-[12px] ${line} text-muted`}>
                {!shown(SCHEMA_AT(0)) ? (
                  <div className="text-dim">No tools registered on this page.</div>
                ) : (
                  SCHEMA.map((l, i) => shown(SCHEMA_AT(i)) && (
                    <div key={i} className="whitespace-pre-wrap break-words pl-6 -indent-6">{l}</div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* console drawer: the one call the agent makes */}
          <div className={`min-h-[56px] border-t border-line bg-[#161719] px-3 py-2 font-mono text-[12px] ${line}`}>
            {step >= 3 ? (
              <div className="whitespace-pre-wrap break-words">
                <span className="text-accent">←</span> <span className="text-ink">browser_invoke</span> <span className="text-value">"book_a_table"</span>{' '}
                <span className="text-muted">{'{ '}</span>
                {FIELDS.map((f, i) => (
                  <span key={f.name} className="text-muted">
                    <span className="text-attr">{f.name}</span>: {f.name === 'party_size' ? <span className="text-num">4</span> : <span className="text-value">"{f.name === 'seating' ? 'outdoor' : f.value}"</span>}
                    {i < FIELDS.length - 1 ? ', ' : ' }'}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-dim">The calling agent sees the schema above, never this page.</div>
            )}
          </div>

          {/* step bar */}
          <div className="flex items-center gap-1 border-t border-line px-2 py-1">
            <button
              type="button"
              onClick={toggle}
              aria-label={done ? 'Replay' : playing ? 'Pause' : 'Play'}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted hover:bg-raised hover:text-ink"
            >
              {done ? <ReloadIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <span className={`min-w-0 flex-1 truncate px-1 text-[12.5px] sm:hidden ${waiting ? 'text-wait' : 'text-ink'}`}>{STEPS[step]!.label}</span>
            <ol className="flex shrink-0 items-center gap-0.5 sm:gap-1">
              {STEPS.map((s, i) => (
                <li key={s.label}>
                  <button
                    type="button"
                    onClick={() => jump(i)}
                    aria-label={s.label}
                    aria-current={i === step ? 'step' : undefined}
                    className={`flex h-8 min-w-8 items-center justify-center gap-2 rounded-md px-2 text-[12.5px] transition-colors sm:px-2.5 ${
                      i === step ? 'bg-raised text-ink' : i < step ? 'text-muted hover:bg-raised' : 'text-dim hover:bg-raised hover:text-muted'
                    }`}
                  >
                    <span className={`font-mono text-[11px] tnum ${i === step ? (i === 4 ? 'text-wait' : 'text-accent') : ''}`}>{i + 1}</span>
                    <span className="hidden sm:inline">{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </div>
          <div className="sr-only" aria-live="polite">{STEPS[step]!.label}</div>
        </div>
      </div>
      <figcaption className="mt-3 text-[13px] text-dim">
        A reservation form modeled on <code className="font-mono text-muted">examples/booking.html</code>, sent as POST; the call&rsquo;s values are illustrative.
      </figcaption>
    </figure>
  );
}
