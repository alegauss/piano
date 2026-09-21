---
description: Practise a passage, graded, at a tempo that climbs
argument-hint: <passage and hands, e.g. "bars 17 to 20, left hand, from half speed">
---

Set up a practice drill for: $ARGUMENTS

Turn the request into one call to the piano `practise` tool:

- The passage as `bars` (both ends included, counted from bar 1) or as a
  `section` id. If the request names a section by its label and you are not
  sure of the id, ask the piano with `piano_state` first; a refusal lists the
  sections there are.
- `hands` when one hand is asked for, and `other: "silent"` only when the other
  hand should not play along.
- `from` as a fraction of the written tempo where a starting speed is given;
  otherwise leave it out and the drill starts where the tempo already is.

Make one call, not several. Then tell me what the drill is doing, in the words
the tool answered with: each clean repetition is a step faster, and one with a
wrong or missed note drops back a step.
