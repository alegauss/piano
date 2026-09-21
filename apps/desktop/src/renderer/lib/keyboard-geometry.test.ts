import { describe, expect, it } from 'vitest'

import { isBlackKey, keyboardLayout, keyRect, WHITE_KEY_COUNT } from './keyboard-geometry'

const WIDTH = 1040
const WHITE = WIDTH / WHITE_KEY_COUNT

function rect(pitch: number) {
  const found = keyRect(pitch, WIDTH)
  if (found === null) {
    throw new Error(`no key for ${String(pitch)}`)
  }
  return found
}

describe('keyboardLayout', () => {
  it('lays out 88 keys, 52 white and 36 black', () => {
    const keys = keyboardLayout(WIDTH)
    expect(keys).toHaveLength(88)
    expect(keys.filter((key) => !key.black)).toHaveLength(52)
    expect(keys.filter((key) => key.black)).toHaveLength(36)
  })

  it('runs from A0 at the left edge to C8 at the right, white keys equal and touching', () => {
    const whites = keyboardLayout(WIDTH).filter((key) => !key.black)
    expect(whites[0]?.pitch).toBe(21)
    expect(whites[0]?.x).toBe(0)
    whites.forEach((key, index) => {
      expect(key.width).toBeCloseTo(WHITE, 9)
      expect(key.x).toBeCloseTo(index * WHITE, 9)
    })
    const last = rect(108)
    expect(last.x + last.width).toBeCloseTo(WIDTH, 9)
  })

  it('lists white keys before black ones, so black keys are drawn on top', () => {
    const keys = keyboardLayout(WIDTH)
    const firstBlack = keys.findIndex((key) => key.black)
    expect(keys.slice(firstBlack).every((key) => key.black)).toBe(true)
  })
})

describe('black key geometry', () => {
  it('divides the back of C to E into fives and F to B into sevens, as a real keyboard does', () => {
    const c = rect(60).x
    expect(rect(61).x - c).toBeCloseTo((3 / 5) * WHITE, 9)
    expect(rect(63).x - c).toBeCloseTo((9 / 5) * WHITE, 9)
    expect(rect(61).width).toBeCloseTo((3 / 5) * WHITE, 9)

    const f = rect(65).x
    expect(rect(66).x - f).toBeCloseTo((4 / 7) * WHITE, 9)
    expect(rect(68).x - f).toBeCloseTo((12 / 7) * WHITE, 9)
    expect(rect(70).x - f).toBeCloseTo((20 / 7) * WHITE, 9)
    expect(rect(66).width).toBeCloseTo((4 / 7) * WHITE, 9)
  })

  it('spaces C sharp and D sharp differently from F sharp, G sharp and A sharp', () => {
    const centre = (pitch: number) => rect(pitch).x + rect(pitch).width / 2
    const lowGroup = centre(63) - centre(61)
    const highGroup = centre(68) - centre(66)
    expect(lowGroup).toBeCloseTo((6 / 5) * WHITE, 9)
    expect(highGroup).toBeCloseTo((8 / 7) * WHITE, 9)
    expect(lowGroup).not.toBeCloseTo(highGroup, 2)
  })

  it('never lets two black keys touch, and keeps each over the white keys beside it', () => {
    const blacks = keyboardLayout(WIDTH).filter((key) => key.black)
    for (let index = 1; index < blacks.length; index += 1) {
      const previous = blacks[index - 1]
      const current = blacks[index]
      if (previous !== undefined && current !== undefined) {
        expect(current.x).toBeGreaterThan(previous.x + previous.width)
      }
    }
    for (const black of blacks) {
      const below = rect(black.pitch - 1)
      const above = rect(black.pitch + 1)
      expect(black.x).toBeGreaterThan(below.x)
      expect(black.x + black.width).toBeLessThan(above.x + above.width)
    }
  })

  it('scales with the space it is given', () => {
    expect(keyRect(61, WIDTH * 2)?.x).toBeCloseTo(rect(61).x * 2, 9)
  })

  it('knows which keys are black and has no key outside the 88', () => {
    expect([60, 61, 62, 63, 64, 65, 66].map(isBlackKey)).toEqual([
      false,
      true,
      false,
      true,
      false,
      false,
      true,
    ])
    expect(keyRect(20, WIDTH)).toBeNull()
    expect(keyRect(109, WIDTH)).toBeNull()
  })
})
