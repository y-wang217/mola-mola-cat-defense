# Playtest log

Dated observations from people playing the game. An entry here is the only way
a rule enters or leaves [`design-bible.md`](design-bible.md) (section 3).

Each entry records: date, who played, the build, the observation, and which
bible rule it bears on, if any. Where a field was not recorded it says so. A
gap is never filled with a guess.

## Seed entries

Seeded on 2026-10-12, from the M0.1 commit messages and nothing else. Those
messages record what was observed but not when the playtest happened, who played
or which build they played. The date given is the date of the commit that
records the observation. All four patches were built on top of `3c39243`, which
is the only reason to place the build there.

### 2026-08-20: HUD unreadable on a phone; merges invisible

- **Who played:** not recorded ("the playtest").
- **Build:** not recorded. Patch A was built on `3c39243`.
- **Observation:** "The playtest could not read the HUD on a phone and could not
  tell when a merge had happened." (`621aaab`, patch A)
- **Bears on:** no bible rule, because section 2 was empty when it was recorded.
  Patch A acted on it in render code only.

### 2026-08-20: square cells; the board felt wrong

- **Who played:** not recorded ("the tester").
- **Build:** not recorded. Patch B was built on `3c39243` plus patch A.
- **Observation:** "The tester asked for square cells and said the board felt
  wrong." (`fafedc7`, patch B). The same commit records that cells were already
  1:1 and attributes the complaint to the board's own aspect ratio, which
  letterboxed it on a phone.
- **Bears on:** no bible rule, because section 2 was empty when it was recorded.

### 2026-08-20: "Faster everything, faster more actions."

- **Who played:** not recorded.
- **Build:** not recorded. Patch C was built on `3c39243` plus patches A and B.
- **Observation:** patch C's commit message (`efb30cf`) opens with the quoted
  line "Faster everything, faster more actions." and does not say who said it.
  It is entered here because the patch treats it as the request it answers.
- **Bears on:** no bible rule. This is a pacing request, not a presentation one.
  The one presentation consequence the commit records is that the incoming-wave
  preview moved permanently into the HUD when the prep break was removed.

### Not entered

Patch D (`579768c`) answers "the brief", not a recorded playtest observation, so
it has no entry.
