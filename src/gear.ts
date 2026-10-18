// Gear: passive, rule-bending items kept for the rest of the run. See docs/features/run-structure-and-gear.md.
// Each item edits a Mods record that the engine reads; the engine never checks gear ids directly.

export type Slot = 'skis' | 'boots' | 'poles' | 'charm';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Mods {
  tuckMult: number;
  tuckTurnMult: number;
  /** Hops are as big as ramp jumps (and clear trees). */
  springHop: boolean;
  airTurnMult: number;
  /** Seconds of speed boost from each near miss. */
  nearMissBoost: number;
  /** Jumping a dead tree sets it alight and staggers the yeti. */
  matchbook: boolean;
  /** Jumping a stump forages a mushroom: +1 Token and a boost. */
  forager: boolean;
  /** Hitting a dog is a boost instead of a crash. */
  goodBoy: boolean;
  crashTimeMult: number;
  /** Crashes per slope turned into bounces. */
  bounces: number;
  graceAdd: number;
  yetiSpeedMult: number;
}

export const BASE_MODS: Mods = {
  tuckMult: 1,
  tuckTurnMult: 1,
  springHop: false,
  airTurnMult: 1,
  nearMissBoost: 0,
  matchbook: false,
  forager: false,
  goodBoy: false,
  crashTimeMult: 1,
  bounces: 0,
  graceAdd: 0,
  yetiSpeedMult: 1,
};

export interface Gear {
  id: string;
  name: string;
  slot: Slot;
  rarity: Rarity;
  /** Build archetype, for the simulator and for offer variety. */
  build: 'tuck' | 'jump' | 'crash' | 'risk';
  text: string;
  apply: (m: Mods) => void;
}

export const GEAR: Gear[] = [
  {
    id: 'racing-skis', name: 'Racing Skis', slot: 'skis', rarity: 'uncommon', build: 'tuck',
    text: 'Tuck speed +15%. Turning in a tuck is even wider.',
    apply: (m) => { m.tuckMult *= 1.15; m.tuckTurnMult *= 0.75; },
  },
  {
    id: 'rocket-boots', name: 'Rocket Boots', slot: 'boots', rarity: 'rare', build: 'tuck',
    text: 'The secret turbo: every near miss fires a 1-second speed burst.',
    apply: (m) => { m.nearMissBoost += 1; },
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
    id: 'matchbook', name: 'Matchbook', slot: 'charm', rarity: 'uncommon', build: 'jump',
    text: 'Dead trees you jump over catch fire and scare the yeti back for 1 second.',
    apply: (m) => { m.matchbook = true; },
  },
  {
    id: 'mushroom-forager', name: 'Mushroom Forager', slot: 'charm', rarity: 'common', build: 'jump',
    text: 'Jumping over a stump forages a mushroom: +1 Token and a short speed boost.',
    apply: (m) => { m.forager = true; },
  },
  {
    id: 'good-boy', name: 'Good Boy', slot: 'charm', rarity: 'common', build: 'crash',
    text: "Hitting a dog doesn't crash you. You get a 1-second speed boost instead. The dog is fine.",
    apply: (m) => { m.goodBoy = true; },
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
    id: 'yeti-musk', name: 'Yeti Musk', slot: 'charm', rarity: 'uncommon', build: 'risk',
    text: 'The yeti waits 3 seconds longer, but runs 5% faster.',
    apply: (m) => { m.graceAdd += 3; m.yetiSpeedMult *= 1.05; },
  },
];

export const SLOT_LIMIT: Record<Slot, number> = { skis: 1, boots: 1, poles: 1, charm: 5 };
export const SLOT_LABEL: Record<Slot, string> = { skis: 'Skis', boots: 'Boots', poles: 'Poles', charm: 'Charm' };

export function gearById(id: string): Gear {
  const g = GEAR.find((x) => x.id === id);
  if (!g) throw new Error(`unknown gear ${id}`);
  return g;
}

export function modsFor(ids: readonly string[]): Mods {
  const m = { ...BASE_MODS };
  for (const id of ids) gearById(id).apply(m);
  return m;
}

/** Adding this gear would push out an item already in its slot (the oldest one when the slot is full). */
export function displaced(owned: readonly string[], id: string): string | null {
  const slot = gearById(id).slot;
  const same = owned.filter((o) => gearById(o).slot === slot);
  return same.length >= SLOT_LIMIT[slot] ? same[0] : null;
}

export function addGear(owned: readonly string[], id: string): string[] {
  const out = displaced(owned, id);
  return [...owned.filter((o) => o !== out), id];
}
