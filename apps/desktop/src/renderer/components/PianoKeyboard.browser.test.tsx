import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { keyRect } from '../lib/keyboard-geometry'
import { PianoKeyboard, type KeyState } from './PianoKeyboard'

/**
 * The keyboard as a browser lays it out.
 *
 * The roll draws a falling note at keyRect's position, so a note lands on its
 * key exactly when every key on screen sits where keyRect says. That is a
 * claim about measured boxes, which only a real layout can answer.
 */

const WIDTH = 1040

async function laidOut(states?: ReadonlyMap<number, KeyState>) {
  const { container } = render(
    <div style={{ width: WIDTH }}>
      <PianoKeyboard states={states} />
    </div>,
  )
  // The keyboard measures itself after its first render.
  await new Promise((resolve) => requestAnimationFrame(resolve))
  await new Promise((resolve) => requestAnimationFrame(resolve))
  const board = container.querySelector('[role="img"]')
  if (board === null) {
    throw new Error('no keyboard')
  }
  const origin = board.getBoundingClientRect().left
  const key = (pitch: number) => {
    const element = board.querySelector(`[data-pitch="${String(pitch)}"]`)
    if (element === null) {
      throw new Error(`no key ${String(pitch)}`)
    }
    return element as HTMLElement
  }
  return { board, origin, key }
}

describe('PianoKeyboard, laid out', () => {
  it('puts every one of the 88 keys where keyRect says, to within half a pixel', async () => {
    const { origin, key } = await laidOut()
    for (let pitch = 21; pitch <= 108; pitch += 1) {
      const expected = keyRect(pitch, WIDTH)
      const box = key(pitch).getBoundingClientRect()
      expect(
        Math.abs(box.left - origin - (expected?.x ?? NaN)),
        `key ${String(pitch)}`,
      ).toBeLessThan(0.5)
      expect(Math.abs(box.width - (expected?.width ?? NaN)), `key ${String(pitch)}`).toBeLessThan(
        0.5,
      )
    }
  })

  it('draws black keys shorter than white ones, and over them', async () => {
    const { key } = await laidOut()
    const white = key(60).getBoundingClientRect()
    const black = key(61).getBoundingClientRect()
    expect(black.height / white.height).toBeCloseTo(0.64, 2)
    expect(Number(getComputedStyle(key(61)).zIndex)).toBeGreaterThan(0)
  })

  it('colours a key by the state it is given, from the theme', async () => {
    const { key } = await laidOut(
      new Map<number, KeyState>([
        [60, 'sounding'],
        [62, 'correct'],
        [64, 'wrong'],
      ]),
    )
    const colour = (pitch: number) => getComputedStyle(key(pitch)).backgroundColor
    const idle = colour(65)
    expect(colour(60)).not.toBe(idle)
    expect(colour(62)).not.toBe(idle)
    expect(colour(64)).not.toBe(colour(62))
    expect(key(60).dataset['state']).toBe('sounding')
  })
})
