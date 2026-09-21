import { describe, expect, it } from 'vitest'

import {
  arrangementForLevel,
  arrangementsOf,
  resolveArrangement,
  validateArrangements,
  type Arrangement,
} from './arrangement'
import type { Note } from './note'

/** One authoritative source: a melody over an accompaniment, with an ornament. */
const source: Note[] = [
  { id: 'm1', pitch: 72, start: 0, duration: 480, velocity: 90, part: 'melody', hand: 'right' },
  { id: 'm2', pitch: 74, start: 480, duration: 480, velocity: 90, part: 'melody', hand: 'right' },
  { id: 'orn', pitch: 76, start: 460, duration: 20, velocity: 60, part: 'melody', hand: 'right' },
  { id: 'a1', pitch: 48, start: 0, duration: 240, velocity: 60, part: 'accomp', hand: 'left' },
  { id: 'a2', pitch: 52, start: 240, duration: 240, velocity: 60, part: 'accomp', hand: 'left' },
]

const parts = [{ id: 'melody' }, { id: 'accomp' }]

const arrangements: Arrangement[] = [
  {
    id: 'easy',
    level: 'beginner',
    label: 'Melody only',
    parts: ['melody'],
    drop: ['orn'],
    tempoScale: 0.66,
  },
  { id: 'middle', level: 'intermediate', drop: ['orn'], tempoScale: 0.85 },
  { id: 'full', level: 'advanced' },
]

describe('a score with no arrangements', () => {
  it('plays as written at advanced', () => {
    const [only] = arrangementsOf({})
    expect(only?.level).toBe('advanced')
    expect(resolveArrangement(only as Arrangement, source).notes).toHaveLength(source.length)
  })
})

describe('resolving a level', () => {
  it('produces a different note list per level from one source', () => {
    const resolved = arrangements.map((a) => resolveArrangement(a, source))
    const [easy, middle, full] = resolved

    expect(easy?.notes.map((n) => n.id)).toEqual(['m1', 'm2'])
    expect(middle?.notes.map((n) => n.id)).toEqual(['m1', 'm2', 'a1', 'a2'])
    expect(full?.notes).toHaveLength(5)
  })

  it('stores no note twice: the levels are views, not copies', () => {
    // Every note the levels play is the same object from the source, unless an
    // override deliberately changed it.
    const easy = resolveArrangement(arrangements[0] as Arrangement, source)
    for (const note of easy.notes) {
      expect(source).toContain(note)
    }
  })

  it('carries the tempo each level is meant to be played at', () => {
    expect(resolveArrangement(arrangements[0] as Arrangement, source).tempoScale).toBe(0.66)
    expect(resolveArrangement(arrangements[2] as Arrangement, source).tempoScale).toBe(1)
  })

  it('falls back to the level name when no label was written', () => {
    expect(resolveArrangement(arrangements[1] as Arrangement, source).label).toBe('intermediate')
  })
})

describe('fixing a wrong note', () => {
  it('corrects every level at once', () => {
    // The whole reason the levels are views. Correct the source and all three
    // change, with no per-level edit.
    const corrected = source.map((note) => (note.id === 'm2' ? { ...note, pitch: 75 } : note))

    for (const arrangement of arrangements) {
      const resolved = resolveArrangement(arrangement, corrected)
      const m2 = resolved.notes.find((note) => note.id === 'm2')
      expect(m2?.pitch, arrangement.id).toBe(75)
    }
  })

  it('leaves a level that deliberately overrode that note alone', () => {
    const withOverride: Arrangement = {
      id: 'easy',
      level: 'beginner',
      overrides: [{ id: 'm2', pitch: 60 }],
    }
    const resolved = resolveArrangement(withOverride, source)
    expect(resolved.notes.find((n) => n.id === 'm2')?.pitch).toBe(60)
  })
})

describe('overrides', () => {
  it('changes only the fields it names', () => {
    const arrangement: Arrangement = {
      id: 'x',
      level: 'beginner',
      overrides: [{ id: 'm1', velocity: 40 }],
    }
    const m1 = resolveArrangement(arrangement, source).notes.find((n) => n.id === 'm1')
    expect(m1?.velocity).toBe(40)
    // Everything else still follows the source.
    expect(m1?.pitch).toBe(72)
    expect(m1?.hand).toBe('right')
    expect(m1?.start).toBe(0)
  })

  it('does not resurrect a note the arrangement dropped', () => {
    const arrangement: Arrangement = {
      id: 'x',
      level: 'beginner',
      drop: ['orn'],
      overrides: [{ id: 'orn', velocity: 100 }],
    }
    expect(resolveArrangement(arrangement, source).notes.map((n) => n.id)).not.toContain('orn')
  })
})

describe('arrangementForLevel', () => {
  it('finds the arrangement for a level', () => {
    expect(arrangementForLevel(arrangements, 'beginner')?.id).toBe('easy')
  })

  it('answers nothing where the score offers no such level', () => {
    expect(arrangementForLevel([arrangements[2] as Arrangement], 'beginner')).toBeNull()
  })
})

describe('validateArrangements', () => {
  it('accepts a sound set', () => {
    expect(validateArrangements(arrangements, source, parts)).toEqual([])
  })

  it('refuses a drop naming a note the score does not carry', () => {
    expect(
      validateArrangements([{ id: 'x', level: 'beginner', drop: ['ghost'] }], source, parts).join(
        '\n',
      ),
    ).toContain('ghost')
  })

  it('refuses a part the score does not declare', () => {
    expect(
      validateArrangements([{ id: 'x', level: 'beginner', parts: ['brass'] }], source, parts).join(
        '\n',
      ),
    ).toContain('brass')
  })

  it('refuses a tempo scale of zero or less', () => {
    expect(
      validateArrangements([{ id: 'x', level: 'beginner', tempoScale: 0 }], source, parts).join(
        '\n',
      ),
    ).toContain('above zero')
  })

  it('says so when notes have no ids but an arrangement names some', () => {
    const anonymous: Note[] = [{ pitch: 60, start: 0, duration: 480, velocity: 80 }]
    expect(
      validateArrangements([{ id: 'x', level: 'beginner', drop: ['a'] }], anonymous, parts).join(
        '\n',
      ),
    ).toContain('no id')
  })

  it('asks for no ids from a score whose arrangements only filter', () => {
    const anonymous: Note[] = [{ pitch: 60, start: 0, duration: 480, velocity: 80 }]
    expect(
      validateArrangements([{ id: 'x', level: 'beginner', voices: [0] }], anonymous, parts),
    ).toEqual([])
  })
})
