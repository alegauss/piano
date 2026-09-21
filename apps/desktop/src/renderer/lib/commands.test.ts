import type { Level, Note, Section } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { ClickRecorder, FakeTime, Listener } from '../audio/test-doubles'
import { Transport } from '../audio/transport'
import { runCommand, type Controls } from './commands'
import { createDrill, type Wait } from './drill'
import { createGrader } from './grader'

/**
 * Each command against the pieces a person drives: a real transport on a
 * clock the test moves, a real drill and a real grader. What is asserted is
 * that the piano did the thing, and that the sentence coming back says so in
 * bars and fractions of the written tempo.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4

const notes: Note[] = Array.from({ length: 32 }, (_, index) => ({
  pitch: 60 + (index % 5),
  start: index * QUARTER,
  duration: 240,
  velocity: 80,
  hand: index % 2 === 0 ? 'right' : 'left',
}))

const sections: Section[] = [
  { id: 'chorus', label: 'Chorus', startTick: 2 * BAR, endTick: 4 * BAR },
]

function setup() {
  const time = new FakeTime()
  const transport = new Transport(new Listener(time), time.clock, time.ticker, new ClickRecorder())
  transport.load({ timing, notes })
  const grader = createGrader(transport, () => time.now)
  grader.use(timing, notes, {}, sections)
  const wait: Wait = () => () => {}
  const drill = createDrill(transport, grader, { wait })
  drill.use(timing, sections)
  let level: Level | null = null
  let woken = 0
  const controls: Controls = {
    transport,
    timing,
    sections,
    title: 'Study in C',
    level: () => level,
    chooseLevel: (next) => {
      level = next
    },
    drill,
    wake: () => {
      woken += 1
    },
  }
  return {
    transport,
    drill,
    controls,
    run: (command: Parameters<typeof runCommand>[0]) => runCommand(command, controls),
    woken: () => woken,
  }
}

describe('what a command does to the piano', () => {
  it('plays what is open, waking the audio first', () => {
    const { run, transport, woken } = setup()
    const answer = run({ kind: 'play' })
    expect(transport.status).toBe('playing')
    expect(woken()).toBe(1)
    expect(answer.text).toContain('Study in C')
  })

  it('refuses to play a score it cannot open rather than playing the wrong one', () => {
    const { run, transport } = setup()
    const answer = run({ kind: 'play', score: 'nocturne' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('nocturne')
    expect(transport.status).toBe('stopped')
  })

  it('stops, and stops a drill with it', () => {
    const { run, transport, drill } = setup()
    run({ kind: 'practise', drill: { passage: { kind: 'bars', from: 1, to: 1 } } })
    run({ kind: 'stop' })
    expect(transport.status).toBe('stopped')
    expect(drill.state.running).toBe(false)
  })

  it('goes to a bar as a musician counts it, or to a named section', () => {
    const { run, transport } = setup()
    expect(run({ kind: 'seek', bar: 3 }).ok).toBe(true)
    expect(transport.position()).toBe(2 * BAR)

    expect(run({ kind: 'seek', section: 'chorus' }).ok).toBe(true)
    expect(transport.position()).toBe(2 * BAR)
  })

  it('names the sections there are when asked for one that is not', () => {
    const { run } = setup()
    const answer = run({ kind: 'seek', section: 'bridge' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('"chorus"')
  })

  it('sets the tempo and the transposition, and says what they are now', () => {
    const { run, transport } = setup()
    expect(run({ kind: 'tempo', scale: 0.5 }).text).toContain('50%')
    expect(transport.tempoScale).toBe(0.5)

    expect(run({ kind: 'transpose', semitones: -2 }).text).toContain('2 semitones down')
    expect(transport.transpose).toBe(-2)
    expect(run({ kind: 'transpose', semitones: 0 }).text).toContain('written pitch')
  })

  it('chooses a level through the same chooser a person uses', () => {
    const { run, controls } = setup()
    const answer = run({ kind: 'level', level: 'beginner' })
    expect(controls.level()).toBe('beginner')
    expect(answer.text).toContain('Beginner')
  })

  it('reports what is open and what it is doing, as a sentence and as data', () => {
    const { run } = setup()
    run({ kind: 'tempo', scale: 0.75 })
    run({ kind: 'level', level: 'intermediate' })
    const answer = run({ kind: 'state' })

    expect(answer.text).toContain('Study in C')
    expect(answer.text).toContain('75%')
    expect(answer.data).toMatchObject({
      status: 'stopped',
      tempoScale: 0.75,
      level: 'intermediate',
    })
  })
})

describe('practising from a sentence', () => {
  it('starts a drill from one request: the passage, the hand and the ladder', () => {
    const { run, drill, transport } = setup()
    const answer = run({
      kind: 'practise',
      drill: { passage: { kind: 'bars', from: 2, to: 3 }, hands: ['left'], from: 0.5 },
    })

    expect(answer.ok).toBe(true)
    expect(answer.text).toContain('bars 2 to 3')
    expect(answer.text).toContain('left hand')
    expect(drill.state.range).toEqual({ start: BAR, end: 3 * BAR })
    expect(transport.tempoScale).toBeCloseTo(0.5, 6)
  })

  it('practises a named section', () => {
    const { run, drill } = setup()
    expect(
      run({ kind: 'practise', drill: { passage: { kind: 'section', id: 'chorus' } } }).ok,
    ).toBe(true)
    expect(drill.state.range).toEqual({ start: 2 * BAR, end: 4 * BAR })
  })

  it('says so when the passage is not in the piece, and drills nothing', () => {
    const { run, drill } = setup()
    const answer = run({ kind: 'practise', drill: { passage: { kind: 'section', id: 'coda' } } })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('"chorus"')
    expect(drill.state.running).toBe(false)
  })
})
