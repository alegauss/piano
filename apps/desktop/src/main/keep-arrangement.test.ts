import {
  isRulesWork,
  parseScore,
  reduceScore,
  type Arrangement,
  type Score,
} from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { keepInFile, type KeepFiles } from './keep-arrangement'

/**
 * Keeping a worked-out arrangement in the open score's file, with the disk in
 * a map: what is written, what is refused, and that a person's work wins.
 */

const score: Score = {
  formatVersion: 1,
  metadata: { title: 'Chords' },
  notes: [
    { id: 'a', pitch: 72, start: 0, duration: 480, velocity: 80 },
    { id: 'b', pitch: 76, start: 0, duration: 480, velocity: 80 },
    { id: 'c', pitch: 79, start: 0, duration: 480, velocity: 80 },
  ],
}

const proposal = reduceScore(score, 'beginner', {
  voices: 1,
  ornaments: false,
  chords: 'simplified',
}).arrangement as Arrangement

function disk(files: Record<string, string>): KeepFiles & { readonly held: Map<string, string> } {
  const held = new Map(Object.entries(files))
  return {
    held,
    read: (path) => {
      const text = held.get(path)
      return text === undefined ? Promise.reject(new Error('gone')) : Promise.resolve(text)
    },
    write: (path, text) => {
      held.set(path, text)
      return Promise.resolve()
    },
  }
}

describe('keeping a worked-out arrangement in the score', () => {
  it('writes it into the open file, signed as the rules’ work, and hands back the score', async () => {
    const files = disk({ '/music/chords.score.json': JSON.stringify(score) })
    const result = await keepInFile('/music/chords.score.json', proposal, files)
    expect(result).toMatchObject({ kind: 'kept', name: 'chords.score.json' })

    const reopened = parseScore(JSON.parse(files.held.get('/music/chords.score.json') ?? ''))
    expect(reopened.ok).toBe(true)
    if (reopened.ok) {
      const kept = reopened.score.arrangements?.[0]
      expect(kept?.level).toBe('beginner')
      expect(kept === undefined ? false : isRulesWork(kept)).toBe(true)
    }
  })

  it('replaces its own earlier work rather than keeping two', async () => {
    const files = disk({ '/music/chords.score.json': JSON.stringify(score) })
    await keepInFile('/music/chords.score.json', proposal, files)
    const again = await keepInFile('/music/chords.score.json', proposal, files)
    expect(again.kind).toBe('kept')
    const written = JSON.parse(files.held.get('/music/chords.score.json') ?? '') as Score
    expect(written.arrangements).toHaveLength(1)
  })

  it('leaves a score’s own arrangement for the level alone, and says so', async () => {
    const own = { ...score, arrangements: [{ id: 'mine', level: 'beginner', label: 'Mine' }] }
    const files = disk({ '/music/chords.score.json': JSON.stringify(own) })
    const result = await keepInFile('/music/chords.score.json', proposal, files)
    expect(result.kind).toBe('refused')
    expect(files.held.get('/music/chords.score.json')).toBe(JSON.stringify(own))
  })

  it('refuses where there is no score file to keep it in', async () => {
    const files = disk({ '/music/tune.mid': 'MThd' })
    expect((await keepInFile(null, proposal, files)).kind).toBe('refused')
    expect((await keepInFile('/music/tune.mid', proposal, files)).kind).toBe('refused')
    expect((await keepInFile('/music/gone.score.json', proposal, files)).kind).toBe('refused')
  })

  it('refuses an arrangement naming notes the file does not carry, and writes nothing', async () => {
    const files = disk({ '/music/chords.score.json': JSON.stringify(score) })
    const stray = { id: 'generated-beginner', level: 'beginner', drop: ['nowhere'] }
    const result = await keepInFile('/music/chords.score.json', stray, files)
    expect(result.kind).toBe('refused')
    expect(files.held.get('/music/chords.score.json')).toBe(JSON.stringify(score))
  })

  it('refuses what is not an arrangement at all', async () => {
    const files = disk({ '/music/chords.score.json': JSON.stringify(score) })
    expect((await keepInFile('/music/chords.score.json', { level: 'expert' }, files)).kind).toBe(
      'refused',
    )
  })
})
