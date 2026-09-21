import type { Hand, Note, Section } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { ClickRecorder, FakeTime, Listener } from '../audio/test-doubles'
import { START_LEAD_SECONDS, Transport } from '../audio/transport'
import { createDrill, DEFAULT_STEP, type Wait } from './drill'
import { createGrader } from './grader'
import type { OtherHand } from './parts'

/**
 * The drill against a real transport and a real grader, on a clock the test
 * moves by hand and a gap it waits out by hand.
 *
 * What matters is the loop being made of graded repetitions rather than laps:
 * every claim here is about what the tempo did after a repetition, which is
 * only answerable because each one stops and is judged.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4
/** 120 bpm at 480 ticks to the quarter. */
const TICKS_PER_SECOND = 960

function note(pitch: number, start: number, hand: Hand = 'right'): Note {
  return { pitch, start, duration: 240, velocity: 80, hand }
}

/** Four bars of quarters, which is a passage worth drilling. */
const piece = Array.from({ length: 16 }, (_, index) => note(60 + (index % 4), index * QUARTER))

function setup(notes: readonly Note[] = piece, sections: readonly Section[] = []) {
  const time = new FakeTime()
  const engine = new Listener(time)
  const clicker = new ClickRecorder()
  const transport = new Transport(engine, time.clock, time.ticker, clicker)
  transport.load({ timing, notes })
  const grader = createGrader(transport, () => time.now)
  grader.use(timing, notes, {})

  /** The gap between repetitions, waited out when the test says so. */
  let resting: (() => void) | null = null
  const wait: Wait = (_seconds, run) => {
    resting = run
    return () => {
      resting = null
    }
  }
  const taken: { plays: readonly Hand[]; other: OtherHand }[] = []
  let released = 0
  const drill = createDrill(transport, grader, {
    wait,
    hands: (plays, other) => taken.push({ plays, other }),
    before: () => {
      released += 1
    },
  })
  drill.use(timing, sections)

  return {
    time,
    transport,
    grader,
    drill,
    taken,
    clicker,
    released: () => released,
    /** Let the gap between repetitions pass. */
    rest: () => {
      const run = resting
      resting = null
      run?.()
    },
    /** Play the notes of the passage in time, so the repetition comes out clean. */
    playThrough: (from: number, to: number) => {
      for (const one of notes.filter((n) => n.start >= from && n.start < to)) {
        time.run(START_LEAD_SECONDS + (one.start - from) / TICKS_PER_SECOND / transport.tempoScale)
        grader.played({ kind: 'on', pitch: one.pitch, velocity: 80 }, true)
      }
    },
    /** Run the clock past the end of the passage, so the repetition ends. */
    runPast: (from: number, to: number) => {
      time.run(START_LEAD_SECONDS + (to - from) / TICKS_PER_SECOND / transport.tempoScale + 0.2)
    },
  }
}

describe('a drill is made of graded repetitions', () => {
  it('plays the passage from its start and stops dead at its end', () => {
    const { transport, drill, time } = setup()
    drill.start({ range: { kind: 'ticks', start: BAR, end: 2 * BAR }, from: 1 })

    expect(transport.status).toBe('playing')
    expect(transport.position()).toBe(BAR)
    time.run(3)
    expect(transport.status).toBe('paused')
    expect(drill.state.passes).toBe(1)
  })

  it('climbs a step when the repetition came out clean', () => {
    const { drill, playThrough, runPast, rest } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, from: 0.6 })
    expect(drill.state.tempoScale).toBeCloseTo(0.6, 6)

    playThrough(0, BAR)
    runPast(0, BAR)

    expect(drill.state.last).toBe('clean')
    expect(drill.state.clean).toBe(1)
    expect(drill.state.tempoScale).toBeCloseTo(0.6 + DEFAULT_STEP, 6)
    rest()
    expect(drill.state.passes).toBe(1)
  })

  it('drops back a step when something went wrong', () => {
    const { drill, grader, time, runPast } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, from: 0.6, step: 0.1 })

    // One wrong note is enough to fail a repetition.
    time.run(START_LEAD_SECONDS)
    grader.played({ kind: 'on', pitch: 61, velocity: 80 }, true)
    runPast(0, BAR)

    expect(drill.state.last).toBe('faulty')
    expect(drill.state.tempoScale).toBeCloseTo(0.6, 6)
    expect(drill.state.clean).toBe(0)
  })

  it('never drops below where it started', () => {
    const { drill, grader, time, runPast } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, from: 0.5, step: 0.25 })

    time.run(START_LEAD_SECONDS)
    grader.played({ kind: 'on', pitch: 61, velocity: 80 }, true)
    runPast(0, BAR)

    expect(drill.state.last).toBe('faulty')
    expect(drill.state.tempoScale).toBeCloseTo(0.5, 6)
  })

  it('never climbs past the written tempo', () => {
    const { drill, playThrough, runPast } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, from: 0.9, step: 0.25 })

    playThrough(0, BAR)
    runPast(0, BAR)

    expect(drill.state.last).toBe('clean')
    expect(drill.state.tempoScale).toBe(1)
  })

  it('does not climb on a repetition nobody played into', () => {
    const { drill, time } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, from: 0.7 })
    time.run(3)

    expect(drill.state.last).toBeNull()
    expect(drill.state.tempoScale).toBeCloseTo(0.7, 6)
    expect(drill.state.passes).toBe(1)
  })

  it('starts the next repetition once the gap has passed', () => {
    const { drill, transport, time, rest } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, from: 1 })
    time.run(3)
    expect(transport.status).toBe('paused')

    rest()
    expect(transport.status).toBe('playing')
    expect(transport.position()).toBe(0)
    expect(drill.state.passes).toBe(1)
  })
})

describe('the three things compose', () => {
  it('takes one hand, a passage and a tempo ladder as one request', () => {
    const { drill, taken, transport } = setup()
    drill.start({
      range: { kind: 'bars', from: 2, to: 2 },
      hands: ['left'],
      other: 'silent',
      from: 0.5,
    })

    expect(taken[0]).toEqual({ plays: ['left'], other: 'silent' })
    expect(drill.state.range).toEqual({ start: BAR, end: 2 * BAR })
    expect(transport.tempoScale).toBeCloseTo(0.5, 6)
    expect(drill.state.hands).toEqual(['left'])
  })

  it('takes a named passage by its name', () => {
    const sections: Section[] = [
      { id: 'chorus', label: 'Chorus', startTick: 2 * BAR, endTick: 4 * BAR },
    ]
    const { drill } = setup(piece, sections)
    drill.start({ range: { kind: 'section', id: 'chorus' } })
    expect(drill.state.range).toEqual({ start: 2 * BAR, end: 4 * BAR })
  })

  it('refuses a passage the score does not have, rather than drilling nothing', () => {
    const { drill, transport } = setup()
    drill.start({ range: { kind: 'section', id: 'nowhere' } })
    expect(drill.state.running).toBe(false)
    expect(transport.status).toBe('stopped')
  })

  it('asks whatever was holding playback to let go first', () => {
    const { drill, released } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR } })
    expect(released()).toBe(1)
  })

  it('borrows the count-in and gives it back', () => {
    const { drill, transport } = setup()
    expect(transport.countIn).toBe(false)
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, countIn: true })
    expect(transport.countIn).toBe(true)

    drill.stop()
    expect(transport.countIn).toBe(false)
  })
})

describe('leaving a drill', () => {
  it('hands the keyboard back when it stops', () => {
    const { drill, taken } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR }, hands: ['left'], other: 'silent' })
    drill.stop()

    expect(taken.at(-1)).toEqual({ plays: ['left', 'right'], other: 'accompanies' })
    expect(drill.state.running).toBe(false)
  })

  it('lets go of the hold, so playback is not stuck at the end of the passage', () => {
    const { drill, transport } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR } })
    expect(transport.heldAt).toBe(BAR)
    drill.stop()
    expect(transport.heldAt).toBeNull()
  })

  it('stops when somebody pauses in the middle of a repetition', () => {
    const { drill, transport, time } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: 4 * BAR } })
    time.run(1)
    transport.pause()

    expect(drill.state.running).toBe(false)
  })

  it('stops listening to the transport when it is closed', () => {
    const { drill, transport, time } = setup()
    drill.start({ range: { kind: 'ticks', start: 0, end: BAR } })
    drill.close()
    time.run(3)

    expect(drill.state.running).toBe(false)
    // And the passage is not still held at its end by a drill nobody is in.
    expect(transport.heldAt).toBeNull()
  })
})
