// The "clean skier" bot used by the simulator and tests: follows the generator's validated line,
// never jumps, never brakes. If it can clear a slope in a tuck, a careful human can too.
import { type Game, type Input, NO_INPUT } from './engine';

export interface BotOptions {
  /** false = the "cruiser", who never tucks (and should get caught). */
  tuck?: boolean;
}

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
  const target = heading + Math.atan(err * 2);
  const settled = Math.abs(err) < 0.35 && Math.abs(target - s.angle) < 0.2;
  return { targetAngle: target, turn: 0, tuck: opts.tuck !== false && settled && Math.abs(target) < 0.5, brake: false, jump: false };
}
