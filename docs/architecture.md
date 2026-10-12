# Architecture

Layers and the dependency arrow, why determinism is paid for, stack, repo
layout, data contracts, commands and testing policy. Moved from the old
`claude.md` §2–§8 and §10 on 2026-10-12. The prohibitions themselves are invariants
and live in `CLAUDE.md`; this file carries the argument.

## Layers and the dependency arrow

**The dependency arrow points one way:** `web → sim`. The sim never imports from
`web`. If you find yourself wanting to, the abstraction is wrong.

`CLAUDE.md` states the current arrow, which adds `packages/levels -> packages/sim`.

## Product constraints that shape the architecture

| Constraint | Value |
| --- | --- |
| Platforms | Web first, then iOS + Android via Capacitor |
| Model | Free to play |
| PvP | In scope, **asynchronous** (replay-based) |

## Why determinism is paid for

```
tick(state: GameState, inputs: Input[]) -> GameState
```

The sim is a pure, dependency-free TypeScript module. Same inputs, same seed,
same output — byte-identical, in the browser and in Node, today and in six months.

The prohibitions that follow from this are in `CLAUDE.md`, "The one rule".

### What determinism buys us (why we pay this cost)

- **Replays** = the ordered input log. A full run is ~1KB, not a video.
- **Server-side score validation** — the identical sim module runs in a Vercel
  function and re-simulates the submission. Cheating requires solving the game.
- **Async PvP** — an opponent is just their input log replayed against your board.
- **Spectating and shareable clips** — the observation surface cosmetics need.

All four are nearly free with a pure sim and brutally expensive to retrofit.
If a change would break determinism, stop and flag it.

## Stack

| Layer | Choice | Why |
| --- | --- | --- |
| Language | TypeScript, `strict: true` | — |
| Renderer | **PixiJS v8** | It's a renderer, not a framework. We own the loop. Phaser would fight us for it. |
| Physics | **None** | TD needs pathfinding + fixed tick, not rigid bodies. No Rapier, no Matter, no Box2D. |
| App shell | **Next.js 15, App Router** | Zero-config API routes on Vercel |
| UI | React + Tailwind, DOM overlay above the canvas | Iterating HUD in HTML is far faster than in-canvas |
| UI state | Zustand | Sim state is NOT in Zustand. Only menus/modals/HUD chrome. |
| Hosting | Vercel | Deploys from `apps/web`. The project's **Root Directory** setting must be `apps/web` — importing at the repo root detects no framework and 404s every route. See README → Deploying. |
| DB + auth | Supabase (Postgres) | Auth matters as soon as identity + cosmetics exist |
| Cache/leaderboard | Upstash Redis | **Not yet.** Add only when Postgres `ORDER BY` measurably hurts. |
| Analytics | PostHog | |
| Native wrapper | Capacitor | Later. Do not add config until M5. |

Do not add dependencies without asking. This stack is deliberately small.

## Repo layout

```
/apps/web                  Next.js app (Vercel deploy target)
  /app
    /page.tsx              Today's board
    /api/daily/route.ts    GET  — today's level, never future levels
    /api/run/route.ts      POST — validate submission, write score
    /api/leaderboard/...   GET  — scores for a date
  /components              React shell: HUD, modals, share card
  /game                    Pixi render layer ONLY. Reads sim state, draws it.

/packages/sim              THE SIM. Pure TS. Zero runtime deps.
  tick.ts                  The single entry point
  rng.ts                   sfc32 seeded PRNG
  fixed.ts                 Fixed-point math helpers
  pathing.ts
  types.ts                 GameState, Input, LevelDef
  __tests__/               Golden replay tests (see Testing policy below)

/packages/levels           Offline level generator + vetted level JSON
  generate.ts              Bulk generator, run manually
  vetted/YYYY-MM-DD.json   Committed, hand-approved levels
```

## Data contracts

Define these in `packages/sim/types.ts` and treat changes as migrations.

**`packages/sim/src/types.ts` is authoritative.** The prose copy below is a
snapshot for orientation and is not kept in step with it.

```ts
type LevelDef = {
  id: string;            // "2026-08-19"
  seed: number;          // drives all in-run randomness
  terrain: ...;          // lane waypoints + tiles (path | platform class)
  waves: WaveDef[];      // fully authored, not random
  modifiers: string[];   // available Risk contracts for this day
};

// Reworked 2026-08-18. There is deliberately no `place`: the player cannot
// choose a tile, and no `start_wave`: waves auto-advance.
type Input = {
  tick: number;          // when it was issued — ordering is everything
  kind: "summon" | "merge" | "sell" | "ability";
  payload: ...;
};

type RunSubmission = {
  levelId: string;
  roster: TowerId[];     // chosen before the run; a replay needs it
  risk: string[];        // chosen handicaps
  inputs: Input[];       // the replay
  claimedScore: number;  // server recomputes and compares
};
```

**Server never trusts `claimedScore`.** `/api/run` re-runs `tick()` over the input
log and compares. Mismatch → reject, log, do not write.

**Never ship future levels to the client.** One day at a time. Spoilers and
cheating are the same attack surface.

## Commands

```bash
pnpm dev              # Next dev server on :3000
pnpm test             # Vitest, includes determinism suite
pnpm test:determinism # Golden replays only — run before every commit to sim/
pnpm lint
pnpm typecheck
pnpm levels:generate  # Bulk-generate candidate levels for hand vetting
pnpm build
```

## Testing policy

Coverage percentages are not the goal. These specific tests are:

1. **Golden replay tests (non-negotiable).** Fixtures of `(level, inputs)` with a
   recorded final-state hash. Any sim change that alters a hash must be an
   intentional, explained break — regenerate fixtures in the same commit and say
   why in the message.
2. **Isomorphism test.** The same replay produces the same hash in a browser
   environment and in Node.
3. **Validation test.** A tampered `claimedScore` is rejected by `/api/run`.

UI has no test requirement yet. Don't write React tests to pad the suite.

The gates are listed in `CLAUDE.md`, "Gates and balance".

## Code anti-patterns — reject these on sight

- Adding a physics engine "just for the projectiles." Interpolate them.
- Putting sim state into React state or Zustand. The sim owns its state; React
  reads a snapshot per frame.
- `Math.random()` anywhere under `packages/sim`.
- Trusting a client-submitted score.
