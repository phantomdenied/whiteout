import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { newGame, step } from '../src/engine';
import { buildTarget } from '../src/build';
import { PLAY_URL, buildReport, deviceSummary } from '../src/playtest';
import { newProfile } from '../src/profile';
import { chooseNode, newRun, nodeSeed, paramsFor, runMods } from '../src/run';
import { VERSION } from '../src/version';

const device = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  platform: 'iPhone', maxTouchPoints: 5, width: 390, height: 844, dpr: 3, standalone: false,
};

describe('playtest kit', () => {
  it('VERSION matches package.json', () => {
    expect(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version).toBe(VERSION);
  });

  it('device line names OS, browser and screen, and nothing else', () => {
    expect(deviceSummary(device)).toBe('iOS 17.5 · Safari · 390×844 @3x · browser tab');
    expect(deviceSummary({ ...device, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36', dpr: 2.625, width: 412, height: 915, standalone: true }))
      .toBe('Android 14 · Chrome · 412×915 @2.63x · home-screen app');
    expect(deviceSummary({ ...device, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', platform: 'MacIntel' }))
      .toContain('iPadOS');
  });

  it('the report carries the version, where the tester is, score vs goal, status, seeds, build and device', () => {
    const run = chooseNode(newRun(424242, 'rookie', { passives: { beacon: 2 } }), 0);
    const g = newGame(nodeSeed(run), { params: paramsFor(run), mods: runMods(run), snacks: run.snacks });
    for (let i = 0; i < 120; i++) step(g, { turn: 0, tuck: true, brake: false, jump: false });
    const text = buildReport({ mode: 'playing', rating: 4, build: 'itch.io', run, game: g, profile: newProfile(), device: deviceSummary(device) });
    expect(text).toContain(`Whiteout v${VERSION}`);
    expect(text).toContain('Fun so far: 4/5');
    expect(text).toContain('Build: itch.io');
    expect(text).toContain(`Run seed: 424242 · replay: ${PLAY_URL}?seed=424242`);
    expect(text).toContain(`Slope seed: ${nodeSeed(run)}`);
    expect(text).toContain('Mountain 1 of 3 (Bunny Hill Range) · map row 1 of 7');
    expect(text).toMatch(new RegExp(`Descent: \\d+ / ${g.params.length} m`));
    expect(text).toContain('Status: skiing · 0 of 15 descents cleared');
    expect(text).toContain('Gear: Bubble Wrap');
    expect(text).toContain('Passives: Avalanche Beacon II');
    expect(text).toContain('Device: iOS 17.5 · Safari · 390×844 @3x');
  });

  it('the build marker picks the build; anything unknown is the web build', () => {
    const doc = (content: string | null) => ({
      querySelector: () => (content === null ? null : ({ content } as unknown as Element)),
    }) as unknown as Pick<Document, 'querySelector'>;
    expect(buildTarget(doc('itch'))).toBe('itch');
    expect(buildTarget(doc('single'))).toBe('single');
    expect(buildTarget(doc('web'))).toBe('web');
    expect(buildTarget(doc(null))).toBe('web');
  });

  it('before any run, the report says so instead of showing a stale run', () => {
    const text = buildReport({ mode: 'title', rating: null, build: 'web (GitHub Pages)', run: null, game: null, profile: newProfile(), device: 'test' });
    expect(text).toContain('Fun so far: not rated');
    expect(text).toContain('Run: none started yet');
    expect(text).not.toContain('Run seed');
  });
});
