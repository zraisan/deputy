import type { SVGProps } from 'react';

// One stroke family, 16px grid, 1.5 stroke.
const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true, ...p,
});

export const InspectIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6.5 13.5H3.25a.75.75 0 0 1-.75-.75V3.25a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 .75.75V6.5" /><path d="m8 8 5.5 2-2.25 1.25L10 13.5z" /></svg>
);
export const GitHubIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ ...p, stroke: 'none', fill: 'currentColor' })}><path d="M8 .9a7.1 7.1 0 0 0-2.25 13.85c.36.06.49-.15.49-.34v-1.2c-1.98.43-2.4-.95-2.4-.95-.32-.82-.79-1.04-.79-1.04-.64-.44.05-.43.05-.43.72.05 1.09.73 1.09.73.64 1.09 1.67.78 2.08.6.06-.46.25-.78.45-.96-1.58-.18-3.24-.79-3.24-3.52 0-.78.28-1.41.73-1.91-.07-.18-.32-.9.07-1.88 0 0 .6-.19 1.95.73a6.7 6.7 0 0 1 3.55 0c1.35-.92 1.95-.73 1.95-.73.39.98.14 1.7.07 1.88.46.5.73 1.13.73 1.91 0 2.74-1.67 3.34-3.25 3.52.26.22.48.65.48 1.31v1.94c0 .19.13.41.49.34A7.1 7.1 0 0 0 8 .9Z" /></svg>
);
export const BackIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M13 8H3m4.5-4.5L3 8l4.5 4.5" /></svg>);
export const ForwardIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 8h10M8.5 3.5 13 8l-4.5 4.5" /></svg>);
export const ReloadIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M13 8a5 5 0 1 1-1.46-3.54M13 2.5v2.75h-2.75" /></svg>);
export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5 3.5v9l7-4.5z" /></svg>);
export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M5.5 3.5v9m5-9v9" /></svg>);
export const WarnIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M8 1.9 1.4 13.5h13.2z" /><path d="M8 6.5v3m0 2.1v.01" /></svg>);
export const PuzzleIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M3 5.5h2.25a1.5 1.5 0 1 1 3 0H10.5v2.25a1.5 1.5 0 1 1 0 3V13H3z" /></svg>);
export const ArrowIcon = (p: SVGProps<SVGSVGElement>) => (<svg {...base(p)}><path d="M4.5 11.5l7-7M5.5 4.5h6v6" /></svg>);
