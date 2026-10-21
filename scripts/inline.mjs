// Inline the built JS/CSS into dist/index.html to produce a single self-contained file (dist/whiteout.html),
// plus an artifact variant (dist/artifact.html) without the document skeleton.
import { readFileSync, writeFileSync } from 'node:fs';

const dist = new URL('../dist/', import.meta.url);
let html = readFileSync(new URL('index.html', dist), 'utf8');
const read = (path) => readFileSync(new URL(path.replace(/^\.\//, ''), dist), 'utf8');

html = html.replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/, (_, src) => {
  return `<script type="module">${read(src).replace(/<\/script/g, '<\\/script')}</script>`;
});
html = html.replace(/<link rel="stylesheet" crossorigin href="([^"]+)">/, (_, href) => `<style>${read(href)}</style>`);
// The single file has no manifest, icons, service worker or sfx folder beside it.
html = html.replace('<meta name="whiteout:build" content="web" />', '<meta name="whiteout:build" content="single" />');
html = html.replace(/\s*<link rel="(manifest|icon|apple-touch-icon)"[^>]*>/g, '');

writeFileSync(new URL('whiteout.html', dist), html);
console.log('wrote dist/whiteout.html', html.length, 'bytes');

// Artifact variant: the host supplies the document skeleton and viewport meta, so emit head + body contents only.
const head = html.match(/<head>([\s\S]*)<\/head>/)[1].replace(/<meta (charset|name="viewport")[^>]*>\s*/g, '');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const title = head.match(/<title>.*?<\/title>/)[0];
writeFileSync(new URL('artifact.html', dist), `${title}\n${head.replace(title, '').trim()}\n${body.trim()}\n`);
console.log('wrote dist/artifact.html');
