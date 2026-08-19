# CLAUDE.md

Working title: **TBD** (codename `siege` in package names until we pick one)

This file is the source of truth for how this repo is built. Read it fully before
writing code. If a request conflicts with the FIXED CONSTRAINTS or THE ONE RULE
sections, say so instead of quietly complying.

---

## 1. What we are building

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

### Design checklist — run any proposed mechanic through this before building it

1. **What is the player doing while the wave walks?** If the answer is "watching,"
   the idea isn't finished. Low moment-to-moment agency is this genre's one
   structural weakness; every good TD is a different answer to it. Deliberation
   counts as doing — giving the player information worth thinking about is a valid
   answer. Continuous manual aiming is not.
2. **Is this standard, rare, or already abandoned in the genre?** If it's rare,
   establish *why* it's rare before assuming it's an opportunity. "We'd execute it
   better" is not an answer.
3. **Does it survive cosmetics-only?** If the mechanic depends on selling power,
   selling time, or selling a collection, it does not survive — however good it is.
4. **Does it survive async PvP?** Is income symmetric and deterministic? Is a run
   under five minutes? Does it work with no live opponent present?
5. **What is the content cost per unit of player-facing variety?** Prefer systems
   that generate variety (modifiers, seeds, player authorship, PvP) over content
   that must be hand-made forever. We cannot run a content treadmill.
6. **What stops 40 towers collapsing to 5?** If there's no role-enforcement
   mechanism — flying-only enemies, armour requiring specific damage types, tiles
   only certain units can occupy — the variety is nominal.
7. **What happens in the ten seconds after a loss?** If it isn't immediate and
   compelling, retention will be poor.
8. **Who sees the cosmetic?** If nobody sees it, nobody buys it.
9. **Would someone who has played Kingdom Rush, Bloons, Arknights and Rush Royale
   recognise this as new within thirty seconds?** If not, we're competing on
   execution against studios with a decade of head start and a live-ops team.

### Known dead ends — do not propose these

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

---

## 2. FIXED CONSTRAINTS — do not relitigate these in code review

| Constraint | Value |
| --- | --- |
| Platforms | Web first, then iOS + Android via Capacitor |
| Model | Free to play |
| Monetization | **Cosmetics only.** No paid power, no paid progression, no paid time-skips, no energy, no loot boxes containing power. |
| PvP | In scope, **asynchronous** (replay-based) |
| Ads | None |

Consequences that follow and must be respected:

- Nothing that affects combat outcome may be gated behind money **or** behind
  grind. If it changes the result of a run, every player has it from day one.
- Progression is breadth, cosmetics, rank, and narrative — never stats.
- Cosmetics only sell if they are *seen*. Replay, spectate, share, and profile
  surfaces are load-bearing revenue features, not polish. Treat them as such.

---

## 3. THE ONE RULE: the simulation is deterministic and pure

Everything else in this document is negotiable. This is not.

```
tick(state: GameState, inputs: Input[]) -> GameState
```

The sim is a pure, dependency-free TypeScript module. Same inputs, same seed,
same output — byte-identical, in the browser and in Node, today and in six months.

### Hard prohibitions inside `packages/sim`

- ❌ `Math.random()` — use the seeded PRNG in `sim/rng.ts` (sfc32). Every random
  draw pulls from run state, never from a global.
- ❌ `Date.now()`, `performance.now()`, any wall clock. Time is the tick counter.
- ❌ Importing `pixi.js`, React, DOM types, `window`, or `document`.
- ❌ Variable delta time. Fixed 30Hz tick. Render interpolates between ticks;
  the sim never sees a frame duration.
- ❌ Iterating a `Set`/`Map`/object keys where insertion order could differ.
  Use arrays with explicit sort keys.
- ❌ Floating point where an integer works. Positions and health are fixed-point
  ints (`FP_SCALE = 1000`). Helpers live in `sim/fixed.ts`.

### What determinism buys us (why we pay this cost)

- **Replays** = the ordered input log. A full run is ~1KB, not a video.
- **Server-side score validation** — the identical sim module runs in a Vercel
  function and re-simulates the submission. Cheating requires solving the game.
- **Async PvP** — an opponent is just their input log replayed against your board.
- **Spectating and shareable clips** — the observation surface cosmetics need.

All four are nearly free with a pure sim and brutally expensive to retrofit.
If a change would break determinism, stop and flag it.

---

## 4. Stack

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

---

## 5. Repo layout

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
  __tests__/               Golden replay tests (see §8)

/packages/levels           Offline level generator + vetted level JSON
  generate.ts              Bulk generator, run manually
  vetted/YYYY-MM-DD.json   Committed, hand-approved levels
```

**The dependency arrow points one way:** `web → sim`. The sim never imports from
`web`. If you find yourself wanting to, the abstraction is wrong.

---

## 6. Data contracts

Define these in `packages/sim/types.ts` and treat changes as migrations.

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

---

## 7. Commands

```bash
pnpm dev              # Next dev server on :3000
pnpm test             # Vitest, includes determinism suite
pnpm test:determinism # Golden replays only — run before every commit to sim/
pnpm lint
pnpm typecheck
pnpm levels:generate  # Bulk-generate candidate levels for hand vetting
pnpm build
```

---

## 8. Testing policy

Coverage percentages are not the goal. These specific tests are:

1. **Golden replay tests (non-negotiable).** Fixtures of `(level, inputs)` with a
   recorded final-state hash. Any sim change that alters a hash must be an
   intentional, explained break — regenerate fixtures in the same commit and say
   why in the message.
2. **Isomorphism test.** The same replay produces the same hash in a browser
   environment and in Node.
3. **Validation test.** A tampered `claimedScore` is rejected by `/api/run`.

UI has no test requirement yet. Don't write React tests to pad the suite.

---

## 9. Build order

Do not skip ahead. Each milestone answers one question, and a "no" means we stop
and rethink rather than proceed.

### M0 — Is it fun?
One hardcoded map. Pixi render + sim core. Local only, no backend, no build step
beyond `pnpm dev`.

**Superseded by the summon rework (2026-08-18).** Direct placement is gone: the
player picks a 5-tower roster before the run, then summons — one button, costs
mana, random roster tower onto a random legal tile. Agency comes from roster
construction, merge (tier up, type re-rolls) and sell. Waves auto-advance,
because time-regenerating mana plus a manual start button would let the player
idle and bank unlimited mana.

**Done when:** a person plays a 4-minute run and wants a second one.
**This is the only question that matters. Nothing below is worth building if M0 fails.**

### M1 — Determinism and replay
Extract inputs to a log. Replay reproduces the run exactly. Golden fixtures and
the determinism suite exist and pass.

**Done when:** a recorded run plays back frame-identically, verified by hash.

### M2 — The daily
Level generator + vetted JSON. `/api/daily`. Supabase schema. `/api/run` with
server-side revalidation. Leaderboard for a date.

**Done when:** two people on two devices play the same board and see both scores.

### M3 — Share
Wordle-style emoji scorecard. `navigator.share` with clipboard fallback. Attempt
count included.

**Done when:** a score posted to a group chat makes someone else open the link.

### M4 — Async ghost
Race an opponent's stored replay side-by-side on the same board.

**Done when:** watching Stephanie's ghost pull ahead is annoying enough to trigger a retry.

### M5+ — Not yet
Cosmetics, accounts, clans, Capacitor, Risk contract UI, seasons. **Do not start
any of these before M4 confirms the loop holds.** If asked to, push back and ask
whether M4 is genuinely done.

---

## 10. Anti-patterns — reject these on sight

- Adding a physics engine "just for the projectiles." Interpolate them.
- Putting sim state into React state or Zustand. The sim owns its state; React
  reads a snapshot per frame.
- `Math.random()` anywhere under `packages/sim`.
- Trusting a client-submitted score.
- Building a settings menu, account system, or shop before M4.
- Balancing by feel. Instrument first — wave-reached, placements, restarts,
  abandons — then tune. Level pass rate is a usable proxy for difficulty and it
  correlates directly with churn, so difficulty gets measured, not guessed.
- Any mechanic that only works if someone pays, grinds, or waits. It violates §2.
- New tower types as the answer to "the game feels samey." Design **enemies**
  first. A roster of towers is only as diverse as the set of problems the game
  poses; adding towers without adding problems just adds art cost.

---

## 11. Open questions — do not invent answers

These are genuinely unresolved. If code forces a decision, surface it rather than
picking silently:

- **Retries per day.** A strict one-shot daily (the Wordle model) kills the
  retry loop, which is the engine of TD retention — the reward for failing is
  knowing what wave 14 sends. Current lean: unlimited retries, best score counts,
  attempt count shown on the share card. Keeps both the retry loop and the daily
  social hook. Not final.
- **Income model — RESOLVED for M0, still open past it.** The reasoning stands:
  kill-gold links income to performance, which creates a death spiral — falling
  behind lowers income, which guarantees falling further behind — and it is
  unusable in PvP because whoever gets ahead early gets richer. Time-based income
  is symmetric and makes deployment a continuous verb.

  What shipped is **both**, with one dial. `KILL_MANA_SHARE` in
  `packages/sim/src/economy.ts` splits a fixed target income between a guaranteed
  time-based floor and kill bounties scaled by enemy size. At 0.0 it is pure
  time-based; at 1.0 pure kill-gold. It is set to **0.3**, on measured evidence
  recorded in that file: at 0.6 a family-spanning roster went from an 11-life win
  to a wave-4 loss and sloppy runs spiralled, because kill-funding pays for damage
  and so penalises support-heavy rosters. At 1.0 the model collapses outright.

  The cost main flagged is real and now applies: the difficulty curve is authored
  against a known income schedule, so changing the dial requires re-tuning waves.
- **Is the game completable?** Affects whether the daily is the whole game or a
  front door to a campaign. Premium games are free to have an ending; live games
  usually aren't. We haven't decided which we are.
- **Whether we build the social layer cosmetics require.** Cosmetics are fashion,
  and fashion needs an audience — skins sell in socially ubiquitous games and fail
  in niche ones where you never encounter anyone you know. That means clans,
  persistent identity, spectating, replays and shareable moments are prerequisites
  for the business model, not polish. If we decide we won't build them, the
  monetization model needs revisiting rather than the social features.

---

## 12. Working style

- Honest assessment over optimistic framing. If an approach is likely to fail,
  say so plainly with the reason.
- Small commits. Sim changes are isolated from render changes.
- Ask before adding a dependency, a service, or a milestone.
