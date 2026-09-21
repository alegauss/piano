import { describe, expect, it } from 'vitest'

import { MAX_REPORTED_PROBLEMS, parseScore, type ScoreProblem } from './parse'
import { PER_KIND } from './repair'
import { FORMAT_VERSION } from './version'

/**
 * Refusals as a model repairing its own score reads them. The test that
 * matters most is the last one: a broken score, corrected by doing exactly
 * what the problems say and nothing else, comes back valid.
 */

function score(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: FORMAT_VERSION,
    metadata: { title: 'Study' },
    notes: [{ id: 'n1', pitch: 60, start: 0, duration: 480, velocity: 80 }],
    ...overrides,
  }
}

function problems(raw: unknown): readonly ScoreProblem[] {
  const result = parseScore(raw)
  return result.ok ? [] : result.problems
}

function note(over: Record<string, unknown>) {
  return { pitch: 60, start: 0, duration: 480, velocity: 80, ...over }
}

describe('a problem says what to do', () => {
  it('rounds a tick off the grid to the nearest one', () => {
    const [problem] = problems(score({ notes: [note({ start: 481.4 })] }))
    expect(problem).toMatchObject({ path: 'notes.0.start', received: '481.4', fix: 'use 481' })
  })

  it('names the bound a value went past', () => {
    expect(problems(score({ notes: [note({ velocity: 140 })] }))[0]?.fix).toBe('use 127')
    expect(problems(score({ notes: [note({ start: -3 })] }))[0]?.fix).toBe('use 0')
  })

  it('says which option a typo meant, and lists them all', () => {
    const [problem] = problems(score({ metadata: { title: 'x', level: 'begginer' } }))
    expect(problem?.fix).toBe('use "beginner"')
    expect(problem?.expected).toContain('intermediate')
  })

  it('takes the quotes off a number that arrived as a string', () => {
    expect(problems(score({ notes: [note({ pitch: '60' })] }))[0]?.fix).toBe(
      'use 60, without quotes',
    )
  })

  it('gives an example for a field that is missing', () => {
    const [problem] = problems({ formatVersion: FORMAT_VERSION, metadata: {} })
    expect(problem).toMatchObject({ kind: 'missing', path: 'metadata.title' })
    expect(problem?.fix).toBe('add "title": "Untitled"')
  })

  it('points an unknown field at the one it was probably meant to be, or at extensions', () => {
    const [typo] = problems(score({ note: [] }))
    expect(typo).toMatchObject({
      kind: 'unknown field',
      path: 'note',
      fix: 'rename "note" to "notes"',
    })

    const [stray] = problems(score({ mood: 'wistful' }))
    expect(stray?.fix).toContain('extensions')
  })

  it('names both overlapping notes, where they collide, and how to part them', () => {
    const [problem] = problems(
      score({
        notes: [
          { id: 'a', pitch: 60, start: 0, duration: 480, velocity: 80 },
          { id: 'b', pitch: 60, start: 100, duration: 480, velocity: 80 },
        ],
      }),
    )
    expect(problem).toMatchObject({ kind: 'overlap', path: 'notes.1' })
    expect(problem?.received).toContain('tick 100')
    expect(problem?.expected).toContain('a')
    expect(problem?.fix).toContain('notes.0 a duration of 100')
  })

  it('names the spelling that would agree with the pitch', () => {
    const [problem] = problems(score({ notes: [note({ pitch: 61, spelling: 'C4' })] }))
    expect(problem?.path).toBe('notes.0.spelling')
    expect(problem?.fix).toContain('"C#4"')
  })

  it('points a rule about the rest of the score at the part of it the rule is about', () => {
    const [problem] = problems(score({ notes: [note({ part: 'ghost' })] }))
    expect(problem).toMatchObject({ kind: 'musical', path: 'parts' })
  })
})

describe('a badly broken score', () => {
  const broken = {
    formatVersion: FORMAT_VERSION,
    metadata: {},
    notes: Array.from({ length: 200 }, () => note({ pitch: 'wrong' })),
  }

  it('keeps every problem as data, and shows a bounded few in prose', () => {
    const result = parseScore(broken)
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }
    expect(result.problems).toHaveLength(201)
    expect(result.message.split('\n').length).toBeLessThanOrEqual(MAX_REPORTED_PROBLEMS + 1)
  })

  it('does not let one kind of trouble bury another', () => {
    const result = parseScore(broken)
    if (result.ok) {
      return
    }
    // Two hundred wrong pitches, and the missing title is still in view.
    expect(result.message).toContain('metadata.title')
    expect(result.message.match(/notes\.\d+\.pitch/g)?.length).toBeLessThanOrEqual(PER_KIND)
    expect(result.message).toContain('197 more problems')
  })
})

describe('the repair loop', () => {
  /** Do what a problem's fix says, where it says to use a value. */
  function apply(raw: Record<string, unknown>, problem: ScoreProblem): void {
    const quoted = /^use "(.+)"$/.exec(problem.fix ?? '')
    const number = /^use (-?\d+(?:\.\d+)?)(?:, without quotes)?$/.exec(problem.fix ?? '')
    const value = quoted?.[1] ?? (number === null ? undefined : Number(number[1]))
    if (value === undefined) {
      throw new Error(`no value to use in "${problem.fix ?? ''}"`)
    }
    const keys = problem.path.split('.')
    let target = raw
    for (const key of keys.slice(0, -1)) {
      target = target[key] as Record<string, unknown>
    }
    target[keys.at(-1) ?? ''] = value
  }

  it('turns a broken score into a valid one by doing only what the problems say', () => {
    const raw = score({
      metadata: { title: 'Study', level: 'intermedate' },
      notes: [
        note({ start: 479.6 }),
        note({ pitch: '64', start: 960 }),
        note({ velocity: 0, start: 1440 }),
        note({ velocity: 300, start: 1920 }),
      ],
    })

    const first = problems(raw)
    expect(first.length).toBe(5)
    for (const problem of first) {
      apply(raw, problem)
    }
    expect(parseScore(raw).ok).toBe(true)
  })
})
