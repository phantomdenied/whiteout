import './style.css';
import { botInput } from './bot';
import {
  BOSSES,
  CFG,
  CONDITIONS,
  type Game,
  type GameEvent,
  TRICKS,
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
import { Sound, type SoundName } from './audio';
import { SKIERS, SKIER_IDS, SLOT_LABEL, SNACKS, type SkierId, type SnackId, curseById, displaced, gearById } from './gear';
import { Controls } from './input';
import { CONDITION_IDS } from './slope';
import { GROUP_NAME, LIFT_PASS_TOKENS, PASSIVES, type PassiveGroup, passiveById } from './passives';
import {
  FIRSTS,
  PATCHES,
  type Profile,
  UNLOCKS,
  buyPassive,
  buyPinSlot,
  isUnlocked,
  loadProfile,
  nextRankCost,
  pinSlotCost,
  pinnedRanks,
  recordDescent,
  recordRun,
  runSummaryText,
  togglePin,
} from './profile';
import { Renderer } from './render';
import { randomSeed } from './rng';
import {
  HUT_CHOICES,
  type HutChoice,
  type LogEntry,
  MAX_ALTITUDE,
  type MapNode,
  MOUNTAINS,
  type OfferItem,
  type RunState,
  SLOPES_PER_MOUNTAIN,
  BURN,
  SLALOM,
  SUMMIT_ROW,
  TOTAL_DESCENTS,
  TOTAL_SLOPES,
  buyGear,
  buySnack,
  chooseEvent,
  chooseNode,
  choices,
  currentEvent,
  currentNode,
  dailySeed,
  diamondParams,
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
  secondWindReady,
  sellGear,
  sellPrice,
  serialize,
  slopeInMountain,
  slopeParams,
  snackSlots,
  startAt,
  burnParams,
  summitParams,
  todayUTC,
  totals,
  useHut,
} from './run';

const STUDIO = '?God Complex Studios';
/** When the studio splash went away: the tap that skips it shouldn't also start the game. */
let splashSkipped = -Infinity;
const BEST_KEY = 'whiteout:best';
const SAVE_KEY = 'whiteout:run';
const PROFILE_KEY = 'whiteout:profile';
const MUTE_KEY = 'whiteout:muted';
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

/** attract → title → skier → map → (intro → playing ⇄ paused → reward | lodge | hut | event) → map … → won / lost. */
type Mode = 'attract' | 'title' | 'chalet' | 'skier' | 'map' | 'intro' | 'playing' | 'paused' | 'reward' | 'lodge' | 'hut' | 'event' | 'won' | 'lost';
let mode: Mode = 'attract';
let pendingSeed = initialSeed();
let run: RunState = newRun(pendingSeed);
/** Attract mode: the bot skis demo descents behind the start screen, title and skier select. */
let attractNo = Math.floor(Math.random() * 1000);
let attractOverAt = 0;
/** Half the demos are skied sloppily (lapses off the line, greedy tricks), so the start screen shows fails too. */
let attractSloppy = false;
let lastInput = performance.now();
const ATTRACT_IDLE_MS = 45_000;
let game: Game = attractGame();
let acc = 0;
let last = 0;
let shownSnacks = '';
let death: 'Eaten' | 'Buried' = 'Eaten';
let profile: Profile = loadProfile(load(PROFILE_KEY));
/** Altitude picked for the next run (defaults to your highest). */
let pendingAltitude = profile.altitude;
/** Unlock and Altitude news, shown at the top of the next card. */
let notes: string[] = [];
/** Profile progress made during the current descent. */
let dogsHit = 0;
let mushrooms = 0;
/** Mountain to start the next run on (a Lift Pass), and Patches the last run earned. */
let pendingStart = 0;
let lastPatches = 0;
let installPrompt: (Event & { prompt: () => Promise<void> }) | null = null;

const sound = new Sound();
sound.setMuted(load(MUTE_KEY) === '1');

const renderer = new Renderer(canvas);
const controls = new Controls(app, () => game.skier.angle, onKey, () => game.skier.air > 0);

function initialSeed(): number {
  const param = params.get('seed');
  const n = param === null ? NaN : Number(param);
  return Number.isFinite(n) ? n >>> 0 : randomSeed();
}

/** The descent the run is on, or an endless sandbox slope behind the menus. */
function descentGame(r: RunState): Game {
  return newGame(nodeSeed(r), { params: paramsFor(r), mods: runMods(r), snacks: r.snacks, extraBounce: secondWindReady(r) });
}
/** A real descent for the demo: slopes from all three mountains, now and then a Black Diamond or a Summit. */
function attractGame(): Game {
  const n = attractNo++;
  attractSloppy = Math.random() < 0.5;
  const slope = (n * 7) % TOTAL_SLOPES;
  const params = n % 7 === 6
    ? burnParams(n % MOUNTAINS.length)
    : n % 5 === 4
    ? summitParams(n % MOUNTAINS.length)
    : n % 5 === 2
      ? diamondParams(slope, CONDITION_IDS[n % CONDITION_IDS.length])
      : n % 5 === 1 ? { ...slopeParams(slope), gates: 'section' as const } : slopeParams(slope);
  return newGame(randomSeed(), { params: { ...params, grace: Math.min(params.grace, 4) } });
}

/**
 * The demo skier: the clean-line bot, plus the odd hop-and-trick on a straight stretch. One trick lands safely;
 * the sloppy skier sometimes goes for three and botches the landing.
 */
let greedy = false;
function attractInput(g: Game) {
  const s = g.skier;
  if (g.params.burn) {
    // Burning Man demo: steer for the nearest tree ahead (not the edge wall) and torch it.
    let best: { x: number; y: number } | null = null;
    for (const o of g.obstacles) {
      if (o.y < s.y + 2 || o.y > s.y + 10 || o.hit || Math.abs(o.x) > 26 || (o.kind !== 'tree' && o.kind !== 'deadtree')) continue;
      if (!best || Math.abs(o.x - s.x) < Math.abs(best.x - s.x)) best = o;
    }
    if (best) return { turn: 0, targetAngle: Math.atan2(best.x - s.x, best.y - s.y), tuck: true, brake: false, jump: false };
  }
  const input = botInput(g, attractSloppy ? { lapses: 0.0007 } : {});
  if (s.state !== 'ski') return input;
  const anyTrick = () => (1 + Math.floor(Math.random() * 3)) as 1 | 2 | 3;
  // The clean skier pops one trick from a tuck on a straight; the greedy one keeps chaining in the air.
  if (s.air > 0) return { ...input, trick: greedy && s.trickT <= 0 ? anyTrick() : undefined };
  greedy = attractSloppy && Math.random() < 0.3;
  if (input.tuck && s.speed > 14 && Math.abs(s.angle) < 0.15 && Math.random() < 0.006) return { ...input, trick: anyTrick() };
  return input;
}

const attracting = () => mode === 'attract' || mode === 'title' || mode === 'chalet' || mode === 'skier';

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

function startRun(skier: SkierId, daily: string | null = null) {
  const opts = { altitude: pendingAltitude, passives: pinnedRanks(profile), startMountain: Math.min(pendingStart, profile.liftPass) };
  run = daily
    ? newRun(pendingSeed, skier, { daily })
    : START_MOUNTAIN || START_ROW ? startAt(pendingSeed, skier, START_MOUNTAIN, START_ROW, opts) : newRun(pendingSeed, skier, opts);
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
  dogsHit = mushrooms = 0;
  toasts.replaceChildren();
  setMode('intro');
}

function descentOver() {
  run = finishDescent(
    run,
    {
      cleared: game.result === 'cleared', distance: distance(game), style: style(game), tokens: tokens(game), time: game.time,
      ...(game.gates.length ? { gates: { made: game.gatesMade, total: game.gates.length } } : {}),
      ...(game.params.burn ? { burned: game.burned } : {}),
    },
    game.snacks,
  );
  // Second Wind is spent once the slope's last bounce (its extra one) was used.
  if (secondWindReady(run) && game.bouncesLeft === 0) run = { ...run, secondWindUsed: true };
  const reached = descentsDone(run);
  if (reached > loadBest()) store(BEST_KEY, String(reached));
  const d = recordDescent(profile, { dogsHit, mushrooms });
  const r = recordRun(d.profile, run);
  profile = r.profile;
  store(PROFILE_KEY, JSON.stringify(profile));
  for (const id of [...d.unlocked, ...r.unlocked]) notes.push(`Unlocked: ${SKIERS[id].name}. Pick them at the start of your next run.`);
  if (r.altitudeUp) {
    notes.push(`Altitude ${profile.altitude} unlocked: faster yetis, shorter head starts, more Conditions.`);
    pendingAltitude = profile.altitude;
  }
  if (r.liftPass) notes.push(`Lift Pass: you can now start a run on ${MOUNTAINS[profile.liftPass].name}.`);
  for (const f of r.firsts) notes.push(`${FIRSTS[f]}: +${PATCHES.first} Patches.`);
  lastPatches = r.patches;
  if (notes.length) sound.play('unlock');
  setMode(run.status as Mode);
}

function startDaily() {
  const date = todayUTC();
  pendingSeed = dailySeed(date);
  startRun('rookie', date);
}

/** After any choice: go wherever the run now is. */
function follow(next: RunState) {
  run = next;
  if (run.status === 'skiing') toIntro();
  else setMode(run.status as Mode);
}

function setMode(next: Mode) {
  const wasAttracting = attracting();
  mode = next;
  overlay.hidden = mode === 'playing';
  app.classList.toggle('attract', mode === 'attract');
  app.classList.toggle('demo', attracting());
  if (attracting() && !wasAttracting) newAttract();
  if (mode !== 'playing' && mode !== 'paused' && !attracting()) saveRun();
  const show: Record<Mode, () => void> = {
    attract: showAttract, title: showTitle, chalet: showChalet, skier: showSkier, map: showMap, intro: showIntro, paused: showPaused, reward: showReward,
    lodge: showLodge, hut: showHut, event: showEvent, won: showWon, lost: showLost, playing: () => {},
  };
  show[mode]();
  if (notes.length && mode !== 'playing') {
    card.insertAdjacentHTML('afterbegin', notes.map((n) => `<p class="unlock">${esc(n)}</p>`).join(''));
    notes = [];
  }
}

function toggleMute() {
  sound.setMuted(!sound.muted);
  store(MUTE_KEY, sound.muted ? '1' : '0');
  card.querySelectorAll<HTMLButtonElement>('.mute').forEach((b) => (b.textContent = muteLabel()));
}
const muteLabel = () => (sound.muted ? 'Sound: off' : 'Sound: on');
const muteButton = () => `<button class="btn ghost small mute" type="button">${muteLabel()}</button>`;

function pause() {
  if (mode === 'playing') setMode('paused');
}

function onKey(key: string) {
  if (mode === 'attract') {
    setMode('title');
    return;
  }
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
  } else if (key === 'm' || key === 'M') {
    toggleMute();
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
// Document level: steering captures the pointer, which retargets the click away from the overlay.
document.addEventListener('click', () => mode === 'attract' && performance.now() - splashSkipped > 500 && setMode('title'));
for (const type of ['pointerdown', 'keydown'] as const) document.addEventListener(type, () => (lastInput = performance.now()), { capture: true });
// Audio may only start from a user gesture.
// Audio may only start from a user gesture, and iOS only counts a finished tap (touchend / click), not
// pointerdown, so listen for all of them. Coming back to the page also needs a nudge (iOS "interrupts" audio).
for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
  document.addEventListener(type, () => sound.unlock(), { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => !document.hidden && sound.unlock());
card.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  if (b.classList.contains('mute')) toggleMute();
  else sound.play('click');
});
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e as typeof installPrompt;
  if (mode === 'title') showTitle();
});
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

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function installHtml(): string {
  if (standalone()) return '';
  if (installPrompt) return '<button class="btn ghost small" id="install" type="button">Install app</button>';
  if (isIOS()) return '<p class="meta">Play full screen: Share → Add to Home Screen.</p>';
  return '';
}

function dailyHtml(): string {
  const date = todayUTC();
  const d = profile.daily[date];
  const score = d ? ` · Your best: ${d.won ? 'won' : `${d.descents}/${TOTAL_DESCENTS}`} (${d.attempts} ${d.attempts === 1 ? 'try' : 'tries'})` : '';
  return `<span class="meta">Daily ${date}: the same mountain for everyone, as the Rookie${score}</span>`;
}

function newAttract() {
  game = attractGame();
  attractOverAt = 0;
  renderer.reset(game);
  acc = 0;
}

/** The Memphis-style logo: pink block letters with a navy offset shadow, confetti shapes, a yellow tagline tag. */
function logoHtml(small = false): string {
  return `<div class="memphis${small ? ' small' : ''}" role="img" aria-label="Whiteout: ski or be eaten">
    <span class="m-dot" aria-hidden="true"></span><span class="m-tri" aria-hidden="true"></span>
    <span class="m-x" aria-hidden="true">✕</span><span class="m-dash" aria-hidden="true"></span><span class="m-smile" aria-hidden="true"></span>
    <h1>Whiteout</h1>
    <span class="m-tag">Ski or be eaten</span>
  </div>`;
}

function showAttract() {
  const best = loadBest();
  card.innerHTML = `
    ${logoHtml()}
    <p class="press">Tap to start</p>
    <span class="meta">${best ? `Best: ${best} of ${TOTAL_DESCENTS} descents` : 'A downhill roguelike'}</span>
    <span class="meta credit">© 2026 ${STUDIO}</span>`;
}

function showTitle() {
  const best = loadBest();
  const saved = deserialize(load(SAVE_KEY));
  card.innerHTML = `
    <span class="eyebrow">M4 · prototype</span>
    ${logoHtml(true)}
    <p>Three mountains, and a yeti on every slope. Pick your route down: Black Diamonds pay better, Lodges sell Gear, and every Summit has a boss. Cruising won't outrun the yeti. Tucking will, if you don't crash.</p>
    <dl class="controls">
      <dt>Steer</dt><dd>Drag left / right · ← →</dd>
      <dt>Tuck (faster)</dt><dd>Hold your thumb low · ↓</dd>
      <dt>Slow down</dt><dd>Drag up · ↑</dd>
      <dt>Jump</dt><dd>Double-tap · Space</dd>
      <dt>Tricks</dt><dd>While tucked, swipe up, left or right · ↓ + Z X C. Swipe again in the air to chain. Land before a trick ends or you crash.</dd>
      <dt>Snack</dt><dd>Tap it, top right · 1–3</dd>
    </dl>
    <div class="actions">
      ${saved ? '<button class="btn" id="continue">Continue</button>' : ''}
      <button class="btn${saved ? ' ghost' : ''}" id="go">New run</button>
      <button class="btn ghost" id="daily">Daily run</button>
    </div>
    <div class="actions"><button class="btn ghost" id="chalet">Chalet · ${profile.patches} Patches</button></div>
    ${dailyHtml()}
    <span class="meta">${saved ? `Saved run: ${esc(MOUNTAINS[saved.mountain].name)}, ◆ ${saved.tokens} · ` : ''}${best ? `Best: ${best} of ${TOTAL_DESCENTS} descents` : `Seed ${pendingSeed}`}${profile.altitude ? ` · Altitude ${profile.altitude} unlocked` : ''}</span>
    <div class="actions small">${muteButton()}${installHtml()}</div>
    <span class="meta credit">© 2026 ${STUDIO}</span>`;
  on('#go', () => {
    if (saved) pendingSeed = randomSeed();
    setMode('skier');
  });
  on('#daily', startDaily);
  on('#chalet', () => setMode('chalet'));
  on('#install', () => {
    void installPrompt?.prompt();
    installPrompt = null;
    showTitle();
  });
  if (saved) on('#continue', () => resume(saved));
}

function showSkier() {
  card.innerHTML = `
    <span class="eyebrow">New run · Seed ${pendingSeed}</span>
    <h2>Who's skiing?</h2>
    ${profile.altitude ? altitudePicker() : ''}
    ${profile.liftPass ? liftPicker() : ''}
    ${pinsSummary()}
    <div class="offers">${SKIER_IDS.map((id) => {
      const k = SKIERS[id];
      if (!isUnlocked(profile, id)) {
        const how = UNLOCKS.find((u) => u.skier === id)?.how ?? '';
        return `<button class="gear locked" disabled>
          <span class="gear-top"><b>${esc(k.name)}</b><span class="tag">Locked</span></span>
          <span class="gear-text">${esc(how)}</span>
        </button>`;
      }
      return `<button class="gear" data-skier="${id}">
        <span class="gear-top"><b>${esc(k.name)}</b></span>
        <span class="gear-text">${esc(k.boon)}</span>
        <span class="gear-note">${k.bane === 'None.' ? '' : esc(k.bane)}</span>
      </button>`;
    }).join('')}</div>
    <div class="actions"><button class="btn ghost" id="back">Back</button></div>`;
  on('[data-skier]', (b) => startRun(b.dataset.skier as SkierId));
  on('[data-start]', (b) => {
    pendingStart = Number(b.dataset.start);
    showSkier();
  });
  on('#to-chalet', () => setMode('chalet'));
  on('[data-alt]', (b) => {
    pendingAltitude = Number(b.dataset.alt);
    showSkier();
  });
  on('#back', () => setMode('title'));
}

function liftPicker(): string {
  const options = MOUNTAINS.slice(0, profile.liftPass + 1).map((mt, m) =>
    `<button class="chip-btn${m === pendingStart ? ' on' : ''}" data-start="${m}" aria-pressed="${m === pendingStart}">${m + 1} · ${esc(mt.name)}</button>`);
  return `<span class="label">Lift Pass · start on${pendingStart ? ` (+${pendingStart * LIFT_PASS_TOKENS} Tokens for what you skip)` : ''}</span>
    <div class="alt-picker">${options.join('')}</div>`;
}

function pinsSummary(): string {
  const pinned = Object.keys(pinnedRanks(profile));
  const names = pinned.map((id) => esc(passiveById(id).name)).join(', ');
  return `<p class="meta">${pinned.length ? `Pinned: ${names}` : 'No passives pinned.'} <button class="link" id="to-chalet">Chalet</button></p>`;
}

/** The Chalet: buy passives with Patches, pin them for the next run. */
function showChalet() {
  const groups = (Object.keys(GROUP_NAME) as PassiveGroup[]).map((group) => {
    const items = PASSIVES.filter((x) => x.group === group).map((x) => {
      const rank = profile.owned[x.id] ?? 0;
      const cost = nextRankCost(profile, x.id);
      const pinned = profile.pins.includes(x.id);
      const pips = x.costs.map((_, i) => `<i class="${i < rank ? 'on' : ''}"></i>`).join('');
      const text = x.ranks[Math.max(0, rank - 1)];
      const next = rank > 0 && cost !== null ? ` Next: ${esc(x.ranks[rank])}` : '';
      return `<div class="passive${pinned ? ' pinned' : ''}">
        <span class="gear-top"><b>${esc(x.name)}</b>${x.costs.length > 1 ? `<span class="pips">${pips}</span>` : ''}</span>
        <span class="gear-text">${esc(text)}${next}</span>
        <span class="passive-actions">
          ${cost !== null ? `<button class="chip-btn" data-buy="${x.id}" ${profile.patches < cost ? 'disabled' : ''}>${rank ? 'Upgrade' : 'Buy'} · ${cost}</button>` : '<span class="tag">Maxed</span>'}
          ${rank ? `<button class="chip-btn${pinned ? ' on' : ''}" data-pin="${x.id}" ${!pinned && profile.pins.length >= profile.pinSlots ? 'disabled' : ''}>${pinned ? 'Pinned' : 'Pin'}</button>` : ''}
        </span>
      </div>`;
    }).join('');
    return `<span class="label">${esc(GROUP_NAME[group])}</span><div class="passives">${items}</div>`;
  }).join('');
  const slotCost = pinSlotCost(profile);
  card.innerHTML = `
    <span class="eyebrow">Between runs</span>
    <h2>The Chalet</h2>
    <p>Spend Patches on passives that last, then pin up to ${profile.pinSlots} to your jacket for the next run. Every run earns Patches, win or lose. The Daily ignores passives.</p>
    <div class="results">
      <div><b>${profile.patches}</b><span>Patches</span></div>
      <div><b>${profile.pins.length}/${profile.pinSlots}</b><span>pinned</span></div>
      <div><b>${profile.liftPass + 1}</b><span>Lift Pass</span></div>
    </div>
    ${slotCost !== null ? `<button class="btn ghost small" id="slot" ${profile.patches < slotCost ? 'disabled' : ''}>Another pin slot · ${slotCost} Patches</button>` : ''}
    ${groups}
    <div class="actions"><button class="btn" id="back">Done</button></div>`;
  const save = (next: Profile) => {
    profile = next;
    store(PROFILE_KEY, JSON.stringify(profile));
    showChalet();
  };
  on('[data-buy]', (b) => save(buyPassive(profile, b.dataset.buy!)));
  on('[data-pin]', (b) => save(togglePin(profile, b.dataset.pin!)));
  on('#slot', () => save(buyPinSlot(profile)));
  on('#back', () => setMode('title'));
}

function altitudePicker(): string {
  const levels = Array.from({ length: Math.min(MAX_ALTITUDE, profile.altitude) + 1 }, (_, i) => i);
  return `<span class="label">Altitude · ${pendingAltitude ? 'faster yetis, shorter head starts, more Conditions' : 'the standard mountain'}</span>
    <div class="alt-picker">${levels.map((a) => `<button class="chip-btn${a === pendingAltitude ? ' on' : ''}" data-alt="${a}" aria-pressed="${a === pendingAltitude}">${a}</button>`).join('')}</div>`;
}

const NODE_LABEL: Record<MapNode['kind'], string> = {
  slope: 'Slope', diamond: 'Black Diamond', lodge: 'Lodge', hut: 'Warming Hut', event: 'Event', slalom: 'Slalom', burn: 'Burning Man', summit: 'Summit',
};

function nodeHtml(node: MapNode, r: number, c: number, n: number, state: 'open' | 'taken' | 'past' | 'locked'): string {
  const left = ((c + 0.5) / n) * 100;
  let icon = '';
  let sub = '';
  if (node.kind === 'slope' || node.kind === 'diamond') {
    const p = nodeParams(run.seed, run.map, run.mountain, r, c, run.altitude);
    icon = node.kind === 'diamond' ? '<span class="trail double" data-rating="black"></span>' : `<span class="trail" data-rating="${rating(p.difficulty)}"></span>`;
    sub = p.condition ? CONDITIONS[p.condition].name : p.gates ? 'Gates' : `${p.length} m`;
  } else if (node.kind === 'slalom') {
    icon = '<span class="node-icon">⚑</span>';
    sub = 'Bonus';
  } else if (node.kind === 'burn') {
    icon = '<span class="node-icon">🔥</span>';
    sub = 'Bonus';
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
    <span class="eyebrow">${runTag()}Mountain ${run.mountain + 1} of ${MOUNTAINS.length} · ◆ ${run.tokens} Tokens</span>
    <h2>${esc(MOUNTAINS[run.mountain].name)}</h2>
    ${run.note ? `<p class="note">${esc(run.note)}</p>` : run.row === 0 ? `<p>${esc(MOUNTAINS[run.mountain].blurb)} Pick where to go next.</p>` : '<p>Pick where to go next.</p>'}
    <div class="map" style="height:${rows.length * ROW_H}px">
      <svg viewBox="0 0 100 ${rows.length * ROW_H}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>
      ${html}
    </div>
    ${kit()}`;
  on('.node.open', (b) => follow(chooseNode(run, Number(b.dataset.col))));
}

/** "Daily · " or "Altitude 3 · ", for eyebrows. */
const runTag = () => (run.daily ? 'Daily · ' : run.altitude ? `Altitude ${run.altitude} · ` : '');

function showIntro() {
  const p = paramsFor(run);
  const m = run.mountain;
  const cond = p.condition ? CONDITIONS[p.condition] : null;
  const condHtml = cond ? `<p class="condition"><b>${esc(cond.name)}.</b> ${esc(cond.text)}</p>` : '';
  if (p.burn) {
    card.innerHTML = `
      <span class="eyebrow">${runTag()}Mountain ${m + 1} · Bonus stage</span>
      <h2>Burning Man</h2>
      <p>You're on fire, and the forest is dense. Trees you touch or pass close to go up in flames instead of stopping you: each one scores Style, builds your combo and feeds your flame (dead trees double). Rocks and dogs still crash you. Your flame burns down; keep lighting trees or you burn out.</p>
      <div class="results">
        <div><b>1 ◆</b><span>per ${BURN.treesPerToken} trees</span></div>
        <div><b>${BURN.pickAt[m]}</b><span>trees: a reward pick</span></div>
        <div><b>${p.length}</b><span>meters</span></div>
      </div>
      ${kit()}
      <div class="actions"><button class="btn" id="drop">Light up</button></div>
      <span class="meta">◆ ${run.tokens} Tokens · Seed ${run.seed}</span>`;
  } else if (p.gates === 'course') {
    card.innerHTML = `
      <span class="eyebrow">${runTag()}Mountain ${m + 1} · Bonus stage</span>
      <h2>Slalom</h2>
      <p>No yeti. Ski between the flags: every gate scores Style and builds your combo; every two gates pay a Token at the end. Make them all for +${SLALOM.perfectBonus} Tokens and a reward pick.</p>
      <div class="results">
        <div><b>${game.gates.length}</b><span>gates</span></div>
        <div><b>${p.length}</b><span>meters</span></div>
        <div><b>+${SLALOM.perfectBonus}</b><span>if perfect</span></div>
      </div>
      ${kit()}
      <div class="actions"><button class="btn" id="drop">Drop in</button></div>
      <span class="meta">◆ ${run.tokens} Tokens · Seed ${run.seed}</span>`;
  } else if (p.boss) {
    const boss = BOSSES[p.boss];
    card.innerHTML = `
      <span class="eyebrow">${runTag()}Mountain ${m + 1} · Summit</span>
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
      <span class="eyebrow">${runTag()}Mountain ${m + 1} · ${esc(MOUNTAINS[m].name)}</span>
      <h2>${diamond ? 'Black Diamond' : `Slope ${k + 1} of ${SLOPES_PER_MOUNTAIN}`}</h2>
      ${diamond ? '<p>Harder and longer, with better rewards: a guaranteed rare and 1.5× Tokens.</p>' : ''}
      ${condHtml}
      ${p.gates ? `<p class="condition"><b>Slalom gates.</b> ${game.gates.length} gates mid-slope mark the safe line. Each one you make scores Style and builds your combo.</p>` : ''}
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
    </div>
    <div class="actions small">${muteButton()}</div>`;
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
    <span class="eyebrow">${summit ? `${esc(BOSSES[MOUNTAINS[run.mountain].boss].name)} beaten` : node?.kind === 'slalom' ? 'Perfect slalom · every gate' : node?.kind === 'burn' ? `Inferno · ${res.burned ?? 0} trees` : `${node?.kind === 'diamond' ? 'Black Diamond' : 'Slope'} cleared · ${descentsDone(run)} of ${TOTAL_DESCENTS}`}</span>
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

const LOG_ICON: Record<LogEntry['kind'], string> = { slope: '▫', diamond: '◆', lodge: '⌂', hut: '♨', event: '?', slalom: '⚑', burn: '🔥', summit: '▲' };

function routeHtml(): string {
  const rows = MOUNTAINS.map((mt, m) => {
    const entries = run.log.filter((e) => e.mountain === m);
    if (!entries.length) return '';
    const steps = entries.map((e) => {
      const res = run.results.find((x) => x.mountain === m && x.row === e.row);
      const failed = res && !res.cleared;
      const title = `${NODE_LABEL[e.kind]}${e.condition ? `, ${CONDITIONS[e.condition].name}` : ''}${failed ? ', run ended here' : ''}`;
      return `<li class="${e.kind}${failed ? ' failed' : ''}" title="${esc(title)}" aria-label="${esc(title)}">${esc(LOG_ICON[e.kind])}</li>`;
    }).join('');
    return `<div class="route-row"><span>${esc(mt.name)}</span><ol>${steps}</ol></div>`;
  }).join('');
  return rows ? `<span class="label">Route</span><div class="route">${rows}</div>` : '';
}

function runSummary(): string {
  const t = totals(run);
  return `
    <div class="results">
      <div><b>${t.distance.toLocaleString()}</b><span>meters</span></div>
      <div><b>${t.style.toLocaleString()}</b><span>style</span></div>
      <div><b>${formatTime(t.time)}</b><span>time</span></div>
    </div>
    ${routeHtml()}
    ${kit()}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / insecure contexts: fall back to a hidden textarea.
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

function endActions() {
  on('#copy', async (b) => {
    const ok = await copyText(runSummaryText(run, SKIERS[run.skier].name, run.status === 'lost' ? death : null));
    b.textContent = ok ? 'Copied' : 'Copy failed';
  });
  on('#again', () => {
    pendingSeed = randomSeed();
    setMode('skier');
  });
  on('#same', () => {
    pendingSeed = run.seed;
    setMode('skier');
  });
}

function endMeta(): string {
  if (run.daily) {
    const d = profile.daily[run.daily];
    return `${lastPatches ? `+${lastPatches} Patches · ` : ''}Daily ${run.daily}${d ? ` · Your best today: ${d.won ? 'won' : `${d.descents}/${TOTAL_DESCENTS}`} · ${d.attempts} ${d.attempts === 1 ? 'try' : 'tries'}` : ''}`;
  }
  return `${lastPatches ? `+${lastPatches} Patches · ` : ''}${run.altitude ? `Altitude ${run.altitude} · ` : ''}◆ ${run.tokens} Tokens · Seed ${run.seed}`;
}

function showWon() {
  card.innerHTML = `
    <span class="eyebrow">All three Summits</span>
    <h2>You made the last bus</h2>
    <p>Three mountains, three bosses, and nothing ate ${run.skier === 'dog' ? 'the dog' : 'you'}.</p>
    ${runSummary()}
    <div class="actions">
      <button class="btn" id="again">New run</button>
      <button class="btn ghost" id="same">${run.daily ? 'Retry Daily' : 'Same seed'}</button>
    </div>
    <div class="actions"><button class="btn ghost" id="copy">Copy run summary</button></div>
    <span class="meta">${endMeta()}</span>`;
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
      <button class="btn ghost" id="same">${run.daily ? 'Retry Daily' : 'Same seed'}</button>
    </div>
    <div class="actions"><button class="btn ghost" id="copy">Copy run summary</button></div>
    <span class="meta">${endMeta()}</span>`;
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

const SNACK_TOAST: Record<SnackId, string> = { cocoa: 'Cocoa!', fish: 'Fish thrown', map: 'Map out', warmer: 'Warm hands' };

const EVENT_SOUND: Partial<Record<GameEvent['type'], SoundName>> = {
  crash: 'crash', bounce: 'bounce', nearMiss: 'nearMiss', jump: 'jump', ramp: 'jump', trick: 'trick', safeLanding: 'land',
  burn: 'burn', forage: 'coin', gate: 'gate', ignite: 'ignite', burnout: 'land', goodBoy: 'bounce', token: 'coin', snack: 'snack', yetiSpawn: 'roar', closeCall: 'coin',
  eaten: 'eaten', buried: 'buried', finish: 'finish', mushroom: 'secret',
};

function handle(e: GameEvent) {
  const cue = e.type === 'land' ? (e.tricks ? 'trickLand' : 'land') : e.type === 'gate' && !e.made ? 'click' : EVENT_SOUND[e.type];
  if (cue && !(e.type === 'yetiSpawn' && game.params.condition === 'avalanche')) sound.play(cue);
  else if (e.type === 'yetiSpawn') sound.play('buried');
  switch (e.type) {
    case 'crash':
      if (e.kind === 'dog') dogsHit++;
      renderer.bump(10);
      navigator.vibrate?.(60);
      if (e.kind === 'botched') toast('Botched landing', true);
      break;
    case 'bounce':
      renderer.bump(5);
      toast('Boing!');
      break;
    case 'land':
      toast(`${e.kinds.map((k) => TRICKS[k].name).join(' + ')} +${Math.round(e.style)}`);
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
    case 'ignite':
      if (e.n % 10 === 0) toast(`🔥 ${e.n} trees`);
      break;
    case 'burnout':
      toast('Burned out', true);
      break;
    case 'gate':
      if (e.made) toast(`Gate ${game.gatesMade}/${game.gates.length} +${Math.round(e.style)}`);
      else toast('Missed gate', true);
      break;
    case 'goodBoy':
      dogsHit++;
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
    case 'mushroom':
      mushrooms++;
      toast('A mushroom? Something old stirs…');
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

/** DOM writes cost style and layout work even when the value is the same, so only write changes. */
const shown = new WeakMap<object, string>();
function setText(el: HTMLElement, text: string) {
  if (shown.get(el) === text) return;
  shown.set(el, text);
  el.textContent = text;
}
function setStyle(el: HTMLElement, prop: 'width' | 'opacity', value: string) {
  const key = el.style;
  if (shown.get(key) === prop + value) return;
  shown.set(key, prop + value);
  el.style[prop] = value;
}

function updateHud() {
  if (attracting()) return;
  setText(hud.dist, distance(game).toLocaleString());
  setText(hud.length, `/${game.params.length} m`);
  setText(hud.speed, String(Math.round(game.skier.speed)));
  setText(hud.slope, run.row === SUMMIT_ROW ? `${run.mountain + 1}-S` : game.params.gates === 'course' ? '⚑' : game.params.burn ? '🔥' : `${run.mountain + 1}-${slopeInMountain(run.row) + 1}`);
  setText(hud.style, style(game).toLocaleString());
  const mult = multiplier(game);
  setText(hud.mult, mult > 1 ? `×${mult % 1 ? mult.toFixed(1) : mult}` : '');
  const diamond = currentNode(run)?.kind === 'diamond';
  const r = diamond ? 'black' : rating(game.params.difficulty);
  if (trail.dataset.rating !== r) trail.dataset.rating = r;
  if (trail.classList.contains('double') !== diamond) trail.classList.toggle('double', diamond);
  const p = yetiProximity(game);
  const pct = Math.round(p * 100);
  setStyle(meterFill, 'width', `${pct}%`);
  if (meterFill.classList.contains('close') !== p > 0.6) meterFill.classList.toggle('close', p > 0.6);
  if (meter.getAttribute('aria-valuenow') !== String(pct)) meter.setAttribute('aria-valuenow', String(pct));
  if (game.params.gates === 'course') {
    setText(meterLabel, `Gates ${game.gatesMade}/${game.gates.length}`);
    updateSnackBar();
    return;
  }
  if (game.params.burn) {
    // The meter is your flame: it drains, and burning trees refills it.
    setStyle(meterFill, 'width', `${Math.round(game.fuel * 100)}%`);
    if (meterFill.classList.contains('close') !== game.fuel < 0.3) meterFill.classList.toggle('close', game.fuel < 0.3);
    setText(meterLabel, `🔥 ${game.burned} trees${game.fuel < 0.3 ? ' · flame low' : ''}`);
    updateSnackBar();
    return;
  }
  const waiting = game.yetis.every((y) => y.state === 'waiting' || y.state === 'holding') && !game.wall?.armed;
  const name = game.params.boss ? BOSSES[game.params.boss].name : game.params.condition === 'avalanche' ? 'avalanche' : 'yeti';
  setText(meterLabel, waiting
    ? `${game.params.boss ? name : game.params.condition ? CONDITIONS[game.params.condition].name : 'quiet'} · ${Math.max(0, Math.ceil(graceFor(game) - game.time))}s`
    : game.yetis.some((y) => y.stunT > 0) ? 'staggered' : p > 0.75 ? 'right behind you' : p > 0.4 ? 'closing' : name);
  setStyle(frost, 'opacity', mode === 'playing' || mode === 'paused' ? (Math.round(Math.max(0, (p - 0.5) * 2) * 50) / 50).toString() : '0');
  updateSnackBar();
}

// ---------- Loop ----------

// ---------- Interpolation ----------
// The simulation runs at a fixed 60 Hz, but screens refresh at 60, 90 or 120 Hz with jittery timing. Drawing the
// newest state makes some frames show no movement and others two steps (stutter), so each frame draws the moving
// things blended between the last two simulation steps.

interface Snapshot { game: Game | null; x: number; y: number; yetis: { x: number; y: number }[]; wall: number }
const prev: Snapshot = { game: null, x: 0, y: 0, yetis: [], wall: 0 };

function snapshot(g: Game) {
  prev.game = g;
  prev.x = g.skier.x;
  prev.y = g.skier.y;
  prev.yetis = g.yetis.map((y) => ({ x: y.x, y: y.y }));
  prev.wall = g.wall?.y ?? 0;
}

const lerp = (a: number, b: number, t: number) => (Math.abs(b - a) > 5 ? b : a + (b - a) * t);

/** Draw with positions blended toward the previous step, then put the true positions back. */
function drawInterpolated(g: Game, dt: number, alpha: number) {
  if (prev.game !== g || alpha >= 1) {
    renderer.draw(g, dt);
    return;
  }
  const s = g.skier;
  const x = s.x, y = s.y, wall = g.wall?.y ?? 0;
  const yetis = g.yetis.map((v) => ({ x: v.x, y: v.y }));
  s.x = lerp(prev.x, x, alpha);
  s.y = lerp(prev.y, y, alpha);
  g.yetis.forEach((v, i) => {
    const p = prev.yetis[i];
    if (!p) return;
    v.x = lerp(p.x, v.x, alpha);
    v.y = lerp(p.y, v.y, alpha);
  });
  if (g.wall) g.wall.y = lerp(prev.wall, wall, alpha);
  try {
    renderer.draw(g, dt);
  } finally {
    s.x = x;
    s.y = y;
    g.yetis.forEach((v, i) => {
      v.x = yetis[i].x;
      v.y = yetis[i].y;
    });
    if (g.wall) g.wall.y = wall;
  }
}

// ---------- Loop ----------

function frame(now: number) {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  const demo = attracting();
  let stepping = false;
  if (mode === 'playing') {
    stepping = true;
    acc += dt;
    while (acc >= CFG.dt) {
      snapshot(game);
      step(game, BOT ? botInput(game) : controls.read());
      acc -= CFG.dt;
      for (const e of game.events) handle(e);
      game.events.length = 0;
      if (mode !== 'playing') break;
    }
  } else if (demo) {
    stepping = !game.over;
    acc += dt;
    while (acc >= CFG.dt && !game.over) {
      snapshot(game);
      step(game, attractInput(game));
      acc -= CFG.dt;
      for (const e of game.events) if (e.type === 'crash' || e.type === 'eaten') renderer.bump(8);
      game.events.length = 0;
    }
    // Demo descent over: a beat to see how it ended, then the next one.
    if (game.over) {
      attractOverAt ||= now;
      if (now - attractOverAt > 1800) newAttract();
    }
    if (mode === 'title' && now - lastInput > ATTRACT_IDLE_MS) setMode('attract');
  }
  const air = game.skier.air > 0;
  const wall = game.wall?.armed ? game.wall : null;
  sound.update(dt, mode === 'playing', game.skier.speed, air, mode === 'playing' ? yetiProximity(game) : 0, {
    rumble: wall ? Math.max(0, 1 - (game.skier.y - wall.y) / 30) : 0,
    fire: game.params.burn ? game.fuel : 0,
  });
  drawInterpolated(game, mode === 'playing' || demo ? dt : 0, stepping ? acc / CFG.dt : 1);
  updateHud();
  requestAnimationFrame(frame);
}

// Offline play once installed: only on https (or localhost) and only in the real build, which links the manifest.
if ('serviceWorker' in navigator && document.querySelector('link[rel="manifest"]') && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

// ?debug exposes the live game for automated browser tests.
if (params.has('debug')) Object.assign(window, { whiteout: () => ({ game, mode }) });

// The studio splash: once per visit, about 2 s, any tap or key skips it.
const splash = $<HTMLDivElement>('#splash');
const hideSplash = () => {
  if (splash.classList.contains('gone')) return;
  splashSkipped = performance.now();
  splash.classList.add('gone');
  setTimeout(() => splash.remove(), 600);
};
splash.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  hideSplash();
});
window.addEventListener('keydown', hideSplash, { once: true });
setTimeout(hideSplash, params.has('bot') || params.has('debug') ? 0 : 2200);

setMode('attract');
requestAnimationFrame(frame);
