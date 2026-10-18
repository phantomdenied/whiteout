import './style.css';
import { botInput } from './bot';
import { BOSSES, CFG, type Game, type GameEvent, distance, graceFor, multiplier, newGame, step, style, tokens, yetiProximity, yetiSpeedFor } from './engine';
import { SLOT_LABEL, SNACKS, type SnackId, displaced, gearById, modsFor } from './gear';
import { Controls } from './input';
import { Renderer } from './render';
import { randomSeed } from './rng';
import {
  MOUNTAINS,
  type OfferItem,
  type RunState,
  SLOPES_PER_MOUNTAIN,
  TOTAL_DESCENTS,
  buyGear,
  buySnack,
  descentsBefore,
  deserialize,
  finishDescent,
  leaveLodge,
  mountainOf,
  newRun,
  paramsFor,
  pickReward,
  price,
  reroll,
  rerollPrice,
  sellGear,
  sellPrice,
  serialize,
  slopeInMountain,
  slopeSeed,
  snackSlots,
  startAt,
  stageKind,
  totals,
} from './run';

const BEST_KEY = 'whiteout:best';
const SAVE_KEY = 'whiteout:run';
/** ?bot lets the clean-skier bot drive (demos and testing). */
const BOT = new URLSearchParams(location.search).has('bot');
/** ?stage=N starts runs at stage N (0-based), for playtesting bosses and Lodges. */
const START_STAGE = Number(new URLSearchParams(location.search).get('stage')) || 0;

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
const snackBar = $<HTMLDivElement>('#snacks');
const hud = {
  dist: $<HTMLElement>('#dist'),
  length: $<HTMLElement>('#length'),
  speed: $<HTMLElement>('#speed'),
  slope: $<HTMLElement>('#slope-no'),
  style: $<HTMLElement>('#style'),
  mult: $<HTMLElement>('#mult'),
};

/** title → intro → playing ⇄ paused → reward → (lodge) → intro … → won / lost. */
type Mode = 'title' | 'intro' | 'playing' | 'paused' | 'reward' | 'lodge' | 'won' | 'lost';
let mode: Mode = 'title';
let run: RunState = newRun(initialSeed());
let game: Game = stageGame(run);
let acc = 0;
let last = 0;
let shownSnacks = '';
let death: 'Eaten' | 'Buried' = 'Eaten';

const renderer = new Renderer(canvas);
const controls = new Controls(app, () => game.skier.angle, onKey);

function initialSeed(): number {
  const param = new URLSearchParams(location.search).get('seed');
  const n = param === null ? NaN : Number(param);
  return Number.isFinite(n) ? n >>> 0 : randomSeed();
}

function stageGame(r: RunState): Game {
  return newGame(slopeSeed(r), { params: paramsFor(r.stage), mods: modsFor(r.gear), snacks: r.snacks });
}

// ---------- Storage (every read and write may throw in a locked-down browser) ----------

function load(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: progress just won't persist.
  }
}

const loadBest = () => Number(load(BEST_KEY)) || 0;
const saveRun = () => store(SAVE_KEY, run.status === 'won' || run.status === 'lost' ? null : serialize(run));

// ---------- Flow ----------

function startRun(seed: number) {
  run = startAt(seed, START_STAGE);
  if (run.status === 'lodge') setMode('lodge');
  else toIntro();
}

function resume(saved: RunState) {
  run = saved;
  if (run.status === 'skiing') toIntro();
  else setMode(run.status === 'lodge' ? 'lodge' : 'reward');
}

function toIntro() {
  game = stageGame(run);
  renderer.reset(game);
  controls.reset();
  acc = 0;
  toasts.replaceChildren();
  setMode('intro');
}

function descentOver() {
  run = finishDescent(
    run,
    { stage: run.stage, cleared: game.result === 'cleared', distance: distance(game), style: style(game), tokens: tokens(game), time: game.time },
    game.snacks,
  );
  const reached = run.status === 'won' ? TOTAL_DESCENTS : descentsBefore(run.stage) + (run.status === 'reward' ? 1 : 0);
  if (reached > loadBest()) store(BEST_KEY, String(reached));
  setMode(run.status === 'reward' ? 'reward' : run.status === 'won' ? 'won' : 'lost');
}

function afterChoice(next: RunState) {
  run = next;
  if (run.status === 'lodge') setMode('lodge');
  else toIntro();
}

function setMode(next: Mode) {
  mode = next;
  overlay.hidden = mode === 'playing';
  if (mode !== 'playing' && mode !== 'paused') saveRun();
  ({ title: showTitle, intro: showIntro, paused: showPaused, reward: showReward, lodge: showLodge, won: showWon, lost: showLost, playing: () => {} })[mode]();
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
    else if (mode === 'intro' || mode === 'paused') setMode('playing');
    else if (mode === 'lodge') afterChoice(leaveLodge(run));
    else if (mode === 'won' || mode === 'lost') startRun(randomSeed());
  } else if (['1', '2', '3', '4'].includes(key)) {
    const i = Number(key) - 1;
    if (mode === 'playing') controls.queueSnack(i);
    else if (mode === 'reward' && run.offer[i]) afterChoice(pickReward(run, i));
  }
}

$<HTMLButtonElement>('#pause').addEventListener('click', pause);
snackBar.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-i]');
  if (b && mode === 'playing') controls.queueSnack(Number(b.dataset.i));
});
document.addEventListener('visibilitychange', () => document.hidden && pause());
window.addEventListener('resize', () => renderer.resize());

// ---------- Cards ----------

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const rating = (d: number) => (d < 3.5 ? 'green' : d < 6 ? 'blue' : 'black');
const RATING_NAME = { green: 'Green circle', blue: 'Blue square', black: 'Black diamond' };

function on(sel: string, fn: () => void) {
  card.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => b.addEventListener('click', fn));
}

function kit(): string {
  const gear = run.gear.length
    ? `<ul class="chips">${run.gear.map((id) => `<li>${esc(gearById(id).name)}</li>`).join('')}</ul>`
    : '<p class="meta">No Gear yet. You get a pick after every descent.</p>';
  const slots = snackSlots(run);
  const snacks = `<ul class="chips snacks-chips">${Array.from({ length: slots }, (_, i) => {
    const id = run.snacks[i];
    return id ? `<li>${esc(SNACKS[id].short)}</li>` : '<li class="empty">Empty</li>';
  }).join('')}</ul>`;
  return `<div class="kit"><span class="label">Gear</span>${gear}<span class="label">Snacks</span>${snacks}</div>`;
}

function showTitle() {
  const best = loadBest();
  const saved = deserialize(load(SAVE_KEY));
  card.innerHTML = `
    <span class="eyebrow">M2 · prototype</span>
    <h1>Whiteout</h1>
    <p>Three mountains. Four slopes, two Lodges and a Summit boss on each. Something chases you down every slope. Cruising won't outrun it. Tucking will, if you don't crash.</p>
    <dl class="controls">
      <dt>Steer</dt><dd>Drag left / right · ← →</dd>
      <dt>Tuck (faster)</dt><dd>Hold your thumb low · ↓</dd>
      <dt>Slow down</dt><dd>Drag up · ↑</dd>
      <dt>Jump / trick</dt><dd>Flick up or tap · Space. Again in the air for a trick.</dd>
      <dt>Snack</dt><dd>Tap it, top right · 1–3</dd>
    </dl>
    <div class="actions">
      ${saved ? '<button class="btn" id="continue">Continue</button>' : ''}
      <button class="btn${saved ? ' ghost' : ''}" id="go">New run</button>
    </div>
    <span class="meta">${saved ? `Saved run: ${esc(MOUNTAINS[mountainOf(saved.stage)].name)}, ◆ ${saved.tokens} · ` : ''}Seed ${run.seed}${best ? ` · Best: ${best} of ${TOTAL_DESCENTS} descents` : ''}</span>`;
  on('#go', () => startRun(saved ? randomSeed() : run.seed));
  if (saved) on('#continue', () => resume(saved));
}

function showIntro() {
  const p = paramsFor(run.stage);
  const m = mountainOf(run.stage);
  const r = rating(p.difficulty);
  if (p.boss) {
    const boss = BOSSES[p.boss];
    card.innerHTML = `
      <span class="eyebrow">Mountain ${m + 1} · Summit</span>
      <h2>${esc(boss.name)}</h2>
      <p>${esc(boss.twist)}</p>
      <div class="results">
        <div><b>${p.length}</b><span>meters</span></div>
        <div><b>${yetiSpeedFor(game).toFixed(1)}</b><span>m/s</span></div>
        <div><b>${+graceFor(game).toFixed(1)}s</b><span>head start</span></div>
      </div>
      ${kit()}
      <div class="actions"><button class="btn" id="drop">Drop in</button></div>
      <span class="meta">◆ ${run.tokens} Tokens · Seed ${run.seed}</span>`;
  } else {
    const k = slopeInMountain(run.stage);
    card.innerHTML = `
      <span class="eyebrow">Mountain ${m + 1} · ${esc(MOUNTAINS[m].name)}</span>
      <h2>Slope ${k + 1} of ${SLOPES_PER_MOUNTAIN}</h2>
      ${k === 0 ? `<p>${esc(MOUNTAINS[m].blurb)}</p>` : ''}
      <div class="results">
        <div><b>${p.length}</b><span>meters</span></div>
        <div><b class="sign"><span class="trail" data-rating="${r}"></span></b><span>${RATING_NAME[r]}</span></div>
        <div><b>${+graceFor(game).toFixed(1)}s</b><span>until the yeti</span></div>
      </div>
      ${kit()}
      <div class="actions"><button class="btn" id="drop">Drop in</button></div>
      <span class="meta">◆ ${run.tokens} Tokens · Yeti ${yetiSpeedFor(game).toFixed(1)} m/s · Seed ${run.seed}</span>`;
  }
  on('#drop', () => setMode('playing'));
}

function showPaused() {
  card.innerHTML = `
    <span class="eyebrow">Paused</span>
    <h2>Catch your breath</h2>
    <p>The yeti is paused too.</p>
    ${kit()}
    <div class="actions">
      <button class="btn" id="resume">Resume</button>
      <button class="btn ghost" id="restart">New run</button>
    </div>`;
  on('#resume', () => setMode('playing'));
  on('#restart', () => startRun(randomSeed()));
}

function gearButton(id: string, attrs: string, extra = ''): string {
  const g = gearById(id);
  const out = displaced(run.gear, id);
  return `
    <button class="gear" ${attrs}>
      <span class="gear-top"><b>${esc(g.name)}</b><span class="tag ${g.rarity}">${SLOT_LABEL[g.slot]} · ${g.rarity}</span></span>
      <span class="gear-text">${esc(g.text)}</span>
      ${out ? `<span class="gear-note">Replaces ${esc(gearById(out).name)}</span>` : ''}${extra}
    </button>`;
}

function offerButton(item: OfferItem, i: number): string {
  const key = `data-i="${i}" aria-keyshortcuts="${i + 1}"`;
  if (item.kind === 'gear') return gearButton(item.id, key);
  if (item.kind === 'tokens') {
    return `<button class="gear" ${key}><span class="gear-top"><b>◆ ${item.n} Tokens</b><span class="tag">Tokens</span></span><span class="gear-text">Spend them at the next Lodge.</span></button>`;
  }
  const s = SNACKS[item.id];
  const full = run.snacks.length >= snackSlots(run);
  return `<button class="gear" ${key}><span class="gear-top"><b>${esc(s.name)}</b><span class="tag">Snack</span></span><span class="gear-text">${esc(s.text)}</span>${full ? '<span class="gear-note">Your Snack slots are full</span>' : ''}</button>`;
}

function showReward() {
  const res = run.results[run.results.length - 1];
  const summit = stageKind(run.stage) === 'summit';
  card.innerHTML = `
    <span class="eyebrow">${summit ? `${esc(BOSSES[MOUNTAINS[mountainOf(run.stage)].boss].name)} beaten` : `Descent ${descentsBefore(run.stage) + 1} of ${TOTAL_DESCENTS} cleared`}</span>
    <h2>Pick a reward</h2>
    <div class="results">
      <div><b>${res.style.toLocaleString()}</b><span>style</span></div>
      <div><b>+${res.tokens}</b><span>tokens</span></div>
      <div><b>${formatTime(res.time)}</b><span>time</span></div>
    </div>
    <div class="offers">${run.offer.map(offerButton).join('')}</div>
    <div class="actions"><button class="btn ghost" id="skip">Skip</button></div>
    <span class="meta">◆ ${run.tokens} Tokens</span>`;
  card.querySelectorAll<HTMLButtonElement>('.offers .gear').forEach((b) => b.addEventListener('click', () => afterChoice(pickReward(run, Number(b.dataset.i)))));
  on('#skip', () => afterChoice(pickReward(run, null)));
}

function showLodge() {
  const shop = run.shop!;
  const full = run.snacks.length >= snackSlots(run);
  const gearForSale = shop.gear.map((id, i) => {
    if (!id) return '<div class="sold">Sold</div>';
    const cost = price(run, { kind: 'gear', id });
    return gearButton(id, `data-buy-gear="${i}" ${run.tokens < cost ? 'disabled' : ''}`, `<span class="price">◆ ${cost}</span>`);
  });
  const snacksForSale = shop.snacks.map((id, i) => {
    if (!id) return '<div class="sold">Sold</div>';
    const s = SNACKS[id];
    const cost = price(run, { kind: 'snack', id });
    const off = run.tokens < cost || full;
    return `<button class="gear small" data-buy-snack="${i}" ${off ? 'disabled' : ''}><span class="gear-top"><b>${esc(s.short)}</b><span class="price">◆ ${cost}</span></span><span class="gear-text">${esc(s.text)}</span></button>`;
  });
  const selling = run.gear.map((id) => `<button class="chip-btn" data-sell="${id}">${esc(gearById(id).name)} <span>+◆ ${sellPrice(id)}</span></button>`);
  card.innerHTML = `
    <span class="eyebrow">Mountain ${mountainOf(run.stage) + 1} · The Lodge</span>
    <h2>◆ ${run.tokens} Tokens</h2>
    ${shop.freebies.length ? `<p>Your Lunchbox had ${shop.freebies.map((id) => esc(SNACKS[id].name)).join(' and ')} in it.</p>` : ''}
    <span class="label">Gear</span>
    <div class="offers">${gearForSale.join('')}</div>
    <span class="label">Snacks${full ? ' · your slots are full' : ''}</span>
    <div class="offers two">${snacksForSale.join('')}</div>
    ${run.gear.length ? `<span class="label">Sell Gear</span><div class="sell">${selling.join('')}</div>` : ''}
    <div class="actions">
      <button class="btn ghost" id="reroll" ${run.tokens < rerollPrice(run) ? 'disabled' : ''}>Reroll ◆ ${rerollPrice(run)}</button>
      <button class="btn" id="leave">Back out</button>
    </div>
    ${kit()}`;
  const refresh = (next: RunState) => {
    run = next;
    setMode('lodge');
  };
  card.querySelectorAll<HTMLButtonElement>('[data-buy-gear]').forEach((b) => b.addEventListener('click', () => refresh(buyGear(run, Number(b.dataset.buyGear)))));
  card.querySelectorAll<HTMLButtonElement>('[data-buy-snack]').forEach((b) => b.addEventListener('click', () => refresh(buySnack(run, Number(b.dataset.buySnack)))));
  card.querySelectorAll<HTMLButtonElement>('[data-sell]').forEach((b) => b.addEventListener('click', () => refresh(sellGear(run, b.dataset.sell!))));
  on('#reroll', () => refresh(reroll(run)));
  on('#leave', () => afterChoice(leaveLodge(run)));
}

function runSummary(): string {
  const t = totals(run);
  return `
    <div class="results">
      <div><b>${t.distance.toLocaleString()}</b><span>meters</span></div>
      <div><b>${t.style.toLocaleString()}</b><span>style</span></div>
      <div><b>${formatTime(t.time)}</b><span>time</span></div>
    </div>
    ${kit()}`;
}

function showWon() {
  card.innerHTML = `
    <span class="eyebrow">All three Summits</span>
    <h2>You made the last bus</h2>
    <p>Three mountains, three bosses, and nothing ate you.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">Same seed</button>
    </div>
    <span class="meta">◆ ${run.tokens} Tokens · Seed ${run.seed}</span>`;
  on('#again', () => startRun(randomSeed()));
  on('#same', () => startRun(run.seed));
}

function showLost() {
  const m = mountainOf(run.stage);
  const done = descentsBefore(run.stage);
  const best = loadBest();
  const p = paramsFor(run.stage);
  const where = p.boss ? `the Summit of ${MOUNTAINS[m].name}` : `${MOUNTAINS[m].name}`;
  card.innerHTML = `
    <span class="eyebrow">${done >= best && done > 0 ? 'New best' : best ? `Best: ${best} of ${TOTAL_DESCENTS} descents` : 'Run over'}</span>
    <h2>${death} on ${p.boss ? 'the Summit' : `slope ${slopeInMountain(run.stage) + 1}`}</h2>
    <p>${esc(where)}, ${distance(game).toLocaleString()} of ${p.length} m. You cleared ${done} of ${TOTAL_DESCENTS} descents.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">Same seed</button>
    </div>
    <span class="meta">Seed ${run.seed}</span>`;
  on('#again', () => startRun(randomSeed()));
  on('#same', () => startRun(run.seed));
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
const SNACK_TOAST: Record<SnackId, string> = { cocoa: 'Cocoa!', fish: 'Fish thrown', map: 'Map out', warmer: 'Warm hands' };

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
    case 'safeLanding':
      toast('Air Bag');
      break;
    case 'nearMiss':
      toast(`${e.dog ? 'Good dodge' : 'Close one'} +${Math.round(e.style)}`);
      break;
    case 'burn':
      toast('Torched it');
      break;
    case 'goodBoy':
      toast('Good boy!');
      break;
    case 'token':
      toast(`${e.why} +${e.n} ◆`);
      break;
    case 'snack':
      toast(SNACK_TOAST[e.id]);
      break;
    case 'moguls':
      renderer.bump(3);
      break;
    case 'yetiSpawn':
      if (!game.params.boss) toast('Something is coming', true);
      else if (game.yetis.every((y) => y.state !== 'holding')) toast(`${BOSSES[game.params.boss].name}!`, true);
      renderer.bump(6);
      navigator.vibrate?.([40, 60, 40]);
      break;
    case 'closeCall':
      toast(`Close Call ×${game.mods.closeCallMult}`);
      break;
    case 'eaten':
    case 'buried':
      death = e.type === 'buried' ? 'Buried' : 'Eaten';
      renderer.bump(14);
      navigator.vibrate?.([80, 40, 200]);
      break;
    case 'finish':
      navigator.vibrate?.(30);
      break;
    case 'over':
      descentOver();
      break;
  }
}

// ---------- HUD ----------

function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function updateSnackBar() {
  const key = game.snacks.join(',') + '|' + mode;
  if (key === shownSnacks) return;
  shownSnacks = key;
  snackBar.innerHTML = game.snacks
    .map((id, i) => `<button class="snack" data-i="${i}" aria-label="Use ${esc(SNACKS[id].name)} (${i + 1})">${esc(SNACKS[id].short)}</button>`)
    .join('');
}

function updateHud() {
  hud.dist.textContent = distance(game).toLocaleString();
  hud.length.textContent = `/${game.params.length} m`;
  hud.speed.textContent = String(Math.round(game.skier.speed));
  hud.slope.textContent = game.params.boss ? `${mountainOf(run.stage) + 1}-S` : `${mountainOf(run.stage) + 1}-${slopeInMountain(run.stage) + 1}`;
  hud.style.textContent = style(game).toLocaleString();
  const mult = multiplier(game);
  hud.mult.textContent = mult > 1 ? `×${mult % 1 ? mult.toFixed(1) : mult}` : '';
  trail.dataset.rating = rating(game.params.difficulty);
  const p = yetiProximity(game);
  meterFill.style.width = `${Math.round(p * 100)}%`;
  meterFill.classList.toggle('close', p > 0.6);
  meter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  const waiting = game.yetis.every((y) => y.state === 'waiting' || y.state === 'holding');
  const name = game.params.boss ? BOSSES[game.params.boss].name : 'yeti';
  meterLabel.textContent = waiting
    ? `${game.params.boss ? name : 'quiet'} · ${Math.max(0, Math.ceil(graceFor(game) - game.time))}s`
    : game.yetis.some((y) => y.stunT > 0) ? 'staggered' : p > 0.75 ? 'right behind you' : p > 0.4 ? 'closing' : name;
  frost.style.opacity = String(Math.max(0, (p - 0.5) * 2));
  updateSnackBar();
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
