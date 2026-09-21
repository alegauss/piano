import { describe, expect, it } from 'vitest'

import {
  findOverlaps,
  noteEnd,
  noteProblems,
  pitchToSpelling,
  spellingToPitch,
  validateNotes,
  type Note,
} from './note'

function note(overrides: Partial<Note> = {}): Note {
  return { pitch: 60, start: 0, duration: 480, velocity: 80, ...overrides }
}

describe('spelling', () => {
  it('reads scientific pitch notation, where middle C is 60', () => {
    expect(spellingToPitch('C4')).toBe(60)
    expect(spellingToPitch('A0')).toBe(21)
    expect(spellingToPitch('C8')).toBe(108)
  })

  it('reads sharps and flats to the same pitch, which is the point of keeping both', () => {
    expect(spellingToPitch('A#3')).toBe(58)
    expect(spellingToPitch('Bb3')).toBe(58)
    expect(spellingToPitch('Cx4')).toBeNull()
    expect(spellingToPitch('C##4')).toBe(62)
    expect(spellingToPitch('Dbb4')).toBe(60)
  })

  it('refuses something that is not a note name', () => {
    for (const bad of ['H4', 'C', '4C', 'C10', 'C#-2', '']) {
      expect(spellingToPitch(bad), bad).toBeNull()
    }
  })

  it('offers a default spelling without writing it back into the score', () => {
    expect(pitchToSpelling(60)).toBe('C4')
    expect(pitchToSpelling(58)).toBe('A#3')
  })
})

describe('a single note', () => {
  it('accepts an ordinary one', () => {
    expect(noteProblems(note(), 0)).toEqual([])
  })

  it('knows where it stops', () => {
    expect(noteEnd(note({ start: 480, duration: 240 }))).toBe(720)
  })

  it.each([
    ['a pitch above the range', { pitch: 200 }],
    ['a fractional pitch', { pitch: 60.5 }],
    ['a negative start', { start: -1 }],
    ['a duration of nothing', { duration: 0 }],
    ['a velocity of zero, which is a note-off and not a note', { velocity: 0 }],
    ['a velocity past 127', { velocity: 128 }],
  ])('refuses %s', (_label, overrides) => {
    expect(noteProblems(note(overrides), 0).length).toBeGreaterThan(0)
  })

  it('refuses a spelling that contradicts the pitch it sits beside', () => {
    const problems = noteProblems(note({ pitch: 60, spelling: 'D4' }), 0)
    expect(problems).toHaveLength(1)
    expect(problems[0]?.message).toContain('but the note says 60')
  })

  it('accepts a spelling that agrees, in either direction', () => {
    expect(noteProblems(note({ pitch: 58, spelling: 'A#3' }), 0)).toEqual([])
    expect(noteProblems(note({ pitch: 58, spelling: 'Bb3' }), 0)).toEqual([])
  })

  it('names the note by its id when it has one', () => {
    expect(noteProblems(note({ id: 'n7', duration: 0 }), 3)[0]?.note).toBe('n7')
    expect(noteProblems(note({ duration: 0 }), 3)[0]?.note).toBe('note #3')
  })
})

describe('overlap', () => {
  it('refuses two notes of one pitch sounding at once in one voice', () => {
    const overlaps = findOverlaps([
      note({ id: 'a', pitch: 60, start: 0, duration: 480 }),
      note({ id: 'b', pitch: 60, start: 240, duration: 480 }),
    ])
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0]).toMatchObject({ first: 'a', second: 'b', pitch: 60, tick: 240, voice: 0 })
  })

  it('allows the same pitch at once in different voices, which is what voices are for', () => {
    expect(
      findOverlaps([
        note({ pitch: 60, start: 0, duration: 480, voice: 0 }),
        note({ pitch: 60, start: 240, duration: 480, voice: 1 }),
      ]),
    ).toEqual([])
  })

  it('allows two notes of one pitch that only touch', () => {
    // A note ending exactly where the next begins is a repeated note, not an
    // overlap: there is no moment when both are sounding.
    expect(
      findOverlaps([
        note({ pitch: 60, start: 0, duration: 480 }),
        note({ pitch: 60, start: 480, duration: 480 }),
      ]),
    ).toEqual([])
  })

  it('allows a chord, which is many pitches at once', () => {
    expect(
      findOverlaps([
        note({ pitch: 60, start: 0, duration: 480 }),
        note({ pitch: 64, start: 0, duration: 480 }),
        note({ pitch: 67, start: 0, duration: 480 }),
      ]),
    ).toEqual([])
  })

  it('finds an overlap however the notes were ordered in the file', () => {
    const overlaps = findOverlaps([
      note({ id: 'later', pitch: 72, start: 960, duration: 480 }),
      note({ id: 'earlier', pitch: 72, start: 720, duration: 480 }),
    ])
    expect(overlaps).toHaveLength(1)
    expect(overlaps[0]?.first).toBe('earlier')
    expect(overlaps[0]?.second).toBe('later')
  })
})

describe('validateNotes', () => {
  it('says nothing about a sound score', () => {
    expect(
      validateNotes([
        note({ pitch: 60, start: 0, duration: 480, hand: 'right', finger: 1 }),
        note({ pitch: 48, start: 0, duration: 960, hand: 'left', finger: 5 }),
      ]),
    ).toEqual([])
  })

  it('reports every problem in one pass rather than stopping at the first', () => {
    const messages = validateNotes([
      note({ id: 'a', duration: 0 }),
      note({ id: 'b', velocity: 0 }),
      note({ id: 'c', pitch: 60, start: 0, duration: 480 }),
      note({ id: 'd', pitch: 60, start: 100, duration: 480 }),
    ])
    expect(messages.length).toBeGreaterThanOrEqual(3)
    expect(messages.join('\n')).toContain('duration')
    expect(messages.join('\n')).toContain('velocity')
    expect(messages.join('\n')).toContain('overlap')
  })

  it('names both notes, the pitch and the tick, because a model reads this next', () => {
    const [message] = validateNotes([
      note({ id: 'n1', pitch: 64, start: 0, duration: 480 }),
      note({ id: 'n2', pitch: 64, start: 120, duration: 480 }),
    ])
    expect(message).toContain('n1')
    expect(message).toContain('n2')
    expect(message).toContain('64')
    expect(message).toContain('120')
  })
})

describe('a note round-trip', () => {
  it('keeps hand, voice and fingering through JSON', () => {
    const original = note({
      id: 'n1',
      pitch: 58,
      spelling: 'Bb3',
      start: 960,
      duration: 240,
      velocity: 97,
      voice: 1,
      hand: 'left',
      finger: 3,
      part: 'melody',
    })
    const round = JSON.parse(JSON.stringify(original)) as Note
    expect(round).toEqual(original)
    expect(noteProblems(round, 0)).toEqual([])
  })
})
