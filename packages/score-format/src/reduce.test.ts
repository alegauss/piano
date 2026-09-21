import { describe, expect, it } from 'vitest'

import { arrangementForLevel, resolveArrangement } from './arrangement'
import { VALID_FIXTURES } from './fixtures/index'
import type { Note } from './note'
import { parseScore } from './parse'
import {
  accompanies,
  chordsOf,
  dropOrnaments,
  foldWideChords,
  KEEP_EVERYTHING,
  keepTopVoices,
  reduceScore,
  rolesOf,
  thinChords,
  thinFigures,
  type Reduction,
} from './reduce'
import { partsOf } from './part'
import { notesOf, timingOf, type Score } from './score'
import { resolveTiming } from './time'

/**
 * Each rule on its own, and then the pipeline over the reference scores.
 *
 * The failure worth catching is not a reduction that is too hard: it is one
 * that is technically simpler and musically unrecognisable, so most of what is
 * asserted here is what survived rather than what went.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const NO_ROLES = rolesOf([])

function note(pitch: number, start: number, over: Partial<Note> = {}): Note {
  return { pitch, start, duration: QUARTER, velocity: 80, ...over }
}

function pitches(notes: readonly Note[]): number[] {
  return notes.map((one) => one.pitch)
}

const BEGINNER: Reduction = { voices: 1, ornaments: false, chords: 'simplified' }

describe('keeping the top voices', () => {
  const twoVoices = [
    note(72, 0, { voice: 0, hand: 'right' }),
    note(64, 0, { voice: 1, hand: 'right' }),
    note(48, 0, { voice: 0, hand: 'left' }),
  ]

  it('keeps the highest voice of each hand, not the highest in the piece', () => {
    expect(pitches(keepTopVoices(twoVoices, 1))).toEqual([72, 48])
  })

  it('keeps what the score wrote when a level asks for everything', () => {
    expect(keepTopVoices(twoVoices, null)).toHaveLength(3)
  })

  it('never leaves a hand with nothing', () => {
    expect(keepTopVoices(twoVoices, 0).length).toBeGreaterThan(0)
  })
})

describe('taking a chord down to its outer notes', () => {
  it('keeps the bass and the top, and drops the filling', () => {
    const chord = [note(48, 0), note(55, 0), note(60, 0), note(64, 0)]
    expect(pitches(thinChords(chord)).sort((a, b) => a - b)).toEqual([48, 64])
  })

  it('leaves a two-note chord and a single note alone', () => {
    const notes = [note(48, 0), note(60, 0), note(72, QUARTER)]
    expect(thinChords(notes)).toHaveLength(3)
  })

  it('reads a hand at a time: what each hand holds is its own chord', () => {
    const notes = [
      note(72, 0, { hand: 'right' }),
      note(48, 0, { hand: 'left' }),
      note(52, 0, { hand: 'left' }),
      note(55, 0, { hand: 'left' }),
    ]
    // The right hand's single note survives; the left loses its middle.
    expect(pitches(thinChords(notes)).sort((a, b) => a - b)).toEqual([48, 55, 72])
  })

  it('groups notes struck within a few ticks of each other', () => {
    const spread = [note(48, 0), note(55, 10), note(60, 20)]
    expect(chordsOf(spread)).toHaveLength(1)
    expect(chordsOf(spread, 5)).toHaveLength(3)
  })
})

describe('dropping ornaments', () => {
  it('drops a grace note leaning on a long one', () => {
    const notes = [
      note(72, 0, { duration: 4 * QUARTER, hand: 'right' }),
      note(74, 0, { duration: 20, hand: 'right' }),
    ]
    expect(pitches(dropOrnaments(notes, timing))).toEqual([72])
  })

  it('keeps a fast passage, where every note is short', () => {
    const run = [0, 30, 60, 90].map((start) => note(60 + start / 30, start, { duration: 30 }))
    expect(dropOrnaments(run, timing)).toHaveLength(4)
  })

  it('keeps a short note standing on its own', () => {
    const notes = [note(72, 0, { duration: 20 }), note(74, 4 * QUARTER, { duration: 4 * QUARTER })]
    expect(dropOrnaments(notes, timing)).toHaveLength(2)
  })
})

describe('thinning a repeated figure', () => {
  const roles = rolesOf([{ id: 'bass', name: 'Bass', role: 'bass' }])
  const alberti = [0, 120, 240, 360].map((start) =>
    note(48 + (start % 240) / 120, start, { duration: 120, part: 'bass', hand: 'left' }),
  )

  it('leaves one attack a beat where a beat held four', () => {
    const thinned = thinFigures(alberti, timing, roles)
    expect(thinned).toHaveLength(1)
    expect(thinned[0]?.start).toBe(0)
  })

  it('leaves two quavers alone, since that is a rhythm somebody wrote', () => {
    const quavers = [0, 240].map((start) =>
      note(48, start, { duration: 240, part: 'bass', hand: 'left' }),
    )
    expect(thinFigures(quavers, timing, roles)).toHaveLength(2)
  })

  it('never thins the melody', () => {
    const melody = [0, 120, 240, 360].map((start) =>
      note(72, start, { duration: 120, part: 'tune', hand: 'right' }),
    )
    const both = rolesOf([
      { id: 'tune', name: 'Tune', role: 'melody' },
      { id: 'bass', name: 'Bass', role: 'bass' },
    ])
    expect(thinFigures(melody, timing, both)).toHaveLength(4)
  })

  it('takes the left hand for accompaniment where no part says otherwise', () => {
    expect(accompanies(note(48, 0, { hand: 'left' }), NO_ROLES)).toBe(true)
    expect(accompanies(note(72, 0, { hand: 'right' }), NO_ROLES)).toBe(false)
  })
})

describe('folding a chord nobody can reach', () => {
  const roles = rolesOf([{ id: 'bass', name: 'Bass', role: 'bass' }])

  it('leaves the bass note of a tenth in the left hand', () => {
    const wide = [
      note(36, 0, { part: 'bass', hand: 'left' }),
      note(52, 0, { part: 'bass', hand: 'left' }),
    ]
    expect(pitches(foldWideChords(wide, roles))).toEqual([36])
  })

  it('leaves an octave alone, which is a stretch people have', () => {
    const octave = [
      note(36, 0, { part: 'bass', hand: 'left' }),
      note(48, 0, { part: 'bass', hand: 'left' }),
    ]
    expect(foldWideChords(octave, roles)).toHaveLength(2)
  })

  it('never folds the melody onto its lowest note', () => {
    const melody = [
      note(60, 0, { part: 'tune', hand: 'right' }),
      note(79, 0, { part: 'tune', hand: 'right' }),
    ]
    const both = rolesOf([{ id: 'tune', name: 'Tune', role: 'melody' }])
    expect(foldWideChords(melody, both)).toHaveLength(2)
  })
})

describe('the reduction as a whole', () => {
  const score = VALID_FIXTURES['three-levels'] as unknown as Score

  it('changes nothing where the level asks for everything', () => {
    const reduced = reduceScore(score, 'advanced', KEEP_EVERYTHING)
    expect(reduced.notes).toHaveLength(notesOf(score).length)
    expect(reduced.cuts).toEqual([])
  })

  it('takes the ornament out at beginner and says which rule took it', () => {
    const reduced = reduceScore(score, 'beginner', BEGINNER)
    expect(reduced.notes.map((one) => one.id)).not.toContain('orn')
    expect(reduced.cuts.map((cut) => cut.rule)).toContain('ornaments')
  })

  it('writes itself down as an arrangement naming what it left out', () => {
    const reduced = reduceScore(score, 'beginner', BEGINNER)
    expect(reduced.arrangement?.drop).toEqual(['orn'])
    expect(reduced.arrangement?.level).toBe('beginner')
    expect(reduced.arrangement?.tempoScale).toBeUndefined()
    expect(reduced.anonymous).toBe(0)
    // And it resolves back to exactly the notes the rules kept.
    const resolved = resolveArrangement(
      reduced.arrangement ?? { id: 'x', level: 'beginner' },
      notesOf(score),
    )
    expect(resolved.notes).toEqual(reduced.notes)
  })

  it('cannot write itself down where the notes it drops have no id', () => {
    const anonymous: Score = {
      formatVersion: 1,
      metadata: { title: 'No ids' },
      notes: [
        { pitch: 72, start: 0, duration: 4 * QUARTER, velocity: 80, hand: 'right' },
        { pitch: 74, start: 0, duration: 20, velocity: 60, hand: 'right' },
      ],
    }
    const reduced = reduceScore(anonymous, 'beginner', BEGINNER)
    expect(reduced.notes).toHaveLength(1)
    expect(reduced.arrangement).toBeNull()
    expect(reduced.anonymous).toBe(1)
  })

  it('never invents a note, whatever the score and the level', () => {
    for (const [name, fixture] of Object.entries(VALID_FIXTURES)) {
      const one = fixture as unknown as Score
      const source = notesOf(one)
      for (const wants of [BEGINNER, KEEP_EVERYTHING]) {
        const reduced = reduceScore(one, 'beginner', wants)
        expect(reduced.notes.length, name).toBeLessThanOrEqual(source.length)
        for (const kept of reduced.notes) {
          expect(source, name).toContain(kept)
        }
      }
    }
  })

  it('leaves a piece with something to play at every level', () => {
    for (const [name, fixture] of Object.entries(VALID_FIXTURES)) {
      const one = fixture as unknown as Score
      if (notesOf(one).length === 0) {
        continue
      }
      expect(reduceScore(one, 'beginner', BEGINNER).notes.length, name).toBeGreaterThan(0)
    }
  })

  it('leaves every reference score still valid after reducing it', () => {
    for (const [name, fixture] of Object.entries(VALID_FIXTURES)) {
      const one = fixture as unknown as Score
      const reduced = reduceScore(one, 'beginner', BEGINNER)
      if (reduced.arrangement === null) {
        continue
      }
      const next = { ...one, arrangements: [...(one.arrangements ?? []), reduced.arrangement] }
      const parsed = parseScore(next)
      expect(parsed.ok ? [] : parsed.problems, name).toEqual([])
    }
  })

  it('reduces by the part table rather than by the hand where the score fills it in', () => {
    const roles = rolesOf(partsOf(score))
    expect(accompanies(notesOf(score)[0] as Note, roles)).toBe(false)
    expect(accompanies(notesOf(score)[2] as Note, roles)).toBe(true)
  })

  it('is what a level falls back to, since a hand-authored arrangement wins', () => {
    // The fixture carries its own beginner arrangement, which keeps the
    // melody part alone; nothing generated is consulted while it exists.
    const authored = arrangementForLevel(score.arrangements ?? [], 'beginner')
    expect(authored?.id).toBe('easy')
    expect(
      resolveArrangement(authored ?? { id: 'x', level: 'beginner' }, notesOf(score)).notes.map(
        (one) => one.id,
      ),
    ).toEqual(['m1'])
  })
})

describe('what the rules count as one chord', () => {
  it('uses the timing the piece was written against', () => {
    const score = VALID_FIXTURES['meter-change'] as unknown as Score
    expect(timingOf(score).ticksPerQuarter).toBeGreaterThan(0)
    expect(reduceScore(score, 'beginner', BEGINNER).notes.length).toBeGreaterThan(0)
  })
})
