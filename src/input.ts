// Turns touches and keys into engine Input. Control scheme A from descent-and-controls.md:
// drag sideways to steer (relative to where the thumb landed), hold low to tuck, drag up to slow,
// flick up (or tap) to jump / trick. Arrow keys + Space on desktop.
import type { Input } from './engine';

/** Pixels of sideways drag for a full 90° of heading change. */
const STEER_PX = 110;
/** Pixels of vertical offset from the touch point before tuck / brake kicks in. */
const HOLD_PX = 36;
const FLICK_PX = 26;
const FLICK_MS = 120;
const TAP_MS = 220;
const TAP_PX = 12;

interface Touch {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  angle0: number;
  moved: number;
  samples: { y: number; t: number }[];
  x: number;
  y: number;
}

export class Controls {
  private touch: Touch | null = null;
  private keys = new Set<string>();
  private jumpQueued = false;
  private snackQueued: number | undefined;

  constructor(target: HTMLElement, private getAngle: () => number, private onKey: (key: string) => void) {
    target.addEventListener('pointerdown', (e) => this.down(e));
    target.addEventListener('pointermove', (e) => this.move(e));
    target.addEventListener('pointerup', (e) => this.up(e));
    target.addEventListener('pointercancel', (e) => this.up(e, true));
    window.addEventListener('keydown', (e) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.key.toLowerCase());
      if (e.key === ' ') this.jumpQueued = true;
      this.onKey(e.key);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.reset());
  }

  reset() {
    this.touch = null;
    this.keys.clear();
    this.jumpQueued = false;
    this.snackQueued = undefined;
  }

  /** Use a Snack on the next tick (HUD button or number key). */
  queueSnack(index: number) {
    this.snackQueued = index;
  }

  /** Input for one tick. Consumes a queued jump. */
  read(): Input {
    const k = this.keys;
    const jump = this.jumpQueued;
    const snack = this.snackQueued;
    this.jumpQueued = false;
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
      snack,
    };
  }

  private down(e: PointerEvent) {
    if (this.touch || (e.target as HTMLElement).closest('button')) return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.touch = {
      id: e.pointerId, x0: e.clientX, y0: e.clientY, t0: e.timeStamp, angle0: this.getAngle(),
      moved: 0, samples: [{ y: e.clientY, t: e.timeStamp }], x: e.clientX, y: e.clientY,
    };
  }

  private move(e: PointerEvent) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    t.x = e.clientX;
    t.y = e.clientY;
    t.moved = Math.max(t.moved, Math.hypot(t.x - t.x0, t.y - t.y0));
    t.samples.push({ y: t.y, t: e.timeStamp });
    while (t.samples.length > 2 && e.timeStamp - t.samples[0].t > FLICK_MS) t.samples.shift();
    // Flick: a fast upward stroke. Re-anchor vertically so the stroke doesn't also count as braking.
    if (t.samples[0].y - t.y > FLICK_PX) {
      this.jumpQueued = true;
      t.y0 = t.y;
      t.samples = [{ y: t.y, t: e.timeStamp }];
    }
  }

  private up(e: PointerEvent, cancelled = false) {
    const t = this.touch;
    if (!t || t.id !== e.pointerId) return;
    if (!cancelled && e.timeStamp - t.t0 < TAP_MS && t.moved < TAP_PX) this.jumpQueued = true;
    this.touch = null;
  }
}
