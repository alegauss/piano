import {
  arrangementForLevel,
  arrangementsOf,
  bundlingProblems,
  LEVELS,
  notesOf,
  parseScore,
  resolveArrangement,
  type Score,
} from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { BUNDLED_SCORES } from './index'

/**
 * The scores the installer carries, held to what shipping them promises: each
 * is valid, public domain with its source named, one at each level between
 * them, and each carries three arrangements somebody wrote, one per level,
 * that genuinely differ.
 */

const scores: Score[] = BUNDLED_SCORES.map((raw) => {
  const parsed = parseScore(raw)
  if (!parsed.ok) {
    throw new Error(parsed.message)
  }
  return parsed.score
})

describe('the scores the app ships with', () => {
  it('are valid, and none says anything the format had to guess', () => {
    for (const raw of BUNDLED_SCORES) {
      const parsed = parseScore(raw)
      expect(parsed.ok).toBe(true)
      if (parsed.ok) {
        expect(parsed.migrated).toEqual([])
      }
    }
  })

  it.each(scores.map((score) => [score.metadata.title, score] as const))(
    '%s names a public-domain source, as anything shipped must',
    (_title, score) => {
      expect(bundlingProblems(score.metadata)).toEqual([])
      expect(score.metadata.provenance?.source.length).toBeGreaterThan(20)
    },
  )

  it.each(scores.map((score) => [score.metadata.title, score] as const))(
    '%s carries a beginner, an intermediate and an advanced arrangement of its own',
    (_title, score) => {
      const authored = arrangementsOf(score)
      expect(authored.map((one) => one.level).sort()).toEqual([...LEVELS].sort())
      const played = LEVELS.map((level) => {
        const arrangement = arrangementForLevel(authored, level)
        expect(arrangement, level).not.toBeNull()
        const resolved = resolveArrangement(arrangement ?? authored[0]!, notesOf(score))
        return `${String(resolved.notes.length)}@${String(resolved.tempoScale)}`
      })
      // Three levels that are three different things to play.
      expect(new Set(played).size).toBe(3)
      // And the easiest is never more to play than the hardest.
      const counts = LEVELS.map(
        (level) =>
          resolveArrangement(arrangementForLevel(authored, level)!, notesOf(score)).notes.length,
      )
      expect(counts[0]).toBeLessThanOrEqual(counts[2] ?? 0)
    },
  )

  it('cover the three levels between them, the easiest first', () => {
    expect(scores.map((score) => score.metadata.level)).toEqual([...LEVELS])
  })

  it('open with the tunes they are named for', () => {
    const opening = (score: Score, count: number) =>
      notesOf(score)
        .filter((note) => note.hand === 'right')
        .sort((one, other) => one.start - other.start)
        .slice(0, count)
        .map((note) => note.pitch)
    // E E F G G F E D, and D G A B C D G G.
    expect(opening(scores[0]!, 8)).toEqual([64, 64, 65, 67, 67, 65, 64, 62])
    expect(opening(scores[1]!, 8)).toEqual([74, 67, 69, 71, 72, 74, 67, 67])
    // The first broken chord of the Prelude: G C E, twice.
    expect(opening(scores[2]!, 6)).toEqual([67, 72, 76, 67, 72, 76])
  })
})
