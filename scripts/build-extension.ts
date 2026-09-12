/**
 * Bundle the extension into packages/extension/dist, ready to load unpacked.
 *
 * Two passes on purpose: MV3 service workers may be ES modules, but content
 * scripts and popup scripts are classic scripts and must be IIFEs.
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'packages/extension/dist';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

async function bundle(entrypoints: string[], format: 'esm' | 'iife') {
  const built = await Bun.build({ entrypoints, outdir: OUT, target: 'browser', format, naming: '[name].js' });
  if (!built.success) { console.error(built.logs.join('\n')); process.exit(1); }
  return built.outputs.map((o) => o.path.split('/').pop());
}

const worker = await bundle(['packages/extension/src/sw.ts'], 'esm');
const classic = await bundle(
  ['packages/extension/src/content.ts', 'packages/extension/src/popup.ts', 'packages/extension/src/mainworld.ts'],
  'iife',
);

cpSync('packages/extension/manifest.json', `${OUT}/manifest.json`);
cpSync('packages/extension/popup.html', `${OUT}/popup.html`);
console.log(`built → ${OUT}`);
for (const f of [...worker, ...classic]) console.log('  ', f);
