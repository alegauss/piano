import type { Note } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { FakeTime, Listener } from '../audio/test-doubles'
import { Transport } from '../audio/transport'
import { createWaitMode } from './wait-mode'

/**
 * Wait mode against a real transport on a clock the test moves by hand.
 *
 * The claim that matters is that nothing sounds ahead of the player: the
 * scheduler hands notes over a tenth of a second early, so a wait that only
 * pauses on arrival would leak the next few notes. Every test here watches
 * what the engine was told, not just where the position is.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter

function note(pitch: number, start: number, part?: string, hand?: 'left' | 'right'): Note {
  return { pitch, start, duration: 200, velocity: 80, part, hand }
}

function setup(notes: readonly Note[], filter = {}) {
  const time = new FakeTime()
  const engine = new Listener(time)
  const transport = new Transport(engine, time.clock, time.ticker)
  transport.load({ timing, notes })
  transport.setFilter(filter)
  const wait = createWaitMode(transport)
  wait.use(notes, filter)
  return {
    time,
    engine,
    transport,
    wait,
    struck: () =>
      engine.heard
        .filter((call) => call.call.startsWith('on '))
        .map((call) => Number(call.call.split(' ')[1])),
    play: (pitch: number) => {
      wait.played({ kind: 'on', pitch, velocity: 80 })
    },
  }
}

describe('waiting for the player', () => {
  const melody = [note(60, 0), note(62, QUARTER), note(64, 2 * QUARTER)]

  it('holds at the first note it is waiting for, and sounds nothing past it', () => {
    const { time, transport, wait, struck } = setup(melody)
    wait.setOn(true)
    transport.play()
    time.run(3)

    expect(struck()).toEqual([])
    expect(wait.state.outstanding).toEqual([60])
    expect(transport.position()).toBe(0)
    expect(transport.status).toBe('paused')
  })

  it('carries on the moment the note is played, and stops at the next one', () => {
    const { time, transport, wait, play, struck } = setup(melody)
    wait.setOn(true)
    transport.play()
    time.run(1)

    play(60)
    time.run(2)
    // It ran to the second note and is waiting there, not at the third.
    expect(wait.state.outstanding).toEqual([62])
    expect(transport.position()).toBe(QUARTER)
    // Only what the player has not owed yet was allowed to sound, and the
    // note they played was not replayed at them.
    expect(struck()).not.toContain(62)

    play(62)
    time.run(4)
    expect(wait.state.outstanding).toEqual([64])
  })

  it('waits for every note of a chord, and for none that was not asked for', () => {
    const chord = [note(60, QUARTER), note(64, QUARTER), note(67, QUARTER + 10)]
    const { time, transport, wait, play } = setup(chord)
    wait.setOn(true)
    transport.play()
    time.run(1)
    expect(wait.state.outstanding).toEqual([60, 64, 67])

    play(60)
    play(67)
    expect(wait.state.outstanding).toEqual([64])
    expect(transport.status).toBe('paused')

    play(64)
    expect(wait.state.outstanding).toEqual([])
  })

  it('never blocks on a note nobody asked for, but notes it', () => {
    const { time, transport, wait, play } = setup(melody)
    wait.setOn(true)
    transport.play()
    time.run(1)

    play(61)
    play(63)
    expect(wait.state.extras).toEqual([61, 63])
    expect(transport.status).toBe('paused')

    play(60)
    expect(wait.state.extras).toEqual([])
    expect(wait.state.outstanding).toEqual([62])
  })

  it('lets the piece run when it is switched off', () => {
    const { time, transport, wait, struck } = setup(melody)
    wait.setOn(true)
    transport.play()
    time.run(1)
    expect(struck()).toEqual([])

    wait.setOn(false)
    transport.play()
    time.run(3)
    expect(struck()).toEqual([60, 62, 64])
  })
})

describe('waiting on one hand while the other plays through', () => {
  const both = [
    note(72, 0, 'right', 'right'),
    note(36, 0, 'left', 'left'),
    note(74, QUARTER, 'right', 'right'),
    note(38, QUARTER, 'left', 'left'),
  ]

  it('waits only for the part the app has been told not to play', () => {
    const { time, transport, wait } = setup(both, { mutedParts: ['right'] })
    wait.setOn(true)
    transport.play()
    time.run(1)
    expect(wait.state.outstanding).toEqual([72])
  })

  it('sounds the accompaniment at the tick it was waiting on, and never the player’s notes', () => {
    const { time, transport, wait, play, struck } = setup(both, { mutedParts: ['right'] })
    wait.setOn(true)
    transport.play()
    time.run(1)
    expect(struck()).toEqual([])

    play(72)
    time.run(2)
    // The left hand under the chord sounded; the right hand, which the
    // player is playing, was never struck by the app.
    expect(struck()).toContain(36)
    expect(struck()).not.toContain(72)
    expect(wait.state.outstanding).toEqual([74])
  })
})
