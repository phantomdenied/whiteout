# Run Structure & Gear — Feature Document

> **Version:** v1.0 · **Status:** Draft · **Last updated:** 2026-10-17 · Master: [GDD](../GDD.md)

## Design Goal
> Turn a great one-minute descent into a 20–30 minute run where your choices compound. Gear should change *how* you ski (P2), and routes should trade risk for reward.

## Core Mechanics

### Run shape
```
Skier pick ─▶ Mountain 1 map ─▶ … ─▶ Summit 1 ─▶ Mountain 2 map ─▶ … ─▶ Summit 2 ─▶ Mountain 3 ─▶ Summit 3 = WIN
```
- 3 Mountains. Each map is 4 rows of nodes (2–3 choices per row) followed by the Summit.
- You pick one node per row; paths branch and rejoin (Slay the Spire style). The whole map is visible from the start.

### Route map
| Node | What happens |
|---|---|
| **Slope** | A normal descent, then a reward pick |
| **Black Diamond** | Difficulty +2 and a random Condition. A better reward pick (one rare guaranteed) and ×1.5 Tokens. |
| **Lodge** | Shop: 3 Gear, 2 Snacks, 1 service (sell Gear, remove a Curse, reroll the shop) |
| **Hot Cocoa** | Rest: refill Snacks to capacity, or remove a Curse, or upgrade one Gear |
| **Event** | A one-screen choice with a tradeoff, e.g. "Ski the closed run: +2 Gear picks, gain a Curse" |

Each map has at least one Lodge and at least one Hot Cocoa.

### Style and Tokens
| Source | Style |
|---|---|
| Distance | 1 per meter |
| Near miss | 25 |
| Trick (clean landing) | 50 / 150 / 400 for 1 / 2 / 3 tricks in one jump |
| Gate pair | 30 |
| Close Call (finish with the yeti meter above 80%) | ×1.5 on the slope's total |
| Crash | Resets the current combo; no Style lost |

Style accumulates as **Chips × Mult**-style combos: consecutive tricks and near misses without a crash raise a combo multiplier (×1 → ×4). This reuses Spindle's proven scoring feel.

**Tokens = Style ÷ 100**, rounded down, paid at the finish gate.

### Reward pick
After each Slope or Black Diamond: choose 1 of 3 (Gear, Snack, or Tokens). Rarity: Common 70% / Uncommon 25% / Rare 5% (Black Diamonds guarantee one Rare).

### Gear
- **Slots:** Skis (1), Boots (1), Poles (1), and **Charms** (5). Slot items change core handling; Charms are rule-benders.
- Sell for half price at the Lodge.

**Sample Gear** (first pass; the goal is roughly 30 at M2):
| Gear | Slot | Effect | Build |
|---|---|---|---|
| Racing Skis | Skis | Tuck speed +15%; turning in a tuck is even wider | Tuck |
| Twin Tips | Skis | You can land backwards; landing backwards scores ×2 trick Style | Trick |
| Rocket Boots | Boots | The secret turbo: a 2 s ×2 speed burst, recharged by near misses | Tuck |
| Spring Boots | Boots | Jump from flat ground as high as off a ramp | Jump |
| Ice Picks | Poles | Turn instantly once per jump (mid-air) | Trick |
| Matchbook | Charm | Dead trees you jump over burn and stagger the yeti by 1 s | Jump |
| Mushroom Forager | Charm | Stumps become mushrooms when jumped (not only from uphill); eating one gives +1 Token and a short tuck boost | Jump |
| Good Boy | Charm | Hitting a dog doesn't crash you; you get a 1 s speed boost instead. The dog is fine. | Crash |
| Bubble Wrap | Charm | Crash downtime −50% | Crash |
| Rubber Chicken | Charm | The first crash each slope makes you bounce instead (no crash) | Crash |
| Lift Pass | Charm | Once per slope, grab a chairlift cable to skip 40 m forward | Utility |
| Yeti Musk | Charm | Grace +3 s, but the yeti is 5% faster | Risk |
| Whiteout Goggles | Charm | Fog and Night have no effect | Utility |

**Synergy test (P2):** every Gear must combine with at least two others into a noticeable build. "+X% stat" items are only allowed in a slot item that also changes how you ski.

### Snacks (consumables, 2 slots, upgradable to 3)
| Snack | Effect |
|---|---|
| Hot Cocoa Thermos | Instant full tuck speed for 3 s |
| Frozen Fish | Throw it behind you: the yeti stops 2 s to eat it |
| Trail Map | Shows the safest line for the next 200 m |
| Hand Warmer | The next crash takes 0.3 s |

### Curses
These come from Events and some Black Diamonds and stay until removed (at the Lodge or Hot Cocoa). Examples: "Squeaky Boots" (the yeti hears you: grace −2 s); "Rental Skis" (cruise speed −10%).

### Starting skiers
Each skier is a starting kit with a boon and a bane, the same idea as Spindle's starting decks.
| Skier | Boon | Bane | Unlock |
|---|---|---|---|
| **The Rookie** | Starts with Bubble Wrap | — | Default |
| **The Snowboarder** | A trick on every jump is free (no crash if you land mid-trick) | Can't snowplow | Clear Mountain 1 |
| **The Retiree** | Starts with Rocket Boots (the secret turbo) | Cruise speed −10% | Find the mushroom secret |
| **The Dog** | Tiny hitbox; jumps everything except trees | No Skis slot | Hit 50 dogs |

### Meta progression
- Unlocks add **options** (skiers, Gear in the pool, Conditions, Daily Seed), never raw power. P5: a skilled first-time player can win.
- **Peaks:** after the first win, an ascension-style ladder of 10 difficulty tiers (faster yetis, shorter grace, more Conditions).

### Numbers (first pass)
| Quantity | Value |
|---|---|
| Tokens per average slope | ~8–12 |
| Lodge prices | Common Gear 8, Uncommon 14, Rare 22, Snack 4, Reroll 3 (+1 each) |
| Run length | 15 slopes (12 + 3 Summits) at ~1 min, plus menus ≈ 20–30 min |

## Player Experience
- **Intended:** "One more run." Builds you name ("the dog-crash build"), route decisions that feel like bets.
- **Risks:** analysis paralysis at the Lodge (keep it to 6 items with big readable cards); one dominant build (simulator bots per build archetype); runs too long for the phone (save between slopes).

## Relationship to Other Systems
- **Depends on:** [Descent](descent-and-controls.md) (Style events, obstacle hooks) and [Yetis](yetis.md) (stagger, grace, Close Call).
- **Affects:** the difficulty budget for slope generation (per slope and Peak).

## Implementation Priority (Levels of Quality)
| Level | Content | Status |
|---|---|---|
| Core | Linear 3-mountain run, reward pick of 1 in 3 from 10 Gear, Tokens | Not started |
| Expected | Route map, Lodge, Snacks, 30 Gear, Summits, save between slopes | Not started |
| Desired | Events, Curses, 4 skiers, unlocks, Daily Seed | Not started |
| Aspirational | 10 Peaks, Gear upgrades, run history | Not started |

## Change Log
| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-10-17 | First draft |
