import { describe, expect, it } from 'vitest'

import type { Note } from './note'
import type { Score } from './score'
import { formatWarnings, scoreWarnings, type WarningKind } from './warnings'

/**
 * Each warning against the mistake it is for, and against the music that
 * looks like that mistake and is not, which is what keeps a warning worth
 * reading.
 */

const Q = 480
const BAR = 4 * Q

function note(pitch: number, start: number, duration: number, extra: Partial<Note> = {}): Note {
  return { pitch, start, duration, velocity: 80, ...extra }
}

const right = (pitch: number, start: number, duration = Q, extra: Partial<Note> = {}) =>
  note(pitch, start, duration, { hand: 'right', ...extra })
const left = (pitch: number, start: number, duration = Q, extra: Partial<Note> = {}) =>
  note(pitch, start, duration, { hand: 'left', ...extra })

function score(notes: readonly Note[], extra: Partial<Score> = {}): Score {
  return { formatVersion: 1, metadata: { title: 'Test' }, notes, ...extra }
}

/** Four quarters in each hand for a bar, so a bar is full unless a test says otherwise. */
function fullBar(bar: number, melody = 72, bass = 48): Note[] {
  return [0, 1, 2, 3].flatMap((beat) => [
    right(melody, bar * BAR + beat * Q),
    left(bass, bar * BAR + beat * Q),
  ])
}

const kinds = (notes: readonly Note[], extra: Partial<Score> = {}): WarningKind[] =>
  scoreWarnings(score(notes, extra)).map((warning) => warning.kind)

describe('a correct score', () => {
  it('has nothing to warn about', () => {
    expect(kinds([...fullBar(0), ...fullBar(1)])).toEqual([])
  })
})

describe('the hands crossing', () => {
  it('warns when the left hand sits above the right in a bar, naming both notes', () => {
    const warnings = scoreWarnings(score([right(60, 0, BAR), left(67, 0, BAR), ...fullBar(1)]))
    expect(warnings).toHaveLength(1)
    const [warning] = warnings
    expect(warning).toMatchObject({ kind: 'hands crossed', bar: 1, path: 'notes.1' })
    expect(warning?.received).toContain('G4 in the left hand')
    expect(warning?.received).toContain('C4 (notes.0)')
  })

  it('says nothing where they only share a note, or where no hand is named', () => {
    expect(kinds([right(60, 0, BAR), left(60, Q, 3 * Q), ...fullBar(1)])).toEqual([])
    expect(kinds([note(60, 0, Q), note(67, 0, Q), note(40, Q, 3 * Q)])).toEqual([])
  })
})

describe('a chord one hand cannot hold', () => {
  it('warns past an octave, whichever hand', () => {
    const notes = [right(60, 0, BAR), right(76, 0, BAR), left(36, 0, BAR), left(52, 0, BAR)]
    const warnings = scoreWarnings(score(notes))
    expect(warnings.map((one) => one.kind)).toEqual(['wide chord', 'wide chord'])
    expect(warnings[0]?.received).toContain('16 semitones')
  })

  it('lets an octave through, and a wide interval split between the hands', () => {
    expect(kinds([right(60, 0, BAR), right(72, 0, BAR)])).toEqual([])
    expect(kinds([left(40, 0, BAR), right(72, 0, BAR)])).toEqual([])
  })
})

describe('a line holding more than its bar', () => {
  it('warns when quarters are written as halves, and says what the duration should be', () => {
    const notes = [0, 1, 2, 3].map((beat) => right(72 + beat, beat * Q, 2 * Q))
    const warnings = scoreWarnings(score(notes))
    expect(warnings.map((one) => one.kind)).toEqual([
      'line overfull',
      'line overfull',
      'line overfull',
    ])
    expect(warnings[0]?.fix).toContain('give notes.0 a duration of 480')
  })

  it('leaves a held note under a figure, two voices, legato and a chord alone', () => {
    const figure = [0, 1, 2, 3].map((beat) => left(55 + beat, beat * Q, Q))
    expect(kinds([left(43, 0, BAR), ...figure])).toEqual([])
    const voices = [right(72, 0, 2 * Q), right(67, Q, 2 * Q, { voice: 1 })]
    expect(kinds(voices)).toEqual([])
    expect(kinds([right(72, 0, Q + 20), right(74, Q, Q)])).toEqual([])
    expect(kinds([right(72, 0, Q), right(76, 0, 2 * Q), right(79, Q, Q)])).toEqual([])
  })
})

describe('a bar cut short', () => {
  /** Three beats of four in bar 1, and the next bar on its downbeat. */
  const short = [
    ...[0, 1, 2].flatMap((beat) => [right(72, beat * Q), left(48, beat * Q)]),
    ...fullBar(1),
  ]

  it('warns when every hand stops a beat early and the music picks up on the downbeat', () => {
    const [warning] = scoreWarnings(score(short))
    expect(warning).toMatchObject({ kind: 'bar cut short', bar: 1 })
    expect(warning?.received).toContain('from beat 4')
    expect(warning?.received).toContain('1 beat before the next bar')
    expect(warning?.expected).toContain('4/4')
  })

  it('reads the meter of the bar, so three beats of 3/4 are a full bar', () => {
    const waltz = { timing: { timeSignatures: [{ tick: 0, numerator: 3, denominator: 4 }] } }
    const bars = [0, 1, 2, 3, 4, 5].map((beat) => right(72, beat * Q))
    expect(kinds(bars, waltz)).toEqual([])
  })

  it('lets the pedal carry the sound across', () => {
    const pedalled = {
      expression: { pedals: [{ tick: 0, pedal: 'sustain' as const, value: 127 }] },
    }
    expect(kinds(short, pedalled)).toEqual([])
  })

  it('leaves articulation, an entry off the downbeat, and the end of the piece alone', () => {
    const detached = [0, 1, 2, 3, 4].map((beat) => right(72, beat * Q, Q - 60))
    expect(kinds(detached)).toEqual([])
    const upbeat = [right(72, 0, 2 * Q), right(74, BAR - Q / 2, Q / 2), ...fullBar(1)]
    expect(kinds(upbeat)).toEqual([])
    expect(kinds([...fullBar(0), right(72, BAR, Q)])).toEqual([])
  })
})

describe('the warnings as prose', () => {
  it('names the bar beside the note, and counts past a few of one kind', () => {
    const notes = Array.from({ length: 6 }, (_, bar) => [
      right(60, bar * BAR, BAR),
      left(67, bar * BAR, BAR),
    ]).flat()
    const said = formatWarnings(scoreWarnings(score(notes)))
    expect(said).toContain('notes.1 (bar 1): expected the left hand below the right')
    expect(said).toContain('and 3 more warnings like these (3 hands crossed)')
  })

  it('counts one left over as one', () => {
    const notes = Array.from({ length: 4 }, (_, bar) => [
      right(60, bar * BAR, BAR),
      left(67, bar * BAR, BAR),
    ]).flat()
    expect(formatWarnings(scoreWarnings(score(notes)))).toContain(
      'and 1 more warning like this (1 hands crossed)',
    )
  })
})
