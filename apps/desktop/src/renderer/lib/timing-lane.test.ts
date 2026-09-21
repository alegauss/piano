import { describe, expect, it } from 'vitest'

import type { TimingMark } from './grading'
import { keyRect } from './keyboard-geometry'
import { dashY, LANE_SECONDS, laneDashes, laneOf } from './timing-lane'

/**
 * Where each strike's dash lands in the lane above the strike line: which
 * side of the middle, how far, and for how long.
 */

const WIDTH = 1200
const WINDOW = 0.12
const lane = laneOf(600)

const mark = (offset: number, at = 10, pitch = 60): TimingMark => ({
  pitch,
  offset,
  at,
  outcome: Math.abs(offset) <= WINDOW ? 'correct' : offset < 0 ? 'early' : 'late',
})

describe('the timing lane', () => {
  it('sits just above the strike line, and takes little of a short field', () => {
    expect(lane.top + lane.height).toBe(600)
    expect(lane.height).toBeLessThanOrEqual(28)
    expect(laneOf(100).height).toBeCloseTo(15, 6)
  })

  it('puts an early strike above the middle and a late one below, as far as the error', () => {
    const early = dashY(lane, -0.06, WINDOW)
    const late = dashY(lane, 0.06, WINDOW)
    expect(early).toBeLessThan(lane.middle)
    expect(late).toBeGreaterThan(lane.middle)
    expect(lane.middle - early).toBeCloseTo(late - lane.middle, 6)
    // The window's edge is a quarter of the lane from the middle.
    expect(dashY(lane, WINDOW, WINDOW) - lane.middle).toBeCloseTo(lane.height / 4, 6)
    expect(dashY(lane, 0, WINDOW)).toBe(lane.middle)
  })

  it('keeps a wild strike inside the lane rather than off it', () => {
    expect(dashY(lane, 5, WINDOW)).toBeLessThan(lane.top + lane.height)
    expect(dashY(lane, -5, WINDOW)).toBeGreaterThan(lane.top)
  })

  it('draws each dash over the key that was struck, in the colour of its verdict', () => {
    const [dash] = laneDashes([mark(-0.2, 10, 64)], 10, WINDOW, WIDTH, lane)
    const key = keyRect(64, WIDTH)
    expect(dash).toMatchObject({ x: key?.x, width: key?.width, colour: '--judge-late', alpha: 1 })
    expect(laneDashes([mark(0.01)], 10, WINDOW, WIDTH, lane)[0]?.colour).toBe('--judge-correct')
  })

  it('fades a dash over a few seconds, then lets it go', () => {
    const marks = [mark(0, 10)]
    expect(laneDashes(marks, 10 + LANE_SECONDS / 2, WINDOW, WIDTH, lane)[0]?.alpha).toBeCloseTo(
      0.5,
      6,
    )
    expect(laneDashes(marks, 10 + LANE_SECONDS + 0.01, WINDOW, WIDTH, lane)).toEqual([])
  })

  it('shows a passage struck a little early as a row on one side', () => {
    const passage = [60, 62, 64, 65, 67].map((pitch, index) =>
      mark(-0.03, 10 + index * 0.25, pitch),
    )
    const dashes = laneDashes(passage, 11.5, WINDOW, WIDTH, lane)
    expect(dashes).toHaveLength(5)
    expect(dashes.every((dash) => dash.y < lane.middle)).toBe(true)
  })
})
