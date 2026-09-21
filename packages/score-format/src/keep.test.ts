import { describe, expect, it } from 'vitest'

import {
  arrangementDigest,
  isRulesWork,
  keepArrangement,
  REDUCTION_RULES,
  signedByRules,
  withoutStaleRulesWork,
  type Arrangement,
} from './arrangement'
import type { Note } from './note'
import { parseScore } from './parse'
import { reduceScore } from './reduce'

/**
 * A worked-out arrangement kept in the score: the rules sign what they write,
 * so their own work can be replaced and a person's never is, and their work
 * that has gone stale is set aside rather than stopping the score opening.
 */

const note = (id: string, pitch: number, start: number): Note => ({
  id,
  pitch,
  start,
  duration: 240,
  velocity: 80,
})
const notes = [note('a', 72, 0), note('b', 76, 0), note('c', 79, 0), note('d', 48, 0)]

const proposal: Arrangement = { id: 'generated-beginner', level: 'beginner', drop: ['b'] }

describe('the rules signing their work', () => {
  it('signs an arrangement with the rules and a digest of what it does', () => {
    const signed = signedByRules(proposal)
    expect(signed.generated).toEqual({
      rules: REDUCTION_RULES,
      digest: arrangementDigest(proposal),
    })
    expect(isRulesWork(signed)).toBe(true)
  })

  it('knows a person changed it the moment what it does changes, but not for a new name', () => {
    const signed = signedByRules(proposal)
    expect(isRulesWork({ ...signed, drop: ['b', 'c'] })).toBe(false)
    expect(isRulesWork({ ...signed, tempoScale: 0.5 })).toBe(false)
    expect(isRulesWork({ ...signed, label: 'Right hand, thinned' })).toBe(true)
    expect(isRulesWork(proposal)).toBe(false)
  })

  it('is what a reduction hands back', () => {
    const reduced = reduceScore(
      { formatVersion: 1, metadata: { title: 'Chords' }, notes },
      'beginner',
      { voices: 1, ornaments: false, chords: 'simplified' },
    )
    expect(reduced.arrangement).not.toBeNull()
    expect(isRulesWork(reduced.arrangement!)).toBe(true)
  })
})

describe('keeping a worked-out arrangement', () => {
  it('adds it where the score has nothing for the level', () => {
    const kept = keepArrangement([], proposal)
    expect(kept.kept).toBe(true)
    if (kept.kept) {
      expect(kept.arrangements).toHaveLength(1)
      expect(isRulesWork(kept.arrangements[0]!)).toBe(true)
    }
  })

  it('replaces the rules’ own earlier work for the level', () => {
    const earlier = signedByRules({ ...proposal, drop: ['c'] })
    const kept = keepArrangement([earlier], proposal)
    expect(kept.kept && kept.arrangements.map((one) => one.drop)).toEqual([['b']])
  })

  it('never replaces an arrangement somebody wrote, or corrected', () => {
    const written: Arrangement = { id: 'mine', level: 'beginner', label: 'Mine', parts: ['x'] }
    expect(keepArrangement([written], proposal)).toMatchObject({ kept: false })
    const corrected = { ...signedByRules(proposal), drop: ['b', 'd'] }
    const refusal = keepArrangement([corrected], proposal)
    expect(refusal.kept).toBe(false)
    if (!refusal.kept) {
      expect(refusal.reason).toContain('its own beginner arrangement')
    }
  })

  it('leaves the other levels as they were', () => {
    const other: Arrangement = { id: 'hard', level: 'advanced' }
    const kept = keepArrangement([other], proposal)
    expect(kept.kept && kept.arrangements.map((one) => one.id)).toEqual([
      'hard',
      'generated-beginner',
    ])
  })
})

describe('the rules’ work gone stale', () => {
  const stale = signedByRules({ ...proposal, drop: ['b', 'gone'] })

  it('is set aside when it names a note the score no longer has', () => {
    expect(withoutStaleRulesWork([stale], notes)).toEqual({ arrangements: [], setAside: [stale] })
  })

  it('keeps a person’s arrangement even when it is stale, since only they know what they meant', () => {
    const theirs = { ...stale, drop: ['gone'] }
    expect(withoutStaleRulesWork([theirs], notes).arrangements).toEqual([theirs])
  })

  it('lets a score open with a notice, rather than refusing it over a proposal', () => {
    const parsed = parseScore({
      formatVersion: 1,
      metadata: { title: 'Edited since' },
      notes,
      arrangements: [stale],
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.score.arrangements).toEqual([])
      expect(parsed.migrated.join(' ')).toContain('set aside')
    }
  })

  it('still refuses a person’s arrangement that names a note that is gone', () => {
    const parsed = parseScore({
      formatVersion: 1,
      metadata: { title: 'Edited since' },
      notes,
      arrangements: [{ ...stale, drop: ['gone'] }],
    })
    expect(parsed.ok).toBe(false)
  })

  it('keeps the signature through a save and a reopen', () => {
    const signed = signedByRules(proposal)
    const parsed = parseScore(
      JSON.parse(
        JSON.stringify({
          formatVersion: 1,
          metadata: { title: 'Kept' },
          notes,
          arrangements: [signed],
        }),
      ),
    )
    expect(parsed.ok && isRulesWork(parsed.score.arrangements![0]!)).toBe(true)
  })
})
