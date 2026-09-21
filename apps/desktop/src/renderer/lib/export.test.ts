import type { Note, Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { describeExport, exportedScore } from './export'

const written: Note[] = [
  { id: 'a', pitch: 60, start: 0, duration: 480, velocity: 80 },
  { id: 'b', pitch: 64, start: 480, duration: 480, velocity: 80 },
]

const score: Score = {
  formatVersion: 1,
  metadata: { title: 'Study' },
  notes: written,
  arrangements: [{ id: 'easy', level: 'beginner', drop: ['b'], tempoScale: 0.5 }],
}

describe('what saving as MIDI sends', () => {
  it('is the score as written when no level is chosen', () => {
    expect(exportedScore(score, written, null)).toBe(score)
  })

  it('leaves out a part the level does not play', () => {
    const twoParts: Score = {
      ...score,
      parts: [
        { id: 'tune', name: 'Tune' },
        { id: 'bass', name: 'Bass' },
      ],
      notes: [
        { pitch: 72, start: 0, duration: 480, velocity: 80, part: 'tune' },
        { pitch: 48, start: 0, duration: 480, velocity: 60, part: 'bass' },
      ],
    }
    const sent = exportedScore(twoParts, [twoParts.notes![0]!], 'beginner')
    expect(sent.parts?.map((part) => part.id)).toEqual(['tune'])
  })

  it('is the version being played at a level, with one version of the music in it', () => {
    const sent = exportedScore(score, [written[0]!], 'beginner')
    expect(sent.notes).toEqual([written[0]])
    expect(sent).not.toHaveProperty('arrangements')
    expect(sent.metadata.title).toBe('Study')
  })
})

describe('what the window says afterwards', () => {
  it('names the file, and what the file could not keep', () => {
    expect(describeExport({ kind: 'saved', name: 'Study.mid', dropped: [] })).toBe(
      'Saved Study.mid.',
    )
    expect(
      describeExport({ kind: 'saved', name: 'Study.mid', dropped: ['2 fingerings', '1 section'] }),
    ).toBe('Saved Study.mid. A MIDI file has nowhere to put 2 fingerings; 1 section.')
  })

  it('says nothing when the dialog was closed, and why when it could not save', () => {
    expect(describeExport({ kind: 'cancelled' })).toBeNull()
    expect(describeExport({ kind: 'refused', message: 'no disk' })).toBe(
      'Could not save as MIDI: no disk',
    )
  })
})
