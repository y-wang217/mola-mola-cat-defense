# Design bible

The authority on how anything is shown to a player. It is permanent; stage and
patch prompts are disposable. Where a prompt and this file disagree on how
something is shown, this file wins until it is amended through section 3. Where
they disagree on what something is, the prompt and the data win. This file
governs presentation only, never simulation, balance or the input log.

## 1. The two constraints

These outrank every rule in section 2 and every prompt.

### C1. Attributes, never verdicts

The UI presents attributes of options, never judgements about them. No
recommendations, no "best" markers, no scores or ratings on options, no
highlighting or ordering that ranks one option above another.

### C2. No decision-relevant fact is removed. It is re-encoded.

A fact the player uses to make a decision may change form (a sentence becomes a
glyph, a panel becomes a bar segment, text becomes a number), but it may not
disappear. A redesign that drops a decision-relevant fact has failed, whatever
else it achieves.

## 2. Rules

Empty. A rule is added only through section 3, from a disconfirmer observed in
a playtest and recorded in [`playtest-log.md`](playtest-log.md).

Each rule, when added, carries:

- **Rule:** what is shown and how.
- **Disconfirmer:** the specific playtest observation that would show the rule is
  wrong.
- **Source:** the playtest-log entry that produced it.

## 3. Amendment process

This file changes only this way. A prompt does not amend it by saying it does.

1. **Observe.** A disconfirmer is observed in a playtest: a player misreads,
   misses or is misled by something on screen.
2. **Record.** The observation is entered in [`playtest-log.md`](playtest-log.md),
   dated, with who played, the build, and which rule or constraint it bears on.
3. **Amend.** A PR to this file adds, changes or deletes a rule, citing the
   log entry. A superseded rule is deleted, not left behind a flag, and the
   deletion is recorded with a dated note in [`docs/README.md`](../README.md).

C1 and C2 are amended the same way and are also restated as invariants in
`CLAUDE.md`, so changing either one also means changing `CLAUDE.md`.
