# Design notes

Product shape, the design checklist, known dead ends, and the anti-patterns that
are design rather than code. Moved from the old `claude.md` §1 and §10 on
2026-10-12; see `docs/README.md` for what was deleted on the way.

## What we are building

A mobile-first tower defense game, delivered first as a **daily-challenge web game**
in the mould of Kinda Hard Golf / Wordle: one shared board per day, generated at
00:00 UTC, everyone in the world plays the same thing, scores are compared and
shared.

The web daily is not a demo. It is the actual product's first shape. Native
iOS/Android comes later via Capacitor wrapping the same build.

### Why the daily format (do not re-derive this)

The daily solves three problems that would otherwise sink the project:

- **PvP matchmaking liquidity.** We need no matchmaker and no concurrent
  population. Everyone plays the same board; the leaderboard *is* the PvP.
  Async by construction.
- **Content cadence.** One generated map per day plus rotating modifiers is a
  *system*, not a hand-authored level treadmill. A two-person team cannot run a
  treadmill.
- **Difficulty authorship.** Optional stacked handicaps ("Risk") on a shared
  board give players self-selected difficulty with a single leaderboard. This is
  the Arknights Contingency Contract structure applied as the core spine rather
  than a side mode.

## Design checklist

Run any proposed mechanic through this before building it. Items 3 and 8 of the
original list were deleted on 2026-10-12 (see `docs/README.md`, Deleted); the rest
are renumbered.

1. **What is the player doing while the wave walks?** If the answer is "watching,"
   the idea isn't finished. Low moment-to-moment agency is this genre's one
   structural weakness; every good TD is a different answer to it. Deliberation
   counts as doing — giving the player information worth thinking about is a valid
   answer. Continuous manual aiming is not.
2. **Is this standard, rare, or already abandoned in the genre?** If it's rare,
   establish *why* it's rare before assuming it's an opportunity. "We'd execute it
   better" is not an answer.
3. **Does it survive async PvP?** Is income symmetric and deterministic? Is a run
   under five minutes? Does it work with no live opponent present?
4. **What is the content cost per unit of player-facing variety?** Prefer systems
   that generate variety (modifiers, seeds, player authorship, PvP) over content
   that must be hand-made forever. We cannot run a content treadmill.
5. **What stops 40 towers collapsing to 5?** If there's no role-enforcement
   mechanism — flying-only enemies, armour requiring specific damage types, tiles
   only certain units can occupy — the variety is nominal.
6. **What happens in the ten seconds after a loss?** If it isn't immediate and
   compelling, retention will be poor.
7. **Would someone who has played Kingdom Rush, Bloons, Arknights and Rush Royale
   recognise this as new within thirty seconds?** If not, we're competing on
   execution against studios with a decade of head start and a live-ops team.

## Known dead ends — do not propose these

- **Continuous manual aiming as the core verb** (the "Zuma-like" TD). Twenty years,
  no commercial validation anywhere, and a coherent reason why: aiming demands
  continuous attention on one point while strategy demands looking away. The two
  loops fight each other.
- **Constant manual focus-fire.** Practitioner consensus is that it isn't fun and
  feels twitchy. Turning it into a cooldown ability is fine; making it a constant
  demand is not.
- **Four-player real-time TD battle royale.** Tried at full scale by a major Korean
  publisher (Defense Derby, 2023–2025), shut down in 22 months.
- **Idle/incremental TD under our model.** That branch's economics exist to sell
  time. Remove the time-selling and the exponential curve has no reason to exist.
- **Wide flat rosters with no role enforcement.** Reliably collapse to a five-unit
  meta regardless of balance effort.
- **Retroactively monetizing anything that was previously free.** The single most
  reliable way to produce a community crisis.

## Design anti-patterns — reject these on sight

- Building a settings menu, account system, or shop before M4.
- Balancing by feel. Instrument first — wave-reached, placements, restarts,
  abandons — then tune. Level pass rate is a usable proxy for difficulty and it
  correlates directly with churn, so difficulty gets measured, not guessed.
- Any mechanic that only works if someone pays, grinds, or waits. It violated the
  old `claude.md` §2, whose monetization rows were deleted on 2026-10-12 (see
  `docs/README.md`, Deleted).
- New tower types as the answer to "the game feels samey." Design **enemies**
  first. A roster of towers is only as diverse as the set of problems the game
  poses; adding towers without adding problems just adds art cost.
