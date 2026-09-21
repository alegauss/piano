import { HISTORY_VERSION, KEEP_RECORDS, storedHistory, type PracticeRecord } from '@piano/ipc'
import type { Score, Section } from '@piano/score-format'
import { resolveTiming } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { ClickRecorder, FakeTime, Listener } from '../audio/test-doubles'
import { START_LEAD_SECONDS, Transport } from '../audio/transport'
import { createGrader } from './grader'
import { grade, type Expected, type Played } from './grading'
import {
  createProgress,
  describeSuggestion,
  fingerprintOf,
  PROGRESS_KEY,
  recordOf,
  scoreKey,
  suggestFrom,
  type Kept,
  type Legacy,
  type PracticeContext,
  type Store,
} from './progress'

/**
 * The history, and the one thing it is for: a sentence naming the bars to go
 * back to. Everything else here is about not losing it — to a rename, to a
 * correction, to a store somebody hand-edited into nonsense, or to the move
 * out of the browser's storage into the file main keeps.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4

const sections: Section[] = [{ id: 'opening', label: 'Opening', startTick: 0, endTick: 4 * BAR }]

const context: PracticeContext = {
  score: 'sonata',
  fingerprint: 'abc',
  level: 'beginner',
  sections,
}

function expected(pitch: number, tick: number): Expected {
  return { pitch, tick, velocity: 80 }
}

function strike(pitch: number, tick: number): Played {
  return { pitch, velocity: 80, tick, slip: 0, scale: 1, expressive: false }
}

/** An attempt over two bars, with the second one played or dropped. */
function attemptAt(secondBar: boolean) {
  return grade(
    [expected(60, 0), expected(62, BAR)],
    secondBar ? [strike(60, 0), strike(62, BAR)] : [strike(60, 0)],
    { timing, sections },
  )
}

function record(over: Partial<PracticeRecord> = {}): PracticeRecord {
  return {
    score: 'sonata',
    fingerprint: 'abc',
    at: 1000,
    level: 'beginner',
    tempoScale: 0.6,
    sections: ['opening'],
    tally: { correct: 1, early: 0, late: 0, wrong: 0, missed: 1, extra: 0, of: 2 },
    bars: [
      { bar: 1, faults: 0, of: 1 },
      { bar: 2, faults: 1, of: 1 },
    ],
    ...over,
  }
}

/** Main, as far as the window can tell: a list, a notice, and the two doors. */
function memory(start: Partial<Kept> = {}) {
  let held: readonly PracticeRecord[] = start.records ?? []
  let erased = 0
  let saved = 0
  const store: Store = {
    load: () =>
      Promise.resolve({ records: held, notice: start.notice ?? null, fresh: start.fresh ?? false }),
    save: (records) => {
      held = records
      return Promise.resolve()
    },
    erase: () => {
      held = []
      erased += 1
      return Promise.resolve()
    },
    keep: () => {
      saved += 1
      return Promise.resolve({ kind: 'saved', name: 'piano-practice-2026-01-01.json' })
    },
  }
  return { store, held: () => held, erased: () => erased, saved: () => saved }
}

/** The browser storage an older version wrote to. */
function browser(value: string | null): Legacy & { readonly left: () => string | null } {
  let held = value
  return {
    get: (key) => (key === PROGRESS_KEY ? held : null),
    remove: () => {
      held = null
    },
    left: () => held,
  }
}

describe('what a piece is known by', () => {
  it('is its own id, so a rename does not start the history over', () => {
    const score = { formatVersion: 1, metadata: { id: 'sonata-1', title: 'A' } } satisfies Score
    expect(scoreKey(score)).toBe('sonata-1')
    expect(scoreKey({ ...score, metadata: { id: 'sonata-1', title: 'B' } })).toBe('sonata-1')
  })

  it('falls back to what it is called, where a score carries no id', () => {
    expect(scoreKey({ formatVersion: 1, metadata: { title: 'Ballade' } })).toContain('Ballade')
  })

  it('fingerprints the notes, so a correction can be told from a re-save', () => {
    const score: Score = {
      formatVersion: 1,
      metadata: { title: 'A' },
      notes: [{ pitch: 60, start: 0, duration: 240, velocity: 80 }],
    }
    expect(fingerprintOf(score)).toBe(fingerprintOf({ ...score, metadata: { title: 'B' } }))
    expect(fingerprintOf(score)).not.toBe(
      fingerprintOf({ ...score, notes: [{ pitch: 61, start: 0, duration: 240, velocity: 80 }] }),
    )
  })
})

describe('what an attempt leaves behind', () => {
  it('keeps the counts, the level, the tempo and the bars, and none of the notes', () => {
    const written = recordOf(attemptAt(false), context, 0.75, 123)
    expect(written).toMatchObject({ score: 'sonata', level: 'beginner', tempoScale: 0.75, at: 123 })
    expect(written.sections).toEqual(['opening'])
    expect(written.bars.find((bar) => bar.bar === 2)?.faults).toBe(1)
    expect(JSON.stringify(written)).not.toContain('pitch')
  })
})

describe('where to start today', () => {
  it('names the bars that failed most, worst first', () => {
    const suggestion = suggestFrom([record(), record({ at: 2000 })], sections)
    expect(suggestion?.bars).toEqual([2])
    expect(suggestion?.attempts).toBe(2)
    expect(describeSuggestion(suggestion!)).toContain('bar 2')
    expect(describeSuggestion(suggestion!)).toContain('Opening')
  })

  it('says so when nothing is failing any more', () => {
    const clean = record({
      tally: { correct: 2, early: 0, late: 0, wrong: 0, missed: 0, extra: 0, of: 2 },
      bars: [
        { bar: 1, faults: 0, of: 1 },
        { bar: 2, faults: 0, of: 1 },
      ],
    })
    const suggestion = suggestFrom([clean], sections)
    expect(suggestion?.bars).toEqual([])
    expect(describeSuggestion(suggestion!)).toContain('Nothing has failed')
  })

  it('remembers the fastest a clean attempt was managed at', () => {
    const clean = record({
      tempoScale: 0.9,
      tally: { correct: 2, early: 0, late: 0, wrong: 0, missed: 0, extra: 0, of: 2 },
      bars: [],
    })
    expect(suggestFrom([record(), clean], sections)?.tempoReached).toBeCloseTo(0.9, 6)
    expect(suggestFrom([record()], sections)?.tempoReached).toBeNull()
  })

  it('says when the notes have moved under the history', () => {
    expect(suggestFrom([record(), record({ fingerprint: 'zzz' })], sections)?.stale).toBe(true)
    expect(suggestFrom([record(), record()], sections)?.stale).toBe(false)
  })

  it('has nothing to say before anything has been practised', () => {
    expect(suggestFrom([], sections)).toBeNull()
  })
})

describe('keeping it between sessions', () => {
  function setup(main = memory(), legacy: Legacy = browser(null)) {
    const time = new FakeTime()
    const transport = new Transport(
      new Listener(time),
      time.clock,
      time.ticker,
      new ClickRecorder(),
    )
    const notes = [
      { pitch: 60, start: 0, duration: 240, velocity: 80 },
      { pitch: 62, start: BAR, duration: 240, velocity: 80 },
    ]
    transport.load({ timing, notes })
    const grader = createGrader(transport, () => time.now)
    grader.use(timing, notes, {}, sections)
    let clock = 1000
    const progress = createProgress(grader, transport, {
      store: main.store,
      legacy,
      now: () => (clock += 1000),
    })
    progress.use(context)
    return { time, transport, grader, progress, main, legacy }
  }

  it('writes an attempt down as the grader finishes one', () => {
    const { time, transport, grader, progress } = setup()
    transport.play()
    time.run(START_LEAD_SECONDS)
    grader.played({ kind: 'on', pitch: 60, velocity: 80 }, true)
    transport.pause()

    expect(progress.forScore('sonata')).toHaveLength(1)
    expect(progress.forScore('sonata')[0]?.level).toBe('beginner')
  })

  it('reads back what a previous session left', async () => {
    const main = memory()
    const first = setup(main)
    await first.progress.load()
    first.progress.record(attemptAt(false))
    first.progress.close()

    const second = setup(main)
    await second.progress.load()
    expect(second.progress.forScore('sonata')).toHaveLength(1)
  })

  it('keeps an attempt graded while the history was still being read', async () => {
    const main = memory({ records: [record({ at: 500 })] })
    const { progress } = setup(main)
    const reading = progress.load()
    progress.record(attemptAt(false))
    await reading

    expect(progress.records).toHaveLength(2)
    expect(main.held()).toHaveLength(2)
  })

  it('says what could not be read, until it has been read', async () => {
    const { progress } = setup(memory({ notice: '2 attempts could not be read.' }))
    await progress.load()
    expect(progress.notice).toBe('2 attempts could not be read.')
    progress.dismiss()
    expect(progress.notice).toBeNull()
  })

  it('moves what an older version kept in the browser over, exactly once', async () => {
    const legacy = browser(JSON.stringify(storedHistory([record(), { ...record(), at: 2000 }])))
    const main = memory({ fresh: true })
    const first = setup(main, legacy)
    await first.progress.load()

    expect(first.progress.records).toHaveLength(2)
    expect(main.held()).toHaveLength(2)
    expect(legacy.left()).toBeNull()

    const second = setup(memory({ records: main.held() }), legacy)
    await second.progress.load()
    expect(second.progress.records).toHaveLength(2)
  })

  it('leaves a browser store that is nonsense behind rather than refusing to practise', async () => {
    const legacy = browser('not json at all')
    const { progress } = setup(memory({ fresh: true }), legacy)
    await progress.load()
    expect(progress.records).toEqual([])
    expect(legacy.left()).toBeNull()
  })

  it('says so rather than emptying itself when the history cannot be read', async () => {
    const main = memory()
    const { progress } = setup({
      ...main,
      store: { ...main.store, load: () => Promise.reject(new Error('main is not answering')) },
    })
    await progress.load()
    expect(progress.notice).toContain('main is not answering')
  })

  it('reads out one piece where a piece is named, and all of it where none is', () => {
    const { progress } = setup()
    progress.record(attemptAt(false))
    progress.use({ ...context, score: 'other' })
    progress.record(attemptAt(false))

    const one = JSON.parse(progress.exported('sonata'))
    expect(one.records).toHaveLength(1)
    expect(one.records[0].score).toBe('sonata')
    expect(one.version).toBe(HISTORY_VERSION)
    expect(JSON.parse(progress.exported()).records).toHaveLength(2)
    expect(JSON.parse(progress.exported('never-practised')).records).toEqual([])
  })

  it('can be read out whole, forgotten per piece and erased altogether', async () => {
    const { progress, main } = setup()
    progress.record(attemptAt(false))
    progress.use({ ...context, score: 'other' })
    progress.record(attemptAt(false))

    expect(JSON.parse(progress.exported()).records).toHaveLength(2)
    progress.forget('other')
    expect(progress.records).toHaveLength(1)
    expect(main.held()).toHaveLength(1)

    await progress.erase()
    expect(progress.records).toEqual([])
    expect(main.erased()).toBe(1)
    expect(JSON.parse(progress.exported()).records).toEqual([])
  })

  it('keeps what it has when erasing fails, and says why', async () => {
    const main = memory()
    const { progress } = setup({
      ...main,
      store: { ...main.store, erase: () => Promise.reject(new Error('the file is in use')) },
    })
    progress.record(attemptAt(false))
    await progress.erase()

    expect(progress.records).toHaveLength(1)
    expect(progress.notice).toContain('the file is in use')
  })

  it('hands the whole history over through the door main opens', async () => {
    const { progress, main } = setup()
    expect(await progress.keep()).toMatchObject({ kind: 'saved' })
    expect(main.saved()).toBe(1)
  })

  it('keeps a bounded history, since a year-old attempt says nothing about today', () => {
    const { progress } = setup()
    for (let index = 0; index < KEEP_RECORDS + 10; index += 1) {
      progress.record(attemptAt(index % 2 === 0))
    }
    expect(progress.records).toHaveLength(KEEP_RECORDS)
  })

  it('suggests where to start from what it has kept', () => {
    const { progress } = setup()
    progress.record(attemptAt(false))
    progress.record(attemptAt(false))

    const suggestion = progress.suggest('sonata')
    expect(suggestion?.bars).toEqual([2])
    expect(progress.suggest('nothing-practised')).toBeNull()
  })
})
