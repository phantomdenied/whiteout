// Which build this page is, from <meta name="whiteout:build"> in index.html, which each packaging step sets:
// web (GitHub Pages: service worker, install prompts, recorded sound), single (one inlined file, the claude.ai
// Artifact: no sfx folder, so synthesized sound) or itch (the itch.io zip, played in itch's iframe: recorded
// sound, but no service worker or "add to home screen", which belong to the Pages build).
export type BuildTarget = 'web' | 'single' | 'itch';

export const BUILD_LABEL: Record<BuildTarget, string> = {
  web: 'web (GitHub Pages)',
  single: 'single file (claude.ai)',
  itch: 'itch.io',
};

export function buildTarget(doc: Pick<Document, 'querySelector'> = document): BuildTarget {
  const value = doc.querySelector<HTMLMetaElement>('meta[name="whiteout:build"]')?.content;
  return value === 'single' || value === 'itch' ? value : 'web';
}
