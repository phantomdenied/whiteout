# Whiteout — Game Design Document (Master)

> **Version:** v1.5 · **Status:** Draft · **Last updated:** 2026-10-18
> **Working title:** *Whiteout* (placeholder — rename freely)

This is the master document. It stays short and links out to Feature Documents for the detail. If a Feature Document and this file disagree, **the Feature Document is authoritative** for its system and this file should be fixed.

| Feature Document | Covers |
|---|---|
| [Descent & Controls](features/descent-and-controls.md) | Steering, speed, tuck, jumps, tricks, crashes, obstacles, slope generation |
| [Yetis](features/yetis.md) | The pursuers: spawn, chase rules, escape, edge yetis, Summit bosses |
| [Run Structure & Gear](features/run-structure-and-gear.md) | Mountains, slopes, route map, Tokens, Lodge, Gear, Snacks, skiers, unlocks |

---

## 1. Executive Summary

| | |
|---|---|
| **Pitch (30 s)** | The 1991 downhill skiing game where a yeti eats you, rebuilt as a roguelike. Each slope is a short, seeded, procedurally built run with something hunting you from behind. Between slopes you pick Gear that changes how you ski. Get down three mountains alive to win the run. |
| **Genre** | Single-player arcade roguelike / downhill dodger |
| **Platform** | Phone first (portrait, one thumb). Ships as a PWA, then wrapped for iOS/Android. Desktop playable with the keyboard. |
| **Audience** | People who remember SkiFree's yeti; Downwell / Balatro / Slay the Spire fans who want a fast action-roguelike in 1-minute bites. |
| **Session length** | Slope: 45–90 s. Full run: 20–30 min, save between slopes. |
| **USP** | The most-remembered moment in casual PC gaming — the yeti appearing — becomes the core loop instead of the punchline. Every slope is a chase; every build is a different answer to "how do I not get eaten?" |

### Inspirations and landscape
- **SkiFree** (Chris Pirih, 1991) — the source: endless slope, trees, dogs, ramps, the yeti at 2,000 m, the secret turbo key. We take its *mechanics and spirit*, never its name, art, or code (see §12).
- **Downwell** — a vertical one-thumb roguelike; shows how much build variety fits in short descents.
- **Balatro / Slay the Spire** — route map, shop, and synergy-driven builds between short encounters.
- **Alto's Adventure / Odyssey** — modern phone skiing; proves the controls and audience. It's endless and serene, not a roguelike and not a chase.

## 2. Design Pillars

### P1. The yeti is the clock
> There is always something behind you. Speed is survival, not just score.

- ✅ Every slope has a pursuer; dawdling, crashing, and detours all let it close.
- ✅ Risky lines (ramps, gaps, tucking through trees) buy distance and Style.
- ❌ Health bars, hit points, or a timer that ticks without a visible cause.
- ❌ Safe slopes with nothing chasing (rest happens *between* slopes).

### P2. Gear changes how you ski, not just how fast
> A build should feel different in your thumb, not only in the numbers.

- ✅ Gear that adds verbs or rewrites rules: "Jumping over a tree sets it alight and scares the yeti back", "Crashing into dogs is a speed boost".
- ✅ Combos across Gear and Snacks: a jump build, a crash build, a tuck build.
- ❌ Flat "+10% speed" items with no interaction.

### P3. One thumb, readable at speed
> Fully playable one-handed in portrait, and every death is visible coming.

- ✅ Steering by thumb drag, jump by flick; nothing needs two hands.
- ✅ The camera shows more slope ahead than behind; hazards are telegraphed before they're on screen.
- ❌ Off-screen instant deaths, tiny hitboxes, multi-finger gestures.

### P4. Homage, not copy
> It should feel like SkiFree's sense of humor grew a game around it.

- ✅ The jokes become mechanics: dogs, burning dead trees, stumps that turn into mushrooms, the chairlift, the secret turbo.
- ✅ Original name, art, sound, and code.
- ❌ SkiFree's name, sprites, sounds, or decompiled code.

### P5. Short slopes, fair luck
> A loss should feel like your line choice, not the generator.

- ✅ Seeded slopes (shareable seeds), generation from hand-made chunks with a difficulty budget.
- ✅ Every slope is beatable without Gear at its intended difficulty (verified by the simulator).
- ❌ Unavoidable obstacle walls, yetis faster than a clean tuck.

## 3. Core Gameplay

### Loops
```
 Moment (seconds)        Slope (~1 min)               Run (20–30 min)
┌────────────────┐      ┌──────────────────────┐      ┌──────────────────────────┐
│ read the slope │      │ descend to the gate  │      │ 3 Mountains              │
│ steer / tuck / │ ───▶ │ while the yeti hunts │ ───▶ │ × (4 slopes + Summit)    │
│ jump / trick   │      │ earn Style → Tokens  │      │ pick a route on the map  │
│ dodge or crash │      │ reward pick (1 of 3) │      │ build Gear at the Lodge  │
└────────────────┘      └──────────────────────┘      │ win: survive Summit 3    │
                                                      └──────────────────────────┘
                                                                  │
                                                Meta: unlock skiers, Gear, Conditions
```

### Win and loss
- **Slope cleared:** pass the finish gate at the bottom.
- **Run won:** clear the third Summit (the boss chase).
- **Run lost:** a yeti catches you. Permadeath. Crashing alone never ends a run; it only costs time, and time is what the yeti eats.

### Controls
| | Phone (primary) | Desktop |
|---|---|---|
| Steer | Drag thumb left/right anywhere in the lower half (relative, like a virtual stick) | ← → |
| Tuck (go faster, turn wider) | Hold the thumb low on the screen | ↓ |
| Slow down | Drag the thumb up past its start point | ↑ |
| Jump / trick | Flick up; flick again in the air for a trick | Space; again in the air |
| Snack | Tap its icon (top right) | 1–3 |
| Pause | Tap the pause icon | Esc / F3 |

Controls are the riskiest open question and are prototyped first (see [Descent & Controls](features/descent-and-controls.md)).

## 4. Game Systems
| System | Summary | Doc |
|---|---|---|
| Descent | Skier physics (angle, speed, tuck), jumps and tricks, crashes, obstacle catalogue, chunk-based seeded slope generation, Conditions | [Descent & Controls](features/descent-and-controls.md) |
| Pursuers | The yeti spawns after a grace period, chases at a capped speed, closes when you crash, and eats you on contact. Edge yetis guard the slope's sides. Summits are boss chases. | [Yetis](features/yetis.md) |
| Run & economy | Route map, Style → Tokens, reward picks, the Lodge shop, Gear slots, Snacks, starting skiers, unlocks | [Run Structure & Gear](features/run-structure-and-gear.md) |

Dependency order: Descent ← Yetis ← Run & Gear. (Yetis read skier speed and crash state; Gear modifies both.)

## 5. Narrative and Setting
Light and absurd, told through item text and one line per Summit, like SkiFree's jokes.
- A resort mountain range at the end of the season. The lifts are closing, the last bus leaves from the bottom, and the yetis have woken up hungry.
- Three mountains with their own look: **Bunny Hill Range** (resort, groomed runs, lots of other skiers and dogs), **Black Pine** (forest, night, ice), **The Spine** (alpine, cliffs, avalanches, whiteouts).
- No cutscenes. Skier bios and Gear text carry the humor.

## 6. Characters
- **Skiers** (playable): each is a starting kit with a boon and a bane, the same idea as Spindle's starting decks. See [Run Structure & Gear](features/run-structure-and-gear.md#starting-skiers).
- **Yetis** (enemies): the Yeti, the Edge Yetis, and one Summit boss per mountain. See [Yetis](features/yetis.md).
- **Slope traffic** (neutral hazards): dogs, other skiers, snowboarders, and the chairlift. They're obstacles with personality, not enemies.

## 7. Level Design
- **Run = 3 Mountains.** Each mountain is a branching route map of 6 rows ending at a **Summit** (boss chase): every path crosses 4 slopes and 2 stops.
- **Slope** = 600–1,000 m of procedurally stitched **chunks** (hand-authored slope segments about one screen tall), built from a seed under a difficulty budget that rises per slope and per mountain.
- **Map nodes:** slope rows offer Slope or Black Diamond (harder, more reward); stop rows offer Lodge (shop), Warming Hut (rest: refill Snacks, remove a Curse, or upgrade one Gear), or Event (a one-screen choice).
- **Conditions** modify a whole slope: Powder, Ice, Night, Fog, Avalanche. Mountains 2 and 3 add them.

Details: [Descent & Controls §Slope generation](features/descent-and-controls.md#slope-generation) and [Run Structure & Gear §Route map](features/run-structure-and-gear.md#route-map).

## 8. UI/UX
### Screen flow
```
Title ─▶ Skier pick ─▶ Route map ─▶ Slope ─▶ Reward pick ─▶ Route map ─▶ … ─▶ Summit ─▶ next Mountain
                                      │                                                   │
                                      └──── caught ─▶ Run summary (seed, stats, unlocks) ◀┘ (win)
```
### Slope HUD (portrait)
```
┌───────────────────────────┐
│ 412m   0:38   ★ 1,240  ⏸ │  distance · time · Style · pause
│ [▓▓▓▓▓▓░░░░] yeti         │  Yeti distance meter (fills as it closes)
│                 🥤 🐟     │  Snacks
│                           │
│        (slope view;       │  camera: skier ~1/3 from the top,
│     more slope ahead      │  2/3 of the screen shows what's ahead
│       than behind)        │
│                           │
│ - - - thumb zone - - - -  │  lower half: steer / tuck / flick
└───────────────────────────┘
```
- The yeti meter is the main tension cue, backed by sound (a roar on spawn, footsteps as it closes) and a screen-edge frost vignette.
- Pick screens and the Lodge use big cards, sized for a thumb, like Spindle.

## 9. Audio
- Light chiptune with a modern mix. The tempo of each slope's music rises as the yeti closes.
- Readable cues: a roar on spawn, footsteps when it's within one screen, a "whoosh" for near misses, a crunch and wobble for crashes.
- Every cue also has a visual equivalent, so the game is fully playable on mute (phones are often muted).
- **Built in M4:** all sound is synthesized live with Web Audio (no audio files): a ski hiss that follows your speed, yeti footsteps that quicken as it closes in, a roar on spawn (a low rumble for an Avalanche), and short cues for crashes, near misses, jumps, tricks, landings, Tokens, Snacks, the finish and the secret. A Sound on/off toggle (title and pause screens, or `M`) is remembered. Music is not built yet.

## 10. Business Model
- Premium, one-time purchase. No ads, no in-app purchases, no energy timers.
- Free web demo: Mountain 1 only.
- Daily Seed: the same run for everyone, with a local leaderboard and shareable result text. **Built in M4:** one seed per UTC date, always the Rookie at Altitude 0; your best result and attempts for the day are kept, and the end screen copies a shareable summary.

## 11. Development Plan
Same stack as Spindle: TypeScript + Vite + Vitest. The game is drawn on a 2D canvas, all in this folder, with its own `package.json`. The simulation engine is pure and deterministic (fixed timestep, seeded RNG, no DOM), so bots can play thousands of slopes for balance, as Spindle's `sim/` does.

| Milestone | Scope | Exit test |
|---|---|---|
| **M0 — Feel** (built; playtest pending) | One endless slope: steering, tuck, jump, crash, 6 obstacle types, the yeti chase. Placeholder art. | Five people play on a phone; controls feel good within 30 s; the yeti is scary. |
| **M1 — Slopes** (built) | Chunk library, seeded generation, finish gate, difficulty budget, 3 mountains in a straight line, reward pick of 1 in 3 (10 Gear). | A run starts, ends, and can be replayed from a seed. The simulator shows every slope is clearable without Gear. |
| **M2 — Builds** (built; playtest pending) | Tokens, the Lodge, Snacks, 30 Gear, the Summit bosses. | Three distinct builds are viable in playtests. |
| **M3 — Roguelike** (built; playtest pending) | Route map, Black Diamonds, Events, Conditions, 4 starting skiers. | Average run length 20–30 min; no single dominant route. |
| **M4 — Ship** (built except final art; playtest pending) | Unlocks, Daily Seed, final art and audio, PWA, save and resume. Built: skier unlocks, the Altitude ladder, Daily Seed, synthesized audio, end-of-run summary with a copy button, installable PWA with offline play, save and resume. Not built: final art, music. | Ready for the store. |

## 12. Risks
| Risk | Severity | Mitigation |
|---|---|---|
| **IP:** too close to SkiFree (name, art, the "Abominable Snow Monster") | High | Original name, art, audio, and code. Yetis are folklore; ours get their own design and name. Mechanics are not copyrightable, but trade dress (look and feel) can be, so the art style is deliberately different. |
| Phone steering feels imprecise at speed | High | M0 is entirely about feel. Try relative drag, tilt, and two-zone tap; pick by playtest. |
| Procedural slopes feel samey | Medium | Hand-authored chunks with tags, Conditions, a themed mountain each, and Gear that changes how you read the slope. |
| Deaths feel unfair (from behind, or off-screen) | Medium | The yeti meter, audio cues, a minimum 3 s grace period on every slope (Summits included), and a hard pursuer speed cap below clean-tuck speed (P5). |
| Balance: one Gear combo trivializes the yeti | Medium | Simulator bots for each build archetype; Summits test different skills. |
| Scope creep from the "roguelike" layer | Medium | Milestones gate features; Feature Docs are written only for systems in development. |

## Glossary
| Term | Meaning |
|---|---|
| **Run** | One attempt from skier pick to win or death |
| **Mountain** | One act of the run: a route map of slopes ending in a Summit |
| **Slope** | One descent from the start to the finish gate |
| **Summit** | A mountain's final slope: a boss chase |
| **Chunk** | A hand-authored slope segment about one screen tall; slopes are stitched from chunks |
| **Condition** | A modifier for a whole slope (Powder, Ice, Night, Fog, Avalanche) |
| **Yeti** | The main pursuer on every slope |
| **Edge Yeti** | A pursuer that guards the slope's left/right bounds |
| **Grace** | Time at the start of a slope before the yeti moves (never under 3 s) |
| **Pursuer cap** | The hard speed limit for every yeti and avalanche (17.5 m/s), always below clean tuck speed (18 m/s) |
| **Leash** | The yeti never falls more than 1.5 screens behind; if it does, it jumps forward to that distance |
| **Stagger** | A short stop forced on the yeti by Gear or Snacks (at most 3 s per slope) |
| **Tuck** | Crouched stance: faster, wider turns |
| **Style** | Points from distance, tricks, gates, and near misses; converts to Tokens |
| **Combo** | A multiplier (×1 → ×4) on trick and near-miss Style that builds until you crash |
| **Close Call** | Finishing a slope with the yeti meter above 80%: ×1.5 Style |
| **Token** | Run currency, spent at the Lodge |
| **Black Diamond** | A harder slope node: difficulty +2, a Condition, better rewards |
| **Lodge** | A stop node with the shop |
| **Warming Hut** | A stop node for rest: refill Snacks, remove a Curse, or upgrade one Gear |
| **Altitude** | A post-win difficulty tier (1–10), like an ascension ladder |
| **Gear** | A passive, rule-bending item for the rest of the run (slotted) |
| **Snack** | A one-use consumable |
| **Curse** | A negative modifier picked up from Events or Black Diamonds |
| **Skier** | A playable character: a starting kit with a boon and a bane |

## Change Log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First draft (gdd init) |
| v1.1 | 2026-10-17 | Audit fixes: 6-row maps (4 slopes + 2 stops), pursuer cap, 3 s minimum grace, Hot Cocoa node → Warming Hut, Peaks → Altitude, glossary completed |
| v1.2 | 2026-10-18 | M0 and M1 prototypes built |
| v1.3 | 2026-10-18 | M2 prototype built |
| v1.4 | 2026-10-18 | M3 prototype built |
| v1.5 | 2026-10-18 | M4 built except art: unlocks, Altitude, Daily Seed, audio, run summary, PWA |
