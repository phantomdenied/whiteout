# Descent & Controls — Feature Document

> **Version:** v1.4 · **Status:** Draft · **Last updated:** 2026-10-17 · Master: [GDD](../GDD.md)

## Design Goal
> Skiing should feel good on its own, before any yeti or Gear. Thirty seconds on a phone should be enough to carve, tuck, and jump on purpose.

Pillars served: **P3** (one thumb, readable), **P5** (fair luck), **P1** (speed is survival).

## Core Mechanics

### Basic rules
- **The slope** scrolls upward: the skier stays about 1/3 from the top of the screen, and the world moves past.
- **Heading:** the skier points in one of 9 directions (hard left … straight down … hard right). Downhill speed depends on heading: straight down is fastest, across the slope is slow, and full sideways stops you (as in the original).
- **Tuck:** about +50% top speed, but the heading changes one step slower. Tucking is how you outrun the yeti.
- **Slow down:** drag up to snowplow: −50% speed. A sideways heading stops you quickly.
- **Jump:** double-tap. You're airborne for about 0.6 s (longer off ramps), passing over low obstacles (stumps, rocks, small dogs, moguls). Trees still hit you unless the jump is from a ramp.
- **Slalom gates:** pairs of flags, 3.6 m apart, centered on the generator's clean line (so the gates show a safe way down). Passing between them on your feet scores 15 Style × the combo and adds 1 to the combo; missing one scores nothing. 35% of plain slopes (no Avalanche, not Black Diamonds) have a slalom section in their middle third, a gate every 22 m.
- **Tricks:** while tucked (thumb held low), swipe up, left or right: you pop into the air and straight into the trick, no jump needed. Swipe again in the air to chain, up to 3 per jump. A clean landing scores Style; landing mid-trick is a crash. Upright on the ground, a fast sideways drag is just steering. A swipe must be deliberate: at least 18% of the screen width (60 px minimum) within 0.1 s, twice as far along its direction as across it, with a 0.22 s cooldown, so steering corrections never count as tricks.

| Swipe | Trick | Pose time | Style |
|---|---|---|---|
| Up | Spread Eagle | 0.22 s | 40 |
| Left | Helicopter | 0.30 s | 70 |
| Right | Backflip | 0.38 s | 110 |

Several tricks in one jump: the sum × 1.5 (two) or × 2 (three), and × 1.25 more if none repeats. A 0.6 s pop fits one trick, or two Spread Eagles; three need more air: Hang Time, Spring Boots, or a ramp (by design, the big combos need upgrades). Desktop: hold ↓ and press Z / X / C; Space jumps (and does a Spread Eagle in the air).
- **Crash:** a hit sends you tumbling for 1.0 s, then 0.4 s getting up (with no control), then you restart from speed 0. Crashing has no other penalty; the cost is the time the yeti gains.
- **Near miss:** passing within 0.5 m of an obstacle at speed scores Style and fills the whoosh meter (used by some Gear).

### Numbers (first pass — tune with the simulator)
| Quantity | Value | Note |
|---|---|---|
| World unit | 16 units = 1 m | Same scale as the original, for easy comparison |
| Simulation tick | 60 Hz fixed | Deterministic; rendering interpolates |
| Cruise top speed (straight down) | 12 m/s | |
| Tuck top speed | 18 m/s | Fixed: no Gear, Curse or skier lowers it. Only Conditions that slow pursuers by the same factor may (see [Yetis](yetis.md#numbers-first-pass)) |
| Acceleration to cruise | ~1.5 s from 0 | |
| Snowplow | −50% speed | |
| Airtime | 0.6 s (double-tap hop), 1.0–1.4 s (ramp) | |
| Crash downtime | 1.4 s total | 1.0 s tumble + 0.4 s getting up |
| Slope width | 54 m skiable (about 2 screens), bounded by a tree line | Beyond it are the Edge Yetis (later), see [Yetis](yetis.md#edge-yetis) |

### Obstacle catalogue
| Obstacle | Jumpable? | On hit | Notes / hooks |
|---|---|---|---|
| Tree | No (only from a ramp) | Crash | Most common |
| Dead tree | Yes | Crash | Jumping it sets it alight (the original's joke; Gear hook) |
| Stump | Yes | Crash | Ski it backwards (uphill) and it becomes a mushroom (secret; Gear hook) |
| Rock | Yes | Crash | Small; jump practice |
| Moguls | Yes | Slows you | Not a crash; ruins a tuck |
| Ramp | — | Big jump | Required for trick Style |
| Dog | Yes | Crash | Wanders. Leaves yellow snow; crashing into it is a Gear hook. |
| Other skier / snowboarder | No | Crash | Moving, with predictable lines |
| Chairlift tower | No | Crash | The lift cables above are harmless decoration |
| Ice patch | — | Can't steer for 1 s | Condition: Ice |
| Gate flags | — | Pass between them for Style | Slalom chunks |

### Slope generation
- A slope is stitched from **chunks**: segments 40 m tall, hand-drawn as 30 × 20 text grids (one cell = 2 m) in `src/chunks.ts` and tagged with difficulty (1–10). Theme and feature tags come later.
- **Layout:** a 30 m clear run-in, then chunks separated by 8 m of open snow (seams, so a corridor that exits on one side can reach the next entry), randomly mirrored. A tree line stands just outside the skiable width on both sides. Each mountain swaps a share of trees for dead trees (8% / 25% / 15%).
- **Scatter:** loose trees, rocks, stumps and the odd mogul or ramp fill the open snow, at least 2.2 m from anything already placed. It's heaviest on easy slopes (about 0.03 per m² at difficulty 2.5) and fades to nothing by difficulty 5, whose dense chunks already set the challenge. Busy chunks get proportionally less, so their designed corridors stay readable. Obstacles per 100 m of slope: about 150–200 on mountain 1, 250–360 on mountain 2, 340–390 on mountain 3.
- **Generation:** a seeded RNG picks chunks to fill the slope's length under a **difficulty budget** that rises within the slope (warm-up −1 for the first 15%, crux +1, final sprint ±0) and with each slope of the run. No chunk repeats back to back, and no two chunks of difficulty 8+ appear back to back.
- **Guarantees (validator):** a path search finds the cheapest clean line from the start to the finish gate. The line keeps hitbox + 0.75 m from every crash obstacle and ramp (dogs: their whole wander range), turns at most 45°, and changes its sideways rate gradually so it can actually be skied. A clean tuck along it must keep the yeti at least 12 m away. A layout that fails is rejected and re-rolled (up to 24 tries, then a cleared corridor as a fallback; in tests no slope needs the fallback).
- **Validation:** the simulator's "clean skier" bot (`src/bot.ts`) follows the validator's line in a tuck without jumping, and must clear every generated slope without Gear (`npm run sim`, plus a test). A "cruiser" bot that never tucks must get caught.

### Conditions (whole-slope modifiers)
Mountain 1 slopes have none; 30% of mountain 2 slopes and 50% of mountain 3 slopes roll one; every Black Diamond has one. Avalanche only appears from mountain 2. The map shows each slope's Condition before you pick it.

| Condition | Effect (as built in M3) |
|---|---|
| Powder | −20% top speed for you and the yeti (the pursuer rule holds); crashes 30% shorter; falling snow |
| Ice | Every turn 25% slower; bluer snow. The validator demands a straighter line (at most ~27° instead of 45°). Ice patches are not built yet |
| Night | Dark, except a cone of light from your headlamp (about 48° wide, 18 m long) pointing where you're heading, and a faint glow around you. Turning swings the beam, so you can look before you commit. Render only |
| Fog | A white wall that thickens with distance downhill: obstacles appear late |
| Avalanche | **Black Diamonds only** (mountains 2–3), so always optional. Replaces the yeti: when the grace ends the wall roars in and then stays at most **10 m behind you** at 16.5 → 17 m/s, barely below a clean tuck (18). No lead to bank; a crash or a few seconds out of the tuck buries you. **Built to need upgrades:** in the simulator the starting kit is buried every time, pure speed or pure crash builds fall short on mountain 3, and speed + control (Carving Skis, Aero Helmet, Carbon Poles, Rubber Chicken, Snowshoes) clears 97–100%. Slopes are 1.5 difficulty easier (an open race), the camera zooms out to keep the wall in view, and it pays 3× Tokens (2× on top of the Black Diamond's 1.5×) and two guaranteed rares. Can't be staggered |

Simulator (clean bot, hardest Black Diamond of each mountain): 100% under every Condition on mountains 1–2, 87–100% on mountain 3.

### Edge cases
- **Skiing uphill:** allowed, slowly (by heading sideways and tapping). It's useful for the stump→mushroom secret and nothing else; going far uphill wakes the Top Yeti (see [Yetis](yetis.md#edge-yetis)).
- **Stopping completely:** allowed. The yeti gets free time.
- **Landing on an obstacle:** counts as a crash, unless the obstacle is jumpable and you land after it.
- **App sent to the background:** auto-pause.

## Player Experience
- **Intended:** flow. Reading lines through trees, the snap of a tuck, a clean trick landing just ahead of a hazard.
- **Risks:** imprecise steering (P3), samey slopes, a frustrating lack of control while crashed.
  - Mitigations: M0 controls testing (below); chunk variety with themes; crashes kept short (1.4 s) and readable.

### Control prototypes (M0)
| Scheme | Steer | Tuck | Jump |
|---|---|---|---|
| **A. Relative drag** (default) | Horizontal offset from where the thumb touched down | Thumb low on the screen | Double-tap (tricks: swipe up / left / right in the air) |
| B. Tilt | Tilt the phone | Hold anywhere | Tap |
| C. Two-zone tap | Tap or hold the left/right half | Both halves | Swipe up |

Pick by playtest: time to clear the first slope, crash rate, self-reported feel.

## Relationship to Other Systems
- **Depends on:** nothing (base layer).
- **Affects:** [Yetis](yetis.md) (they read the skier's position, speed, and crash state); [Run Structure & Gear](run-structure-and-gear.md) (Style feeds Tokens; Gear hooks into jumps, crashes, near misses, obstacles).

## Implementation Priority (Levels of Quality)
| Level | Content | Status |
|---|---|---|
| Core | Steering, tuck, jump, crash, trees/rocks/stumps/ramps, one endless seeded slope | M0 prototype |
| Expected | Chunk library and finish gate, tricks, dogs and traffic, near misses, control-scheme setting | M1: chunks, finish gate, tricks, dogs, near misses. Traffic and control setting not started |
| Desired | Conditions, secrets (mushroom, burning trees), slalom chunks | Burning trees and mushrooms via Gear (M1). Rest not started |
| Aspirational | Chunk editor, community seeds | Not started |

## Change Log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First draft |
| v1.1 | 2026-10-17 | Avalanche speed defined; tuck speed made fixed |
| v1.2 | 2026-10-18 | M1: chunk grid format, seams, edge tree line, validator rules, bots; slope width 54 m |
| v1.3 | 2026-10-18 | Playtest: mountain 1 too sparse. Added scatter, smaller warm-up dip, line clearance 0.75 m |
| v1.4 | 2026-10-18 | M3: Conditions as built (Ice softened to −25% turning, Avalanche tops out at 16 m/s), where they appear |
| v1.5 | 2026-10-18 | Avalanche leashed 18 m behind (one crash buries you), 2× Tokens and a rare; slalom gates |
