# siege (working title)

Mobile-first tower defense, built as a daily-challenge web game.
**`claude.md` is the source of truth for how this repo is built — read it first.**

## Status: M0 (summon rework)

M0 asks one question and nothing else: *does a four-minute run make a person
want a second one?* (`claude.md` §9.)

The player picks a **roster of 5 distinct towers before the run**, then plays one
verb: **summon** — costs mana, drops a random roster tower onto a random legal
tile. There is no placement choice and no type choice. Agency lives in three
places instead, and all three are required for the design to work at all:

1. **Roster construction**, before the run — the strategic layer.
2. **Merge** — two of the same type and tier become one at tier+1, with the type
   **re-rolled** from the roster. Every merge is a real gamble.
3. **Sell** — clearing a tile is the spatial verb, since placement is random.

Three tower families, each made mandatory by the enemies rather than by a rule:
projectile (platform tiles), melee (lane tiles, physically blocks), status
(platform tiles, force multipliers with no standalone value).

What does not exist yet, by design: no backend, no accounts, no share card, no
art. Those are M2–M4 and are gated on M0 answering yes.

## Commands

```bash
pnpm install
pnpm dev         # http://localhost:3000
pnpm test        # sim: determinism, purity, and design-invariant tests
pnpm typecheck
pnpm lint
pnpm build
```

## The one rule

`tick(state, inputs) -> GameState` is pure and deterministic. No wall clock, no
`Math.random`, no DOM, no variable delta time inside `packages/sim`. The
prohibitions are enforced mechanically by `packages/sim/__tests__/purity.test.ts`,
and the reasoning is in `claude.md` §3.

## Design notes worth knowing before changing tuning

Enemies are written before towers, and each archetype exists to make one family
mandatory (`packages/sim/src/enemies.ts`). Fliers ignore blockers, so projectile
is required. Armour floors fast-and-weak damage, so `armor_shred` is required.
`packages/sim/__tests__/balance.test.ts` asserts that a roster neglecting a
family loses, and it is a tripwire: a tuning change that flattens the decision
space should fail there rather than pass quietly.

**Known gap, asserted rather than hidden:** neglecting *melee* does not lose.
§5 gives the runner two answers — "melee block **or** slow" — so a roster with
Frost handles runners without a blocker, and nothing is melee-exclusive the way
fliers are projectile-exclusive. Measured at equal damage density, melee is
break-even. Closing that needs a new enemy, not a new number.

Platform tiles are deliberately **clustered around the five lane tiles**. A
blocker's whole job is holding enemies inside somebody's range; if lane tiles sit
outside platform coverage then blocking parks the enemy in a dead zone and melee
becomes a liability. Preserve that clustering when editing the board.

## Determinism

Every summon draw, merge re-roll and tile selection consumes the single seeded
run RNG stream, and **the order of consumption is part of the contract** — it is
documented at the top of `packages/sim/src/summon.ts`. The golden fixture in
`packages/sim/__tests__/fixtures/` pins a scripted run's final-state hash. Any
change to draw order or tuning flips that hash, which must be an intentional,
explained break with the fixture regenerated in the same commit:

```bash
REGEN_FIXTURE=1 pnpm --filter @siege/sim exec vitest run gen-fixture
```
