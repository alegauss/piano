import { describe, expect, it } from 'vitest'

import { StrikeField } from './strikes'

/** A field the size of a window, so a burst has somewhere to go. */
const WIDTH = 1040
const HEIGHT = 600

function strike(pitch: number, at: number, velocity = 100) {
  return { kind: 'strike', pitch, velocity, at } as const
}

describe('StrikeField', () => {
  it('fires a strike when the clock reaches it, not when it is handed over', () => {
    const field = new StrikeField()
    field.take(strike(60, 10))
    field.update(9.9, WIDTH, HEIGHT)
    expect(field.fireCount).toBe(0)
    expect(field.alive).toBe(0)

    field.update(10, WIDTH, HEIGHT)
    expect(field.fireCount).toBe(1)
    expect(field.alive).toBeGreaterThan(0)
  })

  it('throws more at a loud note than a soft one', () => {
    const soft = new StrikeField()
    soft.take(strike(60, 0, 20))
    soft.update(0, WIDTH, HEIGHT)
    const loud = new StrikeField()
    loud.take(strike(60, 0, 127))
    loud.update(0, WIDTH, HEIGHT)
    expect(loud.alive).toBeGreaterThan(soft.alive)
  })

  it('lets a burst die, so a piece does not end under a cloud', () => {
    const field = new StrikeField()
    field.take(strike(60, 0))
    field.update(0, WIDTH, HEIGHT)
    expect(field.alive).toBeGreaterThan(0)
    field.update(1, WIDTH, HEIGHT)
    expect(field.alive).toBe(0)
  })

  it('flashes the key it struck, and fades', () => {
    const field = new StrikeField()
    field.take(strike(64, 0))
    field.update(0, WIDTH, HEIGHT)
    expect(field.flashes(0).get(64)).toBeCloseTo(1, 2)
    expect(field.flashes(0.09).get(64) ?? 0).toBeCloseTo(0.5, 1)
    field.update(0.5, WIDTH, HEIGHT)
    expect(field.flashes(0.5).size).toBe(0)
  })

  it('never grows: a pool of ten holds ten however hard the piece is played', () => {
    const field = new StrikeField(10)
    for (let pitch = 40; pitch < 80; pitch += 1) {
      field.take(strike(pitch, 0))
    }
    field.update(0, WIDTH, HEIGHT)
    expect(field.fireCount).toBe(40)
    expect(field.alive).toBe(10)
  })

  it('drops what was scheduled but will not sound, on a stop or a seek', () => {
    const field = new StrikeField()
    field.take(strike(60, 5))
    field.take({ kind: 'silence' })
    field.update(10, WIDTH, HEIGHT)
    expect(field.fireCount).toBe(0)
    expect(field.alive).toBe(0)
  })

  it('ignores a strike off the keyboard rather than throwing particles nowhere', () => {
    const field = new StrikeField()
    field.take(strike(12, 0))
    field.update(0, WIDTH, HEIGHT)
    expect(field.fireCount).toBe(0)
  })

  it('scatters the same way twice, so what is seen can be tested', () => {
    const once = new StrikeField()
    once.take(strike(60, 0))
    once.update(0, WIDTH, HEIGHT)
    const again = new StrikeField()
    again.take(strike(60, 0))
    again.update(0, WIDTH, HEIGHT)
    expect(once.alive).toBe(again.alive)
  })
})
