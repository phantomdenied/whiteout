// The playtest kit's report: everything a developer needs to understand and replay what a tester saw, as plain
// text (docs/playtest.md). Pure: the page hands in the state; nothing here reads the DOM, storage or the clock.
// Nothing personal goes in: no names, no account, no location, no full user agent.
import { CONDITIONS, type Game, distance, multiplier, style, yetiProximity } from './engine';
import { SKIERS, SNACKS, curseById, gearById } from './gear';
import { passiveById } from './passives';
import { type Profile, routeText } from './profile';
import {
  BURN,
  MOUNTAINS,
  type MapNode,
  ROWS,
  type RunState,
  TOTAL_DESCENTS,
  currentNode,
  descentsDone,
  nodeSeed,
  paramsFor,
} from './run';
import { VERSION } from './version';

export const GAME_NAME = 'Whiteout';
/** The public build, for replay links (the claude.ai Artifact has no address a tester can add ?seed= to). */
export const PLAY_URL = 'https://phantomdenied.github.io/whiteout/';
export const DISCORD_URL = 'https://dsc.gg/god-complex-studios';

export interface DeviceInput {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  width: number;
  height: number;
  dpr: number;
  standalone: boolean;
}

/** OS, browser and screen in one line, e.g. "iOS 17.5 · Safari · 390×844 @3x · home-screen app". */
export function deviceSummary(d: DeviceInput): string {
  const ua = d.userAgent;
  let os = 'Unknown OS';
  const ios = ua.match(/(?:iPhone|iPad|iPod).*? OS (\d+)[_.](\d+)/);
  const android = ua.match(/Android (\d+(?:\.\d+)?)/);
  const mac = ua.match(/Mac OS X (\d+)[_.](\d+)/);
  const win = ua.match(/Windows NT (\d+\.\d+)/);
  if (ios) os = `iOS ${ios[1]}.${ios[2]}`;
  else if (d.platform === 'MacIntel' && d.maxTouchPoints > 1) os = 'iPadOS';
  else if (android) os = `Android ${android[1]}`;
  else if (mac) os = `macOS ${mac[1]}.${mac[2]}`;
  else if (win) os = `Windows ${win[1] === '10.0' ? '10/11' : win[1]}`;
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  const browser = /CriOS/.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /EdgiOS|Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Unknown browser';
  const dpr = Math.round(d.dpr * 100) / 100;
  return [os, browser, `${Math.round(d.width)}×${Math.round(d.height)} @${dpr}x`, d.standalone ? 'home-screen app' : 'browser tab'].join(' · ');
}

const NODE_NAME: Record<MapNode['kind'], string> = {
  slope: 'Slope', diamond: 'Black Diamond', lodge: 'Lodge', hut: 'Warming Hut', event: 'Event', slalom: 'Slalom (bonus)',
  burn: 'Burning Man (bonus)', summit: 'Summit',
};

const time = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export interface ReportInput {
  /** The screen the tester is on (the game's mode). */
  mode: string;
  /** "Fun so far", 1–5, or null when not rated. */
  rating: number | null;
  /** The run, or null when none has started this visit. */
  run: RunState | null;
  /** The descent being skied (or just finished, or paused), or null on map and menu screens. */
  game: Game | null;
  profile: Profile;
  device: string;
}

/** The plain-text report: game and version, where the tester is, score vs goal, status, seeds, build, device. */
export function buildReport(r: ReportInput): string {
  const lines: string[] = [];
  const add = (label: string, value: string) => lines.push(`${label}: ${value}`);
  lines.push(`${GAME_NAME} v${VERSION} · playtest report`);
  add('Fun so far', r.rating ? `${r.rating}/5` : 'not rated');
  add('Screen', r.mode);
  const run = r.run;
  if (!run) {
    add('Run', 'none started yet');
  } else {
    // Seeds: the run seed replays the whole run (maps, Conditions, rewards, every slope); the slope seed is
    // derived from it and named so a single descent can be rebuilt directly.
    add('Run seed', `${run.seed}${run.daily ? ` (Daily ${run.daily})` : ''} · replay: ${PLAY_URL}?seed=${run.seed}`);
    const node = currentNode(run);
    const where = [`Mountain ${run.mountain + 1} of ${MOUNTAINS.length} (${MOUNTAINS[run.mountain].name})`, `map row ${run.row + 1} of ${ROWS}`];
    if (node) where.push(NODE_NAME[node.kind]);
    const p = node && node.kind !== 'lodge' && node.kind !== 'hut' && node.kind !== 'event' ? paramsFor(run) : null;
    if (p?.condition) where.push(`Condition: ${CONDITIONS[p.condition].name}`);
    add('Where', where.join(' · '));
    if (p) add('Slope seed', String(nodeSeed(run)));
    add('Status', `${run.status} · ${descentsDone(run)} of ${TOTAL_DESCENTS} descents cleared (goal: all ${TOTAL_DESCENTS}, beating 3 Summits)`);
    add('Setup', [SKIERS[run.skier].name, `Altitude ${run.altitude}`, run.startMountain ? `Lift Pass start on mountain ${run.startMountain + 1}` : 'started on mountain 1'].join(' · '));
  }
  const g = r.game;
  if (run && g && Number.isFinite(g.params.length)) {
    const bits = [`${distance(g)} / ${g.params.length} m`, `Style ${style(g).toLocaleString('en-US')}`, `combo ×${multiplier(g)}`, time(g.time)];
    if (g.params.burn) bits.push(`${g.burned} trees burned (reward pick at ${BURN.pickAt[g.params.mountain] ?? '?'})`, `flame ${Math.round(g.fuel * 100)}%`);
    else if (g.gates.length) bits.push(`gates ${g.gatesMade}/${g.gates.length}`);
    if (g.yetis.length || g.wall) bits.push(`pursuer ${Math.round(yetiProximity(g) * 100)}% close`);
    if (g.result) bits.push(g.result === 'cleared' ? 'cleared' : 'caught');
    add('Descent', bits.join(' · '));
  }
  if (run) {
    const last = run.results[run.results.length - 1];
    if (last) add('Last result', `${NODE_NAME[last.kind]} on mountain ${last.mountain + 1}: ${last.cleared ? 'cleared' : 'caught'} · ${last.distance} m · Style ${last.style.toLocaleString('en-US')} · +${last.tokens} Tokens`);
    add('Tokens', String(run.tokens));
    add('Route', routeText(run) || 'not started');
    add('Gear', run.gear.length ? run.gear.map((id) => gearById(id).name).join(', ') : 'none');
    add('Snacks', run.snacks.length ? run.snacks.map((id) => SNACKS[id].short).join(', ') : 'none');
    add('Curses', run.curses.length ? run.curses.map((id) => curseById(id).name).join(', ') : 'none');
    const passives = Object.entries(run.passives).map(([id, rank]) => `${passiveById(id).name}${rank > 1 ? ` ${'I'.repeat(rank)}` : ''}`);
    add('Passives', passives.length ? passives.join(', ') : 'none');
  }
  const pr = r.profile;
  add('Profile', `Patches ${pr.patches} · Lift Pass to mountain ${pr.liftPass + 1} · Altitude unlocked ${pr.altitude} · runs ${pr.stats.runs} · wins ${pr.stats.wins} · skiers ${pr.unlocked.length}/4`);
  add('Device', r.device);
  return lines.join('\n');
}
