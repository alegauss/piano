import { describe, expect, it } from 'vitest'

import { noteEnd, type Note } from './note'
import {
  barAtTick,
  barFigures,
  barRangeToTicks,
  beatTicks,
  DEFAULT_MICROSECONDS_PER_QUARTER,
  DEFAULT_TICKS_PER_QUARTER,
  figureTicks,
  resolveTiming,
  secondsToTicks,
  tickAtBar,
  ticksPerBar,
  ticksToFigure,
  ticksToSeconds,
  type BarFigure,
  type Timing,
} from './time'

const PPQ = DEFAULT_TICKS_PER_QUARTER
const BAR_4_4 = PPQ * 4

/** 120 bpm: one quarter is half a second, one 4/4 bar is two seconds. */
const plain = resolveTiming(undefined)

describe('resolveTiming', () => {
  it('gives a score with no timing the defaults everyone assumes', () => {
    expect(plain.ticksPerQuarter).toBe(480)
    expect(plain.tempo).toEqual([{ tick: 0, microsecondsPerQuarter: 500_000 }])
    expect(plain.timeSignatures).toEqual([{ tick: 0, numerator: 4, denominator: 4 }])
    expect(plain.pickupTicks).toBe(0)
  })

  it('sorts events the file listed out of order', () => {
    const timing: Timing = {
      tempo: [
        { tick: 1920, microsecondsPerQuarter: 250_000 },
        { tick: 0, microsecondsPerQuarter: 500_000 },
      ],
    }
    expect(resolveTiming(timing).tempo.map((event) => event.tick)).toEqual([0, 1920])
  })
})

describe('ticksToSeconds', () => {
  it('turns a quarter into half a second at 120 bpm', () => {
    expect(ticksToSeconds(plain, PPQ)).toBeCloseTo(0.5, 9)
    expect(ticksToSeconds(plain, BAR_4_4)).toBeCloseTo(2, 9)
  })

  it('starts at zero', () => {
    expect(ticksToSeconds(plain, 0)).toBe(0)
  })

  it('applies a mid-piece tempo change from exactly the right tick', () => {
    // Bar 9 in 4/4 starts at tick 8 * 1920 = 15360, where the tempo doubles.
    const changeAt = 8 * BAR_4_4
    const timing = resolveTiming({
      tempo: [
        { tick: 0, microsecondsPerQuarter: DEFAULT_MICROSECONDS_PER_QUARTER },
        { tick: changeAt, microsecondsPerQuarter: DEFAULT_MICROSECONDS_PER_QUARTER / 2 },
      ],
    })

    // Eight bars at two seconds each, unaffected by what comes after.
    expect(ticksToSeconds(timing, changeAt)).toBeCloseTo(16, 9)
    // The ninth bar takes half as long, and not a millisecond of the change
    // leaks backwards into the eighth.
    expect(ticksToSeconds(timing, changeAt + BAR_4_4)).toBeCloseTo(17, 9)
    expect(ticksToSeconds(timing, changeAt - 1)).toBeLessThan(16)
  })

  it('does not accumulate error across a long piece', () => {
    // Three hundred bars: if each conversion drifted, this is where it shows.
    const atEnd = ticksToSeconds(plain, BAR_4_4 * 300)
    expect(atEnd).toBeCloseTo(600, 9)
  })
})

describe('secondsToTicks', () => {
  it('is the inverse of ticksToSeconds, including across a tempo change', () => {
    const timing = resolveTiming({
      tempo: [
        { tick: 0, microsecondsPerQuarter: 500_000 },
        { tick: 4 * BAR_4_4, microsecondsPerQuarter: 250_000 },
      ],
    })

    for (const tick of [0, 100, BAR_4_4, 4 * BAR_4_4, 4 * BAR_4_4 + 37, 20 * BAR_4_4]) {
      expect(secondsToTicks(timing, ticksToSeconds(timing, tick))).toBeCloseTo(tick, 6)
    }
  })
})

describe('bars', () => {
  it('counts the first full bar as bar 1', () => {
    expect(barAtTick(plain, 0)).toEqual({ bar: 1, tickInBar: 0 })
    expect(barAtTick(plain, BAR_4_4)).toEqual({ bar: 2, tickInBar: 0 })
    expect(barAtTick(plain, BAR_4_4 + 240)).toEqual({ bar: 2, tickInBar: 240 })
  })

  it('calls the pickup bar 0 and starts counting after it', () => {
    // A single quarter-note pickup.
    const timing = resolveTiming({ pickupTicks: PPQ })
    expect(barAtTick(timing, 0)).toEqual({ bar: 0, tickInBar: 0 })
    expect(barAtTick(timing, PPQ - 1)).toEqual({ bar: 0, tickInBar: PPQ - 1 })
    expect(barAtTick(timing, PPQ)).toEqual({ bar: 1, tickInBar: 0 })
    expect(tickAtBar(timing, 1)).toBe(PPQ)
  })

  it('numbers bars continuously across a meter change', () => {
    // Four bars of 4/4, then 3/4 from tick 7680.
    const changeAt = 4 * BAR_4_4
    const timing = resolveTiming({
      timeSignatures: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: changeAt, numerator: 3, denominator: 4 },
      ],
    })

    expect(ticksPerBar({ numerator: 3, denominator: 4 }, PPQ)).toBe(PPQ * 3)
    expect(barAtTick(timing, changeAt)).toEqual({ bar: 5, tickInBar: 0 })
    expect(barAtTick(timing, changeAt + PPQ * 3)).toEqual({ bar: 6, tickInBar: 0 })
    expect(tickAtBar(timing, 5)).toBe(changeAt)
    expect(tickAtBar(timing, 6)).toBe(changeAt + PPQ * 3)
  })

  it('handles an odd meter, where assuming four beats would be wrong', () => {
    const timing = resolveTiming({ timeSignatures: [{ tick: 0, numerator: 7, denominator: 8 }] })
    const bar = ticksPerBar({ numerator: 7, denominator: 8 }, PPQ)
    expect(bar).toBe(PPQ * 3.5)
    expect(barAtTick(timing, bar)).toEqual({ bar: 2, tickInBar: 0 })
  })

  it('resolves a bar range the way somebody counting on the roll would', () => {
    // Bars 12 to 20 inclusive: starts at the top of 12, ends at the top of 21.
    expect(barRangeToTicks(plain, 12, 20)).toEqual({
      start: 11 * BAR_4_4,
      end: 20 * BAR_4_4,
    })
  })

  it('reads a reversed range as the same range', () => {
    expect(barRangeToTicks(plain, 20, 12)).toEqual(barRangeToTicks(plain, 12, 20))
  })
})

const WHOLE = { denominator: 1, dots: 0 }
const HALF = { denominator: 2, dots: 0 }
const QUARTER = { denominator: 4, dots: 0 }
const EIGHTH = { denominator: 8, dots: 0 }
const SIXTEENTH = { denominator: 16, dots: 0 }

describe('ticksToFigure', () => {
  it('spells the plain figures', () => {
    expect(ticksToFigure(PPQ * 4, PPQ)).toEqual({ figure: WHOLE, ticks: 1920, remainder: 0 })
    expect(ticksToFigure(PPQ * 2, PPQ)).toEqual({ figure: HALF, ticks: 960, remainder: 0 })
    expect(ticksToFigure(PPQ, PPQ)).toEqual({ figure: QUARTER, ticks: 480, remainder: 0 })
    expect(ticksToFigure(PPQ / 2, PPQ)).toEqual({ figure: EIGHTH, ticks: 240, remainder: 0 })
    expect(ticksToFigure(PPQ / 4, PPQ)).toEqual({ figure: SIXTEENTH, ticks: 120, remainder: 0 })
  })

  it('reads the figure off the grid it is given, not off 480', () => {
    expect(ticksToFigure(240, 240).figure).toEqual(QUARTER)
    expect(ticksToFigure(240, 480).figure).toEqual(EIGHTH)
  })

  it('writes a dot rather than tying two figures together', () => {
    expect(ticksToFigure(720, PPQ)).toEqual({
      figure: { denominator: 4, dots: 1 },
      ticks: 720,
      remainder: 0,
    })
    expect(ticksToFigure(840, PPQ).figure).toEqual({ denominator: 4, dots: 2 })
    expect(ticksToFigure(1440, PPQ).figure).toEqual({ denominator: 2, dots: 1 })
  })

  it('measures a dot as half of everything before it', () => {
    expect(figureTicks(QUARTER, PPQ)).toBe(480)
    expect(figureTicks({ denominator: 4, dots: 1 }, PPQ)).toBe(720)
    expect(figureTicks({ denominator: 4, dots: 2 }, PPQ)).toBe(840)
    expect(figureTicks(WHOLE, PPQ)).toBe(1920)
  })

  it('hands back what a triplet leaves over instead of refusing it', () => {
    // Three eighths in the time of two: 160 ticks each, which no figure spells.
    const fit = ticksToFigure(160, PPQ)
    expect(fit.figure).toEqual(SIXTEENTH)
    expect(fit.remainder).toBe(40)
  })

  it('builds a tie chain when called again on the leftover', () => {
    // Five sixteenths: a quarter tied to a sixteenth, which is how it is read.
    const first = ticksToFigure(600, PPQ)
    expect(first.figure).toEqual(QUARTER)
    expect(ticksToFigure(first.remainder, PPQ)).toEqual({
      figure: SIXTEENTH,
      ticks: 120,
      remainder: 0,
    })
  })

  it('spells a duration below the shortest figure as that figure, and says it did', () => {
    const fit = ticksToFigure(10, PPQ)
    expect(fit.figure).toEqual({ denominator: 64, dots: 0 })
    expect(fit.ticks).toBe(30)
    expect(fit.remainder).toBe(-20)
  })
})

const note = (start: number, duration: number, rest: Partial<Note> = {}): Note => ({
  pitch: 60,
  start,
  duration,
  velocity: 80,
  ...rest,
})

/** One figure as a reader would say it: where, how long, and what it is written as. */
const spelled = (figure: BarFigure): string =>
  [
    `${String(figure.start)}+${String(figure.ticks)}`,
    `${String(figure.figure.denominator)}${'.'.repeat(figure.figure.dots)}`,
    figure.notes.length === 0 ? 'rest' : `${String(figure.notes.length)} note(s)`,
  ].join(' ')

describe('barFigures', () => {
  it('fills an empty bar with one rest', () => {
    expect(barFigures(plain, [], 1).map(spelled)).toEqual(['0+1920 1 rest'])
  })

  it('reads a dotted rhythm and rests out the remainder of the bar', () => {
    const notes = [note(0, 720), note(720, 240)]
    expect(barFigures(plain, notes, 1).map(spelled)).toEqual([
      '0+720 4. 1 note(s)',
      '720+240 8 1 note(s)',
      '960+960 2 rest',
    ])
  })

  it('writes the gap after a note as a rest, because a rest here is a gap', () => {
    expect(barFigures(plain, [note(0, PPQ)], 1).map(spelled)).toEqual([
      '0+480 4 1 note(s)',
      '480+1440 2. rest',
    ])
  })

  it('leaves a triplet as three figures that each report their leftover', () => {
    const triplet = [note(0, 160), note(160, 160), note(320, 160)]
    const figures = barFigures(plain, triplet, 1)
    expect(figures.slice(0, 3).map((figure) => figure.ticks)).toEqual([160, 160, 160])
    expect(figures.slice(0, 3).map((figure) => figure.remainder)).toEqual([40, 40, 40])
    expect(figures.map(spelled).at(-1)).toBe('480+1440 2. rest')
  })

  it('clips a note at the barline and shows it again in the next bar', () => {
    // A quarter on beat 4 of bar 1, held a half note long into bar 2.
    const crossing = note(1440, 960)
    expect(barFigures(plain, [crossing], 1).map(spelled)).toEqual([
      '0+1440 2. rest',
      '1440+480 4 1 note(s)',
    ])
    expect(barFigures(plain, [crossing], 2).map(spelled)).toEqual([
      '1920+480 4 1 note(s)',
      '2400+1440 2. rest',
    ])
    // The tie is the note's own arithmetic, which is why no flag carries it.
    const opening = barFigures(plain, [crossing], 2)[0]
    expect(opening?.notes[0]?.start).toBeLessThan(opening?.start ?? 0)
    expect(noteEnd(crossing)).toBeGreaterThan(1920)
  })

  it('reads the pickup as bar 0 and the first full bar after it', () => {
    const timing = resolveTiming({ pickupTicks: PPQ })
    const notes = [note(0, PPQ), note(PPQ, PPQ * 4)]
    expect(barFigures(timing, notes, 0).map(spelled)).toEqual(['0+480 4 1 note(s)'])
    expect(barFigures(timing, notes, 1).map(spelled)).toEqual(['480+1920 1 1 note(s)'])
  })

  it('writes 6/8 as dotted quarters, where the counted beat is an eighth', () => {
    const six = { tick: 0, numerator: 6, denominator: 8 }
    const timing = resolveTiming({ timeSignatures: [six] })
    expect(ticksPerBar(six, PPQ)).toBe(1440)
    expect(beatTicks(six, PPQ)).toBe(240)
    expect(barFigures(timing, [note(0, 720), note(720, 720)], 1).map(spelled)).toEqual([
      '0+720 4. 1 note(s)',
      '720+720 4. 1 note(s)',
    ])
  })

  it('keeps one hand out of the other stave', () => {
    const notes = [note(0, PPQ, { hand: 'left' }), note(0, PPQ / 2, { hand: 'right' })]
    expect(barFigures(plain, notes, 1, 'left').map(spelled)).toEqual([
      '0+480 4 1 note(s)',
      '480+1440 2. rest',
    ])
    // 1680 ticks is a double-dotted half exactly, so the rest takes two dots.
    expect(barFigures(plain, notes, 1, 'right').map(spelled)).toEqual([
      '0+240 8 1 note(s)',
      '240+1680 2.. rest',
    ])
    // Named no hand, both are one line, which is what a score with no hands is.
    expect(barFigures(plain, notes, 1).map(spelled)).toEqual([
      '0+480 4 2 note(s)',
      '480+1440 2. rest',
    ])
  })

  it('leaves a held note with its own figure when the hand strikes again', () => {
    // One stave, one line: the whole note keeps the figure it opened, and a
    // caller drawing a second voice reads the notes themselves.
    const notes = [note(0, PPQ * 4, { hand: 'left' }), note(960, PPQ, { hand: 'left' })]
    expect(barFigures(plain, notes, 1, 'left').map(spelled)).toEqual([
      '0+960 2 1 note(s)',
      '960+480 4 1 note(s)',
      '1440+480 4 rest',
    ])
  })

  it('tiles the bar with no gap and no overlap', () => {
    const notes = [note(0, 160), note(160, 800), note(1200, 240)]
    const figures = barFigures(plain, notes, 1)
    let cursor = 0
    for (const figure of figures) {
      expect(figure.start).toBe(cursor)
      cursor += figure.ticks
    }
    expect(cursor).toBe(BAR_4_4)
  })
})

describe('what the practice mode depends on', () => {
  it('leaves every note on its tick when the tempo is halved', () => {
    // The transport scales tempo rather than editing the score, so the same
    // ticks are the same bars and only the clock changes underneath.
    const written = plain
    const halved = resolveTiming({
      tempo: [{ tick: 0, microsecondsPerQuarter: DEFAULT_MICROSECONDS_PER_QUARTER * 2 }],
    })

    for (const tick of [0, PPQ, BAR_4_4, BAR_4_4 * 17 + 91]) {
      expect(barAtTick(halved, tick)).toEqual(barAtTick(written, tick))
      expect(ticksToSeconds(halved, tick)).toBeCloseTo(ticksToSeconds(written, tick) * 2, 9)
    }
  })
})
