import type { Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import {
  clock,
  correctionOf,
  describeFiling,
  difficultyOf,
  filingFor,
  filingOf,
  tagsOf,
  withMetadata,
} from './library'

const imported: Score = {
  formatVersion: 1,
  metadata: { title: 'track 1', key: 'C major' },
  notes: [{ pitch: 72, start: 0, duration: 480, velocity: 80 }],
}

describe('what the window says after filing a piece', () => {
  it('names the title and the id it went in under', () => {
    expect(describeFiling({ kind: 'filed', id: 'aria-in-c', title: 'Aria in C' })).toBe(
      'Added Aria in C to the library, as aria-in-c.',
    )
  })

  it('passes the reason on when it was refused', () => {
    expect(describeFiling({ kind: 'refused', message: 'the disk is full' })).toBe(
      'Could not add it to the library: the disk is full',
    )
  })
})

describe('the form the filing door opens with', () => {
  it('starts from what the import did work out, and empty where it knew nothing', () => {
    expect(filingFor(imported)).toEqual({
      title: 'track 1',
      composer: '',
      level: null,
      difficulty: '',
      tags: '',
    })
  })

  it('starts from the piece itself where it is already described', () => {
    const described: Score = {
      ...imported,
      metadata: {
        title: 'Prelude',
        composer: 'Bach',
        level: 'intermediate',
        difficulty: 6,
        tags: ['baroque', 'study'],
      },
    }
    expect(filingFor(described)).toEqual({
      title: 'Prelude',
      composer: 'Bach',
      level: 'intermediate',
      difficulty: '6',
      tags: 'baroque, study',
    })
  })

  it('fills from a library row too, which is all the form asks about', () => {
    expect(
      filingOf({
        title: 'Étude',
        composer: 'Chopin',
        level: 'advanced',
        difficulty: 9,
        tags: ['romantic'],
      }),
    ).toEqual({
      title: 'Étude',
      composer: 'Chopin',
      level: 'advanced',
      difficulty: '9',
      tags: 'romantic',
    })
  })
})

describe('how hard a piece is, as the field holds it', () => {
  it('takes one to ten', () => {
    expect(difficultyOf('1')).toBe(1)
    expect(difficultyOf(' 10 ')).toBe(10)
  })

  it('answers nothing for a piece nobody has graded', () => {
    expect(difficultyOf('')).toBeNull()
    expect(difficultyOf('   ')).toBeNull()
  })

  it('answers nothing for what the format would refuse', () => {
    for (const written of ['0', '11', '4.5', 'hard', '-3']) {
      expect(difficultyOf(written)).toBeNull()
    }
  })
})

describe('what a filled-in form says the piece is', () => {
  it('carries the five fields the library keeps', () => {
    expect(
      correctionOf({
        title: ' Prelude in C ',
        composer: ' Bach ',
        level: 'beginner',
        difficulty: '3',
        tags: 'baroque, study',
      }),
    ).toEqual({
      title: 'Prelude in C',
      composer: 'Bach',
      level: 'beginner',
      difficulty: 3,
      tags: ['baroque', 'study'],
    })
  })

  it('leaves out what was cleared, which is what removes it', () => {
    expect(
      correctionOf({ title: 'Prelude', composer: '  ', level: null, difficulty: '', tags: '' }),
    ).toEqual({ title: 'Prelude' })
  })
})

describe('how long a piece lasts, as a list says it', () => {
  it('reads as minutes and seconds, rounded to the nearest', () => {
    expect(clock(0)).toBe('0:00')
    expect(clock(59.6)).toBe('1:00')
    expect(clock(125)).toBe('2:05')
  })
})

describe('the tags a line of free words holds', () => {
  it('takes the words, trimmed, and drops the empties a stray comma leaves', () => {
    expect(tagsOf(' baroque , study ,, ')).toEqual(['baroque', 'study'])
  })

  it('keeps each word once, since a tag twice narrows nothing', () => {
    expect(tagsOf('study, study')).toEqual(['study'])
  })

  it('answers nothing for a line with no words in it', () => {
    expect(tagsOf('   ')).toEqual([])
  })
})

describe('the score as the form describes it', () => {
  it('writes the fields it owns in and leaves everything else alone', () => {
    const filed = withMetadata(imported, {
      title: 'Prelude in C',
      composer: 'Bach',
      level: 'beginner',
      difficulty: '',
      tags: 'baroque, study',
    })

    expect(filed.metadata).toEqual({
      title: 'Prelude in C',
      composer: 'Bach',
      level: 'beginner',
      tags: ['baroque', 'study'],
      // The key the import read out of the file is not the form's to touch.
      key: 'C major',
    })
    expect(filed.notes).toEqual(imported.notes)
  })

  it('removes what was cleared out rather than filing an empty one', () => {
    const described: Score = {
      ...imported,
      metadata: { title: 'Prelude', composer: 'Nobody', level: 'advanced', tags: ['wrong'] },
    }
    const filed = withMetadata(described, {
      title: 'Prelude',
      composer: '  ',
      level: null,
      difficulty: '',
      tags: '',
    })

    expect(filed.metadata).toEqual({ title: 'Prelude' })
  })

  it('keeps a difficulty the form never showed, so filing does not ungrade a piece', () => {
    const graded: Score = { ...imported, metadata: { title: 'Prelude', difficulty: 7 } }
    const filed = withMetadata(graded, filingFor(graded))
    expect(filed.metadata.difficulty).toBe(7)
  })

  it('keeps the title it had rather than filing a piece with none', () => {
    const filed = withMetadata(imported, {
      title: '   ',
      composer: '',
      level: null,
      difficulty: '',
      tags: '',
    })
    expect(filed.metadata.title).toBe('track 1')
  })
})
