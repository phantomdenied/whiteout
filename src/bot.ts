// The "clean skier" bot used by the simulator and tests: follows the generator's validated line,
// never jumps, never brakes. If it can clear a slope in a tuck, a careful human can too.
import { type Game, type Input, NO_INPUT } from './engine';

export interface BotOptions {
  /** false = the "cruiser", who never tucks (and should get caught). */
  tuck?: boolean;
  /** Chance per tick of a lapse: a second or so drifting off the line (attract mode's sloppy skier). */
  lapses?: number;
  /** Random source for lapses. */
  rand?: () => number;
}

/** Lapse state per game: until when, and which way the skier drifts. */
const lapse = new WeakMap<Game, { until: number; drift: number }>();

export function botInput(g: Game, opts: BotOptions = {}): Input {
  const line = g.line;
  const s = g.skier;
  if (!line) return { ...NO_INPUT, tuck: opts.tuck !== false };
  const at = (y: number) => {
    const i = Math.max(0, Math.min(line.length - 1, y));
    const lo = Math.floor(i);
    const hi = Math.min(line.length - 1, lo + 1);
    return line[lo] + (line[hi] - line[lo]) * (i - lo);
  };
  // Follow the line's direction a little ahead, corrected by how far off it we are right now.
  const ahead = s.y + 1 + s.speed * 0.1;
  const heading = Math.atan2(at(ahead + 2) - at(ahead), 2);
  const err = at(s.y + s.speed * 0.02) - s.x;
  let target = heading + Math.atan(err * 2);
  if (opts.lapses) {
    const rand = opts.rand ?? Math.random;
    let l = lapse.get(g);
    if ((!l || g.time > l.until) && rand() < opts.lapses) {
      l = { until: g.time + 0.6 + rand() * 0.8, drift: (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.35) };
      lapse.set(g, l);
    }
    if (l && g.time <= l.until) return { targetAngle: heading + l.drift, turn: 0, tuck: opts.tuck !== false, brake: false, jump: false };
  }
  const settled = Math.abs(err) < 0.35 && Math.abs(target - s.angle) < 0.2;
  // With an avalanche right behind, stay tucked unless mid-way through a sharp correction (every second counts).
  const pressed = g.wall?.armed === true && g.skier.y - g.wall.y < 25 && Math.abs(target - s.angle) < 0.3 && Math.abs(err) < 0.6;
  return { targetAngle: target, turn: 0, tuck: opts.tuck !== false && (pressed || (settled && Math.abs(target) < 0.5)), brake: false, jump: false };
}
