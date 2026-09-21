import { resolveTiming, type Timing } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { beatsBetween, meterAt, nextBeat } from './beats'

/** The accented beats, as [tick, accent] pairs, for reading at a glance. */
function beats(timing: Timing, to: number): [number, boolean][] {
  return beatsBetween(resolveTiming(timing), 0, to).map((beat) => [beat.tick, beat.accent])
}

describe('beats', () => {
  it('counts four quarters to a bar of four four, the first accented', () => {
    expect(beats({}, 1920)).toEqual([
      [0, true],
      [480, false],
      [960, false],
      [1440, false],
      [1920, true],
    ])
  })

  it('counts seven eighths in seven eight, accenting every seventh', () => {
    const counted = beats({ timeSignatures: [{ tick: 0, numerator: 7, denominator: 8 }] }, 1680)
    expect(counted.map(([tick]) => tick)).toEqual([0, 240, 480, 720, 960, 1200, 1440, 1680])
    expect(counted.filter(([, accent]) => accent).map(([tick]) => tick)).toEqual([0, 1680])
  })

  it('starts a bar exactly where the meter changes', () => {
    const counted = beats(
      {
        timeSignatures: [
          { tick: 0, numerator: 4, denominator: 4 },
          { tick: 1920, numerator: 3, denominator: 4 },
        ],
      },
      3360,
    )
    expect(counted.filter(([, accent]) => accent).map(([tick]) => tick)).toEqual([0, 1920, 3360])
  })

  it('counts a pickup up into the first downbeat, unaccented', () => {
    // A quarter pickup: one beat at 0, then the downbeat of bar one at 480.
    expect(beats({ pickupTicks: 480 }, 960)).toEqual([
      [0, false],
      [480, true],
      [960, false],
    ])
  })

  it('finds the next beat from anywhere, including the downbeat of the next bar', () => {
    const timing = resolveTiming({ timeSignatures: [{ tick: 0, numerator: 3, denominator: 4 }] })
    expect(nextBeat(timing, 500)).toEqual({ tick: 960, accent: false })
    expect(nextBeat(timing, 961)).toEqual({ tick: 1440, accent: true })
  })

  it('reads the meter in force at a tick', () => {
    const timing = resolveTiming({
      timeSignatures: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 1920, numerator: 6, denominator: 8 },
      ],
    })
    expect(meterAt(timing, 100).numerator).toBe(4)
    expect(meterAt(timing, 1920).numerator).toBe(6)
  })
})
