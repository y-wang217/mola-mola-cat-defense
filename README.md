# siege (working title)

Mobile-first tower defense, built as a daily-challenge web game.
**`claude.md` is the source of truth for how this repo is built — read it first.**

## Status: M0

M0 asks one question and nothing else: *does a four-minute run make a person
want a second one?* (`claude.md` §9.)

What exists:

- `packages/sim` — the deterministic sim. Pure TypeScript, zero runtime
  dependencies, fixed 30Hz, fixed-point integer math, seeded PRNG.
- `apps/web` — Next.js shell, PixiJS render layer, React/Tailwind HUD.
  One hardcoded board, two towers, three enemies, eight waves. Local only.

What does not exist yet, by design: no backend, no accounts, no replay log, no
share card, no art. Those are M1–M4 and are gated on M0 answering yes.

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

The two towers are only a decision because the three enemies make them one:
brutes have flat armour that blunts the arrow tower's small frequent hits,
runners outpace the cannon's slow cycle, and swarms drown single-target damage.
`packages/sim/__tests__/balance.test.ts` asserts that a mono-tower build loses.
If a tuning change makes the game feel samey, the answer is a fourth **enemy**,
not a third tower (`claude.md` §10).
