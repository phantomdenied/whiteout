# Whiteout

A downhill-skiing roguelike for phones: every slope is a chase, and the yeti is the clock. Inspired by SkiFree (1991); original name, art, and code.

**Status: M0 — feel prototype.** One endless seeded slope: steering, tuck, jump and tricks, crashes, six obstacle types, and the yeti chase. No run structure yet. See the [design document](docs/GDD.md) for where it's headed.

## Play
- **Drag** left/right anywhere to steer (relative to where your thumb lands). **Hold your thumb low** to tuck (faster, wider turns). **Drag up** to slow down.
- **Flick up** or **tap** to jump; flick/tap again in the air for a trick (up to 3). Land mid-trick and you crash.
- Desktop: ← → steer, ↓ tuck, ↑ slow, Space jump/trick, Esc pause, Enter restart.
- After 8 s the yeti comes. It's faster than cruising and slower than a clean tuck. Crashes cost 1.4 s, and that's how it catches you.
- Hop over rocks, stumps, dogs and moguls. Trees need a ramp.
- Add `?seed=123` to the URL to replay a slope.

## Develop
This is a separate app from Spindle, with its own package:
```bash
cd whiteout
npm install
npm run dev           # local server (also reachable from your phone on the same Wi-Fi)
npm test              # engine tests
npm run build:single  # dist/whiteout.html, one self-contained file
```

Code layout:
- `src/engine.ts` — pure, deterministic simulation at a fixed 60 Hz (no DOM); all tuning in `CFG`
- `src/input.ts` — touch and keyboard → engine input
- `src/render.ts` — canvas renderer with placeholder art
- `src/main.ts`, `src/style.css` — HUD, cards, game loop
