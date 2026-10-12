# Balance

## 0. Standing policy

The gates in `CLAUDE.md` are the rule. This section is the reasoning.

- **Balance is not a gate.** Balance numbers move with every content change.
  Stopping structural work to chase a number that the next checkpoint will move
  again costs a checkpoint and buys nothing. Record the number and keep going.
- **No retuning between checkpoints, and no moving a target to hide a miss.** A
  number measured at a checkpoint has to describe the build at that checkpoint.
  Retuning mid-checkpoint means it describes neither tuning, and moving a target
  turns a measurement into a story.
- **Measurement, never feel.** Instrument first, then tune. The tuning history
  below exists because the first dial set by specification (`KILL_MANA_SHARE`
  0.6) failed on measurement.
- **Mean waves cleared, not win rate.** Win rate is a rare-event statistic: it
  discards every run that died early, so a tuning that loses at wave 2 and one
  that loses at wave 9 score the same.
- **Every figure is stamped** with its seed prefix, seed count, stage id and lane
  length, next to the number. Figures from different seed sets are different
  samples, and wave difficulty is coupled to lane length across maps (an open
  item in `docs/README.md`). **Read down a prefix, never across.**

### Benchmark table

| date | stage id | lane length | seed prefix | seed count | metric | value | commit |
|---|---|---|---|---|---|---|---|

No rows yet. Figures measured before M0.2 are in the M0.1 commit messages; none
carries a stage id or seed stamp, so none is entered here as a benchmark. The
first rows arrive with M0.2 step 5.

## Tuning history

### Income model and `KILL_MANA_SHARE`

Moved from the old `claude.md` §11 on 2026-10-12. The measured evidence is also
recorded beside the constant in `packages/sim/src/economy.ts`.

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
