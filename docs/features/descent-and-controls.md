# Descent & Controls — Feature Document

> **Version:** v1.1 · **Status:** Draft · **Last updated:** 2026-10-17 · Master: [GDD](../GDD.md)

## Design Goal
> Skiing should feel good on its own, before any yeti or Gear. Thirty seconds on a phone should be enough to carve, tuck, and jump on purpose.

Pillars served: **P3** (one thumb, readable), **P5** (fair luck), **P1** (speed is survival).

## Core Mechanics

### Basic rules
- **The slope** scrolls upward: the skier stays about 1/3 from the top of the screen, and the world moves past.
- **Heading:** the skier points in one of 9 directions (hard left … straight down … hard right). Downhill speed depends on heading: straight down is fastest, across the slope is slow, and full sideways stops you (as in the original).
- **Tuck:** about +50% top speed, but the heading changes one step slower. Tucking is how you outrun the yeti.
- **Slow down:** drag up to snowplow: −50% speed. A sideways heading stops you quickly.
- **Jump:** flick up. You're airborne for about 0.6 s (longer off ramps), passing over low obstacles (stumps, rocks, small dogs, moguls). Trees still hit you unless the jump is from a ramp.
- **Tricks:** flick again in the air (up to 3 per jump, each a different pose). A clean landing scores Style; landing mid-trick is a crash.
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
| Airtime | 0.6 s (flick), 1.0–1.4 s (ramp) | |
| Crash downtime | 1.4 s total | 1.0 s tumble + 0.4 s getting up |
| Slope width | 60 m (about 3 screens) | Beyond it are the Edge Yetis, see [Yetis](yetis.md#edge-yetis) |

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
- A slope is stitched from **chunks**: segments about one screen tall (around 40 m), hand-authored in a data file and tagged with difficulty (1–10), theme (resort/forest/alpine), and features (ramp, gates, traffic, narrow, open).
- **Generation:** a seeded RNG picks chunks to fill the slope's length under a **difficulty budget** that rises within the slope (warm-up → crux → final sprint) and with each slope of the run.
- **Guarantees:** every chunk has a clean line at cruise speed, the edges of adjacent chunks must line up (no blocked joins), and no two hardest chunks appear back to back.
- **Validation:** the simulator's "clean skier" bot must clear every generated slope without Gear. Seeds it can't clear are rejected and regenerated.

### Conditions (whole-slope modifiers; Mountains 2–3)
| Condition | Effect |
|---|---|
| Powder | −20% top speed for you and the yeti; crashes are shorter |
| Ice | Turning takes longer; random ice patches |
| Night | Visible range shrinks to a lit cone ahead |
| Fog | Obstacles appear later; the yeti meter becomes the main cue |
| Avalanche | Replaces the yeti: a wall that starts at 10 m/s and accelerates to the pursuer cap (17.5 m/s) over 30 s; can't be staggered |

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
| **A. Relative drag** (default) | Horizontal offset from where the thumb touched down | Thumb low on the screen | Flick up |
| B. Tilt | Tilt the phone | Hold anywhere | Tap |
| C. Two-zone tap | Tap or hold the left/right half | Both halves | Swipe up |

Pick by playtest: time to clear the first slope, crash rate, self-reported feel.

## Relationship to Other Systems
- **Depends on:** nothing (base layer).
- **Affects:** [Yetis](yetis.md) (they read the skier's position, speed, and crash state); [Run Structure & Gear](run-structure-and-gear.md) (Style feeds Tokens; Gear hooks into jumps, crashes, near misses, obstacles).

## Implementation Priority (Levels of Quality)
| Level | Content | Status |
|---|---|---|
| Core | Steering, tuck, jump, crash, trees/rocks/stumps/ramps, one endless seeded slope | Not started |
| Expected | Chunk library and finish gate, tricks, dogs and traffic, near misses, control-scheme setting | Not started |
| Desired | Conditions, secrets (mushroom, burning trees), slalom chunks | Not started |
| Aspirational | Chunk editor, community seeds | Not started |

## Change Log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First draft |
| v1.1 | 2026-10-17 | Avalanche speed defined; tuck speed made fixed |
