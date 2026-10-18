// Altitude check: the clean-skier bot on every descent of whole runs at Altitude 0, 5 and 10.
// Usage: npx vite-node sim/altitude.ts [-- seeds]
import { botInput } from '../src/bot';
import { CFG, newGame, step } from '../src/engine';
import { MOUNTAINS, ROWS, generateMap, nodeParams } from '../src/run';

const seeds = Number(process.argv[2]) || 20;
for (const altitude of [0, 5, 10]) {
  let total = 0, cleared = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    for (let m = 0; m < MOUNTAINS.length; m++) {
      const map = generateMap(seed, m);
      for (let r = 0; r < ROWS; r++) {
        map.rows[r].forEach((node, c) => {
          if (node.kind !== 'slope' && node.kind !== 'diamond' && node.kind !== 'summit') return;
          const g = newGame(seed * 101 + m * 13 + r * 7 + c, { params: nodeParams(seed, map, m, r, c, altitude) });
          while (!g.over && g.tick < 60 * 600) {
            step(g, botInput(g, { tuck: true }));
            g.events.length = 0;
          }
          total++;
          if (g.result === 'cleared') cleared++;
        });
      }
    }
  }
  console.log(`Altitude ${altitude}: clean bot cleared ${cleared}/${total} (${Math.round((cleared / total) * 100)}%)`);
  void CFG;
}
