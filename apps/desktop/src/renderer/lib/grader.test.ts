import type { Note } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { ClickRecorder, FakeTime, Listener } from '../audio/test-doubles'
import { START_LEAD_SECONDS, Transport } from '../audio/transport'
import { createGrader } from './grader'
import { NO_LATENCY, type Latency } from './latency'

/**
 * The grader against a real transport on a clock the test moves by hand.
 *
 * What is asserted here is what the arithmetic cannot know on its own: that a
 * pass is the unit, that the stretch graded is the one that was played, that
 * the count-in is nobody's attempt, and that the machine's lag is put back
 * before anyone is judged on it.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
/** 120 bpm at 480 ticks to the quarter. */
const TICKS_PER_SECOND = 960

function note(pitch: number, start: number, velocity = 80): Note {
  return { pitch, start, duration: 240, velocity }
}

function setup(notes: readonly Note[], latency: Latency = NO_LATENCY) {
  const time = new FakeTime()
  const engine = new Listener(time)
  const clicker = new ClickRecorder()
  const transport = new Transport(engine, time.clock, time.ticker, clicker)
  transport.load({ timing, notes })
  const grader = createGrader(transport, () => time.now)
  grader.use(timing, notes, {})
  grader.useLatency(latency)
  return {
    time,
    transport,
    grader,
    /** Play a note now, from a controller unless told otherwise. */
    play: (pitch: number, velocity = 80, expressive = true) => {
      grader.played({ kind: 'on', pitch, velocity }, expressive)
    },
    outcomes: () => grader.state.attempt?.judged.map((one) => one.outcome),
  }
}

/** Where a tick falls on the clock, on a pass started from the beginning. */
function at(tick: number): number {
  return START_LEAD_SECONDS + tick / TICKS_PER_SECOND
}

describe('a pass is the unit', () => {
  const melody = [note(60, 0), note(62, QUARTER)]

  it('grades what was played once playback comes to rest', () => {
    const { time, transport, play, grader, outcomes } = setup(melody)
    transport.play()
    expect(grader.state.running).toBe(true)
    expect(grader.state.attempt).toBeNull()

    time.run(at(0))
    play(60)
    time.run(at(QUARTER))
    play(62)
    time.run(3)

    expect(transport.status).toBe('stopped')
    expect(grader.state.running).toBe(false)
    expect(outcomes()).toEqual(['correct', 'correct'])
  })

  it('counts the strikes as they arrive, so a view can say it is listening', () => {
    const { time, transport, play, grader } = setup(melody)
    transport.play()
    time.run(at(0))
    play(60)
    expect(grader.state.taken).toBe(1)
  })

  it('grades the stretch that was played, not the whole piece', () => {
    const { time, transport, play, grader } = setup([
      note(60, 0),
      note(62, QUARTER),
      note(64, 2 * QUARTER),
      note(65, 3 * QUARTER),
    ])
    transport.play()
    time.run(at(0))
    play(60)
    time.run(at(QUARTER))
    play(62)
    time.run(at(QUARTER) + 0.05)
    transport.pause()

    expect(grader.state.attempt?.tally).toMatchObject({ of: 2, correct: 2, missed: 0 })
  })

  it('leaves the last report alone when a pass was only listened to', () => {
    const { time, transport, play, grader } = setup(melody)
    transport.play()
    time.run(at(0))
    play(60)
    time.run(3)
    const graded = grader.state.attempt
    expect(graded).not.toBeNull()

    transport.play()
    time.run(6)
    expect(grader.state.attempt).toBe(graded)
  })

  it('starts again from nothing on the next pass', () => {
    const { time, transport, play, grader } = setup(melody)
    transport.play()
    time.run(at(0))
    play(60)
    time.run(3)

    transport.play()
    expect(grader.state.taken).toBe(0)
    expect(grader.state.running).toBe(true)
  })
})

describe('what is not anybody attempt', () => {
  it('scores nothing played during the count-in', () => {
    const { time, transport, play, grader } = setup([note(60, 0)])
    transport.setCountIn(true)
    transport.play()

    // Four beats at half a second each: the piece begins at 2.05.
    time.run(1)
    play(60)
    expect(grader.state.taken).toBe(0)

    time.run(START_LEAD_SECONDS + 2 + 0.01)
    play(60)
    expect(grader.state.taken).toBe(1)
  })
})

describe('the machine lag, put back before anyone is judged on it', () => {
  it('grades a player who was in time as in time, however slow the machine', () => {
    const latency = { output: 0.06, input: 0.09 }
    const { time, transport, play, grader } = setup([note(60, 0)], latency)
    transport.play()

    // The note is scheduled at 0.05 and heard at 0.11; a player answering it
    // exactly has their event arrive at 0.20.
    time.run(at(0) + latency.output + latency.input)
    play(60)
    transport.pause()

    expect(grader.state.attempt?.judged[0]?.offset).toBeCloseTo(0, 3)
    expect(grader.state.attempt?.judged[0]?.outcome).toBe('correct')
  })
})

describe('waiting for the player', () => {
  const melody = [note(60, 0), note(62, QUARTER)]

  it('is not the end of the pass, and what is played into a hold is in time', () => {
    const { time, transport, play, grader, outcomes } = setup(melody)
    transport.hold(QUARTER)
    transport.play()
    time.run(at(QUARTER) + 0.05)

    expect(transport.status).toBe('paused')
    expect(grader.state.running).toBe(true)
    expect(grader.state.attempt).toBeNull()

    play(62)
    transport.stop()

    expect(outcomes()).toEqual(['missed', 'correct'])
    expect(grader.state.attempt?.judged[1]?.offset).toBe(0)
  })
})

describe('the strictness setting', () => {
  it('is what the next attempt is graded against', () => {
    const { time, transport, play, grader, outcomes } = setup([note(60, 0)])
    grader.setStrictness('strict')
    expect(grader.state.strictness).toBe('strict')

    transport.play()
    time.run(at(0) + 0.1)
    play(60)
    transport.pause()

    expect(outcomes()).toEqual(['late'])
    expect(grader.state.attempt?.strictness).toBe('strict')
  })
})

describe('the touch', () => {
  it('is graded from the controller and not from the typing keyboard', () => {
    const { time, transport, play, grader } = setup([note(60, 0, 80)])
    transport.play()
    time.run(at(0))
    play(60, 110, false)
    transport.pause()
    expect(grader.state.attempt?.dynamics).toBeNull()

    const second = setup([note(60, 0, 80)])
    second.transport.play()
    second.time.run(at(0))
    second.play(60, 110, true)
    second.transport.pause()
    expect(second.grader.state.attempt?.dynamics).toMatchObject({ of: 1, within: 0 })
  })
})

describe('letting go', () => {
  it('stops listening to the transport when it is closed', () => {
    const { transport, grader } = setup([note(60, 0)])
    grader.close()
    transport.play()
    expect(grader.state.running).toBe(false)
  })
})
