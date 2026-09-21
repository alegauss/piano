---
description: Play what is open in the Piano app, optionally slower or from a bar
argument-hint: '[e.g. "at half speed from bar 9"]'
---

Play the piece open in the Piano app. $ARGUMENTS

Use the piano tools in this order, and only the ones the request needs:

- `set_tempo` if a speed is asked for, as a fraction of the written tempo (half
  speed is 0.5).
- `seek` if a bar or a named section is asked for.
- `play`.

Then tell me in one sentence what is playing, from where and how fast, using
what the tools answered rather than what was asked. If no piano window is
listening, pass on what the tool said about getting the app.
