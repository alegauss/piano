---
name: piano-score
description: Write a score in the piano score format that validates the first time and sounds like music. Use when asked to write, compose, arrange or transcribe a piece for the Piano app, and when validate_score refuses one.
---

# Writing a piano score

A score is one JSON object. The quickest way to get one right is to copy the
shape below and change the music, not to assemble it from a list of fields.

## The shape, by example

A complete four-bar piece: a right-hand melody over a left-hand bass, two named
phrases, dynamics, a pedal at the end, and a beginner arrangement that is
genuinely easier than the piece as written.

<!-- prettier-ignore -->
```json
{
  "formatVersion": 1,
  "metadata": {
    "id": "little-ascent",
    "title": "Little Ascent",
    "composer": "Written for this example",
    "key": "C major",
    "level": "beginner",
    "difficulty": 2,
    "provenance": { "source": "Composed for the piano plugin", "licence": "CC0" }
  },
  "timing": {
    "ticksPerQuarter": 480,
    "tempo": [{ "tick": 0, "microsecondsPerQuarter": 666667 }],
    "timeSignatures": [{ "tick": 0, "numerator": 4, "denominator": 4 }]
  },
  "parts": [
    { "id": "melody", "name": "Melody", "colour": "note-part-1", "role": "melody" },
    { "id": "bass", "name": "Bass", "colour": "note-part-2", "role": "bass" }
  ],
  "notes": [
    { "pitch": 60, "start": 0, "duration": 480, "velocity": 72, "part": "melody", "hand": "right" },
    { "pitch": 64, "start": 480, "duration": 480, "velocity": 76, "part": "melody", "hand": "right" },
    { "pitch": 67, "start": 960, "duration": 480, "velocity": 80, "part": "melody", "hand": "right" },
    { "pitch": 64, "start": 1440, "duration": 480, "velocity": 70, "part": "melody", "hand": "right" },
    { "pitch": 65, "start": 1920, "duration": 480, "velocity": 74, "part": "melody", "hand": "right" },
    { "pitch": 69, "start": 2400, "duration": 480, "velocity": 80, "part": "melody", "hand": "right" },
    { "pitch": 67, "start": 2880, "duration": 960, "velocity": 72, "part": "melody", "hand": "right" },
    { "pitch": 64, "start": 3840, "duration": 480, "velocity": 76, "part": "melody", "hand": "right" },
    { "pitch": 67, "start": 4320, "duration": 480, "velocity": 82, "part": "melody", "hand": "right" },
    { "pitch": 72, "start": 4800, "duration": 480, "velocity": 90, "part": "melody", "hand": "right" },
    { "pitch": 71, "start": 5280, "duration": 480, "velocity": 80, "part": "melody", "hand": "right" },
    { "pitch": 69, "start": 5760, "duration": 480, "velocity": 76, "part": "melody", "hand": "right" },
    { "pitch": 71, "start": 6240, "duration": 480, "velocity": 80, "part": "melody", "hand": "right" },
    { "pitch": 72, "start": 6720, "duration": 960, "velocity": 84, "part": "melody", "hand": "right" },

    { "pitch": 48, "start": 0, "duration": 960, "velocity": 58, "part": "bass", "hand": "left" },
    { "pitch": 43, "start": 960, "duration": 960, "velocity": 54, "part": "bass", "hand": "left" },
    { "pitch": 41, "start": 1920, "duration": 960, "velocity": 58, "part": "bass", "hand": "left" },
    { "pitch": 48, "start": 2880, "duration": 960, "velocity": 54, "part": "bass", "hand": "left" },
    { "pitch": 48, "start": 3840, "duration": 960, "velocity": 60, "part": "bass", "hand": "left" },
    { "pitch": 43, "start": 4800, "duration": 960, "velocity": 62, "part": "bass", "hand": "left" },
    { "pitch": 41, "start": 5760, "duration": 960, "velocity": 58, "part": "bass", "hand": "left" },
    { "pitch": 48, "start": 6720, "duration": 960, "velocity": 60, "part": "bass", "hand": "left" },
    { "pitch": 55, "start": 6720, "duration": 960, "velocity": 56, "part": "bass", "hand": "left" }
  ],
  "expression": {
    "dynamics": [
      { "tick": 0, "level": "mp" },
      { "tick": 3840, "level": "mf" }
    ],
    "pedals": [
      { "tick": 6720, "pedal": "sustain", "value": 127 },
      { "tick": 7680, "pedal": "sustain", "value": 0 }
    ]
  },
  "sections": [
    { "id": "phrase-a", "label": "First phrase", "startTick": 0, "endTick": 3840 },
    { "id": "phrase-b", "label": "Second phrase", "startTick": 3840, "endTick": 7680 }
  ],
  "arrangements": [
    { "id": "easy", "level": "beginner", "label": "Melody alone", "parts": ["melody"], "tempoScale": 0.75 },
    { "id": "full", "level": "advanced", "label": "As written" }
  ]
}
```

## The numbers that are easy to get wrong

| What              | Value                                                                             |
| ----------------- | --------------------------------------------------------------------------------- |
| Middle C          | pitch 60 (C4). A4 is 69. A piano runs from 21 (A0) to 108 (C8).                   |
| A quarter note    | 480 ticks, unless `ticksPerQuarter` says otherwise                                |
| Eighth, sixteenth | 240, 120. A dotted quarter is 720, a half 960, a whole 1920                       |
| One bar           | 4/4 is 1920 ticks, 3/4 is 1440, 6/8 is 1440, 2/4 is 960                           |
| Tempo             | `microsecondsPerQuarter` = 60 000 000 ÷ bpm, as a whole number: 120 bpm is 500000 |
| A note's start    | where it begins, from tick 0 at the start of the piece; never a bar number        |
| A pickup          | `timing.pickupTicks`, the length of the partial bar before bar 1                  |

**Velocity is touch, and a dynamic mark scales it.** `mf` leaves a note's
velocity alone and `p` takes about a third off, so write velocities around 60 to
90 with a shape inside each phrase — louder towards its peak, softer at its end —
and set the overall level with `expression.dynamics`. A whole piece at a flat
100 is the most common way a generated score sounds mechanical, and writing soft
velocities under a `p` mark makes it doubly quiet.

## What validation catches for you

`validate_score` runs the same checks as the app. Fix exactly the fields its
problems name and check again.

- Unknown fields anywhere are refused; anything of your own goes under
  `extensions`.
- Two notes of the same pitch overlapping in one `voice` are refused. A chord is
  several pitches at one start, which is fine; two melodic lines in one hand
  that cross or hold through each other need different `voice` numbers.
- Every `part` a note names must be declared in `parts`.
- An arrangement that `drop`s or `overrides` notes names them by `id`, and then
  every note needs an id.
- An arrangement carrying `generated` is one the app worked out and somebody
  kept. Correct it freely: once changed it counts as written by hand, and the
  app never replaces it. Untouched, one naming notes you removed is set aside
  rather than refused.
- A `spelling` such as `"Bb3"` must agree with the pitch it sits on.

A valid score can come back with **warnings** as well: music that passes and is
still probably wrong. Each names the bar and the note. They are not refusals —
hands do cross, and a rest can end a bar — so read each one, fix the slips, and
leave what the music means. They only check notes that name their `hand`.

## What nothing catches, and you must

These are the mistakes that pass validation and still make a bad score. Read
the finished score for each of them before saving it. The ones marked
_(warned)_ also come back as warnings, but only where the arithmetic shows them.

1. **A left hand above the right** _(warned)_. The bass sits below the melody. If
   the hands cross, it should be because the music crosses, not because octaves
   were miscounted — check the lowest right-hand note against the highest
   left-hand note in each bar.
2. **A chord no hand can reach** _(warned)_. Notes one hand plays at once should
   span an octave (12 semitones) or less; a tenth is for large hands only. Spread
   a wider chord across both hands or roll it.
3. **A melody stuck in one octave.** A tune that never leaves five neighbouring
   notes is a drill, not a melody. Give it a shape: a rise to a high point, and
   somewhere to come back to.
4. **A beginner arrangement identical to the advanced one.** A beginner version
   must actually be easier: the melody alone, one voice, fewer notes, slower
   (`tempoScale`). If you cannot make one that is easier, leave arrangements out
   and let the app reduce the piece itself.
5. **Notes that do not fill the bar** _(warned)_. Add up the durations in each
   hand for each bar; a 4/4 bar is 1920 ticks of notes and rests. Rests are gaps
   between notes, not notes of their own. The warnings catch a note running into
   the next in one voice, and a bar where every hand stops a beat or more early.
6. **Velocity with no dynamics.** See above: shape inside the phrase, level
   from the marks.
7. **No sections.** Name the phrases, verses or movements, so somebody can say
   "practise the bridge" and be understood.

## When to stop

A piece still under copyright is not written out, from memory or otherwise,
however it is asked for: say so plainly, and offer an original piece in the same
style, or a traditional or public-domain one. Never present an approximation as
the real thing. Name where the notes came from in `metadata.provenance`, with a
licence: `public-domain` or `CC0` for a traditional or old work, `CC0` for
something written fresh.

## The loop

1. Write the score.
2. `validate_score`. If it is refused, correct the named fields and validate
   again until it passes.
3. Read it once more against the list above.
4. `save_score`, and report the id it was saved under.
