// Balance simulator: bots ski every kind of descent for many seeds and print a table.
// Rows: every slope, each mountain's hardest Black Diamond under every Condition it can roll, and the Summits.
// Usage: npm run sim [-- seeds] [-- builds]   (default 30 seeds; add "builds" for the tuck and crash build tables)
import { botInput } from '../src/bot';
import { CFG, type Game, distance, newGame, step, style, tokens } from '../src/engine';
import { modsFor } from '../src/gear';
import { MOUNTAINS, SLOPES_PER_MOUNTAIN, diamondParams, slopeParams, summitParams } from '../src/run';
import { CONDITION_IDS, type SlopeParams, buildSlope } from '../src/slope';

const seeds = Number(process.argv[2]) || 30;
const builds = process.argv.includes('builds');

const DESCENTS: { label: string; params: SlopeParams }[] = [];
MOUNTAINS.forEach((_, m) => {
  for (let k = 0; k < SLOPES_PER_MOUNTAIN; k++) DESCENTS.push({ label: `${m + 1}-${k + 1}`, params: slopeParams(m * SLOPES_PER_MOUNTAIN + k) });
  for (const c of CONDITION_IDS) {
    if (c === 'avalanche' && m === 0) continue;
    DESCENTS.push({ label: `${m + 1}◆${c.slice(0, 5)}`, params: diamondParams(m * SLOPES_PER_MOUNTAIN + SLOPES_PER_MOUNTAIN - 1, c) });
  }
  DESCENTS.push({ label: `${m + 1}-S`, params: summitParams(m) });
});

function ski(g: Game, tuck: boolean): number {
  let crashes = 0;
  while (!g.over && g.tick < 60 * 600) {
    step(g, botInput(g, { tuck }));
    for (const e of g.events) if (e.type === 'crash') crashes++;
    g.events.length = 0;
  }
  return crashes;
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

function simulate(label: string, tuck: boolean, gear: string[] = []) {
  console.log(`\n${label} (${seeds} seeds each)`);
  console.log('descent       len  diff  yeti grace | clear  crashes  time  style  tokens  tries');
  for (const [i, d] of DESCENTS.entries()) {
    const p = d.params;
    let cleared = 0, crashes = 0, time = 0, sty = 0, tok = 0, tries = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      const s = seed * 7919 + i * 31;
      tries += buildSlope(s, p, CFG.tuck).attempts;
      const g = newGame(s, { params: p, mods: modsFor(gear) });
      crashes += ski(g, tuck);
      if (g.result === 'cleared') {
        cleared++;
        time += g.time;
        sty += style(g);
        tok += tokens(g);
      }
      void distance;
    }
    const c = Math.max(1, cleared);
    console.log([
      d.label.padEnd(11),
      String(p.length).padStart(5),
      p.difficulty.toFixed(1).padStart(5),
      String(p.condition === 'avalanche' ? 'wall' : p.yetiSpeed).padStart(5),
      p.grace.toFixed(1).padStart(5),
      '|',
      pct(cleared / seeds).padStart(5),
      (crashes / seeds).toFixed(2).padStart(8),
      (time / c).toFixed(1).padStart(5),
      String(Math.round(sty / c)).padStart(6),
      (tok / c).toFixed(1).padStart(7),
      (tries / seeds).toFixed(1).padStart(6),
    ].join(' '));
  }
}

simulate('Clean skier: follows the validated line in a tuck, never jumps', true);
simulate('Cruiser: same line, never tucks (the yeti should win)', false);
if (builds) {
  simulate('Tuck build: Racing Skis, Carbon Poles, Aero Helmet, Downhill Suit', true, ['racing-skis', 'carbon-poles', 'aero-helmet', 'downhill-suit']);
  simulate('Crash build: Bubble Wrap, Rubber Chicken, Stunt Double, Helmet Cam, Insurance', true, ['bubble-wrap', 'rubber-chicken', 'stunt-double', 'helmet-cam', 'insurance']);
}
