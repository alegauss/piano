import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { formatProblems, MAX_REPORTED_PROBLEMS, parseScore } from './parse'
import { scoreSchema } from './schema'
import { FORMAT_VERSION } from './version'

function score(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: FORMAT_VERSION,
    metadata: { title: 'Gymnopédie No. 1', composer: 'Erik Satie' },
    notes: [{ id: 'n1', pitch: 60, start: 0, duration: 480, velocity: 80 }],
    ...overrides,
  }
}

describe('the schema itself', () => {
  it('refuses a field the format does not define', () => {
    // Whether the published document is in step with this is checked by
    // scripts/check-schema-fresh.mjs: reading a file from disk is exactly what
    // this package must not learn to do.
    const generated = z.toJSONSchema(scoreSchema, {
      target: 'draft-2020-12',
      io: 'input',
    }) as Record<string, unknown>
    expect(generated['additionalProperties']).toBe(false)
    expect(generated['required']).toEqual(['formatVersion', 'metadata'])
  })
})

describe('parseScore', () => {
  it('accepts a sound score and says nothing was migrated', () => {
    const result = parseScore(score())
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.score.metadata.title).toBe('Gymnopédie No. 1')
      expect(result.migrated).toEqual([])
    }
  })

  it('accepts a score that is only a version, a title and nothing else', () => {
    expect(parseScore({ formatVersion: FORMAT_VERSION, metadata: { title: 'Untitled' } }).ok).toBe(
      true,
    )
  })

  it('refuses something that is not an object at all', () => {
    for (const bad of [null, 42, 'a score', []]) {
      expect(parseScore(bad).ok, JSON.stringify(bad)).toBe(false)
    }
  })
})

describe('what an error says', () => {
  it('names the path, the value received and what was expected', () => {
    const result = parseScore(
      score({ notes: [{ pitch: 'sixty', start: 0, duration: 480, velocity: 80 }] }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    const [problem] = result.problems
    expect(problem?.path).toBe('notes.0.pitch')
    expect(problem?.received).toBe('"sixty"')
    expect(problem?.expected).toBeTruthy()
    expect(result.message).toContain('notes.0.pitch')
    expect(result.message).toContain('"sixty"')
  })

  it('points a missing field at the field rather than at the score', () => {
    const result = parseScore({ formatVersion: FORMAT_VERSION, metadata: {} })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems[0]?.path).toBe('metadata.title')
      expect(result.problems[0]?.received).toBe('nothing')
    }
  })

  it('names the field a typo probably meant', () => {
    const result = parseScore(score({ note: [] }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('"notes"')
    }
  })

  it('reports the musical rules a schema cannot express', () => {
    const result = parseScore(
      score({
        notes: [
          { id: 'a', pitch: 60, start: 0, duration: 480, velocity: 80 },
          { id: 'b', pitch: 60, start: 100, duration: 480, velocity: 80 },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.message).toContain('overlap')
      expect(result.message).toContain('a')
      expect(result.message).toContain('b')
    }
  })

  it('stays bounded on a badly broken score', () => {
    const notes = Array.from({ length: 200 }, (_, i) => ({
      id: `n${String(i)}`,
      pitch: 'wrong',
      start: 0,
      duration: 480,
      velocity: 80,
    }))
    const result = parseScore(score({ notes }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.length).toBe(200)
      // The message is what a caller reads, and it is the bounded half.
      expect(result.message.split('\n').length).toBeLessThanOrEqual(MAX_REPORTED_PROBLEMS + 1)
      expect(result.message).toContain('more problems')
    }
  })

  it('renders an empty problem list as an empty message', () => {
    expect(formatProblems([])).toBe('')
  })
})

describe('an old file', () => {
  it('is migrated before it is validated, because old is not malformed', () => {
    const result = parseScore({ formatVersion: FORMAT_VERSION, metadata: { title: 'x' } })
    expect(result.ok).toBe(true)
  })

  it('reports a version from the future against formatVersion', () => {
    const result = parseScore(score({ formatVersion: FORMAT_VERSION + 5 }))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems[0]?.path).toBe('formatVersion')
      expect(result.problems[0]?.expected).toContain('update the app')
    }
  })
})
