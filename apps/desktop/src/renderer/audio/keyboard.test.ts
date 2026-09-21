import { describe, expect, it } from 'vitest'

import { Keyboard, SOFT_PEDAL_SCALE, type Voice } from './keyboard'

type Played = {
  readonly pitch: number
  readonly velocity: number
  readonly at: number
  released: number | null
  stopped: boolean
}

/** A keyboard whose voices only write down what happened to them. */
function keyboard() {
  const played: Played[] = []
  const keys = new Keyboard((pitch, velocity, at): Voice => {
    const note: Played = { pitch, velocity, at, released: null, stopped: false }
    played.push(note)
    return {
      release: (when) => {
        note.released = when
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
    expect(played).toEqual([{ pitch: 60, velocity: 90, at: 0, released: 1, stopped: false }])
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

  it('treats a sustain value below half as up, until half-pedalling is modelled', () => {
    const { keys, played } = keyboard()
    keys.pedal('sustain', 40, 0)
    keys.noteOn(60, 90, 0)
    keys.noteOff(60, 1)
    expect(played[0]?.released).toBe(1)
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
