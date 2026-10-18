import './style.css';
import { CFG, type Game, type GameEvent, distance, graceFor, multiplier, newGame, step, style, tokens, yetiProximity, yetiSpeedFor } from './engine';
import { SLOT_LABEL, displaced, gearById, modsFor } from './gear';
import { botInput } from './bot';
import { Controls } from './input';
import { Renderer } from './render';
import { randomSeed } from './rng';
import {
  MOUNTAINS,
  type RunState,
  SLOPES_PER_MOUNTAIN,
  TOTAL_SLOPES,
  finishSlope,
  mountainOf,
  newRun,
  pickReward,
  slopeParams,
  slopeSeed,
  totals,
} from './run';

const BEST_KEY = 'whiteout:best';
/** ?bot lets the clean-skier bot drive (demos and testing). */
const BOT = new URLSearchParams(location.search).has('bot');

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
  length: $<HTMLElement>('#length'),
  speed: $<HTMLElement>('#speed'),
  slope: $<HTMLElement>('#slope-no'),
  style: $<HTMLElement>('#style'),
  mult: $<HTMLElement>('#mult'),
};

/** title → intro → playing ⇄ paused → reward → intro … → won / lost. */
type Mode = 'title' | 'intro' | 'playing' | 'paused' | 'reward' | 'won' | 'lost';
let mode: Mode = 'title';
let run: RunState = newRun(initialSeed());
let game: Game = slopeGame(run);
let acc = 0;
let last = 0;

const renderer = new Renderer(canvas);
const controls = new Controls(app, () => game.skier.angle, onKey);

function initialSeed(): number {
  const param = new URLSearchParams(location.search).get('seed');
  const n = param === null ? NaN : Number(param);
  return Number.isFinite(n) ? n >>> 0 : randomSeed();
}

function slopeGame(r: RunState): Game {
  return newGame(slopeSeed(r), { params: slopeParams(r.slope), mods: modsFor(r.gear) });
}

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(slopes: number) {
  try {
    localStorage.setItem(BEST_KEY, String(slopes));
  } catch {
    // Storage blocked: the best just won't persist.
  }
}

// ---------- Flow ----------

function startRun(seed: number) {
  run = newRun(seed);
  toIntro();
}

function toIntro() {
  game = slopeGame(run);
  renderer.reset(game);
  controls.reset();
  acc = 0;
  toasts.replaceChildren();
  setMode('intro');
}

function dropIn() {
  setMode('playing');
}

function slopeOver() {
  run = finishSlope(run, {
    slope: run.slope,
    cleared: game.result === 'cleared',
    distance: distance(game),
    style: style(game),
    tokens: tokens(game),
    time: game.time,
  });
  const reached = run.status === 'won' ? TOTAL_SLOPES : run.slope;
  if (reached > loadBest()) saveBest(reached);
  setMode(run.status === 'reward' ? 'reward' : run.status === 'won' ? 'won' : 'lost');
}

function choose(id: string | null) {
  run = pickReward(run, id);
  toIntro();
}

function setMode(next: Mode) {
  mode = next;
  overlay.hidden = mode === 'playing';
  ({ title: showTitle, intro: showIntro, paused: showPaused, reward: showReward, won: showWon, lost: showLost, playing: () => {} })[mode]();
}

function pause() {
  if (mode === 'playing') setMode('paused');
}

function onKey(key: string) {
  if (key === 'Escape' || key === 'p' || key === 'F3') {
    if (mode === 'playing') pause();
    else if (mode === 'paused') setMode('playing');
  } else if (key === 'Enter') {
    if (mode === 'title') startRun(run.seed);
    else if (mode === 'intro') dropIn();
    else if (mode === 'paused') setMode('playing');
    else if (mode === 'won' || mode === 'lost') startRun(randomSeed());
  } else if (mode === 'reward' && ['1', '2', '3'].includes(key)) {
    const id = run.offer[Number(key) - 1];
    if (id) choose(id);
  }
}

$<HTMLButtonElement>('#pause').addEventListener('click', pause);
document.addEventListener('visibilitychange', () => document.hidden && pause());
window.addEventListener('resize', () => renderer.resize());

// ---------- Cards ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const rating = (d: number) => (d < 3.5 ? 'green' : d < 6 ? 'blue' : 'black');
const RATING_NAME = { green: 'Green circle', blue: 'Blue square', black: 'Black diamond' };

function gearChips(ids: string[]): string {
  if (!ids.length) return '<p class="meta">No Gear yet. You get a pick after every slope.</p>';
  return `<ul class="chips">${ids.map((id) => `<li>${esc(gearById(id).name)}</li>`).join('')}</ul>`;
}

function showTitle() {
  const best = loadBest();
  card.innerHTML = `
    <span class="eyebrow">M1 · prototype</span>
    <h1>Whiteout</h1>
    <p>Get down three mountains, four slopes each. After a few seconds on every slope something starts chasing you. Cruising won't outrun it. Tucking will, if you don't crash. Pick new Gear after every slope.</p>
    <dl class="controls">
      <dt>Steer</dt><dd>Drag left / right · ← →</dd>
      <dt>Tuck (faster)</dt><dd>Hold your thumb low · ↓</dd>
      <dt>Slow down</dt><dd>Drag up · ↑</dd>
      <dt>Jump / trick</dt><dd>Flick up or tap · Space. Again in the air for a trick.</dd>
    </dl>
    <div class="actions"><button class="btn" id="go">New run</button></div>
    <span class="meta">Seed ${run.seed}${best ? ` · Best: ${best} of ${TOTAL_SLOPES} slopes` : ''}</span>`;
  $<HTMLButtonElement>('#go').addEventListener('click', () => startRun(run.seed));
}

function showIntro() {
  const p = slopeParams(run.slope);
  const m = mountainOf(run.slope);
  const k = run.slope % SLOPES_PER_MOUNTAIN;
  const r = rating(p.difficulty);
  card.innerHTML = `
    <span class="eyebrow">Mountain ${m + 1} · ${esc(MOUNTAINS[m].name)}</span>
    <h2>Slope ${k + 1} of ${SLOPES_PER_MOUNTAIN}</h2>
    ${k === 0 ? `<p>${esc(MOUNTAINS[m].blurb)}</p>` : ''}
    <div class="results">
      <div><b>${p.length}</b><span>meters</span></div>
      <div><b class="sign"><span class="trail" data-rating="${r}"></span></b><span>${RATING_NAME[r]}</span></div>
      <div><b>${+graceFor(game).toFixed(1)}s</b><span>until the yeti</span></div>
    </div>
    ${gearChips(run.gear)}
    <div class="actions"><button class="btn" id="drop">Drop in</button></div>
    <span class="meta">◆ ${run.tokens} Tokens · Yeti ${yetiSpeedFor(game).toFixed(1)} m/s · Seed ${run.seed}</span>`;
  $<HTMLButtonElement>('#drop').addEventListener('click', dropIn);
}

function showPaused() {
  card.innerHTML = `
    <span class="eyebrow">Paused</span>
    <h2>Catch your breath</h2>
    <p>The yeti is paused too.</p>
    ${gearChips(run.gear)}
    <div class="actions">
      <button class="btn" id="resume">Resume</button>
      <button class="btn ghost" id="restart">New run</button>
    </div>`;
  $<HTMLButtonElement>('#resume').addEventListener('click', () => setMode('playing'));
  $<HTMLButtonElement>('#restart').addEventListener('click', () => startRun(randomSeed()));
}

function showReward() {
  const res = run.results[run.results.length - 1];
  const offers = run.offer.map((id, i) => {
    const g = gearById(id);
    const out = displaced(run.gear, id);
    return `
      <button class="gear" data-id="${g.id}" aria-keyshortcuts="${i + 1}">
        <span class="gear-top"><b>${esc(g.name)}</b><span class="tag ${g.rarity}">${SLOT_LABEL[g.slot]} · ${g.rarity}</span></span>
        <span class="gear-text">${esc(g.text)}</span>
        ${out ? `<span class="gear-note">Replaces ${esc(gearById(out).name)}</span>` : ''}
      </button>`;
  });
  card.innerHTML = `
    <span class="eyebrow">Slope ${run.slope + 1} of ${TOTAL_SLOPES} cleared</span>
    <h2>Pick your Gear</h2>
    <div class="results">
      <div><b>${res.style.toLocaleString()}</b><span>style</span></div>
      <div><b>+${res.tokens}</b><span>tokens</span></div>
      <div><b>${formatTime(res.time)}</b><span>time</span></div>
    </div>
    <div class="offers">${offers.join('')}</div>
    <div class="actions"><button class="btn ghost" id="skip">Skip</button></div>
    <span class="meta">◆ ${run.tokens} Tokens banked for the Lodge (coming in M2)</span>`;
  card.querySelectorAll<HTMLButtonElement>('.gear').forEach((b) => b.addEventListener('click', () => choose(b.dataset.id!)));
  $<HTMLButtonElement>('#skip').addEventListener('click', () => choose(null));
}

function runSummary(): string {
  const t = totals(run);
  return `
    <div class="results">
      <div><b>${t.distance.toLocaleString()}</b><span>meters</span></div>
      <div><b>${t.style.toLocaleString()}</b><span>style</span></div>
      <div><b>${formatTime(t.time)}</b><span>time</span></div>
    </div>
    ${gearChips(run.gear)}`;
}

function showWon() {
  card.innerHTML = `
    <span class="eyebrow">All ${TOTAL_SLOPES} slopes</span>
    <h2>You made the last bus</h2>
    <p>Three mountains, and nothing ate you.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">Same seed</button>
    </div>
    <span class="meta">◆ ${run.tokens} Tokens · Seed ${run.seed}</span>`;
  $<HTMLButtonElement>('#again').addEventListener('click', () => startRun(randomSeed()));
  $<HTMLButtonElement>('#same').addEventListener('click', () => startRun(run.seed));
}

function showLost() {
  const m = mountainOf(run.slope);
  const best = loadBest();
  card.innerHTML = `
    <span class="eyebrow">${run.slope >= best && run.slope > 0 ? 'New best' : best ? `Best: ${best} of ${TOTAL_SLOPES} slopes` : 'Run over'}</span>
    <h2>Eaten on slope ${run.slope + 1}</h2>
    <p>${esc(MOUNTAINS[m].name)}, ${distance(game).toLocaleString()} of ${slopeParams(run.slope).length} m. You cleared ${run.slope} of ${TOTAL_SLOPES} slopes.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">Same seed</button>
    </div>
    <span class="meta">Seed ${run.seed}</span>`;
  $<HTMLButtonElement>('#again').addEventListener('click', () => startRun(randomSeed()));
  $<HTMLButtonElement>('#same').addEventListener('click', () => startRun(run.seed));
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
    case 'bounce':
      renderer.bump(5);
      toast('Boing!');
      break;
    case 'land':
      toast(`${TRICK_NAMES[e.tricks]} +${Math.round(e.style)}`);
      break;
    case 'nearMiss':
      toast(`Close one +${Math.round(e.style)}`);
      break;
    case 'burn':
      toast('Torched it');
      break;
    case 'forage':
      toast('Mushroom +1 ◆');
      break;
    case 'goodBoy':
      toast('Good boy!');
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
    case 'finish':
      navigator.vibrate?.(30);
      break;
    case 'over':
      slopeOver();
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
  hud.dist.textContent = distance(game).toLocaleString();
  hud.length.textContent = `/${game.params.length} m`;
  hud.speed.textContent = String(Math.round(game.skier.speed));
  hud.slope.textContent = `${mountainOf(run.slope) + 1}-${(run.slope % SLOPES_PER_MOUNTAIN) + 1}`;
  hud.style.textContent = style(game).toLocaleString();
  const mult = multiplier(game);
  hud.mult.textContent = mult > 1 ? `×${mult % 1 ? mult.toFixed(1) : mult}` : '';
  trail.dataset.rating = rating(game.params.difficulty);
  const p = yetiProximity(game);
  meterFill.style.width = `${Math.round(p * 100)}%`;
  meterFill.classList.toggle('close', p > 0.6);
  meter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  meterLabel.textContent =
    game.yeti.state === 'waiting'
      ? `quiet · ${Math.max(0, Math.ceil(graceFor(game) - game.time))}s`
      : game.yeti.stunT > 0 ? 'staggered' : p > 0.75 ? 'right behind you' : p > 0.4 ? 'closing' : 'yeti';
  frost.style.opacity = String(Math.max(0, (p - 0.5) * 2));
}

// ---------- Loop ----------

function frame(now: number) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  if (mode === 'playing') {
    acc += dt;
    while (acc >= CFG.dt) {
      step(game, BOT ? botInput(game) : controls.read());
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
