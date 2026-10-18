# Run Structure & Gear — Feature Document

> **Version:** v1.3 · **Status:** Draft · **Last updated:** 2026-10-17 · Master: [GDD](../GDD.md)

## Design Goal
> Turn a great one-minute descent into a 20–30 minute run where your choices compound. Gear should change *how* you ski (P2), and routes should trade risk for reward.

## Core Mechanics

### Run shape
**Built in M2 (no route map yet):** each mountain is a fixed line: Slope, Slope, Lodge, Slope, Slope, Lodge, Summit. That is the row pattern below with one node per row; branching, Warming Huts, Events and Black Diamonds arrive with the route map in M3. Runs save between stages (Continue on the title screen).

```
Skier pick ─▶ Mountain 1 map ─▶ … ─▶ Summit 1 ─▶ Mountain 2 map ─▶ … ─▶ Summit 2 ─▶ Mountain 3 ─▶ Summit 3 = WIN
```
- 3 Mountains. Each map has 6 rows of nodes (2–3 choices per row) followed by the Summit.
- **Row pattern:** Slope, Slope, Stop, Slope, Slope, Stop, then the Summit. Slope rows offer Slope or Black Diamond; Stop rows offer Lodge, Warming Hut, or Event. So every path is 4 slopes + 2 stops + the Summit.
- You pick one node per row; paths branch and rejoin (Slay the Spire style). The whole map is visible from the start.

### Route map
| Node | What happens |
|---|---|
| **Slope** | A normal descent, then a reward pick |
| **Black Diamond** | Difficulty +2 and a random Condition. A better reward pick (one rare guaranteed) and ×1.5 Tokens. |
| **Lodge** | Shop: 3 Gear, 2 Snacks, 1 service (sell Gear, remove a Curse, reroll the shop) |
| **Warming Hut** | Rest: refill Snacks to capacity, or remove a Curse, or upgrade one Gear |
| **Event** | A one-screen choice with a tradeoff, e.g. "Ski the closed run: +2 Gear picks, gain a Curse" |

Each map's Stop rows include at least one Lodge and at least one Warming Hut.

### Style and Tokens
| Source | Style |
|---|---|
| Distance | 1 per meter |
| Near miss | 25 |
| Trick (clean landing) | 50 / 150 / 400 for 1 / 2 / 3 tricks in one jump |
| Gate pair | 30 |
| Close Call (finish with the yeti meter above 80%) | ×1.5 on the slope's total |
| Crash | Resets the current combo; no Style lost |

Style accumulates as **Chips × Mult**-style combos: consecutive tricks and near misses without a crash raise a combo multiplier (×1 → ×4). The combo multiplies only trick and near-miss Style, never distance or gates. This reuses Spindle's proven scoring feel.

**Tokens = Style ÷ 200**, rounded down, paid at the finish gate.

Worked example (average Mountain 1 slope): 800 m distance (800) + 8 near misses (200) + 3 jumps of tricks (≈450). The 650 skill Style × an average combo of ×2 = 1,300. Total ≈ 2,100 Style → **10 Tokens**. A strong run (combo ×4, Close Call) ≈ 3,500 → 17. A clumsy one (no combo) ≈ 1,450 → 7. That fits the 8–12 target and rewards skill without breaking the shop.

### Reward pick
After each Slope or Black Diamond: choose 1 of 3 (Gear, Snack, or Tokens). Rarity: Common 70% / Uncommon 25% / Rare 5% (Black Diamonds guarantee one Rare).

### Gear
- **Slots:** Skis (1), Boots (1), Poles (1), and **Charms** (5). Slot items change core handling; Charms are rule-benders.
- Sell for half price at the Lodge.

**The 30 Gear (M2).** Slots: Skis, Boots, Poles take one item each; Charms take five. A second item in a full slot replaces the oldest.

| Build | Gear (slot, rarity): effect |
|---|---|
| Tuck | Racing Skis (skis, U): tuck +15%, wider tuck turns · Carving Skis (skis, C): turn 30% faster, tuck turns 50% faster · Rocket Boots (boots, R): near misses fire a 1 s burst · Carbon Poles (poles, C): accelerate twice as fast · Aero Helmet (U): tuck +8% · Downhill Suit (R): every 4 s of unbroken tuck fires a 1 s burst |
| Jump | Twin Tips (skis, U): tricks score double · Spring Boots (boots, C): hops as big as ramp jumps · Ice Picks (poles, C): turn 3× faster in the air · Hang Time (U): airtime +40% · Air Bag (C): a botched landing is safe · Ramp Rat (C): ramps pay 1 Token and a burst · Showboat (R): clean trick landings stun the yeti 0.5 s · Matchbook (U): jumped dead trees burn and stun the yeti 1 s · Mushroom Forager (C): jumped stumps pay 1 Token and a burst |
| Crash | Snowshoes (boots, C): moguls don't slow you, hike 3× faster · Good Boy (C): dogs are a boost, not a crash · Dog Whistle (U): dog near misses score triple plus a burst · Bubble Wrap (C): crashes half as long · Rubber Chicken (U): first crash per slope bounces · Stunt Double (R): rocks and stumps always bounce · Helmet Cam (C): crashes keep your combo · Insurance Policy (U): every crash pays 1 Token |
| Risk / economy | Yeti Musk (U): yeti waits 3 s longer, runs 5% faster · Yeti Bait (R): Close Call pays ×3 · Piggy Bank (C): +2 Tokens per finish · Coupon Book (U): Lodge −25% · Lucky Charm (U): 4 reward choices · Fanny Pack (C): +1 Snack slot · Lunchbox (U): a free Snack at every Lodge |

Stagger from all sources (Showboat, Matchbook, Frozen Fish) shares the 3 s per-slope cap. Twin Tips, Ice Picks and Mushroom Forager differ from the first-pass ideas (backwards landings, instant air turns, collecting mushrooms) so they need no extra inputs. Lift Pass and Whiteout Goggles wait for chairlifts and Conditions.

Simulator check (`npm run sim`, clean bot, which never jumps): a tuck build (Racing Skis, Carbon Poles, Aero Helmet, Downhill Suit) clears slopes about 18% faster; a crash build (Bubble Wrap, Rubber Chicken, Stunt Double, Helmet Cam, Insurance) turns almost every bot loss into a clear. The jump build needs human playtests.

**Synergy test (P2):** every Gear must combine with at least two others into a noticeable build. "+X% stat" items are only allowed in a slot item that also changes how you ski.

### Snacks (consumables, 2 slots, upgradable to 3)
| Snack | Effect |
|---|---|
| Hot Cocoa Thermos | Instant full tuck speed for 3 s |
| Frozen Fish | Throw it behind you: the yeti stops 2 s to eat it |
| Trail Map | Shows the safest line for the next 200 m |
| Hand Warmer | The next crash takes 0.3 s |

### Curses
These come from Events and some Black Diamonds and stay until removed (at the Lodge or Warming Hut). Examples: "Squeaky Boots" (the yeti hears you: grace −2 s, never below the 3 s minimum); "Rental Skis" (turning one step slower). Curses never lower tuck speed (see [Yetis](yetis.md#numbers-first-pass)).

### Starting skiers
Each skier is a starting kit with a boon and a bane, the same idea as Spindle's starting decks.
| Skier | Boon | Bane | Unlock |
|---|---|---|---|
| **The Rookie** | Starts with Bubble Wrap | — | Default |
| **The Snowboarder** | A trick on every jump is free (no crash if you land mid-trick) | Can't snowplow | Clear Mountain 1 |
| **The Retiree** | Starts with Rocket Boots (the secret turbo) | Crash downtime +50% | Find the mushroom secret |
| **The Dog** | Tiny hitbox; jumps everything except trees | No Skis slot | Hit 50 dogs |

### Meta progression
- Unlocks add **options** (skiers, Gear in the pool, Conditions, Daily Seed), never raw power. P5: a skilled first-time player can win.
- **Altitude:** after the first win, an ascension-style ladder of 10 difficulty tiers (faster yetis up to the pursuer cap, shorter grace down to the 3 s minimum, more Conditions).

### Numbers (first pass)
| Quantity | Value |
|---|---|
| Tokens per average slope | ~8–12 |
| Lodge prices | Common Gear 6, Uncommon 10, Rare 16, Snack 3, Reroll 2 (+1 each); selling pays half. Lowered from 8/14/22/4/3 in M2: without tricks a skier earns 3–6 Tokens per descent |
| Run length | 15 descents (12 slopes + 3 Summits) at ~1 min, plus 6 stops and menus ≈ 20–30 min |

## Player Experience
- **Intended:** "One more run." Builds you name ("the dog-crash build"), route decisions that feel like bets.
- **Risks:** analysis paralysis at the Lodge (keep it to 6 items with big readable cards); one dominant build (simulator bots per build archetype); runs too long for the phone (save between slopes).

## Relationship to Other Systems
- **Depends on:** [Descent](descent-and-controls.md) (Style events, obstacle hooks) and [Yetis](yetis.md) (stagger, grace, Close Call).
- **Affects:** the difficulty budget for slope generation (per slope and Altitude).

## Implementation Priority (Levels of Quality)
| Level | Content | Status |
|---|---|---|
| Core | Linear 3-mountain run, reward pick of 1 in 3 from 10 Gear, Tokens | M1 prototype (Tokens banked, nothing to spend them on until the Lodge) |
| Expected | Route map, Lodge, Snacks, 30 Gear, Summits, save between slopes | Not started |
| Desired | Events, Curses, 4 skiers, unlocks, Daily Seed | Not started |
| Aspirational | 10 Altitudes, run history | Not started |

## Change Log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First draft |
| v1.1 | 2026-10-17 | 6-row maps, Warming Hut, Altitude, Tokens ÷ 200 with worked example, combo scope, Retiree and Rental Skis changed to keep tuck speed fixed |
| v1.2 | 2026-10-18 | M1: Rocket Boots, Ice Picks and Mushroom Forager reworded to what was built; the M1 Gear pool listed |
| v1.3 | 2026-10-18 | M2: the 30 Gear, linear stage pattern, lower Lodge prices, save |
