// Balance simulator: bots ski every slope of the run for many seeds and print a table per slope.
// Usage: npm run sim [-- seeds]   (default 50 seeds × 15 descents per bot: 12 slopes and 3 Summits)
import { botInput } from '../src/bot';
import { type Game, distance, newGame, step, style, tokens } from '../src/engine';
import { TOTAL_STAGES, paramsFor, stageKind } from '../src/run';
import { buildSlope } from '../src/slope';
import { CFG } from '../src/engine';
import { modsFor } from '../src/gear';

const seeds = Number(process.argv[2]) || 50;

interface Row {
  cleared: number;
  eaten: number;
  crashes: number;
  time: number;
  style: number;
  tokens: number;
  reached: number;
}

function ski(g: Game, tuck: boolean): number {
  let crashes = 0;
  const opts = { tuck };
  while (!g.over && g.tick < 60 * 600) {
    step(g, botInput(g, opts));
    for (const e of g.events) if (e.type === 'crash') crashes++;
    g.events.length = 0;
  }
  return crashes;
}

function simulate(label: string, tuck: boolean, gear: string[] = []) {
  console.log(`\n${label} (${seeds} seeds per slope)`);
  console.log('stage   len  diff  yeti grace | clear  eaten  crashes  time  style  tokens  reached  tries');
  for (let i = 0; i < TOTAL_STAGES; i++) {
    if (stageKind(i) === 'lodge') continue;
    const p = paramsFor(i);
    let tries = 0;
    const row: Row = { cleared: 0, eaten: 0, crashes: 0, time: 0, style: 0, tokens: 0, reached: 0 };
    for (let seed = 1; seed <= seeds; seed++) {
      tries += buildSlope(seed * 7919 + i, p, CFG.tuck).attempts;
      const g = newGame(seed * 7919 + i, { params: p, mods: modsFor(gear) });
      row.crashes += ski(g, tuck);
      if (g.result === 'cleared') {
        row.cleared++;
        row.time += g.time;
        row.style += style(g);
        row.tokens += tokens(g);
      } else row.eaten++;
      row.reached += distance(g) / p.length;
    }
    const c = Math.max(1, row.cleared);
    console.log(
      [
        `${i + 1}${p.boss ? '*' : ''}`.padStart(5),
        String(p.length).padStart(4),
        p.difficulty.toFixed(1).padStart(5),
        String(p.yetiSpeed).padStart(5),
        p.grace.toFixed(1).padStart(5),
        '|',
        pct(row.cleared / seeds).padStart(5),
        pct(row.eaten / seeds).padStart(6),
        (row.crashes / seeds).toFixed(2).padStart(8),
        (row.time / c).toFixed(1).padStart(5),
        String(Math.round(row.style / c)).padStart(6),
        (row.tokens / c).toFixed(1).padStart(7),
        pct(row.reached / seeds).padStart(8),
        (tries / seeds).toFixed(1).padStart(6),
      ].join(' '),
    );
  }
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

simulate('Clean skier: follows the validated line in a tuck, never jumps', true);
simulate('Cruiser: same line, never tucks (the yeti should win)', false);
simulate('Tuck build: clean skier with Racing Skis, Carbon Poles, Aero Helmet, Downhill Suit', true, ['racing-skis', 'carbon-poles', 'aero-helmet', 'downhill-suit']);
simulate('Crash build: clean skier with Bubble Wrap, Rubber Chicken, Stunt Double, Helmet Cam, Insurance', true, ['bubble-wrap', 'rubber-chicken', 'stunt-double', 'helmet-cam', 'insurance']);
