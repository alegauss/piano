---
description: Write a score for a named piece, check it, keep it and play it
argument-hint: <piece, e.g. "Twinkle Twinkle, beginner, right hand melody">
---

Write a score for: $ARGUMENTS

1. Use the piano-score skill: it has the format by example, the numbers that
   are easy to get wrong, and the mistakes no validator catches.
2. Decide what can be written. A piece still under copyright is not copied, even
   from memory: say so, and offer an original piece in its style instead. A
   traditional tune or a work in the public domain is fine, and so is anything
   new.
3. Write it as JSON in the piano score format, with a `metadata.id` made of
   lowercase words and dashes, provenance saying where the notes came from, and
   named sections where the music has them.
4. Check it with the piano `validate_score` tool. If it is refused, correct
   exactly the fields the problems name and check again, until it is valid.
   Then read it once against the skill's list of mistakes validation misses.
5. Keep it with `save_score`, and tell me the id it was saved under.
6. Ask the piano what is open with `piano_state`. If the window can play it,
   play it with `play`; if it says it cannot open a library score yet, tell me
   the score is saved and ready for when it can.
