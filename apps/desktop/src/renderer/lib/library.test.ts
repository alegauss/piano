import type { Score } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { describeFiling, filingFor, tagsOf, withMetadata } from './library'

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
    expect(filingFor(imported)).toEqual({ title: 'track 1', composer: '', level: null, tags: '' })
  })

  it('starts from the piece itself where it is already described', () => {
    const described: Score = {
      ...imported,
      metadata: {
        title: 'Prelude',
        composer: 'Bach',
        level: 'intermediate',
        tags: ['baroque', 'study'],
      },
    }
    expect(filingFor(described)).toEqual({
      title: 'Prelude',
      composer: 'Bach',
      level: 'intermediate',
      tags: 'baroque, study',
    })
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
  it('writes the three fields in and leaves everything else alone', () => {
    const filed = withMetadata(imported, {
      title: 'Prelude in C',
      composer: 'Bach',
      level: 'beginner',
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
      tags: '',
    })

    expect(filed.metadata).toEqual({ title: 'Prelude' })
  })

  it('keeps the title it had rather than filing a piece with none', () => {
    const filed = withMetadata(imported, { title: '   ', composer: '', level: null, tags: '' })
    expect(filed.metadata.title).toBe('track 1')
  })
})
