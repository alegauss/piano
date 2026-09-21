import { describe, expect, it } from 'vitest'

import type { Note } from './note'
import {
  audibleNotes,
  IMPLICIT_PART_ID,
  notesByPart,
  partOf,
  partsOf,
  validateParts,
  type Part,
} from './part'

function note(overrides: Partial<Note> = {}): Note {
  return { pitch: 60, start: 0, duration: 480, velocity: 80, ...overrides }
}

const melody: Part = { id: 'melody', name: 'Melody', colour: 'note-part-1', role: 'melody' }
const bass: Part = { id: 'bass', name: 'Bass', colour: 'note-part-2', role: 'bass' }

describe('a score with no parts', () => {
  it('gets one implicit part rather than none', () => {
    const parts = partsOf({})
    expect(parts).toHaveLength(1)
    expect(parts[0]?.id).toBe(IMPLICIT_PART_ID)
  })

  it('treats its notes as belonging to that part', () => {
    expect(partOf(note())).toBe(IMPLICIT_PART_ID)
    expect(audibleNotes([note(), note({ pitch: 64 })])).toHaveLength(2)
  })

  it('raises no complaint about the missing part table', () => {
    expect(validateParts(partsOf({}), [note()])).toEqual([])
  })
})

describe('grouping', () => {
  it('buckets notes by the part they name', () => {
    const notes = [
      note({ part: 'melody' }),
      note({ part: 'bass', pitch: 40 }),
      note({ part: 'melody', pitch: 64 }),
    ]
    const grouped = notesByPart([melody, bass], notes)
    expect(grouped.get('melody')).toHaveLength(2)
    expect(grouped.get('bass')).toHaveLength(1)
  })

  it('keeps a bucket for a declared part with no notes', () => {
    const grouped = notesByPart([melody, bass], [note({ part: 'melody' })])
    expect(grouped.get('bass')).toEqual([])
  })
})

describe('what is audible', () => {
  const notes = [
    note({ id: 'm', part: 'melody', hand: 'right', voice: 0 }),
    note({ id: 'b', part: 'bass', hand: 'left', voice: 1, pitch: 40 }),
  ]

  it('silences a muted part', () => {
    expect(audibleNotes(notes, { mutedParts: ['bass'] }).map((n) => n.id)).toEqual(['m'])
  })

  it('lets solo win over mute, as in every audio tool', () => {
    expect(
      audibleNotes(notes, { mutedParts: ['bass'], soloParts: ['bass'] }).map((n) => n.id),
    ).toEqual(['b'])
  })

  it('plays one hand without caring how the parts were split', () => {
    expect(audibleNotes(notes, { hands: ['left'] }).map((n) => n.id)).toEqual(['b'])
  })

  it('keeps a note that names no hand, because the score never said it had one', () => {
    const mixed = [...notes, note({ id: 'x', part: 'melody' })]
    expect(audibleNotes(mixed, { hands: ['left'] }).map((n) => n.id)).toEqual(['b', 'x'])
  })

  it('filters by voice', () => {
    expect(audibleNotes(notes, { voices: [1] }).map((n) => n.id)).toEqual(['b'])
  })

  it('plays everything when nothing is filtered', () => {
    expect(audibleNotes(notes, {})).toHaveLength(2)
    expect(audibleNotes(notes, { mutedParts: [], soloParts: [], hands: [] })).toHaveLength(2)
  })
})

describe('validateParts', () => {
  it('accepts a sound part table', () => {
    expect(validateParts([melody, bass], [note({ part: 'melody' })])).toEqual([])
  })

  it('refuses two parts sharing an id', () => {
    const messages = validateParts([melody, { ...bass, id: 'melody' }], [])
    expect(messages.join('\n')).toContain('share the id')
  })

  it('refuses a colour literal, because the roll must follow the theme', () => {
    const messages = validateParts([{ ...melody, colour: '#ff0000' }], [])
    expect(messages.join('\n')).toContain('note-part-1')
  })

  it('names a part the notes reference but the score never declared', () => {
    const messages = validateParts([melody], [note({ part: 'ghost' })])
    expect(messages).toHaveLength(1)
    expect(messages[0]).toContain('ghost')
  })

  it('names a missing part once, however many notes reference it', () => {
    const messages = validateParts([melody], [note({ part: 'ghost' }), note({ part: 'ghost' })])
    expect(messages).toHaveLength(1)
  })
})
