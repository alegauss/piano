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
  KEEP_RECORDS,
  recordOf,
  scoreKey,
  suggestFrom,
  type PracticeContext,
  type PracticeRecord,
  type Store,
} from './progress'

/**
 * The history, and the one thing it is for: a sentence naming the bars to go
 * back to. Everything else here is about not losing it — to a rename, to a
 * correction, or to a store somebody hand-edited into nonsense.
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

function memory(): Store & { readonly held: () => string | null } {
  let value: string | null = null
  return {
    read: () => value,
    write: (next) => {
      value = next
    },
    held: () => value,
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
  function setup(store = memory()) {
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
      store,
      now: () => (clock += 1000),
    })
    progress.use(context)
    return { time, transport, grader, progress, store }
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

  it('reads back what a previous session left', () => {
    const store = memory()
    const first = setup(store)
    first.progress.record(attemptAt(false))
    first.progress.close()

    const second = setup(store)
    expect(second.progress.forScore('sonata')).toHaveLength(1)
  })

  it('starts over rather than refusing to practise when the store is nonsense', () => {
    const store = memory()
    store.write('not json at all')
    const { progress } = setup(store)
    expect(progress.records).toEqual([])
  })

  it('can be read out whole and forgotten, per piece and altogether', () => {
    const { progress } = setup()
    progress.record(attemptAt(false))
    progress.use({ ...context, score: 'other' })
    progress.record(attemptAt(false))

    expect(JSON.parse(progress.exported()).records).toHaveLength(2)
    progress.forget('other')
    expect(progress.records).toHaveLength(1)
    progress.forget()
    expect(progress.records).toEqual([])
    expect(JSON.parse(progress.exported()).records).toEqual([])
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
