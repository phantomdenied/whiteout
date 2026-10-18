import './style.css';
import { botInput } from './bot';
import {
  BOSSES,
  CFG,
  CONDITIONS,
  type Game,
  type GameEvent,
  distance,
  graceFor,
  multiplier,
  newGame,
  step,
  style,
  tokens,
  yetiProximity,
  yetiSpeedFor,
} from './engine';
import { SKIERS, SKIER_IDS, SLOT_LABEL, SNACKS, type SkierId, type SnackId, curseById, displaced, gearById } from './gear';
import { Controls } from './input';
import { Renderer } from './render';
import { randomSeed } from './rng';
import {
  HUT_CHOICES,
  type HutChoice,
  type MapNode,
  MOUNTAINS,
  type OfferItem,
  type RunState,
  SLOPES_PER_MOUNTAIN,
  SUMMIT_ROW,
  TOTAL_DESCENTS,
  buyGear,
  buySnack,
  chooseEvent,
  chooseNode,
  choices,
  currentEvent,
  currentNode,
  descentsDone,
  deserialize,
  eventChoiceAvailable,
  finishDescent,
  hutAvailable,
  leaveLodge,
  newRun,
  nodeParams,
  nodeSeed,
  paramsFor,
  pickReward,
  price,
  reroll,
  rerollPrice,
  runMods,
  sellGear,
  sellPrice,
  serialize,
  slopeInMountain,
  snackSlots,
  startAt,
  totals,
  useHut,
} from './run';

const BEST_KEY = 'whiteout:best';
const SAVE_KEY = 'whiteout:run';
const params = new URLSearchParams(location.search);
/** ?bot lets the clean-skier bot drive (demos and testing). */
const BOT = params.has('bot');
/** ?mountain=N&row=R starts runs further in (0-based; row 6 is the Summit), for playtesting. */
const START_MOUNTAIN = Number(params.get('mountain')) || 0;
const START_ROW = Number(params.get('row')) || 0;

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

/** title → skier → map → (intro → playing ⇄ paused → reward | lodge | hut | event) → map … → won / lost. */
type Mode = 'title' | 'skier' | 'map' | 'intro' | 'playing' | 'paused' | 'reward' | 'lodge' | 'hut' | 'event' | 'won' | 'lost';
let mode: Mode = 'title';
let pendingSeed = initialSeed();
let run: RunState = newRun(pendingSeed);
let game: Game = previewGame();
let acc = 0;
let last = 0;
let shownSnacks = '';
let death: 'Eaten' | 'Buried' = 'Eaten';

const renderer = new Renderer(canvas);
const controls = new Controls(app, () => game.skier.angle, onKey);

function initialSeed(): number {
  const param = params.get('seed');
  const n = param === null ? NaN : Number(param);
  return Number.isFinite(n) ? n >>> 0 : randomSeed();
}

/** The descent the run is on, or an endless sandbox slope behind the menus. */
function descentGame(r: RunState): Game {
  return newGame(nodeSeed(r), { params: paramsFor(r), mods: runMods(r), snacks: r.snacks });
}
function previewGame(): Game {
  return newGame(pendingSeed, { params: { length: 600, difficulty: 2.5, mountain: run.mountain, yetiSpeed: 14, grace: 99 } });
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

function startRun(skier: SkierId) {
  run = startAt(pendingSeed, skier, START_MOUNTAIN, START_ROW);
  game = previewGame();
  renderer.reset(game);
  setMode('map');
}

function resume(saved: RunState) {
  run = saved;
  if (run.status === 'skiing') toIntro();
  else setMode(run.status as Mode);
}

function toIntro() {
  game = descentGame(run);
  renderer.reset(game);
  controls.reset();
  acc = 0;
  toasts.replaceChildren();
  setMode('intro');
}

function descentOver() {
  run = finishDescent(
    run,
    { cleared: game.result === 'cleared', distance: distance(game), style: style(game), tokens: tokens(game), time: game.time },
    game.snacks,
  );
  const reached = descentsDone(run);
  if (reached > loadBest()) store(BEST_KEY, String(reached));
  setMode(run.status as Mode);
}

/** After any choice: go wherever the run now is. */
function follow(next: RunState) {
  run = next;
  if (run.status === 'skiing') toIntro();
  else setMode(run.status as Mode);
}

function setMode(next: Mode) {
  mode = next;
  overlay.hidden = mode === 'playing';
  if (mode !== 'playing' && mode !== 'paused' && mode !== 'title' && mode !== 'skier') saveRun();
  const show: Record<Mode, () => void> = {
    title: showTitle, skier: showSkier, map: showMap, intro: showIntro, paused: showPaused, reward: showReward,
    lodge: showLodge, hut: showHut, event: showEvent, won: showWon, lost: showLost, playing: () => {},
  };
  show[mode]();
}

function pause() {
  if (mode === 'playing') setMode('paused');
}

function onKey(key: string) {
  if (key === 'Escape' || key === 'p' || key === 'F3') {
    if (mode === 'playing') pause();
    else if (mode === 'paused') setMode('playing');
  } else if (key === 'Enter') {
    if (mode === 'title') setMode('skier');
    else if (mode === 'intro' || mode === 'paused') setMode('playing');
    else if (mode === 'lodge') follow(leaveLodge(run));
    else if (mode === 'won' || mode === 'lost') {
      pendingSeed = randomSeed();
      setMode('skier');
    }
  } else if (['1', '2', '3', '4'].includes(key)) {
    const i = Number(key) - 1;
    if (mode === 'playing') controls.queueSnack(i);
    else if (mode === 'reward' && run.offer[i]) follow(pickReward(run, i));
    else if (mode === 'map' && choices(run)[i] !== undefined) follow(chooseNode(run, choices(run)[i]));
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

function on(sel: string, fn: (b: HTMLButtonElement) => void) {
  card.querySelectorAll<HTMLButtonElement>(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
}

function kit(): string {
  const gear = run.gear.length
    ? `<ul class="chips">${run.gear.map((id) => `<li>${esc(gearById(id).name)}</li>`).join('')}</ul>`
    : '<p class="meta">No Gear yet. You get a pick after every descent.</p>';
  const slots = snackSlots(run);
  const snacks = slots
    ? `<ul class="chips">${Array.from({ length: slots }, (_, i) => {
        const id = run.snacks[i];
        return id ? `<li>${esc(SNACKS[id].short)}</li>` : '<li class="empty">Empty</li>';
      }).join('')}</ul>`
    : '<p class="meta">No Snack slots.</p>';
  const curses = run.curses.length
    ? `<span class="label">Curses</span><ul class="chips">${run.curses.map((id) => `<li class="curse" title="${esc(curseById(id).text)}">${esc(curseById(id).name)}</li>`).join('')}</ul>`
    : '';
  return `<div class="kit"><span class="label">${esc(SKIERS[run.skier].name)} · Gear</span>${gear}<span class="label">Snacks</span>${snacks}${curses}</div>`;
}

function showTitle() {
  const best = loadBest();
  const saved = deserialize(load(SAVE_KEY));
  card.innerHTML = `
    <span class="eyebrow">M3 · prototype</span>
    <h1>Whiteout</h1>
    <p>Three mountains, and a yeti on every slope. Pick your route down: Black Diamonds pay better, Lodges sell Gear, and every Summit has a boss. Cruising won't outrun the yeti. Tucking will, if you don't crash.</p>
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
    <span class="meta">${saved ? `Saved run: ${esc(MOUNTAINS[saved.mountain].name)}, ◆ ${saved.tokens} · ` : ''}${best ? `Best: ${best} of ${TOTAL_DESCENTS} descents` : `Seed ${pendingSeed}`}</span>`;
  on('#go', () => {
    if (saved) pendingSeed = randomSeed();
    setMode('skier');
  });
  if (saved) on('#continue', () => resume(saved));
}

function showSkier() {
  card.innerHTML = `
    <span class="eyebrow">New run · Seed ${pendingSeed}</span>
    <h2>Who's skiing?</h2>
    <div class="offers">${SKIER_IDS.map((id) => {
      const k = SKIERS[id];
      return `<button class="gear" data-skier="${id}">
        <span class="gear-top"><b>${esc(k.name)}</b></span>
        <span class="gear-text">${esc(k.boon)}</span>
        <span class="gear-note">${k.bane === 'None.' ? '' : esc(k.bane)}</span>
      </button>`;
    }).join('')}</div>
    <div class="actions"><button class="btn ghost" id="back">Back</button></div>`;
  on('[data-skier]', (b) => startRun(b.dataset.skier as SkierId));
  on('#back', () => setMode('title'));
}

const NODE_LABEL: Record<MapNode['kind'], string> = {
  slope: 'Slope', diamond: 'Black Diamond', lodge: 'Lodge', hut: 'Warming Hut', event: 'Event', summit: 'Summit',
};

function nodeHtml(node: MapNode, r: number, c: number, n: number, state: 'open' | 'taken' | 'past' | 'locked'): string {
  const left = ((c + 0.5) / n) * 100;
  let icon = '';
  let sub = '';
  if (node.kind === 'slope' || node.kind === 'diamond') {
    const p = nodeParams(run.seed, run.map, run.mountain, r, c);
    icon = node.kind === 'diamond' ? '<span class="trail double" data-rating="black"></span>' : `<span class="trail" data-rating="${rating(p.difficulty)}"></span>`;
    sub = p.condition ? CONDITIONS[p.condition].name : `${p.length} m`;
  } else if (node.kind === 'summit') {
    icon = '<span class="node-icon">▲</span>';
    sub = BOSSES[MOUNTAINS[run.mountain].boss].name;
  } else {
    icon = `<span class="node-icon">${node.kind === 'lodge' ? '⌂' : node.kind === 'hut' ? '♨' : '?'}</span>`;
  }
  const label = node.kind === 'diamond' ? 'Black Diamond' : NODE_LABEL[node.kind];
  return `<button class="node ${node.kind} ${state}" style="left:${left}%" data-col="${c}" ${state === 'open' ? '' : 'disabled'}
    aria-label="${esc(label)}${sub ? `, ${esc(sub)}` : ''}">${icon}<span class="node-name">${esc(label)}</span>${sub ? `<span class="node-sub">${esc(sub)}</span>` : ''}</button>`;
}

function showMap() {
  const rows = run.map.rows;
  const open = new Set(choices(run));
  const ROW_H = 64;
  const lines: string[] = [];
  rows.forEach((row, r) => {
    row.forEach((node, c) => {
      for (const k of node.next) {
        const taken = run.path[r] === c && run.path[r + 1] === k;
        const x1 = ((c + 0.5) / row.length) * 100;
        const x2 = ((k + 0.5) / rows[r + 1].length) * 100;
        lines.push(`<line x1="${x1}" y1="${r * ROW_H + ROW_H / 2}" x2="${x2}" y2="${(r + 1) * ROW_H + ROW_H / 2}" class="${taken ? 'taken' : ''}" />`);
      }
    });
  });
  const html = rows.map((row, r) => {
    const nodes = row.map((node, c) => {
      const state = r < run.row ? (run.path[r] === c ? 'taken' : 'past') : r === run.row && open.has(c) ? 'open' : 'locked';
      return nodeHtml(node, r, c, row.length, state);
    }).join('');
    return `<div class="map-row${r === run.row ? ' current' : ''}" style="height:${ROW_H}px">${nodes}</div>`;
  }).join('');
  card.innerHTML = `
    <span class="eyebrow">Mountain ${run.mountain + 1} of ${MOUNTAINS.length} · ◆ ${run.tokens} Tokens</span>
    <h2>${esc(MOUNTAINS[run.mountain].name)}</h2>
    ${run.note ? `<p class="note">${esc(run.note)}</p>` : run.row === 0 ? `<p>${esc(MOUNTAINS[run.mountain].blurb)} Pick where to go next.</p>` : '<p>Pick where to go next.</p>'}
    <div class="map" style="height:${rows.length * ROW_H}px">
      <svg viewBox="0 0 100 ${rows.length * ROW_H}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
      ${html}
    </div>
    ${kit()}`;
  on('.node.open', (b) => follow(chooseNode(run, Number(b.dataset.col))));
}

function showIntro() {
  const p = paramsFor(run);
  const m = run.mountain;
  const cond = p.condition ? CONDITIONS[p.condition] : null;
  const condHtml = cond ? `<p class="condition"><b>${esc(cond.name)}.</b> ${esc(cond.text)}</p>` : '';
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
    const k = slopeInMountain(run.row);
    const diamond = currentNode(run)?.kind === 'diamond';
    const r = diamond ? 'black' : rating(p.difficulty);
    card.innerHTML = `
      <span class="eyebrow">Mountain ${m + 1} · ${esc(MOUNTAINS[m].name)}</span>
      <h2>${diamond ? 'Black Diamond' : `Slope ${k + 1} of ${SLOPES_PER_MOUNTAIN}`}</h2>
      ${diamond ? '<p>Harder and longer, with better rewards: a guaranteed rare and 1.5× Tokens.</p>' : ''}
      ${condHtml}
      <div class="results">
        <div><b>${p.length}</b><span>meters</span></div>
        <div><b class="sign"><span class="trail${diamond ? ' double' : ''}" data-rating="${r}"></span></b><span>${diamond ? 'Double black' : RATING_NAME[r]}</span></div>
        <div><b>${+graceFor(game).toFixed(1)}s</b><span>${p.condition === 'avalanche' ? 'until it slides' : 'until the yeti'}</span></div>
      </div>
      ${kit()}
      <div class="actions"><button class="btn" id="drop">Drop in</button></div>
      <span class="meta">◆ ${run.tokens} Tokens · ${p.condition === 'avalanche' ? `Avalanche up to ${yetiSpeedFor(game)} m/s` : `Yeti ${yetiSpeedFor(game).toFixed(1)} m/s`} · Seed ${run.seed}</span>`;
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
  on('#restart', () => {
    pendingSeed = randomSeed();
    setMode('skier');
  });
}

function gearButton(id: string, attrs: string, extra = ''): string {
  const g = gearById(id);
  const out = displaced(run.gear, id, run.skier);
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
    return `<button class="gear" ${key}><span class="gear-top"><b>◆ ${item.n} Tokens</b><span class="tag">Tokens</span></span><span class="gear-text">Spend them at a Lodge.</span></button>`;
  }
  const s = SNACKS[item.id];
  const full = run.snacks.length >= snackSlots(run);
  return `<button class="gear" ${key}><span class="gear-top"><b>${esc(s.name)}</b><span class="tag">Snack</span></span><span class="gear-text">${esc(s.text)}</span>${full ? '<span class="gear-note">Your Snack slots are full</span>' : ''}</button>`;
}

function showReward() {
  const res = run.results[run.results.length - 1];
  const node = currentNode(run);
  const summit = node?.kind === 'summit';
  card.innerHTML = `
    <span class="eyebrow">${summit ? `${esc(BOSSES[MOUNTAINS[run.mountain].boss].name)} beaten` : `${node?.kind === 'diamond' ? 'Black Diamond' : 'Slope'} cleared · ${descentsDone(run)} of ${TOTAL_DESCENTS}`}</span>
    <h2>Pick a reward</h2>
    <div class="results">
      <div><b>${res.style.toLocaleString()}</b><span>style</span></div>
      <div><b>+${res.tokens}</b><span>tokens</span></div>
      <div><b>${formatTime(res.time)}</b><span>time</span></div>
    </div>
    <div class="offers">${run.offer.map(offerButton).join('')}</div>
    <div class="actions"><button class="btn ghost" id="skip">Skip</button></div>
    <span class="meta">◆ ${run.tokens} Tokens</span>`;
  on('.offers .gear', (b) => follow(pickReward(run, Number(b.dataset.i))));
  on('#skip', () => follow(pickReward(run, null)));
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
    <span class="eyebrow">Mountain ${run.mountain + 1} · The Lodge</span>
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
  on('[data-buy-gear]', (b) => refresh(buyGear(run, Number(b.dataset.buyGear))));
  on('[data-buy-snack]', (b) => refresh(buySnack(run, Number(b.dataset.buySnack))));
  on('[data-sell]', (b) => refresh(sellGear(run, b.dataset.sell!)));
  on('#reroll', () => refresh(reroll(run)));
  on('#leave', () => follow(leaveLodge(run)));
}

function showHut() {
  const opts = (Object.keys(HUT_CHOICES) as HutChoice[]).map((id) => {
    const c = HUT_CHOICES[id];
    return `<button class="gear" data-hut="${id}" ${hutAvailable(run, id) ? '' : 'disabled'}><span class="gear-top"><b>${esc(c.label)}</b></span><span class="gear-text">${esc(c.detail)}</span></button>`;
  });
  card.innerHTML = `
    <span class="eyebrow">Mountain ${run.mountain + 1} · Warming Hut</span>
    <h2>Warm up</h2>
    <p>A wood stove and a bench. There's time for one thing.</p>
    <div class="offers">${opts.join('')}</div>
    <div class="actions"><button class="btn ghost" id="leave">Keep going</button></div>
    ${kit()}`;
  on('[data-hut]', (b) => follow(useHut(run, b.dataset.hut as HutChoice)));
  on('#leave', () => follow(useHut(run, null)));
}

function showEvent() {
  const ev = currentEvent(run)!;
  card.innerHTML = `
    <span class="eyebrow">Mountain ${run.mountain + 1} · Event</span>
    <h2>${esc(ev.title)}</h2>
    <p>${esc(ev.text)}</p>
    <div class="offers">${ev.choices.map((c, i) => `<button class="gear" data-choice="${i}" ${eventChoiceAvailable(run, i) ? '' : 'disabled'}><span class="gear-top"><b>${esc(c.label)}</b></span><span class="gear-text">${esc(c.detail)}</span></button>`).join('')}</div>
    ${kit()}
    <span class="meta">◆ ${run.tokens} Tokens</span>`;
  on('[data-choice]', (b) => follow(chooseEvent(run, Number(b.dataset.choice))));
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

function endActions() {
  on('#again', () => {
    pendingSeed = randomSeed();
    setMode('skier');
  });
  on('#same', () => {
    pendingSeed = run.seed;
    setMode('skier');
  });
}

function showWon() {
  card.innerHTML = `
    <span class="eyebrow">All three Summits</span>
    <h2>You made the last bus</h2>
    <p>Three mountains, three bosses, and nothing ate ${run.skier === 'dog' ? 'the dog' : 'you'}.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">Same seed</button>
    </div>
    <span class="meta">◆ ${run.tokens} Tokens · Seed ${run.seed}</span>`;
  endActions();
}

function showLost() {
  const done = descentsDone(run);
  const best = loadBest();
  const p = paramsFor(run);
  const node = currentNode(run);
  const where = node?.kind === 'summit' ? 'the Summit' : node?.kind === 'diamond' ? 'a Black Diamond' : `slope ${slopeInMountain(run.row) + 1}`;
  card.innerHTML = `
    <span class="eyebrow">${done >= best && done > 0 ? 'New best' : best ? `Best: ${best} of ${TOTAL_DESCENTS} descents` : 'Run over'}</span>
    <h2>${death} on ${where}</h2>
    <p>${esc(MOUNTAINS[run.mountain].name)}, ${distance(game).toLocaleString()} of ${p.length} m. You cleared ${done} of ${TOTAL_DESCENTS} descents.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">Same seed</button>
    </div>
    <span class="meta">Seed ${run.seed}</span>`;
  endActions();
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
      toast('Stuck it');
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
      if (game.params.condition === 'avalanche') toast('Avalanche!', true);
      else if (!game.params.boss) toast('Something is coming', true);
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
  hud.slope.textContent = run.row === SUMMIT_ROW ? `${run.mountain + 1}-S` : `${run.mountain + 1}-${slopeInMountain(run.row) + 1}`;
  hud.style.textContent = style(game).toLocaleString();
  const mult = multiplier(game);
  hud.mult.textContent = mult > 1 ? `×${mult % 1 ? mult.toFixed(1) : mult}` : '';
  trail.dataset.rating = currentNode(run)?.kind === 'diamond' ? 'black' : rating(game.params.difficulty);
  trail.classList.toggle('double', currentNode(run)?.kind === 'diamond');
  const p = yetiProximity(game);
  meterFill.style.width = `${Math.round(p * 100)}%`;
  meterFill.classList.toggle('close', p > 0.6);
  meter.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  const waiting = game.yetis.every((y) => y.state === 'waiting' || y.state === 'holding') && !game.wall?.armed;
  const name = game.params.boss ? BOSSES[game.params.boss].name : game.params.condition === 'avalanche' ? 'avalanche' : 'yeti';
  meterLabel.textContent = waiting
    ? `${game.params.boss ? name : game.params.condition ? CONDITIONS[game.params.condition].name : 'quiet'} · ${Math.max(0, Math.ceil(graceFor(game) - game.time))}s`
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
