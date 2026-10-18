# Whiteout

By **?God Complex Studios**.

A downhill-skiing roguelike for phones: every slope is a chase, and the yeti is the clock. Inspired by SkiFree (1991); original name, art, and code.

**Play it:** https://phantomdenied.github.io/whiteout/ (best on a phone, held upright)

**Playtesting?** Play a run or two, then [leave feedback](https://github.com/phantomdenied/whiteout/issues/new?template=playtest.yml). Tap *Copy run summary* on the end screen and paste it in.

**Status: M4 — everything but the final art.** Pick your route down three mountains on a branching map: Slopes and Black Diamonds, Lodges (shop), Warming Huts (rest) and Events (risky choices), and a boss on every Summit. Mountains 2 and 3 bring Conditions: Powder, Ice, Night, Fog and Avalanches. 30 Gear, 4 Snacks, 6 Curses. Runs save between nodes.

New in M4:
- **Unlocks:** start as the Rookie; unlock the Snowboarder, the Retiree and the Dog by playing (the skier screen says how).
- **Altitude:** win once to unlock Altitude 1, a 10-step difficulty ladder.
- **Daily run:** the same mountain for everyone each day (UTC). Your best and attempts are kept.
- **Sound:** synthesized effects, a ski hiss and yeti footsteps. Toggle on the title or pause screen, or press `M`.
- **Run summary:** the end screen shows your route and copies a text summary (handy for feedback).
- **Slalom:** gates on some slopes (they mark a safe line and build your combo), and a no-yeti Slalom bonus stage on the map that pays per gate.
- **Burning Man** bonus stage: you're on fire in a dense forest. Trees you touch go up in flames for points and feed your flame; rocks still crash you, and if your flame burns out the stage ends.
- **Avalanche Black Diamonds** (optional): the wall stays 10 m behind you, nearly as fast as your tuck. Built to need speed and control upgrades; pays triple Tokens and two rares.
- **Patches and the Chalet:** every run earns Patches; spend them on passives (Pocket Money, Second Wind, Avalanche Beacon…) and pin up to 3 for your next run.
- **Lift Passes:** beat a mountain's Summit to start later runs on the next mountain.
- **At night** the headlamp is a beam you aim by turning, and the yeti's eyes glow red in the dark.
- **Attract mode:** the start screen shows the bot skiing demo descents (it comes back after 45 s idle on the title).
- **Install it:** on iPhone, Share → Add to Home Screen; on Android, the *Install app* button. Works offline once installed.

See the [design document](docs/GDD.md).

## Play
- **Drag** left/right anywhere to steer (relative to where your thumb lands). **Hold your thumb low** to tuck (faster, wider turns). **Drag up** to slow down.
- **Tricks:** while tucked, **swipe up** (Spread Eagle), **left** (Helicopter) or **right** (Backflip): you pop straight into the trick. Swipe again in the air to chain (three need extra air from Gear or a ramp). Longer tricks score more, mixing them scores a bonus. Land mid-trick and you crash.
- **Double-tap** to jump (hop over rocks, stumps and dogs).
- **Snacks:** tap one (top right) to use it. Desktop: 1–3.
- Desktop: ← → steer, ↓ tuck, ↑ slow, Space jump, ↓ + Z / X / C tricks, 1–4 pick a reward, Esc pause, Enter continue, M sound on/off.
- The yeti comes after a few seconds. It's faster than cruising and slower than a clean tuck. Crashes cost 1.4 s, and that's how it catches you.
- Hop over rocks, stumps, dead trees, dogs and moguls. Trees need a ramp (or Spring Boots).
- Add `?seed=123` to replay a run, `?bot` to let the clean-skier bot drive, `?mountain=1&row=6` to start further in (0-based; row 6 is the Summit).

## Develop
```bash
npm install
npm run dev           # local server (also reachable from your phone on the same Wi-Fi)
npm test              # engine, slope, run and gear tests
npm run sim           # bots ski every slope, Black Diamond × Condition and Summit (add `-- 30 builds` for build tables)
npx vite-node sim/altitude.ts   # clean-bot clear rate at Altitude 0, 5 and 10
npm run build:single  # dist/whiteout.html, one self-contained file
```

Pushing to `main` runs the tests and deploys to GitHub Pages (`.github/workflows/pages.yml`).

Code layout:
- `src/engine.ts` — pure, deterministic simulation at a fixed 60 Hz (no DOM); all tuning in `CFG`
- `src/chunks.ts` — the hand-drawn chunk library (text grids; edit freely, tests check each has a clean line)
- `src/slope.ts` — slope generation, difficulty budget, and the line validator
- `src/run.ts` — route maps, descent parameters and Conditions, rewards, the Lodge, Warming Huts, Events, save
- `src/gear.ts` — the 30 Gear, Curses, starting skiers, Snacks, and the mods they apply
- `src/events.ts` — the Event library
- `src/profile.ts` — unlocks, Altitude, lifetime stats, Daily results, Patches, the Chalet, Lift Passes, the run summary text
- `src/passives.ts` — the persistent passives
- `src/audio.ts` — synthesized sound (Web Audio)
- `public/` — PWA manifest, icons, service worker
- `src/bot.ts` — the clean-skier bot used by `sim/` and tests
- `src/input.ts` — touch and keyboard → engine input
- `src/render.ts` — canvas renderer with placeholder art
- `src/main.ts`, `src/style.css` — HUD, cards, game loop
