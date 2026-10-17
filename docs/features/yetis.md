# Yetis — Feature Document

> **Version:** v1.1 · **Status:** Draft · **Last updated:** 2026-10-17 · Master: [GDD](../GDD.md)

## Design Goal
> The yeti is the clock (P1). It turns "ski down a hill" into "get down the hill *now*". It must be scary but fair: always escapable by clean skiing, and never invisible.

## Core Mechanics

### Basic rules
- **Spawn:** after a **grace** period (8 s on slope 1, shrinking to 4 s by Mountain 3, never under 3 s from any effect) the yeti appears at the top of the screen with a roar.
- **Chase:** it moves straight toward the skier at a capped speed, faster downhill than across the slope (a homage to the original's yeti, which had separate speed caps for each direction).
- **Leash:** if it falls more than 1.5 screens behind, it teleports to 1.5 screens behind (offscreen). So you can never fully lose it, only stay ahead of it. Escaping means reaching the finish gate.
- **Catch:** contact means you're eaten (a 2-second animation), and the run ends.
- **The meter:** the HUD meter shows the yeti's distance, from 0 to 1.5 screens. Footsteps play inside 1 screen, and a frost vignette appears inside 0.5 screens.

### Numbers (first pass)
| Quantity | Value | Relation to the skier |
|---|---|---|
| Yeti downhill speed | 14 m/s (Mountain 1) → 16 m/s (Mountain 3) | Faster than cruise (12), slower than tuck (18) |
| Yeti cross-slope speed | 8 m/s | Big sideways detours are risky |
| Yeti uphill speed | 4 m/s | |
| Grace | 8 s → 4 s | Hard minimum 3 s after all modifiers (Curses, Altitude), Summits included |
| **Pursuer cap** | 17.5 m/s | Applies to every yeti, boss and avalanche after all modifiers (Gear, Altitude). Clean tuck is 18 m/s. |
| Leash | 1.5 screens | |

**The design rule (enforced in tests):** every pursuer's speed ≤ the pursuer cap (17.5 m/s) < clean tuck speed (18 m/s), on every slope. Tuck speed is fixed: no Gear, Curse or skier may lower it. A Condition may lower it only if it slows pursuers by the same factor (Powder: both −20%). The yeti only catches you because of crashes, stops, snowplowing, and bad lines.

Rough feel: one crash costs 1.4 s standing still (14 m/s × 1.4 s ≈ 20 m) plus about 1.5 s of re-acceleration (≈ 10 m more), so the yeti gains about 30 m. From a full leash (about 1.5 screens ≈ 60 m), two quick crashes, or a long stretch at cruise without tucking (losing 2 m/s), gets you caught at Mountain 1 speed. Simulator target: an average bot gets caught on 10–20% of Mountain 1 slopes.

### Edge Yetis
A homage to the original's four yetis, one past each edge of the map:
- The slope is 60 m wide. Stay beyond either edge for more than 2 s and an **Edge Yeti** charges in from that side, faster across the slope (16 m/s).
- Skiing about 30 m uphill past the start wakes the **Top Yeti**.
- They keep the slope bounded, so there's no escape by going sideways or up, without invisible walls.

### Distraction (Gear and Snack hooks)
- **Stagger:** some effects push the yeti back or stun it (a fish Snack, burning trees, Gear). Stagger time is capped at 3 s per slope, so it can't be stun-locked.
- **The yeti eats things:** skiers and dogs it touches stop it for 1 s (lean into the dark humor; no gore).

### Summit bosses (one per mountain)
| Mountain | Boss | Twist |
|---|---|---|
| 1 — Bunny Hill Range | **Big Yeti** | 17 m/s, faster than the normal yeti; jumps over obstacles in its way. A pure speed test. |
| 2 — Black Pine | **The Twins** | Two yetis that flank from the left and right (Edge Yetis that close in). A steering test. |
| 3 — The Spine | **The Old One** | An avalanche (capped at 15 m/s) and a yeti (17 m/s) together: the wall closes slowly and the yeti breaks through it. The finale. |

Summits are 1,200 m long. The boss is visible from the start, 1.5 screens back, and holds still for the 3 s minimum grace.

### Edge cases
- **Yeti reaches you mid-air:** you're caught on landing unless you land beyond its reach. This rewards big jumps.
- **Caught while crashed:** you're caught.
- **Finish gate:** crossing it while the yeti is touching you counts as a clear. Ties go to the player.
- **Avalanche Condition:** replaces the yeti (no yeti on that slope).

## Player Experience
- **Intended:** the cold-sweat moment from 1991 every slope, followed by relief and a burst of Style at the gate.
- **Risks:** it gets old (mitigation: Summit variants, Conditions, Gear that interacts with it); deaths feel cheap (mitigation: the meter, audio, the speed rule above).

## Relationship to Other Systems
- **Depends on:** [Descent](descent-and-controls.md) (skier position, speed, crash state, slope bounds).
- **Affects:** [Run Structure & Gear](run-structure-and-gear.md): Style bonuses for finishing with the yeti close (the "Close Call" multiplier); Gear and Snacks that stagger it.

## Implementation Priority (Levels of Quality)
| Level | Content | Status |
|---|---|---|
| Core | Yeti spawn, chase with direction caps, leash, catch, meter | M0 prototype |
| Expected | Edge Yetis, Top Yeti, stagger hooks, audio cues, eating animation | Not started |
| Desired | Three Summit bosses, eats-skiers interaction | Not started |
| Aspirational | Yeti personalities (patterns), a yeti bestiary page | Not started |

## Change Log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First draft |
| v1.1 | 2026-10-17 | Pursuer cap (17.5 m/s), boss speeds, 3 s minimum grace incl. Summits |
