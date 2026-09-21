import { describe, expect, it } from 'vitest'

import { contrastRatio, luminance } from './contrast'

describe('the contrast maths', () => {
  it('puts black and white at the ends of the scale', () => {
    expect(luminance([0, 0, 0])).toBe(0)
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 6)
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 2)
  })

  it('says a colour has no contrast with itself', () => {
    expect(contrastRatio([120, 40, 200], [120, 40, 200])).toBe(1)
  })

  it('does not care which way round it is asked', () => {
    expect(contrastRatio([20, 30, 40], [200, 210, 220])).toBeCloseTo(
      contrastRatio([200, 210, 220], [20, 30, 40]),
      9,
    )
  })

  it('weights green as the eye does', () => {
    expect(luminance([0, 255, 0])).toBeGreaterThan(luminance([255, 0, 0]))
    expect(luminance([255, 0, 0])).toBeGreaterThan(luminance([0, 0, 255]))
  })

  it('agrees with a known pair: mid grey on white is about 4.6', () => {
    expect(contrastRatio([117, 117, 117], [255, 255, 255])).toBeCloseTo(4.6, 1)
  })
})
