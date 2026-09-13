import type { ReactNode } from 'react';

// Just enough highlighting for HTML, JSON and shell lines, in the Elements panel's colors.
// Deputy's own attributes are the one thing painted green.
const TOKEN =
  /(\/\/.*$|<!--.*?-->|#\s.*$)|("(?:[^"\\]|\\.)*")|(<\/?[a-zA-Z][\w-]*|\/?>)|\b(toolname|tooldescription|toolparamdescription|toolautosubmit)\b|([a-zA-Z_][\w-]*)(?==)|(\b\d+(?:\.\d+)?\b)/g;

function line(text: string, key: number): ReactNode {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    const i = m.index ?? 0;
    if (i > last) out.push(text.slice(last, i));
    const [whole, comment, str, tag, deputy, attr, num] = m;
    let cls = '';
    if (comment) cls = 'text-dim';
    else if (str) cls = text[i + whole.length] === ':' ? 'text-attr' : 'text-value';
    else if (tag) cls = 'text-tag';
    else if (deputy) cls = 'text-accent';
    else if (attr) cls = 'text-attr';
    else if (num) cls = 'text-num';
    out.push(<span key={i} className={cls}>{whole}</span>);
    last = i + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <div key={key} className="min-h-[1.5em]">{out}</div>;
}

export function Code({ code, className = '' }: { code: string; className?: string }) {
  return (
    <pre className={`overflow-x-auto font-mono text-[13px] leading-[1.6] text-ink ${className}`}>
      <code>{code.split('\n').map(line)}</code>
    </pre>
  );
}
