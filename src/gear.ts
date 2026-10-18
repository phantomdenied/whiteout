// Gear: passive, rule-bending items kept for the rest of the run. See docs/features/run-structure-and-gear.md.
// Each item edits a Mods record that the engine (and the run, for shop/offer effects) reads; nothing
// checks gear ids directly. Snacks are one-use consumables and live here too.

export type Slot = 'skis' | 'boots' | 'poles' | 'charm';
export type Rarity = 'common' | 'uncommon' | 'rare';
export type Build = 'tuck' | 'jump' | 'crash' | 'risk';

export interface Mods {
  // Handling
  tuckMult: number;
  turnMult: number;
  tuckTurnMult: number;
  airTurnMult: number;
  accelMult: number;
  /** Seconds of unbroken tuck that fire a 1 s boost (0 = off). */
  tuckStreakBoost: number;
  /** Moguls don't slow you. */
  mogulProof: boolean;
  hikeMult: number;
  /** Snowboarder: no snowplow. */
  noBrake: boolean;
  /** Skier hitbox radius multiplier (the Dog is small). */
  hitboxMult: number;
  // Air
  /** Hops are as big as ramp jumps (and clear trees). */
  springHop: boolean;
  airMult: number;
  trickMult: number;
  /** Landing mid-trick is a safe landing (no Style) instead of a crash. */
  safeBotch: boolean;
  /** Each clean trick landing staggers the yeti this many seconds. */
  trickStagger: number;
  rampTokens: number;
  rampBoost: number;
  /** Jumping a dead tree sets it alight and staggers the yeti. */
  matchbook: boolean;
  /** Jumping a stump forages a mushroom: +1 Token and a boost. */
  forager: boolean;
  // Near misses and dogs
  /** Seconds of speed boost from each near miss. */
  nearMissBoost: number;
  /** Near misses on dogs score this many times over, and boost you for 1 s. */
  dogNearMult: number;
  /** Hitting a dog is a boost instead of a crash. */
  goodBoy: boolean;
  // Crashes
  crashTimeMult: number;
  /** Crashes per slope turned into bounces. */
  bounces: number;
  /** Crashes into rocks and stumps are always bounces. */
  smallBounce: boolean;
  /** Crashes don't reset the combo. */
  keepCombo: boolean;
  crashTokens: number;
  // Yeti
  graceAdd: number;
  yetiSpeedMult: number;
  /** Close Call (finish with the yeti meter above 80%) multiplies the slope's Style by this. */
  closeCallMult: number;
  // Run economy
  finishTokens: number;
  shopDiscount: number;
  offerSize: number;
  snackSlots: number;
  /** Snacks handed out free at every Lodge visit. */
  lodgeSnacks: number;
}

export const BASE_MODS: Mods = {
  tuckMult: 1,
  turnMult: 1,
  tuckTurnMult: 1,
  airTurnMult: 1,
  accelMult: 1,
  tuckStreakBoost: 0,
  mogulProof: false,
  hikeMult: 1,
  noBrake: false,
  hitboxMult: 1,
  springHop: false,
  airMult: 1,
  trickMult: 1,
  safeBotch: false,
  trickStagger: 0,
  rampTokens: 0,
  rampBoost: 0,
  matchbook: false,
  forager: false,
  nearMissBoost: 0,
  dogNearMult: 1,
  goodBoy: false,
  crashTimeMult: 1,
  bounces: 0,
  smallBounce: false,
  keepCombo: false,
  crashTokens: 0,
  graceAdd: 0,
  yetiSpeedMult: 1,
  closeCallMult: 1.5,
  finishTokens: 0,
  shopDiscount: 0,
  offerSize: 3,
  snackSlots: 2,
  lodgeSnacks: 0,
};

export interface Gear {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Build archetype, for offer variety and the docs. */
  build: Build;
  text: string;
  apply: (m: Mods) => void;
}

export const GEAR: Gear[] = [
  // ---- Tuck: go fast, stay ahead ----
  {
    id: 'racing-skis', name: 'Racing Skis', slot: 'skis', rarity: 'uncommon', build: 'tuck',
    text: 'Tuck speed +15%. Turning in a tuck is even wider.',
    apply: (m) => { m.tuckMult *= 1.15; m.tuckTurnMult *= 0.75; },
  },
  {
    id: 'carving-skis', name: 'Carving Skis', slot: 'skis', rarity: 'common', build: 'tuck',
    text: 'Turn 30% faster, and 50% faster in a tuck.',
    apply: (m) => { m.turnMult *= 1.3; m.tuckTurnMult *= 1.5; },
  },
  {
    id: 'rocket-boots', name: 'Rocket Boots', slot: 'boots', rarity: 'rare', build: 'tuck',
    text: 'The secret turbo: every near miss fires a 1-second speed burst.',
    apply: (m) => { m.nearMissBoost += 1; },
  },
  {
    id: 'carbon-poles', name: 'Carbon Poles', slot: 'poles', rarity: 'common', build: 'tuck',
    text: 'Pick up speed twice as fast, so crashes cost you less ground.',
    apply: (m) => { m.accelMult *= 2; },
  },
  {
    id: 'aero-helmet', name: 'Aero Helmet', slot: 'charm', rarity: 'uncommon', build: 'tuck',
    text: 'Tuck speed +8%.',
    apply: (m) => { m.tuckMult *= 1.08; },
  },
  {
    id: 'downhill-suit', name: 'Downhill Suit', slot: 'charm', rarity: 'rare', build: 'tuck',
    text: 'Every 4 seconds of unbroken tuck fires a 1-second speed burst.',
    apply: (m) => { m.tuckStreakBoost = m.tuckStreakBoost ? Math.min(m.tuckStreakBoost, 4) : 4; },
  },

  // ---- Jump: air, tricks, ramps ----
  {
    id: 'twin-tips', name: 'Twin Tips', slot: 'skis', rarity: 'uncommon', build: 'jump',
    text: 'Tricks score double Style.',
    apply: (m) => { m.trickMult *= 2; },
  },
  {
    id: 'spring-boots', name: 'Spring Boots', slot: 'boots', rarity: 'common', build: 'jump',
    text: 'Hops are as big as ramp jumps, high enough to clear trees.',
    apply: (m) => { m.springHop = true; },
  },
  {
    id: 'ice-picks', name: 'Ice Picks', slot: 'poles', rarity: 'common', build: 'jump',
    text: 'Turn three times faster in the air.',
    apply: (m) => { m.airTurnMult *= 3; },
  },
  {
    id: 'hang-time', name: 'Hang Time', slot: 'charm', rarity: 'uncommon', build: 'jump',
    text: 'Every jump stays in the air 40% longer.',
    apply: (m) => { m.airMult *= 1.4; },
  },
  {
    id: 'air-bag', name: 'Air Bag', slot: 'charm', rarity: 'common', build: 'jump',
    text: 'Landing mid-trick is a safe landing instead of a crash (no Style for it).',
    apply: (m) => { m.safeBotch = true; },
  },
  {
    id: 'ramp-rat', name: 'Ramp Rat', slot: 'charm', rarity: 'common', build: 'jump',
    text: 'Every ramp pays 1 Token and a 1-second speed burst.',
    apply: (m) => { m.rampTokens += 1; m.rampBoost = Math.max(m.rampBoost, 1); },
  },
  {
    id: 'showboat', name: 'Showboat', slot: 'charm', rarity: 'rare', build: 'jump',
    text: 'Every clean trick landing stuns the yeti for half a second.',
    apply: (m) => { m.trickStagger += 0.5; },
  },
  {
    id: 'matchbook', name: 'Matchbook', slot: 'charm', rarity: 'uncommon', build: 'jump',
    text: 'Dead trees you jump over catch fire and scare the yeti back for 1 second.',
    apply: (m) => { m.matchbook = true; },
  },
  {
    id: 'mushroom-forager', name: 'Mushroom Forager', slot: 'charm', rarity: 'common', build: 'jump',
    text: 'Jumping over a stump forages a mushroom: +1 Token and a short speed boost.',
    apply: (m) => { m.forager = true; },
  },

  // ---- Crash: crashing is a plan ----
  {
    id: 'snowshoes', name: 'Snowshoes', slot: 'boots', rarity: 'common', build: 'crash',
    text: "Moguls don't slow you down, and you hike uphill three times as fast.",
    apply: (m) => { m.mogulProof = true; m.hikeMult *= 3; },
  },
  {
    id: 'good-boy', name: 'Good Boy', slot: 'charm', rarity: 'common', build: 'crash',
    text: "Hitting a dog doesn't crash you. You get a 1-second speed boost instead. The dog is fine.",
    apply: (m) => { m.goodBoy = true; },
  },
  {
    id: 'dog-whistle', name: 'Dog Whistle', slot: 'charm', rarity: 'uncommon', build: 'crash',
    text: 'Near misses on dogs score triple and give a 1-second speed boost.',
    apply: (m) => { m.dogNearMult = Math.max(m.dogNearMult, 3); },
  },
  {
    id: 'bubble-wrap', name: 'Bubble Wrap', slot: 'charm', rarity: 'common', build: 'crash',
    text: 'Crashes keep you down half as long.',
    apply: (m) => { m.crashTimeMult *= 0.5; },
  },
  {
    id: 'rubber-chicken', name: 'Rubber Chicken', slot: 'charm', rarity: 'uncommon', build: 'crash',
    text: 'Your first crash on each slope is a bounce instead.',
    apply: (m) => { m.bounces += 1; },
  },
  {
    id: 'stunt-double', name: 'Stunt Double', slot: 'charm', rarity: 'rare', build: 'crash',
    text: 'Crashing into rocks and stumps is always a bounce.',
    apply: (m) => { m.smallBounce = true; },
  },
  {
    id: 'helmet-cam', name: 'Helmet Cam', slot: 'charm', rarity: 'common', build: 'crash',
    text: "Crashes don't reset your combo.",
    apply: (m) => { m.keepCombo = true; },
  },
  {
    id: 'insurance', name: 'Insurance Policy', slot: 'charm', rarity: 'uncommon', build: 'crash',
    text: 'Every crash pays out 1 Token.',
    apply: (m) => { m.crashTokens += 1; },
  },

  // ---- Risk and economy ----
  {
    id: 'yeti-musk', name: 'Yeti Musk', slot: 'charm', rarity: 'uncommon', build: 'risk',
    text: 'The yeti waits 3 seconds longer, but runs 5% faster.',
    apply: (m) => { m.graceAdd += 3; m.yetiSpeedMult *= 1.05; },
  },
  {
    id: 'yeti-bait', name: 'Yeti Bait', slot: 'charm', rarity: 'rare', build: 'risk',
    text: 'Close Call pays ×3 Style instead of ×1.5. Finish with the yeti right behind you.',
    apply: (m) => { m.closeCallMult = Math.max(m.closeCallMult, 3); },
  },
  {
    id: 'piggy-bank', name: 'Piggy Bank', slot: 'charm', rarity: 'common', build: 'risk',
    text: '+2 Tokens at every finish gate.',
    apply: (m) => { m.finishTokens += 2; },
  },
  {
    id: 'coupon-book', name: 'Coupon Book', slot: 'charm', rarity: 'uncommon', build: 'risk',
    text: 'Everything at the Lodge costs 25% less.',
    apply: (m) => { m.shopDiscount = Math.max(m.shopDiscount, 0.25); },
  },
  {
    id: 'lucky-charm', name: 'Lucky Charm', slot: 'charm', rarity: 'uncommon', build: 'risk',
    text: 'Reward picks offer 4 choices instead of 3.',
    apply: (m) => { m.offerSize = Math.max(m.offerSize, 4); },
  },
  {
    id: 'fanny-pack', name: 'Fanny Pack', slot: 'charm', rarity: 'common', build: 'risk',
    text: '+1 Snack slot.',
    apply: (m) => { m.snackSlots += 1; },
  },
  {
    id: 'lunchbox', name: 'Lunchbox', slot: 'charm', rarity: 'uncommon', build: 'risk',
    text: 'Get a free Snack at every Lodge.',
    apply: (m) => { m.lodgeSnacks += 1; },
  },
];

export const SLOT_LIMIT: Record<Slot, number> = { skis: 1, boots: 1, poles: 1, charm: 5 };

// ---------- Curses ----------
// Negative modifiers from Events and Black Diamonds, kept until removed at a Warming Hut or an Event.
// They never lower tuck speed (yetis.md: the pursuer rule).

export interface Curse {
  id: string;
  name: string;
  text: string;
  apply: (m: Mods) => void;
}

export const CURSES: Curse[] = [
  { id: 'squeaky-boots', name: 'Squeaky Boots', text: 'The yeti hears you coming: it shows up 2 seconds sooner.', apply: (m) => { m.graceAdd -= 2; } },
  { id: 'rental-skis', name: 'Rental Skis', text: 'Every kind of turn is 25% slower.', apply: (m) => { m.turnMult *= 0.75; m.tuckTurnMult *= 0.75; } },
  { id: 'wet-socks', name: 'Wet Socks', text: 'Crashes keep you down 30% longer.', apply: (m) => { m.crashTimeMult *= 1.3; } },
  { id: 'heavy-pack', name: 'Heavy Pack', text: 'You pick up speed 30% slower.', apply: (m) => { m.accelMult *= 0.7; } },
  { id: 'frozen-zipper', name: 'Frozen Zipper', text: 'One fewer Snack slot.', apply: (m) => { m.snackSlots -= 1; } },
  { id: 'yeti-scent', name: 'Yeti Scent', text: 'The yeti runs 4% faster.', apply: (m) => { m.yetiSpeedMult *= 1.04; } },
];

export function curseById(id: string): Curse {
  const c = CURSES.find((x) => x.id === id);
  if (!c) throw new Error(`unknown curse ${id}`);
  return c;
}

// ---------- Starting skiers ----------

export type SkierId = 'rookie' | 'snowboarder' | 'retiree' | 'dog';

export const SKIERS: Record<SkierId, { name: string; boon: string; bane: string; gear: string[]; apply: (m: Mods) => void; slots?: Partial<Record<Slot, number>> }> = {
  rookie: {
    name: 'The Rookie', boon: 'Starts with Bubble Wrap.', bane: 'None.',
    gear: ['bubble-wrap'], apply: () => {},
  },
  snowboarder: {
    name: 'The Snowboarder', boon: 'Landing mid-trick never crashes you.', bane: "Can't snowplow to slow down.",
    gear: [], apply: (m) => { m.safeBotch = true; m.noBrake = true; },
  },
  retiree: {
    name: 'The Retiree', boon: 'Starts with Rocket Boots, the secret turbo.', bane: 'Crashes keep you down 50% longer.',
    gear: ['rocket-boots'], apply: (m) => { m.crashTimeMult *= 1.5; },
  },
  dog: {
    name: 'The Dog', boon: 'Tiny: half the hitbox, and hops 20% longer.', bane: 'No Skis slot.',
    gear: [], apply: (m) => { m.hitboxMult *= 0.55; m.airMult *= 1.2; }, slots: { skis: 0 },
  },
};
export const SKIER_IDS = Object.keys(SKIERS) as SkierId[];

export const slotLimit = (slot: Slot, skier: SkierId = 'rookie') => SKIERS[skier].slots?.[slot] ?? SLOT_LIMIT[slot];
/** Gear this skier can't wear at all (the Dog has no Skis slot). */
export const canWear = (id: string, skier: SkierId = 'rookie') => slotLimit(gearById(id).slot, skier) > 0;
export const SLOT_LABEL: Record<Slot, string> = { skis: 'Skis', boots: 'Boots', poles: 'Poles', charm: 'Charm' };
export const PRICE: Record<Rarity, number> = { common: 6, uncommon: 10, rare: 16 };

export function gearById(id: string): Gear {
  const g = GEAR.find((x) => x.id === id);
  if (!g) throw new Error(`unknown gear ${id}`);
  return g;
}

/** Mods from Gear, then Curses, then the starting skier. */
export function modsFor(ids: readonly string[], curses: readonly string[] = [], skier?: SkierId): Mods {
  const m = { ...BASE_MODS };
  for (const id of ids) gearById(id).apply(m);
  for (const id of curses) curseById(id).apply(m);
  if (skier) SKIERS[skier].apply(m);
  m.snackSlots = Math.max(0, m.snackSlots);
  return m;
}

/** Adding this gear would push out an item already in its slot (the oldest one when the slot is full). */
export function displaced(owned: readonly string[], id: string, skier?: SkierId): string | null {
  const slot = gearById(id).slot;
  const same = owned.filter((o) => gearById(o).slot === slot);
  return same.length >= slotLimit(slot, skier) ? same[0] ?? null : null;
}

export function addGear(owned: readonly string[], id: string, skier?: SkierId): string[] {
  if (!canWear(id, skier)) return [...owned];
  const out = displaced(owned, id, skier);
  return [...owned.filter((o) => o !== out), id];
}

// ---------- Snacks ----------

export type SnackId = 'cocoa' | 'fish' | 'map' | 'warmer';

export const SNACKS: Record<SnackId, { name: string; short: string; text: string; price: number }> = {
  cocoa: { name: 'Hot Cocoa Thermos', short: 'Cocoa', text: 'Instantly at full tuck speed, plus a 2-second speed burst.', price: 3 },
  fish: { name: 'Frozen Fish', short: 'Fish', text: 'Throw it behind you: the yeti stops for 2 seconds to eat it.', price: 3 },
  map: { name: 'Trail Map', short: 'Map', text: 'Shows the safest line for the next 200 m.', price: 3 },
  warmer: { name: 'Hand Warmer', short: 'Warmer', text: 'Your next crash only keeps you down for 0.3 seconds.', price: 3 },
};
export const SNACK_IDS = Object.keys(SNACKS) as SnackId[];
