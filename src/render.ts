// Canvas renderer. Placeholder art, all drawn from shapes (original, not SkiFree's sprites).
// The camera keeps the skier about 30% from the top so most of the screen shows the slope ahead.
import { CFG, type Game, type Obstacle, TRICKS, type Yeti, type YetiLook, airborne, yetiProximity } from './engine';
import { type Gate, SLOPE } from './slope';

const C = {
  snow: '#f3f6f9',
  speck: '#dbe5ee',
  track: 'rgba(120, 150, 175, 0.35)',
  shadow: 'rgba(40, 70, 100, 0.16)',
  spruce: '#1f4d3a',
  spruceLight: '#2c6a4f',
  trunk: '#6b4a2f',
  dead: '#7a6a5a',
  flame: '#ff8a1f',
  flameCore: '#ffd23f',
  rock: '#7d8a96',
  rockDark: '#5d6873',
  stump: '#8a6240',
  stumpTop: '#c49a6c',
  mogul: '#e4ecf3',
  mogulShade: '#c3d3e0',
  rampFace: '#b9d3e6',
  rampTop: '#e8f1f8',
  boundary: '#f28c28',
  gateBlue: '#2f6fd6',
  dog: '#b07a45',
  dogDark: '#6e4a28',
  jacket: '#d6452b',
  pants: '#24364a',
  helmet: '#f4c430',
  ski: '#14212b',
  yetiEye: '#ffb000',
  wall: '#ffffff',
  wallBody: '#b9cddd',
  wallShade: '#8fa9bf',
  map: 'rgba(242, 140, 40, 0.85)',
};

const VIEW_WIDTH_M = 26;
const VIEW_HEIGHT_M = 44;
const SKIER_SCREEN_Y = 0.3;
/** While a boss waits behind you, the camera looks back so you can see it. */
const BOSS_LOOK_Y = 0.62;
/** With a leashed avalanche on your heels, sit lower so the wall stays in view (less look-ahead: that's the tension). */
const AVALANCHE_LOOK_Y = 0.56;
const AVALANCHE_ZOOM = 0.78;
const ICE = { snow: '#e3eff7', speck: '#bcd6ea' };
const POWDER = { snow: '#fbfcfe', speck: '#e8eef4' };

/** Fur, shade and face per pursuer; size multiplier. Bosses read as different animals at a glance. */
const LOOKS: Record<YetiLook, { fur: string; shade: string; face: string; size: number }> = {
  yeti: { fur: '#e9f1f7', shade: '#a9c0d2', face: '#2a3d63', size: 1.25 },
  big: { fur: '#dfe8ef', shade: '#8ea8bd', face: '#1d2c4a', size: 1.9 },
  twin: { fur: '#efe6f2', shade: '#b8a3c4', face: '#4a2d63', size: 1.2 },
  old: { fur: '#c9d3db', shade: '#7f8f9c', face: '#141c2b', size: 1.6 },
};
/** Snow and grain per mountain: groomed resort, shaded forest, bright alpine. */
const SNOW = [
  { snow: '#f3f6f9', speck: '#dbe5ee' },
  { snow: '#e8eef2', speck: '#d0dbe4' },
  { snow: '#f7f9fc', speck: '#d6e2f0' },
];

/** Seconds of glowing eye streak behind a yeti at night. */
const EYE_TRAIL_S = 0.45;

/** Night headlamp: cone half-angle (radians), reach and glow radius (meters), and how much of the dark the long throw lifts near and far. */
const HEADLAMP = { halfAngle: 0.42, reach: 18, glow: 2.6, throwNear: 0.13, throwFar: 0.08 };

/** Burning Man: smoky, ash-dusted snow. */
const ASH = { snow: '#efe6dc', speck: '#cdbfb2' };

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private dpr = 1;
  private h = 0;
  private ppm = 16;
  /** Pixels per meter at normal zoom; `ppm` is this × `zoom`. */
  private basePpm = 16;
  /** Zooms out on Avalanche runs so the wall behind and the slope ahead both fit. */
  private zoom = 1;
  private camX = 0;
  private camFrac = SKIER_SCREEN_Y;
  private shake = 0;
  private trail: { x: number; y: number; a: number }[] = [];
  /** Offscreen layer for the night darkness (the headlamp cone is cut out of it). */
  private dark: HTMLCanvasElement | null = null;
  /** Night: where each yeti's eyes have been lately (world meters + game time), for the glowing streak. */
  private eyeTrails = new Map<Yeti, { x: number; y: number; t: number }[]>();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize();
  }

  /**
   * Match the canvas's pixel buffer to its size on screen. Called every frame (cheap when nothing
   * changed), because iOS Safari fires resize events before the new size settles (toolbars showing
   * or hiding, rotation), and a stale buffer gets stretched to fit, squashing the whole slope.
   */
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.basePpm = Math.min(this.w / VIEW_WIDTH_M, this.h / VIEW_HEIGHT_M) * 1.15;
    this.ppm = this.basePpm * this.zoom;
  }

  reset(g: Game) {
    this.camX = g.skier.x;
    this.camFrac = this.lookFor(g);
    this.zoom = this.zoomFor(g);
    this.ppm = this.basePpm * this.zoom;
    this.trail = [];
    this.eyeTrails.clear();
    this.shake = 0;
  }

  /** Where the skier sits on screen (fraction from the top): lower when something behind needs watching. */
  private lookFor(g: Game): number {
    if (g.yetis.some((y) => y.state === 'holding')) return BOSS_LOOK_Y;
    if (g.wall?.leash && g.wall.armed) return AVALANCHE_LOOK_Y;
    return SKIER_SCREEN_Y;
  }

  private zoomFor(g: Game): number {
    return g.wall?.leash ? AVALANCHE_ZOOM : 1;
  }

  bump(amount: number) {
    this.shake = Math.max(this.shake, amount);
  }

  draw(g: Game, frameDt: number) {
    this.resize();
    this.zoom += (this.zoomFor(g) - this.zoom) * Math.min(1, frameDt * 1.5);
    this.ppm = this.basePpm * this.zoom;
    const { ctx, w, h, ppm } = this;
    const s = g.skier;
    this.camX += (s.x - this.camX) * Math.min(1, frameDt * 6);
    this.shake = Math.max(0, this.shake - frameDt * 30);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    this.camFrac += (this.lookFor(g) - this.camFrac) * Math.min(1, frameDt * 1.5);
    const camY = s.y - (h * this.camFrac) / ppm;
    const toX = (x: number) => w / 2 + (x - this.camX) * ppm + sx;
    const toY = (y: number) => (y - camY) * ppm + sy;

    const cond = g.params.condition;
    const tone = g.params.burn ? ASH : cond === 'ice' ? ICE : cond === 'powder' ? POWDER : SNOW[g.params.mountain] ?? SNOW[0];
    ctx.fillStyle = tone.snow;
    ctx.fillRect(0, 0, w, h);

    // Snow grain, fixed to the world so it scrolls.
    ctx.fillStyle = tone.speck;
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

    // Finish gate: a checkered line across the slope and a banner in the middle.
    const L = g.params.length;
    if (Number.isFinite(L) && toY(L) > -ppm * 3 && toY(L) < h + ppm * 3) {
      const fy = toY(L);
      const sq = ppm * 0.6;
      for (let x = -SLOPE.halfWidth, i = 0; x < SLOPE.halfWidth; x += 0.6, i++) {
        ctx.fillStyle = i % 2 ? C.ski : '#ffffff';
        ctx.fillRect(toX(x), fy - sq / 2, sq + 0.5, sq / 2);
        ctx.fillStyle = i % 2 ? '#ffffff' : C.ski;
        ctx.fillRect(toX(x), fy, sq + 0.5, sq / 2);
      }
      for (const side of [-1, 1]) {
        ctx.fillStyle = C.ski;
        ctx.fillRect(toX(side * 4) - 2, fy - ppm * 3, 4, ppm * 3);
      }
      ctx.fillStyle = C.boundary;
      ctx.fillRect(toX(-4), fy - ppm * 3, 8 * ppm, ppm * 0.9);
      ctx.fillStyle = C.ski;
      ctx.font = `900 ${Math.round(ppm * 0.7)}px 'Big Shoulders Display', 'Arial Narrow', sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FINISH', toX(0), fy - ppm * 2.55);
    }

    // Trail Map: the clean line, dashed, for the next stretch.
    if (g.line && g.mapUntil > s.y) {
      ctx.strokeStyle = C.map;
      ctx.lineWidth = Math.max(2, ppm * 0.15);
      ctx.setLineDash([ppm * 0.6, ppm * 0.5]);
      ctx.beginPath();
      const end = Math.min(g.mapUntil, g.line.length - 1, camY + h / ppm + 2);
      for (let y = Math.max(0, Math.floor(s.y)); y <= end; y++) {
        if (y === Math.max(0, Math.floor(s.y))) ctx.moveTo(toX(g.line[y]), toY(y));
        else ctx.lineTo(toX(g.line[y]), toY(y));
      }
      ctx.stroke();
      ctx.setLineDash([]);
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
    g.gates.forEach((gate, i) => {
      if (gate.y < top || gate.y > bottom) return;
      list.push({ y: gate.y, draw: () => this.gate(gate, i, toX, toY(gate.y)) });
    });
    list.push({ y: s.y, draw: () => this.skier(g, toX(s.x), toY(s.y)) });
    if (s.boostT > 0 && s.state === 'ski') {
      // Speed lines trailing uphill of the skier.
      ctx.strokeStyle = 'rgba(242, 140, 40, 0.6)';
      ctx.lineWidth = 2;
      for (let i = -1; i <= 1; i++) {
        const bx = toX(s.x) + i * ppm * 0.35;
        const by = toY(s.y) - ppm * 1.2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx - Math.sin(s.angle) * ppm * 1.4, by - Math.cos(s.angle) * ppm * 1.4);
        ctx.stroke();
      }
    }
    const drawYetis = () => {
      for (const yeti of g.yetis) if (yeti.state !== 'waiting') this.yeti(g, yeti, toX(yeti.x), toY(yeti.y));
    };
    // With an avalanche, pursuers ride on top of it; otherwise they're depth-sorted with everything else.
    if (!g.wall) {
      for (const yeti of g.yetis) {
        if (yeti.state !== 'waiting') list.push({ y: yeti.y + 0.01, draw: () => this.yeti(g, yeti, toX(yeti.x), toY(yeti.y)) });
      }
    }
    list.sort((a, b) => a.y - b.y);
    for (const d of list) d.draw();

    // The Old One's avalanche: everything uphill of its front is buried in snow.
    if (g.wall) {
      const wy = toY(g.wall.y);
      if (wy > 0) {
        // Churning front (white), then the body of the slide behind it, darkening uphill.
        const body = ctx.createLinearGradient(0, wy, 0, Math.max(0, wy - ppm * 12));
        body.addColorStop(0, C.wallBody);
        body.addColorStop(1, C.wallShade);
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        for (let x = 0; x <= w; x += 12) ctx.lineTo(x, wy + Math.sin(x * 0.07 + g.time * 6) * 6 - 4);
        ctx.lineTo(w, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = C.wall;
        for (let x = 0; x <= w; x += 22) {
          const r = ppm * (0.7 + 0.4 * Math.sin(x * 0.3 + g.time * 4));
          ctx.beginPath();
          ctx.arc(x, wy + Math.sin(x * 0.11 - g.time * 5) * 4, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawYetis();
    }

    // Conditions that change what you can see.
    if (cond === 'night') {
      this.headlamp(g, toX(s.x), toY(s.y));
      this.glowingEyes(g, toX, toY);
    } else if (cond === 'fog') {
      // A wall of white that thickens with distance downhill: obstacles appear late.
      const sy = toY(s.y);
      const fog = ctx.createLinearGradient(0, sy + ppm * 3, 0, sy + ppm * 17);
      fog.addColorStop(0, 'rgba(236, 241, 245, 0.12)');
      fog.addColorStop(1, 'rgba(236, 241, 245, 0.96)');
      ctx.fillStyle = fog;
      ctx.fillRect(0, 0, w, h);
    } else if (cond === 'powder') {
      // Falling snow, in screen space.
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      for (let i = 0; i < 90; i++) {
        const fx = (hash(i, 7) * w + g.time * 18 * (0.5 + hash(i, 3))) % w;
        const fy = (hash(i, 11) * h + g.time * 60 * (0.6 + hash(i, 5))) % h;
        ctx.beginPath();
        ctx.arc(fx, fy, 1 + hash(i, 13) * 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Off-screen pursuer arrows at the top edge.
    const p = yetiProximity(g);
    for (const yeti of g.yetis) {
      if ((yeti.state !== 'chasing' && yeti.state !== 'holding') || toY(yeti.y) >= 0) continue;
      const ax = Math.max(24, Math.min(w - 24, toX(yeti.x)));
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
      case 'deadtree': {
        this.ground(px, py, 0.6);
        ctx.strokeStyle = C.dead;
        ctx.lineCap = 'round';
        ctx.lineWidth = u * 0.18;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - u * 2.2);
        ctx.stroke();
        ctx.lineWidth = u * 0.09;
        for (const [hy, dir, len] of [[0.9, -1, 0.7], [1.3, 1, 0.6], [1.75, -1, 0.45]]) {
          ctx.beginPath();
          ctx.moveTo(px, py - u * hy);
          ctx.lineTo(px + dir * u * len, py - u * (hy + 0.4));
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
        if (o.burning) {
          const f = 0.8 + Math.sin(time * 20 + o.phase) * 0.2;
          ctx.fillStyle = C.flame;
          blob(ctx, px, py - u * 1.5, u * 0.55 * f, u * 0.95 * f);
          ctx.fillStyle = C.flameCore;
          blob(ctx, px, py - u * 1.25, u * 0.28 * f, u * 0.5 * f);
        } else if (o.hit) this.stars(px, py - u * 2.4, time);
        break;
      }
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
        if (o.burning) this.fire(px, py - u * 1.4, u * 1.3, time, o.phase);
        else if (o.hit) this.stars(px, py - u * 2.9, time);
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
        if (o.hit && o.touched) {
          // Sprouted a mushroom (the old secret, or the Forager's snack).
          ctx.fillStyle = '#f3ead8';
          ctx.fillRect(px - u * 0.08, py - u * 0.8, u * 0.16, u * 0.4);
          ctx.fillStyle = '#d6452b';
          ctx.beginPath();
          ctx.ellipse(px, py - u * 0.8, u * 0.32, u * 0.22, 0, Math.PI, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          blob(ctx, px - u * 0.13, py - u * 0.88, u * 0.06, u * 0.05);
          blob(ctx, px + u * 0.1, py - u * 0.92, u * 0.05, u * 0.04);
        }
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
    // Trick poses: Spread Eagle stretches out wide, Helicopter spins flat, Backflip flips over (squash through zero).
    const kind = s.trickT > 0 ? s.trickKinds[s.trickKinds.length - 1] : undefined;
    if (kind) {
      const p = 1 - s.trickT / TRICKS[kind].time;
      if (kind === 1) ctx.scale(1 + 0.7 * Math.sin(p * Math.PI), 1 - 0.15 * Math.sin(p * Math.PI));
      else if (kind === 2) ctx.rotate(p * Math.PI * 2);
      else {
        ctx.translate(0, -u * 0.9);
        const c = Math.cos(p * Math.PI * 2);
        ctx.scale(1, (c < 0 ? -1 : 1) * Math.max(0.25, Math.abs(c)));
        ctx.translate(0, u * 0.9);
      }
    }
    // Skis point along the heading: angle 0 = straight down the screen.
    ctx.save();
    ctx.rotate(-s.angle);
    this.skiPair(u, 1, kind === 1);
    ctx.restore();
    this.body(u, s.tuck, s.angle);
    // Burning Man: the skier is a torch, bigger while the flame is full.
    if (g.fuel > 0) this.fire(0, -u * 0.6, u * (0.9 + g.fuel * 1.1), g.time, 0);
    ctx.restore();
  }

  /** A slalom gate: two poles with flags, red and blue alternating; green once made, grey once missed. */
  private gate(gate: Gate, i: number, toX: (x: number) => number, py: number) {
    const { ctx, ppm: u } = this;
    const color = gate.passed ? (gate.made ? '#3aa655' : '#9aa7b2') : i % 2 ? C.gateBlue : C.jacket;
    for (const side of [-1, 1]) {
      const px = toX(gate.x + (side * gate.w) / 2);
      ctx.fillStyle = C.shadow;
      ctx.beginPath();
      ctx.ellipse(px, py, u * 0.2, u * 0.08, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ski;
      ctx.fillRect(px - u * 0.04, py - u * 1.7, u * 0.08, u * 1.7);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(px, py - u * 1.7);
      ctx.lineTo(px - side * u * 0.7, py - u * 1.45);
      ctx.lineTo(px, py - u * 1.2);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Night: darkness everywhere except a cone of light from the skier's headlamp, pointing where they're
   * heading, plus a faint glow around them. Drawn on an offscreen layer: fill it dark, cut the light out
   * (destination-out, feathered with a few widening passes), then lay it over the slope.
   */
  private headlamp(g: Game, px: number, py: number) {
    const { ctx, w, h, ppm: u, dpr } = this;
    const s = g.skier;
    if (!this.dark) this.dark = document.createElement('canvas');
    const layer = this.dark;
    if (layer.width !== this.canvas.width || layer.height !== this.canvas.height) {
      layer.width = this.canvas.width;
      layer.height = this.canvas.height;
    }
    const d = layer.getContext('2d')!;
    d.setTransform(dpr, 0, 0, dpr, 0, 0);
    d.globalCompositeOperation = 'source-over';
    d.clearRect(0, 0, w, h);
    d.fillStyle = 'rgba(8, 14, 30, 0.94)';
    d.fillRect(0, 0, w, h);
    d.globalCompositeOperation = 'destination-out';

    // The lamp sits on the helmet (lifted with the skier in the air) and points along the heading.
    const lift = airborne(s) ? Math.sin((1 - s.air / s.airTotal) * Math.PI) * u * (s.airKind === 'ramp' ? 1.4 : 0.7) : 0;
    const hx = px;
    const hy = py - lift - u * 1.3;
    const dir = s.state === 'crash' ? 0 : s.angle;
    const reach = u * HEADLAMP.reach;
    const light = d.createRadialGradient(hx, hy, u * 0.5, hx, hy, reach);
    light.addColorStop(0, 'rgba(0, 0, 0, 1)');
    light.addColorStop(0.65, 'rgba(0, 0, 0, 0.85)');
    light.addColorStop(1, 'rgba(0, 0, 0, 0)');
    d.fillStyle = light;
    // Feathered edges: the full-strength core, then many slightly wider, faint passes that blend smoothly.
    for (let pass = 0; pass <= 12; pass++) {
      const half = HEADLAMP.halfAngle * (1 + pass * 0.05);
      d.globalAlpha = pass === 0 ? 1 : 0.1;
      d.beginPath();
      d.moveTo(hx, hy);
      for (let i = 0; i <= 12; i++) {
        const a = dir - half + (i / 12) * half * 2;
        d.lineTo(hx + Math.sin(a) * reach, hy + Math.cos(a) * reach);
      }
      d.closePath();
      d.fill();
    }
    // The long throw: a soft beam along the same heading that reaches past the bottom of the screen and never
    // fades out completely, so the far slope (and what's coming) stays dimly visible.
    const far = Math.hypot(w, h) + u * 4;
    const throwLight = d.createRadialGradient(hx, hy, reach * 0.5, hx, hy, far);
    throwLight.addColorStop(0, `rgba(0, 0, 0, ${HEADLAMP.throwNear})`);
    throwLight.addColorStop(1, `rgba(0, 0, 0, ${HEADLAMP.throwFar})`);
    d.fillStyle = throwLight;
    for (let pass = 0; pass <= 8; pass++) {
      const half = HEADLAMP.halfAngle * (1.05 + pass * 0.07);
      d.globalAlpha = pass === 0 ? 1 : 0.12;
      d.beginPath();
      d.moveTo(hx, hy);
      for (let i = 0; i <= 12; i++) {
        const a = dir - half + (i / 12) * half * 2;
        d.lineTo(hx + Math.sin(a) * far, hy + Math.cos(a) * far);
      }
      d.closePath();
      d.fill();
    }
    // A faint glow around the skier, so you can still see yourself (and what's right beside you).
    d.globalAlpha = 0.7;
    const glow = d.createRadialGradient(px, py - u * 0.6, 0, px, py - u * 0.6, u * HEADLAMP.glow);
    glow.addColorStop(0, 'rgba(0, 0, 0, 1)');
    glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    d.fillStyle = glow;
    d.fillRect(px - u * HEADLAMP.glow, py - u * (HEADLAMP.glow + 0.6), u * HEADLAMP.glow * 2, u * HEADLAMP.glow * 2);
    d.globalAlpha = 1;
    d.globalCompositeOperation = 'source-over';

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }

  /** A flickering flame: an outer orange blob and a yellow core, sized `size` (pixels) and centered at its base. */
  private fire(px: number, py: number, size: number, time: number, phase: number) {
    const { ctx } = this;
    const f = 0.85 + Math.sin(time * 18 + phase) * 0.15;
    const sway = Math.sin(time * 7 + phase) * size * 0.08;
    ctx.fillStyle = C.flame;
    blob(ctx, px + sway, py - size * 0.35, size * 0.42 * f, size * 0.75 * f);
    ctx.fillStyle = C.flameCore;
    blob(ctx, px + sway * 0.5, py - size * 0.15, size * 0.22 * f, size * 0.42 * f);
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

  /** How far a yeti's body bounces up this frame (running, or chewing). */
  private yetiBob(g: Game, y: Yeti): number {
    const u = this.ppm;
    if (y.state === 'eating') return Math.abs(Math.sin(g.time * 14)) * u * 0.15;
    const still = y.state === 'holding' || y.stunT > 0;
    return still ? 0 : Math.abs(Math.sin(g.time * 10 + y.dx)) * u * 0.12;
  }

  /**
   * At night: red eyes glowing out of the dark, drawn over the darkness so you see them before the yeti,
   * trailing a fading red streak as it runs.
   */
  private glowingEyes(g: Game, toX: (x: number) => number, toY: (y: number) => number) {
    const { ctx, ppm: u } = this;
    const flicker = 0.85 + Math.sin(g.time * 3) * 0.15;
    for (const y of g.yetis) {
      if (y.state === 'waiting') continue;
      const S = LOOKS[y.look].size;
      // The streak: the last EYE_TRAIL_S seconds of positions, fading and thinning toward the tail.
      const trail = this.eyeTrails.get(y) ?? [];
      const last = trail[trail.length - 1];
      if (!last || last.t !== g.time) trail.push({ x: y.x, y: y.y, t: g.time });
      while (trail.length && (g.time - trail[0].t > EYE_TRAIL_S || trail[0].t > g.time)) trail.shift();
      this.eyeTrails.set(y, trail);
      ctx.save();
      ctx.lineCap = 'butt';
      // Two passes per eye: a soft wide glow, then a thin hot core. Flat ends, so joints don't bead.
      for (const [width, alpha] of [[0.42, 0.16], [0.12, 0.6]] as const) {
        for (const side of [-1, 1]) {
          for (let i = 1; i < trail.length; i++) {
            const a = trail[i - 1];
            const b = trail[i];
            const k = 1 - (g.time - b.t) / EYE_TRAIL_S;
            ctx.strokeStyle = `rgba(255, 40, 30, ${alpha * k * flicker})`;
            ctx.lineWidth = u * width * S * (0.35 + 0.65 * k);
            ctx.beginPath();
            ctx.moveTo(toX(a.x) + side * u * 0.16 * S, toY(a.y) - u * 1.66 * S);
            ctx.lineTo(toX(b.x) + side * u * 0.16 * S, toY(b.y) - u * 1.66 * S);
            ctx.stroke();
          }
        }
      }
      ctx.restore();
      const px = toX(y.x);
      const py = toY(y.y) - this.yetiBob(g, y);
      for (const side of [-1, 1]) {
        const ex = px + side * u * 0.16 * S;
        const ey = py - u * 1.66 * S;
        const glow = ctx.createRadialGradient(ex, ey, 0, ex, ey, u * 0.55 * S);
        glow.addColorStop(0, `rgba(255, 40, 30, ${0.75 * flicker})`);
        glow.addColorStop(1, 'rgba(255, 40, 30, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(ex - u * 0.55 * S, ey - u * 0.55 * S, u * 1.1 * S, u * 1.1 * S);
        ctx.fillStyle = '#ffd6cf';
        ctx.fillRect(ex - u * 0.06 * S, ey - u * 0.04 * S, u * 0.12 * S, u * 0.08 * S);
      }
    }
  }

  private yeti(g: Game, y: Yeti, px: number, py: number) {
    const { ctx, ppm: u } = this;
    const look = LOOKS[y.look];
    const eating = y.state === 'eating';
    const still = y.state === 'holding' || y.stunT > 0;
    const run = still ? 0 : g.time * 10 + y.dx;
    const bob = this.yetiBob(g, y);
    const S = look.size;

    ctx.fillStyle = C.shadow;
    ctx.beginPath();
    ctx.ellipse(px, py, u * 0.9 * S, u * 0.3 * S, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(px, py - bob);
    ctx.scale(S, S);
    // Legs.
    ctx.fillStyle = look.shade;
    const stride = eating ? 0 : Math.sin(run) * u * 0.18;
    ctx.fillRect(-u * 0.42, -u * 0.6 + stride, u * 0.3, u * 0.6 - stride);
    ctx.fillRect(u * 0.12, -u * 0.6 - stride, u * 0.3, u * 0.6 + stride);
    // Shaggy body: a lumpy outline.
    ctx.fillStyle = look.fur;
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
    ctx.strokeStyle = look.shade;
    ctx.lineWidth = Math.max(1, u * 0.05);
    ctx.stroke();
    // Arms up when it's close or eating.
    const reach = eating ? 1 : yetiProximity(g);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * u * 0.62, -u * 1.55);
      ctx.rotate(side * (0.4 + reach * 1.6 + (eating ? Math.sin(g.time * 14) * 0.3 : Math.sin(run) * 0.25)));
      ctx.fillStyle = look.fur;
      ctx.fillRect(-u * 0.14, 0, u * 0.28, u * 0.85);
      ctx.strokeRect(-u * 0.14, 0, u * 0.28, u * 0.85);
      ctx.restore();
    }
    // Face.
    ctx.fillStyle = look.face;
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
    if (y.stunT > 0) this.stars(px, py - u * 3.2, g.time);
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
