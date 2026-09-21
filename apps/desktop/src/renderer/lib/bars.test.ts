import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { barRange, barsBetween, barTicksAt, gridLines } from './bars'

const common = resolveTiming(undefined)
const QUARTER = common.ticksPerQuarter
const BAR = 4 * QUARTER

describe('the grid in common time', () => {
  it('draws a line on every beat and calls one in four a bar line', () => {
    const lines = gridLines(common, 0, 2 * BAR)
    expect(lines.map((line) => line.tick)).toEqual([
      0,
      QUARTER,
      2 * QUARTER,
      3 * QUARTER,
      BAR,
      BAR + QUARTER,
      BAR + 2 * QUARTER,
      BAR + 3 * QUARTER,
      2 * BAR,
    ])
    expect(lines.filter((line) => line.downbeat).map((line) => line.tick)).toEqual([
      0,
      BAR,
      2 * BAR,
    ])
  })

  it('numbers the bars the way a reader counts them, from one', () => {
    const downbeats = gridLines(common, 0, 3 * BAR).filter((line) => line.downbeat)
    expect(downbeats.map((line) => line.bar)).toEqual([1, 2, 3, 4])
  })

  it('knows where a bar starts and ends', () => {
    expect(barRange(common, BAR + QUARTER)).toEqual({ bar: 2, start: BAR, end: 2 * BAR })
    expect(barTicksAt(common, 0)).toBe(BAR)
  })
})

describe('a piece that changes meter', () => {
  // Two bars of 4/4, then 3/4.
  const changing = resolveTiming({
    ticksPerQuarter: 480,
    timeSignatures: [
      { tick: 0, numerator: 4, denominator: 4 },
      { tick: 2 * 1920, numerator: 3, denominator: 4 },
    ],
  })

  it('puts the bar lines where the score says, not where a fixed division would', () => {
    const downbeats = gridLines(changing, 0, 2 * 1920 + 3 * 480 * 2).filter((line) => line.downbeat)
    expect(downbeats.map((line) => line.tick)).toEqual([0, 1920, 3840, 3840 + 1440, 3840 + 2880])
  })

  it('numbers straight through the change', () => {
    const downbeats = gridLines(changing, 0, 3840 + 1440).filter((line) => line.downbeat)
    expect(downbeats.map((line) => line.bar)).toEqual([1, 2, 3, 4])
  })

  it('counts a shorter bar after the change', () => {
    expect(barTicksAt(changing, 4000)).toBe(3 * 480)
    expect(barRange(changing, 4000)).toEqual({ bar: 3, start: 3840, end: 3840 + 1440 })
  })
})

describe('a pickup', () => {
  const pickup = resolveTiming({ ticksPerQuarter: 480, pickupTicks: 480 })

  it('is bar zero, and the first full bar is bar one', () => {
    expect(barRange(pickup, 0).bar).toBe(0)
    expect(barRange(pickup, 480).bar).toBe(1)
    const downbeats = gridLines(pickup, 0, 480 + 1920).filter((line) => line.downbeat)
    expect(downbeats.map((line) => line.bar)).toEqual([1, 2])
  })
})

describe('choosing a loop by dragging', () => {
  it('rounds out to whole bars, whichever way the drag went', () => {
    const forwards = barsBetween(common, BAR + QUARTER, 3 * BAR + QUARTER)
    expect(forwards).toEqual({ start: BAR, end: 4 * BAR })
    expect(barsBetween(common, 3 * BAR + QUARTER, BAR + QUARTER)).toEqual(forwards)
  })

  it('gives a whole bar for a drag inside one', () => {
    expect(barsBetween(common, BAR + 10, BAR + 20)).toEqual({ start: BAR, end: 2 * BAR })
  })
})
