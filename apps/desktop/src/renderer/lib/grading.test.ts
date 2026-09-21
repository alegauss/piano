import { resolveTiming, type Section } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import {
  barNames,
  expectedFrom,
  grade,
  judge,
  NO_FEEDBACK,
  noteKey,
  noteLook,
  troubled,
  WINDOWS,
  type Expected,
  type Feedback,
  type Outcome,
  type Played,
} from './grading'

/**
 * The arithmetic of saying how it went, with no clock and no transport: every
 * strike here is placed by hand, at a tick and a number of seconds off it.
 *
 * 120 bpm at 480 ticks to the quarter, four four: a quarter is half a second
 * and a bar is 1920 ticks.
 */
const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4

function expected(pitch: number, tick: number, velocity = 80): Expected {
  return { pitch, tick, velocity }
}

/** A strike, placed at a tick and pushed off it by `off` seconds. */
function strike(pitch: number, tick: number, off = 0, extra: Partial<Played> = {}): Played {
  return { pitch, velocity: 80, tick, slip: off, scale: 1, expressive: false, ...extra }
}

function outcomes(notes: readonly Expected[], strikes: readonly Played[], options = {}): Outcome[] {
  return grade(notes, strikes, { timing, ...options }).judged.map((one) => one.outcome)
}

describe('the timing window', () => {
  const note = [expected(60, 0)]

  it('counts a strike inside it as in time', () => {
    expect(outcomes(note, [strike(60, 0, 0.1)])).toEqual(['correct'])
    expect(outcomes(note, [strike(60, 0, -0.1)])).toEqual(['correct'])
  })

  it('tells early from late outside it', () => {
    expect(outcomes(note, [strike(60, 0, 0.2)])).toEqual(['late'])
    expect(outcomes(note, [strike(60, 0, -0.2)])).toEqual(['early'])
  })

  it('is the setting: the same strike passes gently and fails strictly', () => {
    expect(outcomes(note, [strike(60, 0, 0.1)], { strictness: 'gentle' })).toEqual(['correct'])
    expect(outcomes(note, [strike(60, 0, 0.1)], { strictness: 'strict' })).toEqual(['late'])
    expect(WINDOWS.strict).toBeLessThan(WINDOWS.gentle)
  })

  it('is in seconds a player feels, not in written time', () => {
    // A hundred ticks is a tenth of a second as written, and a fifth of one
    // at half speed, which is where it leaves the window.
    expect(outcomes(note, [strike(60, 100)])).toEqual(['correct'])
    expect(outcomes(note, [strike(60, 100, 0, { scale: 0.5 })])).toEqual(['late'])
  })

  it('says how far off in seconds, positive for late', () => {
    const attempt = grade(note, [strike(60, 0, 0.2)], { timing })
    expect(attempt.judged[0]?.offset).toBeCloseTo(0.2, 6)
    expect(attempt.window).toBeCloseTo(WINDOWS.steady, 6)
  })
})

describe('matching what was played to what was written', () => {
  const melody = [expected(60, 0), expected(62, QUARTER), expected(64, 2 * QUARTER)]

  it('does not cascade: a dropped note costs one note', () => {
    const attempt = grade(melody, [strike(60, 0), strike(64, 2 * QUARTER)], { timing })
    expect(attempt.judged.map((one) => one.outcome)).toEqual(['correct', 'missed', 'correct'])
    expect(attempt.extras).toEqual([])
  })

  it('calls a note played at the wrong pitch wrong, not missed and extra', () => {
    const attempt = grade(melody, [strike(60, 0), strike(61, QUARTER), strike(64, 2 * QUARTER)], {
      timing,
    })
    expect(attempt.judged.map((one) => one.outcome)).toEqual(['correct', 'wrong', 'correct'])
    expect(attempt.judged[1]?.played?.pitch).toBe(61)
    expect(attempt.extras).toEqual([])
  })

  it('never spends a right note standing in for another', () => {
    // The C is late enough to be nearer the second note than the first. It is
    // still the first note's own, and the second is what went missing.
    const attempt = grade([expected(60, 0), expected(62, 40)], [strike(60, 60)], { timing })
    expect(attempt.judged.map((one) => one.outcome)).toEqual(['correct', 'missed'])
  })

  it('counts a note the score never asked for as an extra', () => {
    const attempt = grade([expected(60, 0)], [strike(60, 0), strike(67, 0)], { timing })
    expect(attempt.judged.map((one) => one.outcome)).toEqual(['correct'])
    expect(attempt.extras.map((one) => one.pitch)).toEqual([67])
    expect(attempt.tally.extra).toBe(1)
  })

  it('does not call a strike a bar away an attempt at anything', () => {
    const attempt = grade([expected(60, 0)], [strike(61, BAR)], { timing })
    expect(attempt.judged.map((one) => one.outcome)).toEqual(['missed'])
    expect(attempt.extras).toHaveLength(1)
  })

  it('takes a chord in any order, since the strikes are all at the tick', () => {
    const chord = [expected(60, 0), expected(64, 0), expected(67, 0)]
    const played = [strike(67, 0, 0.01), strike(60, 0, 0.02), strike(64, 0, 0.005)]
    expect(outcomes(chord, played)).toEqual(['correct', 'correct', 'correct'])
  })
})

describe('the report', () => {
  const notes = [
    expected(60, 0),
    expected(62, QUARTER),
    expected(64, 2 * BAR),
    expected(65, 2 * BAR + QUARTER),
  ]

  it('is per bar, so it can name the bar to go back to', () => {
    const attempt = grade(notes, [strike(60, 0), strike(62, QUARTER)], { timing })
    expect(attempt.bars.map((bar) => bar.bar)).toEqual([1, 3])
    expect(attempt.bars[0]?.tally.correct).toBe(2)
    expect(troubled(attempt.bars).map((bar) => bar.bar)).toEqual([3])
    expect(troubled(attempt.bars)[0]?.tally.missed).toBe(2)
  })

  it('counts a note that was not in the score against the bar it was played in', () => {
    const attempt = grade(notes, [strike(60, 0), strike(62, QUARTER), strike(70, BAR)], { timing })
    expect(attempt.bars.find((bar) => bar.bar === 2)?.tally.extra).toBe(1)
  })

  it('is per named section as well, for the piece that has them', () => {
    const sections: Section[] = [
      { id: 'verse', label: 'Verse', startTick: 0, endTick: BAR },
      { id: 'chorus', label: 'Chorus', startTick: 2 * BAR, endTick: 4 * BAR },
    ]
    const attempt = grade(notes, [strike(60, 0), strike(62, QUARTER)], { timing, sections })
    expect(attempt.sections.map((section) => [section.label, section.tally.correct])).toEqual([
      ['Verse', 2],
      ['Chorus', 0],
    ])
  })

  it('counts every outcome once, and every note the score asked for', () => {
    const attempt = grade(notes, [strike(60, 0), strike(63, 2 * BAR), strike(70, BAR)], { timing })
    const { tally } = attempt
    expect(tally.of).toBe(4)
    expect(tally.correct + tally.early + tally.late + tally.wrong + tally.missed).toBe(4)
    expect(tally.extra).toBe(1)
  })

  it('names runs of bars as ranges, the way somebody says them', () => {
    expect(barNames([17, 18, 19, 20, 24])).toBe('17–20, 24')
    expect(barNames([4])).toBe('4')
    expect(barNames([])).toBe('')
  })
})

describe('the touch, kept apart from the notes', () => {
  const note = [expected(60, 0, 80)]

  it('is not graded on an input that cannot say how hard a key was struck', () => {
    expect(grade(note, [strike(60, 0)], { timing }).dynamics).toBeNull()
  })

  it('says how many were at the weight written, and which way the rest leaned', () => {
    const notes = [expected(60, 0, 80), expected(62, QUARTER, 80)]
    const attempt = grade(
      notes,
      [
        strike(60, 0, 0, { velocity: 85, expressive: true }),
        strike(62, QUARTER, 0, { velocity: 120, expressive: true }),
      ],
      { timing },
    )
    expect(attempt.dynamics).toEqual({ of: 2, within: 1, off: expect.closeTo(22.5, 6) })
  })

  it('leaves the note count alone: a soft note played in time is in time', () => {
    const attempt = grade(note, [strike(60, 0, 0, { velocity: 20, expressive: true })], { timing })
    expect(attempt.tally.correct).toBe(1)
    expect(attempt.dynamics?.within).toBe(0)
  })
})

describe('judging a strike as it lands', () => {
  const owed = [expected(60, 0), expected(64, QUARTER)]

  it('answers the note at its own pitch, and says that note is settled', () => {
    const verdict = judge(owed, strike(60, 0), { timing })
    expect(verdict.outcome).toBe('correct')
    expect(verdict.note?.pitch).toBe(60)
    expect(verdict.settles).toBe(true)
  })

  it('marks a fluff against the note it was aimed at without spending it', () => {
    const verdict = judge(owed, strike(61, 0), { timing })
    expect(verdict.outcome).toBe('wrong')
    expect(verdict.note?.pitch).toBe(60)
    expect(verdict.settles).toBe(false)
  })

  it('calls a strike with nothing owed near it an extra', () => {
    const verdict = judge(owed, strike(61, 4 * BAR), { timing })
    expect(verdict.outcome).toBe('extra')
    expect(verdict.note).toBeNull()
  })

  it('leaves a note that has already been answered alone', () => {
    const claimed = new Set([noteKey(0, 60)])
    expect(judge(owed, strike(60, 0), { timing, claimed }).outcome).toBe('extra')
  })

  it('is the window the report will use, and moves with the setting', () => {
    expect(judge(owed, strike(60, 0, 0.1), { timing }).outcome).toBe('correct')
    expect(judge(owed, strike(60, 0, 0.1), { timing, strictness: 'strict' }).outcome).toBe('late')
  })

  it('agrees with the report on a pass played one note at a time', () => {
    const played = [strike(60, 0), strike(64, QUARTER)]
    const claimed = new Set<string>()
    const live = played.map((one) => {
      const verdict = judge(owed, one, { timing, claimed })
      if (verdict.settles && verdict.note !== null) {
        claimed.add(noteKey(verdict.note.tick, verdict.note.pitch))
      }
      return verdict.outcome
    })
    expect(live).toEqual(grade(owed, played, { timing }).judged.map((one) => one.outcome))
  })
})

describe('what a note on the roll shows', () => {
  const owedNote = { start: 0, pitch: 60 }
  const view = (position: number) => ({ timing, position, tempoScale: 1 })
  const feedback = (over: Partial<Feedback>): Feedback => ({ ...NO_FEEDBACK, ...over })

  it('shows the verdict the note was given', () => {
    const judged = feedback({ notes: new Map<string, Outcome>([[noteKey(0, 60), 'late']]) })
    expect(noteLook(judged, owedNote, view(0))).toBe('late')
  })

  it('calls an owed note the music has gone past missed', () => {
    const attempting = feedback({ owed: new Set([noteKey(0, 60)]), attempting: true })
    expect(noteLook(attempting, owedNote, view(0))).toBeNull()
    expect(noteLook(attempting, owedNote, view(BAR))).toBe('missed')
  })

  it('calls nothing missed while a piece is only being listened to', () => {
    const listening = feedback({ owed: new Set([noteKey(0, 60)]) })
    expect(noteLook(listening, owedNote, view(BAR))).toBeNull()
  })

  it('says nothing at all about a note the player does not owe', () => {
    expect(noteLook(feedback({ attempting: true }), owedNote, view(BAR))).toBeNull()
  })
})

describe('the notes a stretch owes', () => {
  const notes = [
    { pitch: 60, start: 0, duration: 240, velocity: 80 },
    { pitch: 62, start: BAR, duration: 240, velocity: 90 },
    { pitch: 64, start: 4 * BAR, duration: 240, velocity: 70 },
  ]

  it('is what falls inside it, both ends included', () => {
    expect(expectedFrom(notes, 0, BAR).map((one) => one.pitch)).toEqual([60, 62])
    expect(expectedFrom(notes, BAR, 4 * BAR).map((one) => one.pitch)).toEqual([62, 64])
    expect(expectedFrom(notes, BAR + 1, 2 * BAR)).toEqual([])
  })

  it('carries the written velocity, which is what the touch is graded against', () => {
    expect(expectedFrom(notes, 0, BAR)[1]?.velocity).toBe(90)
  })
})
