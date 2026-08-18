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

## Deploying

This repo is a pnpm workspace and the deployable app is **`apps/web`**, not the
repository root.

On Vercel, set the project's **Root Directory** to `apps/web`
(Settings → Build and Deployment → Root Directory, or the **Edit** button next
to Root Directory on the import screen). Leave Framework Preset, Build Command
and Output Directory on their defaults — once the root directory is right,
Next.js is detected and `.next` is found.

**If you skip this, every route returns `404: NOT_FOUND`.** Vercel finds no
framework dependency in the root `package.json`, falls back to the "Other"
preset, and serves the repository root as static files — where there is no
`index.html`. The build succeeds, so nothing looks wrong until you open the URL.

`packages/sim` lives outside the root directory, so the build needs **Include
source files outside of the Root Directory in the Build Step** enabled. It is on
by default for projects created after August 2020; if the build fails to resolve
`@siege/sim`, check it first.
