# docs

Working title: **TBD** (codename `siege` in package names until we pick one)

## Current state

- **On `main`:** M0 with the summon rework, the palatability passes, and the
  M0.1 playtest-feedback patches A–D (merged in `97db437`).
- **In flight:** M0.2, map engine and stages
  ([`spec/m0.2-map-engine-and-stages.md`](spec/m0.2-map-engine-and-stages.md)).
  Step 0, adopting the repo rules, is done. The step 1 report
  ([`reports/m0.2-step1.md`](reports/m0.2-step1.md)) is awaiting review: a
  hard stop before any code.

## Roadmap

Moved from the old `claude.md` §9 on 2026-10-12.

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

#### M0.1 — Playtest feedback (done)
Patches A–D: readability and feedback, the 9x12 board, tempo, in-run tower
family upgrades. Merged to `main` in `97db437`.

#### M0.2 — Map engine and stages (in flight)
Repo rules and the `docs/` tree, tile-based maps with a validator, the
reference-style board, the stage system and a seeded generator. See
[`spec/m0.2-map-engine-and-stages.md`](spec/m0.2-map-engine-and-stages.md).

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

## Open items

These are genuinely unresolved. If code forces a decision, surface it rather than
picking silently:

- Summon and merge share one sequential RNG stream, so a merge shifts every later
  summon. Candidate: per-kind draw tables pre-drawn at run start. Not this
  milestone.
- Wave difficulty is coupled to lane length across maps.
- Retries per day, whether the game is completable, and the stage sequence:
  open. The first two, as they stood in the old `claude.md` §11:
  - **Retries per day.** A strict one-shot daily (the Wordle model) kills the
    retry loop, which is the engine of TD retention — the reward for failing is
    knowing what wave 14 sends. Current lean: unlimited retries, best score counts,
    attempt count shown on the share card. Keeps both the retry loop and the daily
    social hook. Not final.
  - **Is the game completable?** Affects whether the daily is the whole game or a
    front door to a campaign. Premium games are free to have an ending; live games
    usually aren't. We haven't decided which we are.
- **Whether we build the social layer cosmetics require.** Cosmetics are fashion,
  and fashion needs an audience — skins sell in socially ubiquitous games and fail
  in niche ones where you never encounter anyone you know. That means clans,
  persistent identity, spectating, replays and shareable moments are prerequisites
  for the business model, not polish. If we decide we won't build them, the
  monetization model needs revisiting rather than the social features.

The income model, resolved for M0, moved to `balance.md`, "Tuning history".

## Deleted

Dated notes for every rule, mechanic or paragraph removed rather than moved.

### 2026-10-12: migration of the old `claude.md` (M0.2 step 0)

- **Design checklist item 3**, "Does it survive cosmetics-only?", and **item 8**,
  "Who sees the cosmetic?". Deleted per M0.2 Appendix B. The remaining seven are
  in `design/design-notes.md`.
- **§2 Monetization and Ads rows** ("Cosmetics only. No paid power, no paid
  progression, no paid time-skips, no energy, no loot boxes containing power";
  "None") and **the three "Consequences" bullets** (nothing combat-affecting
  gated behind money or grind; progression is never stats; replay, spectate,
  share and profile surfaces as load-bearing revenue features). Deleted per M0.2
  Appendix B. The Platforms, Model and PvP rows are in `architecture.md`.
- **The preamble** ("This file is the source of truth for how this repo is
  built. Read it fully before writing code…"). Superseded by the preamble of
  `CLAUDE.md`, which keeps its "say so instead of quietly complying" rule. The
  opening line of §3, "Everything else in this document is negotiable. This is
  not.", goes with it: it ranked the sections of a file that no longer exists.
- **§3's prohibitions list and §12 Working style.** Not lost: both are restated
  in `CLAUDE.md` ("The one rule" and "Process"). The old wording is not kept.
  The sfc32 detail survives in `architecture.md`, "Repo layout".
