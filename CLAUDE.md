# CLAUDE.md

Invariants for this repo. A rule is here because it holds for every stage and is
expected to hold for every future one. If a future stage could reasonably
reverse it, it does not belong here.

Current state, milestones, open items and balance numbers are not invariants.
They live in `docs/README.md` and `docs/balance.md`, which change constantly.

Justifications are deliberately absent. Each section points at the document that
carries the argument. If a request conflicts with a rule here, say so instead of
quietly complying.

## The one rule: the simulation is deterministic and pure

`tick(state, inputs) -> state`. Same inputs, same seed, same output,
byte-identical, in the browser and in Node, today and in six months.

Inside `packages/sim`:

- No `Math.random`. All randomness comes from `sim/rng.ts`.
- No wall clock: no `Date.now`, no `performance.now`. Time is the tick counter.
- No pixi.js, React, DOM types, `window` or `document`.
- Fixed 30Hz tick. The sim never sees a frame duration. Render interpolates.
- No iteration over a `Set`, `Map` or object keys where order could differ. Use
  arrays with explicit sort keys.
- Fixed-point integers wherever an integer works (`FP_SCALE = 1000`, helpers in
  `sim/fixed.ts`).
- No draw is keyed or ordered by anything that varies with render, frame rate
  or device.
- Map generation is pure and seeded, and every draw it makes is a function of
  its params, seed and attempt index.

If a change would break determinism, stop and flag it.

Argument: `docs/architecture.md`.

## Architecture

- The dependency arrow points one way: `apps/web -> packages/sim` and
  `packages/levels -> packages/sim`. `packages/sim` imports from neither.
  Asserted by a test, not only by lint, because lint is easy to disable inline.
- Sim state never lives in React state or Zustand. React reads a snapshot per
  frame.
- Every number a tuning pass would touch lives in a named constants or data
  module. If tuning requires editing logic, the split is wrong.
- Content is data: maps, stages, wave scripts, towers, enemies. If adding one
  requires editing logic, the split is wrong.
- A map that fails validation cannot be loaded into a run.
- The server never trusts a client score. It re-simulates the input log and
  compares. Mismatch: reject, log, do not write.
- Never ship future levels to the client.
- Do not add a dependency, a service or a milestone without asking.

Argument: `docs/architecture.md`.

## Versioning

| axis | covers |
|---|---|
| `INPUT_LOG_VERSION` | the input schema |
| `GENERATOR_VERSION` | map generation from params and seed |
| map hash | the compiled terrain a stage resolves to |

- A mismatch fails loudly, and the message names which axis mismatched and both
  values. **Never silently reinterpret a replay or a seed.**
- `INPUT_LOG_VERSION` bumps only when an input kind is added, removed,
  reordered or reshaped.
- Golden replay fixtures change only as an intentional, explained break:
  regenerated in the same commit, with the reason in the message.

## Presentation

The authority on how anything is shown to a player is
`docs/design/design-bible.md`. It is permanent. Stage and patch prompts are
disposable.

- **Where a prompt and the bible disagree on how something is shown, the bible
  wins** until the bible is amended. Where they disagree on what something is,
  the prompt and the data win. The bible governs presentation only.
- The UI presents attributes, never verdicts. No recommendations, no "best"
  markers, no scores or ratings on options, no highlighting or ordering that
  ranks one option above another.
- **No fact that changes a decision is removed. It is re-encoded.**
- The bible changes only through its own amendment process: a disconfirmer
  observed in a playtest, recorded in `docs/design/playtest-log.md`, then a PR
  to the bible.
- If an asset fails to load, the game stays fully playable on fallback
  rendering.

## Process

- Every prompt is committed to `docs/spec/` verbatim **before** work begins on
  it, with a register row. A session must not begin implementation from a
  prompt that is not there. Protocol: `docs/spec/README.md`.
- Where built work deviates from its prompt, do not edit the prompt. Record the
  deviation with a date under its register row.
- Where the register records a decision as made, an instruction in an archived
  prompt to make it again is a record of when it was open, not a live
  instruction.
- **Where a prompt says to report before writing code, that is a hard stop.**
- Commit at each checkpoint and stop for review.
- UI comes last in every stage. If a mechanic cannot be shown to work headless,
  polish does not fix it.
- Sim changes and render changes are separate commits.
- A superseded rule or mechanic is deleted, never left behind a flag, and
  recorded with a dated note in `docs/README.md`.
- A proposed mechanic is run through the design checklist in
  `docs/design/design-notes.md` before it is built.
- Honest assessment over optimistic framing. If an approach is likely to fail,
  say so plainly with the reason.

## Gates and balance

Absolute gates: the determinism suite and golden replays, the boundaries test,
type check, lint, build, and the full suite.

- **Balance is not a gate.** Record the number and keep going.
- Do not retune between checkpoints, and do not move a target to make a miss
  disappear.
- Balance by measurement, never by feel. Instrument first, then tune.
- Benchmark on **mean waves cleared**, not win rate.
- Every benchmark figure is stamped with its seed prefix, seed count, stage id
  and lane length, next to the number. **Read down a prefix, never across.**

Standing policy and the benchmark table: `docs/balance.md` section 0.

## Where to find things

| you want | read |
|---|---|
| current state, roadmap, open items, dated deletions | `docs/README.md` |
| the prompt register and deviations | `docs/spec/README.md` |
| layers, stack, data contracts, commands | `docs/architecture.md` |
| balance policy, benchmarks, tuning history | `docs/balance.md` |
| how anything is shown to a player | `docs/design/design-bible.md` |
| playtest observations that can amend the bible | `docs/design/playtest-log.md` |
| design rationale, checklist, known dead ends | `docs/design/design-notes.md` |
