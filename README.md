# Whiteout

A downhill-skiing roguelike for phones: every slope is a chase, and the yeti is the clock. Inspired by SkiFree (1991); original name, art, and code.

**Status: M1 — a full run.** Three mountains, four slopes each: hand-drawn chunks stitched by seed, a finish gate, rising difficulty and yeti speed, and a pick of 1 Gear from 3 after every slope (10 Gear). Get eaten and the run is over. See the [design document](docs/GDD.md) for where it's headed.

## Play
- **Drag** left/right anywhere to steer (relative to where your thumb lands). **Hold your thumb low** to tuck (faster, wider turns). **Drag up** to slow down.
- **Flick up** or **tap** to jump; flick/tap again in the air for a trick (up to 3). Land mid-trick and you crash.
- Desktop: ← → steer, ↓ tuck, ↑ slow, Space jump/trick, 1–3 pick Gear, Esc pause, Enter continue.
- The yeti comes after a few seconds. It's faster than cruising and slower than a clean tuck. Crashes cost 1.4 s, and that's how it catches you.
- Hop over rocks, stumps, dead trees, dogs and moguls. Trees need a ramp (or Spring Boots).
- Add `?seed=123` to replay a run. Add `?bot` to let the clean-skier bot drive.

## Develop
This is a separate app from Spindle, with its own package:
```bash
cd whiteout
npm install
npm run dev           # local server (also reachable from your phone on the same Wi-Fi)
npm test              # engine, slope, run and gear tests
npm run sim           # bots ski every slope for 50 seeds; prints a table per slope
npm run build:single  # dist/whiteout.html, one self-contained file
```

Code layout:
- `src/engine.ts` — pure, deterministic simulation at a fixed 60 Hz (no DOM); all tuning in `CFG`
- `src/chunks.ts` — the hand-drawn chunk library (text grids; edit freely, tests check each has a clean line)
- `src/slope.ts` — slope generation, difficulty budget, and the line validator
- `src/run.ts` — the 12-slope run, slope parameters, Gear offers
- `src/gear.ts` — Gear definitions and the mods they apply
- `src/bot.ts` — the clean-skier bot used by `sim/` and tests
- `src/input.ts` — touch and keyboard → engine input
- `src/render.ts` — canvas renderer with placeholder art
- `src/main.ts`, `src/style.css` — HUD, cards, game loop
