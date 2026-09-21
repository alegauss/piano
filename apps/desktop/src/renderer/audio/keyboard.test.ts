import { describe, expect, it } from 'vitest'

import { damperAmount, Keyboard, SOFT_PEDAL_SCALE, type Voice } from './keyboard'

type Played = {
  readonly pitch: number
  readonly velocity: number
  readonly at: number
  released: number | null
  stopped: boolean
  /** Every time the damper moved, as [when, how hard]. */
  damped: [number, number][]
}

/** A keyboard whose voices only write down what happened to them. */
function keyboard(undamped: (pitch: number) => boolean = () => false) {
  const played: Played[] = []
  const keys = new Keyboard((pitch, velocity, at): Voice => {
    const note: Played = { pitch, velocity, at, released: null, stopped: false, damped: [] }
    played.push(note)
    return {
      ...(undamped(pitch) ? { undamped: true } : {}),
      release: (when) => {
        note.released = when
      },
      damp: (when, amount) => {
        note.damped.push([when, amount])
      },
      stop: () => {
        note.stopped = true
      },
    }
  })
  return { keys, played }
}

describe('Keyboard', () => {
  it('releases a note when its key comes up', () => {
    const { keys, played } = keyboard()
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 1)
    expect(played).toEqual([
      { pitch: 60, velocity: 90, at: 0, released: 1, stopped: false, damped: [] },
    ])
    expect(keys.soundingCount).toBe(0)
  })

  it('keeps a released key sounding while the sustain pedal is down, and lets go when it lifts', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 127, 0)
    keys.noteOn(60, 90, 0.5)
    keys.noteOff(60, 1)
    expect(played[0]?.released).toBeNull()
    keys.pedal('sustain', 0, 3)
    expect(played[0]?.released).toBe(3)
  })

  it('does not hold a key still down when the sustain pedal lifts', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 127, 0)
    keys.noteOn(60, 90, 0)
    keys.pedal('sustain', 0, 1)
    expect(played[0]?.released).toBeNull()
    keys.noteOff(60, 2)
    expect(played[0]?.released).toBe(2)
  })

  it('treats the pedal near the top as down and near the bottom as up', () => {
    expect(damperAmount(127)).toBe(0)
    expect(damperAmount(96)).toBe(0)
    expect(damperAmount(32)).toBe(1)
    expect(damperAmount(0)).toBe(1)
    expect(damperAmount(64)).toBeCloseTo(0.5, 9)
  })

  it('thins a released note at half pedal rather than holding it or cutting it', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 64, 0)
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 1)
    expect(played[0]?.released).toBeNull()
    expect(played[0]?.damped).toEqual([[1, 0.5]])
  })

  it('lets the damper down as the pedal rises and lifts it as the pedal goes back down', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 127, 0)
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 1)
    keys.pedal('sustain', 64, 2)
    keys.pedal('sustain', 127, 3)
    keys.pedal('sustain', 0, 4)
    expect(played[0]?.damped).toEqual([
      [2, 0.5],
      [3, 0],
    ])
    expect(played[0]?.released).toBe(4)
  })

  it('leaves a string with no damper ringing when its key comes up, pedal or not', () => {
    const { keys, played } = keyboard((pitch) => pitch >= 89)
    keys.noteOn(100, 90, 0)
    keys.noteOff(100, 1)
    keys.pedal('sustain', 127, 2)
    keys.pedal('sustain', 0, 3)
    expect(played[0]?.released).toBeNull()
    expect(played[0]?.damped).toEqual([])
    // Struck again, the old sound still gives way to the new one.
    keys.noteOn(100, 90, 4)
    expect(played[0]?.released).toBe(4)
  })

  it('releases exactly what the pedal was holding when it comes up, and nothing else', () => {
    const { keys, played } = keyboard((pitch) => pitch >= 89)
    keys.noteOn(48, 80, 0) // still held by the hand
    keys.noteOn(52, 80, 0) // caught by the sostenuto below
    keys.pedal('sostenuto', 127, 0.1)
    keys.pedal('sustain', 127, 0.2)
    keys.noteOn(55, 80, 0.3) // let go under the pedal: the one it holds
    keys.noteOn(100, 80, 0.3) // a string with no damper
    keys.noteOff(52, 0.5)
    keys.noteOff(55, 0.5)
    keys.noteOff(100, 0.5)
    keys.pedal('sustain', 0, 1)

    expect(played.map((note) => [note.pitch, note.released])).toEqual([
      [48, null],
      [52, null],
      [55, 1],
      [100, null],
    ])
  })

  it('tells the voice every time its key comes up, whatever the pedal does to the string', () => {
    const risen: number[] = []
    const keys = new Keyboard(() => ({
      release: () => {},
      damp: () => {},
      stop: () => {},
      keyUp: (at) => risen.push(at),
    }))
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 1)
    keys.pedal('sustain', 127, 1.5)
    keys.noteOn(62, 90, 2)
    keys.noteOff(62, 3)
    expect(risen).toEqual([1, 3])
  })

  it('holds with the sostenuto only what was down when it was pressed', () => {
    const { keys, played } = keyboard()
    keys.noteOn(48, 80, 0)
    keys.pedal('sostenuto', 127, 0.1)
    keys.noteOn(72, 80, 0.2)
    keys.noteOff(48, 0.5)
    keys.noteOff(72, 0.5)
    expect(played.map((note) => note.released)).toEqual([null, 0.5])
    keys.pedal('sostenuto', 0, 2)
    expect(played[0]?.released).toBe(2)
  })

  it('softens a note struck while the soft pedal is down, and only then', () => {
    const { keys, played } = keyboard()
    keys.pedal('softUnaCorda', 127, 0)
    keys.noteOn(60, 100, 0)
    keys.pedal('softUnaCorda', 0, 1)
    keys.noteOn(62, 100, 1)
    expect(played.map((note) => note.velocity)).toEqual([Math.round(100 * SOFT_PEDAL_SCALE), 100])
  })

  it('damps a string when its key is struck again', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 127, 0)
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 0.5)
    keys.noteOn(60, 90, 1)
    expect(played.map((note) => note.released)).toEqual([1, null])
  })

  it('pairs each release with its own strike when one key overlaps itself', () => {
    // Two voices of one part on one key, which the format allows: the first
    // release belongs to the first strike and must not end the second note.
    const { keys, played } = keyboard()
    keys.noteOn(72, 90, 0)
    keys.noteOn(72, 70, 0.5)
    keys.noteOff(72, 1)
    expect(played[1]?.released).toBeNull()
    keys.noteOff(72, 1.5)
    expect(played[1]?.released).toBe(1.5)
  })

  it('stops everything at once and puts the pedals up', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 127, 0)
    keys.noteOn(60, 90, 0)
    keys.noteOn(64, 90, 0)
    keys.stopAll()
    expect(played.every((note) => note.stopped)).toBe(true)
    keys.noteOn(67, 90, 1)
    keys.noteOff(67, 2)
    expect(played[2]?.released).toBe(2)
  })

  it('releases everything, pedalled or held, when told to let go', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 127, 0)
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 0.5)
    keys.noteOn(64, 90, 0.5)
    keys.releaseAll(2)
    expect(played.map((note) => note.released)).toEqual([2, 2])
    expect(keys.soundingCount).toBe(0)
  })

  it('carries on when the engine has nothing to play a pitch with', () => {
    const keys = new Keyboard(() => null)
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 1)
    expect(keys.soundingCount).toBe(0)
  })
})
