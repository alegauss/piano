import type { LibraryCorrectResult, LibraryRemoveResult } from '@piano/ipc'
import type { Level, Note, Section } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { ClickRecorder, FakeTime, Listener } from '../audio/test-doubles'
import { Transport } from '../audio/transport'
import { runCommand, type Controls, type Opening } from './commands'
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

/** A second piece, for a library score opened by id: two bars of one note. */
const other: Note[] = [
  { pitch: 72, start: 0, duration: 240, velocity: 80 },
  { pitch: 72, start: BAR, duration: 240, velocity: 80 },
]

function setup(
  open: (id: string, transport: Transport) => Promise<Opening> = () =>
    Promise.resolve({ ok: false, text: 'Not in this test.' }),
  /** What the window answers a tidy-up with, since the library is not here. */
  tidying: {
    readonly gone?: LibraryRemoveResult
    readonly put?: LibraryCorrectResult
  } = {},
) {
  const gone: LibraryRemoveResult = tidying.gone ?? { kind: 'removed', id: 'aria' }
  const put: LibraryCorrectResult = tidying.put ?? {
    kind: 'corrected',
    id: 'aria',
    title: 'Aria',
    wasCalled: 'Aria',
    score: null,
    open: false,
  }
  /** Every delete and correction the window was asked to make. */
  const tidied: unknown[] = []
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
  const opened: string[] = []
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
    open: (id) => {
      opened.push(id)
      return open(id, transport)
    },
    remove: (id) => {
      tidied.push({ removed: id })
      return Promise.resolve(gone)
    },
    correct: (id, metadata, taken) => {
      tidied.push({ corrected: id, metadata, ...(taken === undefined ? {} : { taken }) })
      return Promise.resolve(put)
    },
  }
  return {
    transport,
    drill,
    controls,
    run: (command: Parameters<typeof runCommand>[0]) => runCommand(command, controls),
    woken: () => woken,
    opened,
    tidied,
  }
}

describe('what a command does to the piano', () => {
  it('plays what is open, waking the audio first', async () => {
    const { run, transport, woken } = setup()
    const answer = await run({ kind: 'play' })
    expect(transport.status).toBe('playing')
    expect(woken()).toBe(1)
    expect(answer.text).toContain('Study in C')
  })

  it('opens a library score it is asked for, then plays it from the start', async () => {
    const { run, transport, opened } = setup((_id, held) => {
      // What the window does: the transport holds the new piece before the open settles.
      held.load({ timing, notes: other })
      return Promise.resolve({ ok: true, title: 'Nocturne' })
    })
    await run({ kind: 'seek', bar: 5 })
    const answer = await run({ kind: 'play', score: 'nocturne' })

    expect(opened).toEqual(['nocturne'])
    expect(answer).toMatchObject({ ok: true })
    expect(answer.text).toContain('Nocturne')
    expect(transport.status).toBe('playing')
    expect(transport.position()).toBeLessThan(BAR)
  })

  it('plays nothing when the score cannot be opened, and says the open piece is untouched', async () => {
    const { run, transport } = setup(() =>
      Promise.resolve({ ok: false, text: 'No score in the library is called "nocturne".' }),
    )
    const answer = await run({ kind: 'play', score: 'nocturne' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('nocturne')
    expect(answer.text).toContain('"Study in C" is still open')
    expect(transport.status).toBe('stopped')
  })

  it('ends the reason as a sentence before saying what is still open', async () => {
    const { run } = setup(() =>
      Promise.resolve({ ok: false, text: 'notes.0.pitch: expected at most 127; fix: use 127' }),
    )
    const answer = await run({ kind: 'play', score: 'broken' })
    expect(answer.text).toContain('fix: use 127. "Study in C" is still open')
  })

  it('stops, and stops a drill with it', async () => {
    const { run, transport, drill } = setup()
    await run({ kind: 'practise', drill: { passage: { kind: 'bars', from: 1, to: 1 } } })
    await run({ kind: 'stop' })
    expect(transport.status).toBe('stopped')
    expect(drill.state.running).toBe(false)
  })

  it('goes to a bar as a musician counts it, or to a named section', async () => {
    const { run, transport } = setup()
    expect((await run({ kind: 'seek', bar: 3 })).ok).toBe(true)
    expect(transport.position()).toBe(2 * BAR)

    expect((await run({ kind: 'seek', section: 'chorus' })).ok).toBe(true)
    expect(transport.position()).toBe(2 * BAR)
  })

  it('names the sections there are when asked for one that is not', async () => {
    const { run } = setup()
    const answer = await run({ kind: 'seek', section: 'bridge' })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('"chorus"')
  })

  it('sets the tempo and the transposition, and says what they are now', async () => {
    const { run, transport } = setup()
    expect((await run({ kind: 'tempo', scale: 0.5 })).text).toContain('50%')
    expect(transport.tempoScale).toBe(0.5)

    expect((await run({ kind: 'transpose', semitones: -2 })).text).toContain('2 semitones down')
    expect(transport.transpose).toBe(-2)
    expect((await run({ kind: 'transpose', semitones: 0 })).text).toContain('written pitch')
  })

  it('chooses a level through the same chooser a person uses', async () => {
    const { run, controls } = setup()
    const answer = await run({ kind: 'level', level: 'beginner' })
    expect(controls.level()).toBe('beginner')
    expect(answer.text).toContain('Beginner')
  })

  it('reports what is open and what it is doing, as a sentence and as data', async () => {
    const { run } = setup()
    await run({ kind: 'tempo', scale: 0.75 })
    await run({ kind: 'level', level: 'intermediate' })
    const answer = await run({ kind: 'state' })

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
  it('starts a drill from one request: the passage, the hand and the ladder', async () => {
    const { run, drill, transport } = setup()
    const answer = await run({
      kind: 'practise',
      drill: { passage: { kind: 'bars', from: 2, to: 3 }, hands: ['left'], from: 0.5 },
    })

    expect(answer.ok).toBe(true)
    expect(answer.text).toContain('bars 2 to 3')
    expect(answer.text).toContain('left hand')
    expect(drill.state.range).toEqual({ start: BAR, end: 3 * BAR })
    expect(transport.tempoScale).toBeCloseTo(0.5, 6)
  })

  it('practises a named section', async () => {
    const { run, drill } = setup()
    const answer = await run({
      kind: 'practise',
      drill: { passage: { kind: 'section', id: 'chorus' } },
    })
    expect(answer.ok).toBe(true)
    expect(drill.state.range).toEqual({ start: 2 * BAR, end: 4 * BAR })
  })

  it('says so when the passage is not in the piece, and drills nothing', async () => {
    const { run, drill } = setup()
    const answer = await run({
      kind: 'practise',
      drill: { passage: { kind: 'section', id: 'coda' } },
    })
    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('"chorus"')
    expect(drill.state.running).toBe(false)
  })
})

describe('tidying the library from a sentence', () => {
  it('deletes through the window, so the file goes where a row’s delete puts it', async () => {
    const { run, tidied } = setup()
    const answer = await run({ kind: 'remove', score: 'aria' })

    expect(answer.ok).toBe(true)
    expect(answer.text).toContain('bin')
    expect(tidied).toEqual([{ removed: 'aria' }])
  })

  it('passes a refusal on in the window’s own words', async () => {
    const { run } = setup(undefined, {
      gone: { kind: 'refused', message: 'nothing is filed as aria' },
    })
    const answer = await run({ kind: 'remove', score: 'aria' })

    expect(answer.ok).toBe(false)
    expect(answer.text).toBe('nothing is filed as aria')
  })

  it('corrects through the window, and says which id the piece is addressed by now', async () => {
    const { run, tidied } = setup(undefined, {
      put: {
        kind: 'corrected',
        id: 'prelude-in-c',
        title: 'Prelude in C',
        wasCalled: 'Untitled',
        score: null,
        open: false,
      },
    })

    const answer = await run({
      kind: 'correct',
      score: 'untitled',
      metadata: { title: 'Prelude in C' },
    })

    expect(answer.ok).toBe(true)
    expect(answer.text).toContain('addressed as "prelude-in-c"')
    expect(tidied).toEqual([{ corrected: 'untitled', metadata: { title: 'Prelude in C' } }])
  })

  it('says nothing about a name for a piece that did not move', async () => {
    const { run } = setup()
    const answer = await run({ kind: 'correct', score: 'aria', metadata: { title: 'Aria' } })

    expect(answer.ok).toBe(true)
    expect(answer.text).not.toContain('addressed as')
  })

  it('asks back rather than guessing when the name a title wants is taken', async () => {
    const { run } = setup(undefined, {
      put: {
        kind: 'taken',
        id: 'prelude-in-c',
        held: { title: 'Prelude in C', composer: 'Bach', seconds: 95 },
      },
    })

    const answer = await run({
      kind: 'correct',
      score: 'untitled',
      metadata: { title: 'Prelude in C' },
    })

    expect(answer.ok).toBe(false)
    expect(answer.text).toContain('Bach')
    expect(answer.data).toEqual({ taken: 'prelude-in-c' })
  })

  it('carries the choice through when it is made', async () => {
    const { run, tidied } = setup()
    await run({
      kind: 'correct',
      score: 'untitled',
      metadata: { title: 'Prelude in C' },
      taken: 'beside',
    })

    expect(tidied).toEqual([
      { corrected: 'untitled', metadata: { title: 'Prelude in C' }, taken: 'beside' },
    ])
  })
})
