// Turns touches and keys into engine Input. Control scheme A from descent-and-controls.md:
// drag sideways to steer (relative to where the thumb landed), hold low to tuck, drag up to slow,
// double-tap to jump, and in the air swipe up / left / right for the three tricks.
// Desktop: arrow keys, Space to jump, Z / X / C for tricks.
import type { Input, TrickKind } from './engine';

/** Pixels of sideways drag for a full 90° of heading change. */
const STEER_PX = 110;
/** Pixels of vertical offset from the touch point before tuck / brake kicks in. */
const HOLD_PX = 36;
const FLICK_PX = 26;
const FLICK_MS = 120;
const TAP_MS = 220;
const TAP_PX = 12;
/** A second tap starting this soon after the first, near it, is a double tap (jump). */
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 60;
const TRICK_KEYS: Record<string, TrickKind> = { z: 1, x: 2, c: 3 };

interface Touch {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  angle0: number;
  moved: number;
  /** This touch was the second tap of a double tap: its own release isn't a tap. */
  consumed: boolean;
  samples: { x: number; y: number; t: number }[];
  x: number;
  y: number;
}

export class Controls {
  private touch: Touch | null = null;
  private keys = new Set<string>();
  private jumpQueued = false;
  private trickQueued: TrickKind | undefined;
  private snackQueued: number | undefined;
  private lastTap = { t: -Infinity, x: 0, y: 0 };

  constructor(
    target: HTMLElement,
    private getAngle: () => number,
    private onKey: (key: string) => void,
    /** Swipes are tricks only in the air; on the ground a fast sideways drag is just steering. */
    private getAirborne: () => boolean = () => false,
  ) {
    target.addEventListener('pointerdown', (e) => this.down(e));
    target.addEventListener('pointermove', (e) => this.move(e));
    target.addEventListener('pointerup', (e) => this.up(e));
    target.addEventListener('pointercancel', (e) => this.up(e, true));
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ') this.jumpQueued = true;
      const trick = TRICK_KEYS[e.key.toLowerCase()];
      if (trick) this.trickQueued = trick;
      this.onKey(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.touch = null;
    this.keys.clear();
    this.jumpQueued = false;
    this.trickQueued = undefined;
    this.snackQueued = undefined;
    this.lastTap.t = -Infinity;
  }

  /** Use a Snack on the next tick (HUD button or number key). */
  queueSnack(index: number) {
    this.snackQueued = index;
  }

  /** Input for one tick. Consumes a queued jump. */
  read(): Input {
    const k = this.keys;
    const jump = this.jumpQueued;
    const trick = this.trickQueued;
    const snack = this.snackQueued;
    this.jumpQueued = false;
    this.trickQueued = undefined;
    this.snackQueued = undefined;
    const t = this.touch;
    if (t) {
      const dx = t.x - t.x0;
      const dy = t.y - t.y0;
      return {
        targetAngle: t.angle0 + (dx / STEER_PX) * (Math.PI / 2),
        turn: 0,
        tuck: dy > HOLD_PX,
        brake: dy < -HOLD_PX,
        jump,
        trick,
        snack,
      };
    }
    const left = k.has('arrowleft') || k.has('a');
    const right = k.has('arrowright') || k.has('d');
    return {
      turn: (right ? 1 : 0) - (left ? 1 : 0),
      tuck: k.has('arrowdown') || k.has('s'),
      brake: k.has('arrowup') || k.has('w'),
      jump,
      trick,
      snack,
    };
  }

  private down(e: PointerEvent) {
    if (this.touch || (e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    // Second tap of a double tap: jump on touch-down, for the quickest response.
    const double = e.timeStamp - this.lastTap.t < DOUBLE_TAP_MS
      && Math.hypot(e.clientX - this.lastTap.x, e.clientY - this.lastTap.y) < DOUBLE_TAP_PX;
    if (double) {
      this.jumpQueued = true;
      this.lastTap.t = -Infinity;
    }
    this.touch = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, angle0: this.getAngle(),
      moved: 0, consumed: double, samples: [{ x: e.clientX, y: e.clientY, t: e.timeStamp }], x: e.clientX, y: e.clientY,
    };
  }

  private move(e: PointerEvent) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    t.x = e.clientX;
    t.y = e.clientY;
    t.moved = Math.max(t.moved, Math.hypot(t.x - t.x0, t.y - t.y0));
    t.samples.push({ x: t.x, y: t.y, t: e.timeStamp });
    while (t.samples.length > 2 && e.timeStamp - t.samples[0].t > FLICK_MS) t.samples.shift();
    if (!this.getAirborne()) return;
    // Swipe: a fast stroke up (Spread Eagle), left (Helicopter) or right (Backflip). Re-anchor so the stroke
    // doesn't also count as braking or steering.
    const dx = t.x - t.samples[0].x;
    const dy = t.samples[0].y - t.y;
    let kind: TrickKind | undefined;
    if (dy > FLICK_PX && dy > Math.abs(dx)) kind = 1;
    else if (-dx > FLICK_PX && -dx > Math.abs(dy)) kind = 2;
    else if (dx > FLICK_PX && dx > Math.abs(dy)) kind = 3;
    if (kind) {
      this.trickQueued = kind;
      t.x0 += dx;
      t.y0 = t.y;
      t.samples = [{ x: t.x, y: t.y, t: e.timeStamp }];
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    if (!cancelled && !t.consumed && e.timeStamp - t.t0 < TAP_MS && t.moved < TAP_PX) this.lastTap = { t: e.timeStamp, x: t.x, y: t.y };
    this.touch = null;
  }
}
