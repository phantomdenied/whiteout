// Canvas renderer. Placeholder art, all drawn from shapes (original, not SkiFree's sprites).
// The camera keeps the skier about 30% from the top so most of the screen shows the slope ahead.
import { CFG, type Game, type Obstacle, airborne, yetiProximity } from './engine';

const C = {
  snow: '#f3f6f9',
  speck: '#dbe5ee',
  track: 'rgba(120, 150, 175, 0.35)',
  shadow: 'rgba(40, 70, 100, 0.16)',
  spruce: '#1f4d3a',
  spruceLight: '#2c6a4f',
  trunk: '#6b4a2f',
  rock: '#7d8a96',
  rockDark: '#5d6873',
  stump: '#8a6240',
  stumpTop: '#c49a6c',
  mogul: '#e4ecf3',
  mogulShade: '#c3d3e0',
  rampFace: '#b9d3e6',
  rampTop: '#e8f1f8',
  boundary: '#f28c28',
  dog: '#b07a45',
  dogDark: '#6e4a28',
  jacket: '#d6452b',
  pants: '#24364a',
  helmet: '#f4c430',
  ski: '#14212b',
  yetiFur: '#e9f1f7',
  yetiShade: '#a9c0d2',
  yetiFace: '#2a3d63',
  yetiEye: '#ffb000',
};

const VIEW_WIDTH_M = 26;
const VIEW_HEIGHT_M = 44;
const SKIER_SCREEN_Y = 0.3;

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private ppm = 16;
  private camX = 0;
  private shake = 0;
  private trail: { x: number; y: number; a: number }[] = [];

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    this.w = rect.width;
    this.h = rect.height;
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ppm = Math.min(this.w / VIEW_WIDTH_M, this.h / VIEW_HEIGHT_M) * 1.15;
  }

  reset(g: Game) {
    this.camX = g.skier.x;
    this.trail = [];
    this.shake = 0;
  }

  bump(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  draw(g: Game, frameDt: number) {
    const { ctx, w, h, ppm } = this;
    const s = g.skier;
    this.camX += (s.x - this.camX) * Math.min(1, frameDt * 6);
    this.shake = Math.max(0, this.shake - frameDt * 30);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    const camY = s.y - (h * SKIER_SCREEN_Y) / ppm;
    const toX = (x: number) => w / 2 + (x - this.camX) * ppm + sx;
    const toY = (y: number) => (y - camY) * ppm + sy;

    ctx.fillStyle = C.snow;
    ctx.fillRect(0, 0, w, h);

    // Snow grain, fixed to the world so it scrolls.
    ctx.fillStyle = C.speck;
    const cell = 3;
    const x0 = Math.floor((this.camX - w / 2 / ppm) / cell) - 1;
    const x1 = Math.ceil((this.camX + w / 2 / ppm) / cell) + 1;
    const y0 = Math.floor(camY / cell) - 1;
    const y1 = Math.ceil((camY + h / ppm) / cell) + 1;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const r = hash(cx, cy);
        if (r > 0.55) continue;
        ctx.fillRect(toX(cx * cell + r * cell * 1.7), toY(cy * cell + (r * 7.3 % 1) * cell), 2, 1.5);
      }
    }

    // Ski tracks.
    if (s.state === 'ski' && !airborne(s) && s.speed > 0.5) this.trail.push({ x: s.x, y: s.y, a: s.angle });
    if (this.trail.length > 240) this.trail.splice(0, this.trail.length - 240);
    ctx.strokeStyle = C.track;
    ctx.lineWidth = Math.max(1, ppm * 0.07);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      let prev: { x: number; y: number } | null = null;
      for (const p of this.trail) {
        const ox = Math.cos(p.a) * 0.13 * side;
        const oy = -Math.sin(p.a) * 0.13 * side;
        const px = toX(p.x + ox);
        const py = toY(p.y + oy);
        if (prev && Math.hypot(px - prev.x, py - prev.y) > ppm * 1.5) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
        prev = { x: px, y: py };
      }
      ctx.stroke();
    }

    // Boundary poles at the slope edges, every 8 m.
    for (const side of [-1, 1]) {
      const bx = toX(side * CFG.slopeHalfWidth);
      if (bx < -20 || bx > w + 20) continue;
      for (let y = Math.floor(camY / 8) * 8; y < camY + h / ppm + 8; y += 8) {
        const by = toY(y);
        ctx.fillStyle = C.shadow;
        ctx.fillRect(bx - 1, by, ppm * 0.5, 2);
        ctx.fillStyle = C.boundary;
        ctx.fillRect(bx - 1.5, by - ppm * 1.1, 3, ppm * 1.1);
        ctx.fillStyle = C.ski;
        ctx.fillRect(bx - 1.5, by - ppm * 1.1, 3, ppm * 0.25);
      }
    }

    // Depth-sort everything by its ground y.
    type Drawable = { y: number; draw: () => void };
    const list: Drawable[] = [];
    const top = camY - 4;
    const bottom = camY + h / ppm + 4;
    for (const o of g.obstacles) {
      if (o.y < top || o.y > bottom) continue;
      const px = toX(o.x);
      if (px < -60 || px > w + 60) continue;
      list.push({ y: o.y, draw: () => this.obstacle(o, px, toY(o.y), g.time) });
    }
    list.push({ y: s.y, draw: () => this.skier(g, toX(s.x), toY(s.y)) });
    const yeti = g.yeti;
    if (yeti.state !== 'waiting') list.push({ y: yeti.y + 0.01, draw: () => this.yeti(g, toX(yeti.x), toY(yeti.y)) });
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // Off-screen yeti arrow at the top edge.
    if (yeti.state === 'chasing' && toY(yeti.y) < 0) {
      const ax = Math.max(24, Math.min(w - 24, toX(yeti.x)));
      const p = yetiProximity(g);
      ctx.fillStyle = `rgba(214, 69, 43, ${0.35 + p * 0.6})`;
      ctx.beginPath();
      ctx.moveTo(ax, 98);
      ctx.lineTo(ax - 10, 84);
      ctx.lineTo(ax + 10, 84);
      ctx.closePath();
      ctx.fill();
    }
  }

  private ground(px: number, py: number, rx: number) {
    const { ctx, ppm } = this;
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(px + rx * ppm * 0.25, py, rx * ppm, rx * ppm * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  private obstacle(o: Obstacle, px: number, py: number, time: number) {
    const { ctx, ppm } = this;
    const u = ppm;
    switch (o.kind) {
      case 'tree': {
        this.ground(px, py, 0.9);
        ctx.fillStyle = C.trunk;
        ctx.fillRect(px - u * 0.12, py - u * 0.5, u * 0.24, u * 0.5);
        const tiers = [
          [0.4, 1.0, C.spruce],
          [1.1, 0.8, C.spruceLight],
          [1.75, 0.55, C.spruce],
        ] as const;
        for (const [base, half, col] of tiers) {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.moveTo(px - half * u, py - base * u);
          ctx.lineTo(px + half * u, py - base * u);
          ctx.lineTo(px, py - (base + 1.0) * u);
          ctx.closePath();
          ctx.fill();
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(px - u * 0.18, py - u * 2.45);
        ctx.lineTo(px + u * 0.18, py - u * 2.45);
        ctx.lineTo(px, py - u * 2.75);
        ctx.closePath();
        ctx.fill();
        if (o.hit) this.stars(px, py - u * 2.9, time);
        break;
      }
      case 'rock': {
        this.ground(px, py, 0.6);
        ctx.fillStyle = C.rockDark;
        blob(ctx, px, py - u * 0.25, u * 0.6, u * 0.38);
        ctx.fillStyle = C.rock;
        blob(ctx, px - u * 0.08, py - u * 0.32, u * 0.45, u * 0.28);
        ctx.fillStyle = '#ffffff';
        blob(ctx, px - u * 0.1, py - u * 0.5, u * 0.28, u * 0.1);
        break;
      }
      case 'stump': {
        this.ground(px, py, 0.45);
        ctx.fillStyle = C.stump;
        ctx.fillRect(px - u * 0.35, py - u * 0.4, u * 0.7, u * 0.4);
        ctx.fillStyle = C.stumpTop;
        ctx.beginPath();
        ctx.ellipse(px, py - u * 0.4, u * 0.35, u * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'moguls': {
        for (const [dx, dy] of [[-0.7, -0.3], [0.6, -0.1], [-0.1, 0.4]]) {
          ctx.fillStyle = C.mogulShade;
          ctx.beginPath();
          ctx.ellipse(px + dx * u + u * 0.08, py + dy * u + u * 0.06, u * 0.55, u * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.mogul;
          ctx.beginPath();
          ctx.ellipse(px + dx * u, py + dy * u, u * 0.5, u * 0.26, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'ramp': {
        ctx.fillStyle = C.rampFace;
        ctx.beginPath();
        ctx.moveTo(px - u * 0.9, py - u * 0.6);
        ctx.lineTo(px + u * 0.9, py - u * 0.6);
        ctx.lineTo(px + u * 1.0, py + u * 0.35);
        ctx.lineTo(px - u * 1.0, py + u * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.rampTop;
        ctx.fillRect(px - u * 0.9, py - u * 0.9, u * 1.8, u * 0.32);
        for (const side of [-1, 1]) {
          const fx = px + side * u * 1.05;
          ctx.fillStyle = C.ski;
          ctx.fillRect(fx - 1, py - u * 1.3, 2, u * 1.3);
          ctx.fillStyle = C.boundary;
          ctx.beginPath();
          ctx.moveTo(fx, py - u * 1.3);
          ctx.lineTo(fx + side * u * 0.45, py - u * 1.15);
          ctx.lineTo(fx, py - u * 1.0);
          ctx.closePath();
          ctx.fill();
        }
        break;
      }
      case 'dog': {
        this.ground(px, py, 0.45);
        const facing = Math.cos(time * 0.9 + o.phase) >= 0 ? 1 : -1;
        const bob = o.hit ? 0 : Math.abs(Math.sin(time * 9 + o.phase)) * u * 0.06;
        ctx.fillStyle = C.dogDark;
        for (const lx of [-0.25, 0.2]) ctx.fillRect(px + lx * u * facing, py - u * 0.25, u * 0.08, u * 0.25);
        ctx.fillStyle = C.dog;
        ctx.beginPath();
        ctx.ellipse(px, py - u * 0.35 - bob, u * 0.38, u * 0.17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(px + facing * u * 0.38, py - u * 0.52 - bob, u * 0.16, u * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = C.dog;
        ctx.lineWidth = u * 0.07;
        ctx.beginPath();
        ctx.moveTo(px - facing * u * 0.35, py - u * 0.4 - bob);
        ctx.lineTo(px - facing * u * 0.55, py - u * (0.55 + Math.sin(time * 14) * 0.08) - bob);
        ctx.stroke();
        if (o.hit) this.stars(px, py - u * 0.8, time);
        break;
      }
    }
  }

  private stars(px: number, py: number, time: number) {
    const { ctx, ppm } = this;
    ctx.fillStyle = C.helmet;
    for (let i = 0; i < 3; i++) {
      const a = time * 4 + (i * Math.PI * 2) / 3;
      ctx.fillRect(px + Math.cos(a) * ppm * 0.4 - 2, py + Math.sin(a) * ppm * 0.15 - 2, 4, 4);
    }
  }

  private skier(g: Game, px: number, py: number) {
    const { ctx, ppm: u } = this;
    const s = g.skier;
    if (s.state === 'eaten') return; // the yeti has it
    const inAir = airborne(s);
    const t = inAir ? 1 - s.air / s.airTotal : 0;
    const lift = inAir ? Math.sin(t * Math.PI) * u * (s.airKind === 'ramp' ? 1.4 : 0.7) : 0;

    // Shadow stays on the snow.
    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(px, py, u * 0.45 * (1 - lift / (u * 3)), u * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(px, py - lift);
    if (s.state === 'crash') {
      const spin = (CFG.crashTime - s.crashT) * 9;
      ctx.rotate(Math.sin(spin) * 0.9);
      this.skiPair(u, 0.9, true);
      this.body(u, false, 0);
      ctx.restore();
      return;
    }
    // Skis point along the heading: angle 0 = straight down the screen.
    ctx.save();
    ctx.rotate(-s.angle);
    this.skiPair(u, 1, false);
    ctx.restore();
    const trickSpin = s.trickT > 0 ? (1 - s.trickT / CFG.trickTime) * Math.PI * 2 : 0;
    ctx.rotate(trickSpin);
    this.body(u, s.tuck, s.angle);
    ctx.restore();
  }

  private skiPair(u: number, scale: number, scattered: boolean) {
    const { ctx } = this;
    ctx.fillStyle = C.ski;
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * u * 0.14, 0);
      if (scattered) ctx.rotate(side * 0.6);
      ctx.fillRect(-u * 0.045, -u * 0.75 * scale, u * 0.09, u * 1.5 * scale);
      ctx.restore();
    }
  }

  private body(u: number, tuck: boolean, angle: number) {
    const { ctx } = this;
    const h = tuck ? 0.65 : 1;
    const lean = Math.sin(angle) * u * 0.15;
    ctx.fillStyle = C.pants;
    ctx.fillRect(-u * 0.2, -u * 0.55 * h, u * 0.4, u * 0.45 * h);
    ctx.fillStyle = C.jacket;
    ctx.beginPath();
    ctx.ellipse(lean, -u * 0.85 * h, u * 0.3, u * 0.36 * h, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.helmet;
    ctx.beginPath();
    ctx.arc(lean * 1.3, -u * 1.3 * h, u * 0.19, 0, Math.PI * 2);
    ctx.fill();
    // Poles.
    ctx.strokeStyle = C.ski;
    ctx.lineWidth = Math.max(1, u * 0.05);
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(lean + side * u * 0.3, -u * 0.8 * h);
      ctx.lineTo(side * u * 0.45, tuck ? -u * 0.1 : u * 0.2);
      ctx.stroke();
    }
  }

  private yeti(g: Game, px: number, py: number) {
    const { ctx, ppm: u } = this;
    const y = g.yeti;
    const eating = y.state === 'eating';
    const run = g.time * 10;
    const bob = eating ? Math.abs(Math.sin(g.time * 14)) * u * 0.15 : Math.abs(Math.sin(run)) * u * 0.12;
    const S = 1.25;

    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(px, py, u * 0.9 * S, u * 0.3 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(px, py - bob);
    ctx.scale(S, S);
    // Legs.
    ctx.fillStyle = C.yetiShade;
    const stride = eating ? 0 : Math.sin(run) * u * 0.18;
    ctx.fillRect(-u * 0.42, -u * 0.6 + stride, u * 0.3, u * 0.6 - stride);
    ctx.fillRect(u * 0.12, -u * 0.6 - stride, u * 0.3, u * 0.6 + stride);
    // Shaggy body: a lumpy outline.
    ctx.fillStyle = C.yetiFur;
    ctx.beginPath();
    const cx = 0;
    const cy = -u * 1.35;
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const r = (i % 2 ? 0.92 : 1.05) * u * 0.8;
      const x = cx + Math.cos(a) * r * 0.85;
      const yy = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = C.yetiShade;
    ctx.lineWidth = Math.max(1, u * 0.05);
    ctx.stroke();
    // Arms up when it's close or eating.
    const reach = eating ? 1 : yetiProximity(g);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * u * 0.62, -u * 1.55);
      ctx.rotate(side * (0.4 + reach * 1.6 + (eating ? Math.sin(g.time * 14) * 0.3 : Math.sin(run) * 0.25)));
      ctx.fillStyle = C.yetiFur;
      ctx.fillRect(-u * 0.14, 0, u * 0.28, u * 0.85);
      ctx.strokeRect(-u * 0.14, 0, u * 0.28, u * 0.85);
      ctx.restore();
    }
    // Face.
    ctx.fillStyle = C.yetiFace;
    ctx.beginPath();
    ctx.ellipse(0, -u * 1.6, u * 0.38, u * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = C.yetiEye;
    ctx.fillRect(-u * 0.22, -u * 1.7, u * 0.12, u * 0.08);
    ctx.fillRect(u * 0.1, -u * 1.7, u * 0.12, u * 0.08);
    if (eating) {
      // The skier's legs and skis sticking out, kicking.
      ctx.fillStyle = C.pants;
      const kick = Math.sin(g.time * 18) * u * 0.08;
      ctx.fillRect(-u * 0.16 + kick, -u * 1.5, u * 0.12, u * 0.45);
      ctx.fillRect(u * 0.04 - kick, -u * 1.5, u * 0.12, u * 0.45);
      ctx.fillStyle = C.ski;
      ctx.fillRect(-u * 0.5 + kick, -u * 1.08, u * 0.55, u * 0.07);
      ctx.fillRect(u * 0.0 - kick, -u * 1.08, u * 0.55, u * 0.07);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-u * 0.18, -u * 1.48, u * 0.36, u * 0.06);
    }
    ctx.restore();
  }
}

function blob(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
