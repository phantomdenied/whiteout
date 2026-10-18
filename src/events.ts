// Events: one-screen choices with a tradeoff, found on the route map (run-structure-and-gear.md §Route map).
// Each choice is data; run.ts applies it. Random parts are seeded per run and map node.
import type { Build, Rarity } from './gear';

export interface EventEffect {
  tokens?: number;
  /** Gain a random Gear you don't own, of at least this rarity (and of this build, if given). */
  gear?: { rarity: Rarity; build?: Build };
  snacks?: number;
  curse?: boolean;
  removeCurses?: 'one' | 'all';
  /** Swap a random Gear you own for a random one of the next rarity up. */
  upgradeGear?: boolean;
  /** 50/50: the effect, or a Curse. */
  gamble?: boolean;
}

export interface EventChoice {
  label: string;
  /** What happens, in plain words, shown on the button. */
  detail: string;
  effect: EventEffect;
  /** Needs at least one Gear / one Curse to be worth picking (button disabled otherwise). */
  needs?: 'gear' | 'curse';
}

export interface SkiEvent {
  id: string;
  title: string;
  text: string;
  choices: EventChoice[];
}

export const EVENTS: SkiEvent[] = [
  {
    id: 'closed-run',
    title: 'The closed run',
    text: 'A rope across a run, and a sign: CLOSED. Behind it, untouched powder and somebody\'s abandoned gear bag.',
    choices: [
      { label: 'Duck the rope', detail: 'Gain an uncommon-or-better Gear. Gain a Curse.', effect: { gear: { rarity: 'uncommon' }, curse: true } },
      { label: 'Stay on the trail', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'lost-wallet',
    title: 'A lost wallet',
    text: 'A wallet in the snow, stuffed with lift tokens.',
    choices: [
      { label: 'Hand it in', detail: 'The owner gives you their lunch: 2 Snacks.', effect: { snacks: 2 } },
      { label: 'Keep it', detail: '+8 Tokens. Gain a Curse.', effect: { tokens: 8, curse: true } },
    ],
  },
  {
    id: 'ski-swap',
    title: 'Ski swap',
    text: 'A table of second-hand gear in the parking lot. The seller eyes what you\'re wearing.',
    choices: [
      { label: 'Trade up', detail: 'Swap a random Gear you own for one of the next rarity up.', effect: { upgradeGear: true }, needs: 'gear' },
      { label: 'Just looking', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'hot-tub',
    title: 'The hot tub',
    text: 'A steaming hot tub behind the lodge. The sign says GUESTS ONLY.',
    choices: [
      { label: 'Soak', detail: 'Remove every Curse. −5 Tokens for the towel.', effect: { removeCurses: 'all', tokens: -5 }, needs: 'curse' },
      { label: 'Keep moving', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'vending-machine',
    title: 'A vending machine',
    text: 'Half buried in a drift. The coin slot is frozen, but the glass is cracked.',
    choices: [
      { label: 'Pay for 2 Snacks', detail: '−4 Tokens, 2 Snacks.', effect: { tokens: -4, snacks: 2 } },
      { label: 'Shake it', detail: '50/50: 2 free Snacks, or a Curse.', effect: { snacks: 2, gamble: true } },
    ],
  },
  {
    id: 'ski-patrol',
    title: 'Ski patrol',
    text: 'A patroller is hauling a rescue sled uphill and asks for a hand.',
    choices: [
      { label: 'Help out', detail: '+6 Tokens for your trouble.', effect: { tokens: 6 } },
      { label: 'Ask about the yeti', detail: 'They share a trick: remove a Curse.', effect: { removeCurses: 'one' }, needs: 'curse' },
    ],
  },
  {
    id: 'yeti-tracks',
    title: 'Yeti tracks',
    text: 'Huge footprints lead off the trail toward a cave. Something glints inside.',
    choices: [
      { label: 'Follow them', detail: 'Gain a rare Gear. Gain a Curse.', effect: { gear: { rarity: 'rare' }, curse: true } },
      { label: 'Absolutely not', detail: 'Nothing happens.', effect: {} },
    ],
  },
  {
    id: 'old-pro',
    title: 'The old pro',
    text: 'A skier in a 1970s one-piece offers you a lesson. Cash only.',
    choices: [
      { label: 'Take the lesson', detail: '−6 Tokens. Gain a jump Gear.', effect: { tokens: -6, gear: { rarity: 'common', build: 'jump' } } },
      { label: 'Ask for speed tips', detail: '−6 Tokens. Gain a tuck Gear.', effect: { tokens: -6, gear: { rarity: 'common', build: 'tuck' } } },
      { label: 'No thanks', detail: 'Nothing happens.', effect: {} },
    ],
  },
];

export function eventById(id: string): SkiEvent {
  const e = EVENTS.find((x) => x.id === id);
  if (!e) throw new Error(`unknown event ${id}`);
  return e;
}
