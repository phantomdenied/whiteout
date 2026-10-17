import './style.css';
import { CFG, type Game, type GameEvent, distance, multiplier, newGame, step, style, yetiProximity } from './engine';
import { Controls } from './input';
import { Renderer } from './render';
import { randomSeed } from './rng';

const BEST_KEY = 'whiteout:best';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const app = $<HTMLDivElement>('#app');
const canvas = $<HTMLCanvasElement>('#slope');
const frost = $<HTMLDivElement>('#frost');
const overlay = $<HTMLElement>('#overlay');
const card = $<HTMLDivElement>('#card');
const toasts = $<HTMLDivElement>('#toasts');
const meter = $<HTMLDivElement>('.meter');
const meterFill = $<HTMLDivElement>('#meter-fill');
const meterLabel = $<HTMLSpanElement>('#meter-label');
const trail = $<HTMLSpanElement>('#trail');
const hud = {
  dist: $<HTMLElement>('#dist'),
  speed: $<HTMLElement>('#speed'),
  time: $<HTMLElement>('#time'),
  style: $<HTMLElement>('#style'),
  mult: $<HTMLElement>('#mult'),
};

type Mode = 'title' | 'playing' | 'paused' | 'over';
let mode: Mode = 'title';
let game: Game = newGame(initialSeed());
let acc = 0;
let last = 0;

const renderer = new Renderer(canvas);
const controls = new Controls(app, () => game.skier.angle, onKey);

function initialSeed(): number {
  const param = new URLSearchParams(location.search).get('seed');
  const n = param === null ? NaN : Number(param);
  return Number.isFinite(n) ? n >>> 0 : randomSeed();
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(m: number) {
  try {
    localStorage.setItem(BEST_KEY, String(m));
  } catch {
    // Storage blocked: the best distance just won't persist.
  }
}

// ---------- Flow ----------

function start(seed: number) {
  game = newGame(seed);
  renderer.reset(game);
  controls.reset();
  acc = 0;
  toasts.replaceChildren();
  setMode('playing');
}

function setMode(next: Mode) {
  mode = next;
  overlay.hidden = mode === 'playing';
  if (mode === 'title') showTitle();
  if (mode === 'paused') showPaused();
  if (mode === 'over') showOver();
}

function pause() {
  if (mode === 'playing') setMode('paused');
}

function onKey(key: string) {
  if (key === 'Escape' || key === 'p' || key === 'F3') {
    if (mode === 'playing') pause();
    else if (mode === 'paused') setMode('playing');
  } else if (key === 'Enter') {
    if (mode === 'title') start(game.seed);
    else if (mode === 'paused') setMode('playing');
    else if (mode === 'over') start(randomSeed());
  }
}

$<HTMLButtonElement>('#pause').addEventListener('click', pause);
document.addEventListener('visibilitychange', () => document.hidden && pause());
window.addEventListener('resize', () => renderer.resize());

// ---------- Cards ----------

function showTitle() {
  card.innerHTML = `
    <span class="eyebrow">M0 · feel prototype</span>
    <h1>Whiteout</h1>
    <p>Ski as far as you can. After ${CFG.yeti.grace} seconds something starts chasing you. Cruising won't outrun it. Tucking will, if you don't crash.</p>
    <dl class="controls">
      <dt>Steer</dt><dd>Drag left / right · ← →</dd>
      <dt>Tuck (faster)</dt><dd>Hold your thumb low · ↓</dd>
      <dt>Slow down</dt><dd>Drag up · ↑</dd>
      <dt>Jump / trick</dt><dd>Flick up or tap · Space. Again in the air for a trick.</dd>
    </dl>
    <div class="actions"><button class="btn" id="go">Start</button></div>
    <span class="meta">Seed ${game.seed}</span>`;
  $<HTMLButtonElement>('#go').addEventListener('click', () => start(game.seed));
}

function showPaused() {
  card.innerHTML = `
    <span class="eyebrow">Paused</span>
    <h2>Catch your breath</h2>
    <p>The yeti is paused too.</p>
    <div class="actions">
      <button class="btn" id="resume">Resume</button>
      <button class="btn ghost" id="restart">Restart</button>
    </div>`;
  $<HTMLButtonElement>('#resume').addEventListener('click', () => setMode('playing'));
  $<HTMLButtonElement>('#restart').addEventListener('click', () => start(randomSeed()));
}

function showOver() {
  const d = distance(game);
  const prevBest = loadBest();
  if (d > prevBest) saveBest(d);
  card.innerHTML = `
    <span class="eyebrow">${d > prevBest ? 'New best' : `Best ${prevBest.toLocaleString()} m`}</span>
    <h2>Eaten at ${d.toLocaleString()} m</h2>
    <div class="results">
      <div><b>${d.toLocaleString()}</b><span>meters</span></div>
      <div><b>${style(game).toLocaleString()}</b><span>style</span></div>
      <div><b>${formatTime(game.time)}</b><span>time</span></div>
    </div>
    <div class="actions">
      <button class="btn" id="again">Ski again</button>
      <button class="btn ghost" id="same">Same slope</button>
    </div>
    <span class="meta">Seed ${game.seed}</span>`;
  $<HTMLButtonElement>('#again').addEventListener('click', () => start(randomSeed()));
  $<HTMLButtonElement>('#same').addEventListener('click', () => start(game.seed));
}

// ---------- Events → feedback ----------

function toast(text: string, warn = false) {
  const el = document.createElement('div');
  el.className = warn ? 'toast warn' : 'toast';
  el.textContent = text;
  toasts.append(el);
  while (toasts.children.length > 3) toasts.firstElementChild!.remove();
  el.addEventListener('animationend', () => el.remove());
}

const TRICK_NAMES = ['', 'Spread eagle', 'Double', 'Triple daffy'];

function handle(e: GameEvent) {
  switch (e.type) {
    case 'crash':
      renderer.bump(10);
      navigator.vibrate?.(60);
      if (e.kind === 'botched') toast('Botched landing', true);
      break;
    case 'land':
      toast(`${TRICK_NAMES[e.tricks]} +${Math.round(e.style)}`);
      break;
    case 'nearMiss':
      toast(`Close one +${Math.round(e.style)}`);
      break;
    case 'moguls':
      renderer.bump(3);
      break;
    case 'yetiSpawn':
      toast('Something is coming', true);
      renderer.bump(6);
      navigator.vibrate?.([40, 60, 40]);
      break;
    case 'eaten':
      renderer.bump(14);
      navigator.vibrate?.([80, 40, 200]);
      break;
    case 'over':
      setMode('over');
      break;
  }
}

// ---------- HUD ----------

function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateHud() {
  const d = distance(game);
  hud.dist.textContent = d.toLocaleString();
  hud.speed.textContent = String(Math.round(game.skier.speed));
  hud.time.textContent = formatTime(game.time);
  hud.style.textContent = style(game).toLocaleString();
  const mult = multiplier(game);
  hud.mult.textContent = mult > 1 ? `×${mult % 1 ? mult.toFixed(1) : mult}` : '';
  // Density rises with distance, so the trail sign does too.
  trail.dataset.rating = d < 500 ? 'green' : d < 1200 ? 'blue' : 'black';
  const p = yetiProximity(game);
  meterFill.style.width = `${Math.round(p * 100)}%`;
  meterFill.classList.toggle('close', p > 0.6);
  meter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  meterLabel.textContent =
    game.yeti.state === 'waiting' ? `quiet · ${Math.max(0, Math.ceil(CFG.yeti.grace - game.time))}s` : p > 0.75 ? 'right behind you' : p > 0.4 ? 'closing' : 'yeti';
  frost.style.opacity = String(Math.max(0, (p - 0.5) * 2));
}

// ---------- Loop ----------

function frame(now: number) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (mode === 'playing') {
    acc += dt;
    while (acc >= CFG.dt) {
      step(game, controls.read());
      acc -= CFG.dt;
      for (const e of game.events) handle(e);
      game.events.length = 0;
      if (mode !== 'playing') break;
    }
  }
  renderer.draw(game, mode === 'playing' ? dt : 0);
  updateHud();
  requestAnimationFrame(frame);
}

setMode('title');
requestAnimationFrame(frame);
