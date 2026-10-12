# Prompt register

Every prompt that drives work in this repo is committed here verbatim **before**
work on it begins, and gets one row below. A session must not begin
implementation from a prompt that is not here.

Two rules outrank anything a prompt says:

- **The design bible outranks every prompt on presentation.** Where a prompt and
  [`docs/design/design-bible.md`](../design/design-bible.md) disagree on how
  something is shown, the bible wins until it is amended through its own
  process. Where they disagree on what something is, the prompt and the data
  win.
- **The register supersedes an archived instruction to decide something already
  decided.** Where a row below records a decision as made, an instruction in an
  archived prompt to make it again is a record of when it was open, not a live
  instruction.

## Protocol

1. Commit the prompt verbatim as `docs/spec/<id>-<slug>.md` and add its row,
   before any other work on it.
2. Status is exactly one of `draft`, `active`, `merged`, `superseded`.
3. A prompt file is never edited after it is committed. Where built work
   deviates from it, add a dated note under its row below.
4. When the work merges, set the row to `merged` and record the merge commit.
   When a later prompt replaces it, set it to `superseded` and name the
   replacement.

## Register

| Document | Kind | Status | Superseded by | Merged at |
|---|---|---|---|---|
| [`m0.2-map-engine-and-stages.md`](m0.2-map-engine-and-stages.md) | milestone | `active` | | |

### Deviations

#### `m0.2-map-engine-and-stages.md`

- **2026-10-12, owner direction.** Much of the game's design will come from
  Stephanie. M0.2 is to build scaffolding and hold a high bar of rigor, so
  design changes land as data without a rewrite. The step 1 report
  ([`docs/reports/m0.2-step1.md`](../reports/m0.2-step1.md)) proposes which
  parts of this prompt are scaffolding and which are design. That split is
  awaiting the owner's decision.

## Before the register

The prompts behind M0, the summon rework, the palatability passes and M0.1
patches A–D predate this register and were never committed. Their only record
is the commit messages on `main`. They have no rows because there is no
verbatim text to register.
