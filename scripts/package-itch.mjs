// Package the web build for itch.io: an HTML5 zip with index.html at its root. itch serves it from its own
// CDN inside an iframe, so the PWA pieces (service worker, manifest, icons) are left out and the build meta
// says "itch" (recorded sound stays on; the feedback report labels the build).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
const release = new URL('release/', root);
const stage = new URL('itch/', release);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));

if (!existsSync(new URL('index.html', dist))) throw new Error('dist/index.html missing: run npm run build first');
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(new URL('assets/', dist), new URL('assets/', stage), { recursive: true });
cpSync(new URL('sfx/', dist), new URL('sfx/', stage), { recursive: true });

let html = readFileSync(new URL('index.html', dist), 'utf8');
const meta = '<meta name="whiteout:build" content="web" />';
if (!html.includes(meta)) throw new Error('build meta not found in dist/index.html');
html = html.replace(meta, '<meta name="whiteout:build" content="itch" />');
html = html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, '');
writeFileSync(new URL('index.html', stage), html);

const zip = `whiteout-itch-v${version}.zip`;
rmSync(new URL(zip, release), { force: true });
execFileSync('zip', ['-qr9', `../${zip}`, '.'], { cwd: stage });
console.log(`wrote release/${zip}`);
