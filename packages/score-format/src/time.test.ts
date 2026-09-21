import { describe, expect, it } from 'vitest'

import {
  barAtTick,
  barRangeToTicks,
  DEFAULT_MICROSECONDS_PER_QUARTER,
  DEFAULT_TICKS_PER_QUARTER,
  resolveTiming,
  secondsToTicks,
  tickAtBar,
  ticksPerBar,
  ticksToSeconds,
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
