# Whiteout

A downhill-skiing roguelike for phones: every slope is a chase, and the yeti is the clock. Inspired by SkiFree (1991); original name, art, and code.

**Status: M2 — builds.** Each of the three mountains runs Slope, Slope, Lodge, Slope, Slope, Lodge, Summit. A reward pick after every descent (Gear, a Snack, or Tokens), a shop at every Lodge (buy, sell, reroll), 30 Gear across tuck / jump / crash / risk builds, 4 Snacks, and a boss on every Summit: Big Yeti, The Twins, The Old One. Runs save between stages. See the [design document](docs/GDD.md).

## Play
- **Drag** left/right anywhere to steer (relative to where your thumb lands). **Hold your thumb low** to tuck (faster, wider turns). **Drag up** to slow down.
- **Flick up** or **tap** to jump; flick/tap again in the air for a trick (up to 3). Land mid-trick and you crash.
- **Snacks:** tap one (top right) to use it. Desktop: 1–3.
- Desktop: ← → steer, ↓ tuck, ↑ slow, Space jump/trick, 1–4 pick a reward, Esc pause, Enter continue.
- The yeti comes after a few seconds. It's faster than cruising and slower than a clean tuck. Crashes cost 1.4 s, and that's how it catches you.
- Hop over rocks, stumps, dead trees, dogs and moguls. Trees need a ramp (or Spring Boots).
- Add `?seed=123` to replay a run, `?bot` to let the clean-skier bot drive, `?stage=6` to start at a stage (0-based; 2 is the first Lodge, 6/13/20 are the Summits).

## Develop
This is a separate app from Spindle, with its own package:
```bash
cd whiteout
npm install
npm run dev           # local server (also reachable from your phone on the same Wi-Fi)
npm test              # engine, slope, run and gear tests
npm run sim           # bots ski every descent for 50 seeds (plain, cruiser, tuck build, crash build)
npm run build:single  # dist/whiteout.html, one self-contained file
```

Code layout:
- `src/engine.ts` — pure, deterministic simulation at a fixed 60 Hz (no DOM); all tuning in `CFG`
- `src/chunks.ts` — the hand-drawn chunk library (text grids; edit freely, tests check each has a clean line)
- `src/slope.ts` — slope generation, difficulty budget, and the line validator
- `src/run.ts` — stages, slope and Summit parameters, reward offers, the Lodge, save
- `src/gear.ts` — the 30 Gear, the mods they apply, and Snacks
- `src/bot.ts` — the clean-skier bot used by `sim/` and tests
- `src/input.ts` — touch and keyboard → engine input
- `src/render.ts` — canvas renderer with placeholder art
- `src/main.ts`, `src/style.css` — HUD, cards, game loop
