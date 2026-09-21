import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { planSheet } from './sheet'
import { readings } from './sheet-readings'

/**
 * What the page admits to having decided.
 *
 * Every sentence here is about the piece rather than about this codebase, and
 * only the readings that actually apply are said: a page that inferred nothing
 * unusual should not hand somebody a list of caveats to wade through.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4
const WIDTH = 1040

const note = (start: number, duration: number, rest: Partial<Note> = {}): Note => ({
  pitch: 60,
  start,
  duration,
  velocity: 80,
  ...rest,
})

const said = (notes: readonly Note[], key?: string): string[] => {
  const plan = planSheet({ timing, notes, width: WIDTH, ...(key === undefined ? {} : { key }) })
  return readings({ timing, notes, plan, ...(key === undefined ? {} : { key }) })
}

/** One sentence holding this text, or a failure naming what was said instead. */
const about = (sentences: readonly string[], text: string): string => {
  const found = sentences.filter((one) => one.includes(text))
  expect(found, `nothing said about "${text}" in ${JSON.stringify(sentences)}`).toHaveLength(1)
  return found[0] ?? ''
}

describe('readings', () => {
  it('has nothing to say about a page with nothing on it', () => {
    expect(said([])).toEqual([])
  })

  it('names which clef came from which hand', () => {
    const both = said([
      note(0, BAR, { hand: 'right', pitch: 72, spelling: 'C5' }),
      note(0, BAR, { hand: 'left', pitch: 48, spelling: 'C3' }),
    ])
    expect(about(both, 'treble stave is the right hand')).toContain('no clefs')
  })

  it('says so when one stave is standing in for no hands at all', () => {
    expect(about(said([note(0, BAR, { spelling: 'C4' })]), 'one treble stave')).toContain(
      'neither hands nor clefs',
    )
  })

  it('says the signature it used and that it holds for the whole piece', () => {
    expect(about(said([note(0, BAR, { spelling: 'C4' })], 'Bb'), 'key signature is Bb')).toContain(
      'records a key change',
    )
  })

  it('quotes a key it could not read, rather than saying nothing', () => {
    expect(about(said([note(0, BAR, { spelling: 'C4' })], 'modal-ish'), '"modal-ish"')).toContain(
      'not one a signature spells',
    )
  })

  it('says there is no signature where the score names no key', () => {
    expect(said([note(0, BAR, { spelling: 'C4' })])).toContain(
      'No key signature: the score names no key.',
    )
  })

  it('admits the sharps-upward fallback where nothing was spelled', () => {
    expect(about(said([note(0, BAR)]), 'Every accidental is a sharp')).toContain('upward')
  })

  it('counts the notes it had to spell itself where only some were spelled', () => {
    const mixed = said([note(0, QUARTER, { spelling: 'C4' }), note(QUARTER, QUARTER * 3)])
    expect(about(mixed, 'spelled with sharps')).toContain('1 note is')
  })

  it('claims nothing about accidentals where the score spelled every note', () => {
    const spelled = said([note(0, BAR, { spelling: 'C4' })])
    expect(about(spelled, 'Accidentals are the ones the score spelled out')).not.toBe('')
  })

  it('says a rest is a gap, and counts the ones a short bar left', () => {
    // A bar holding one quarter: three beats of it are silence nobody wrote.
    const short = said([note(0, QUARTER, { spelling: 'C4' })])
    expect(about(short, 'a gap in the score')).toContain('does not add up')
  })

  it('says nothing about rests on a page that has none', () => {
    const full = said([note(0, BAR, { spelling: 'C4' })])
    expect(full.filter((one) => one.includes('gap in the score'))).toEqual([])
  })

  it('says a note held over a barline is drawn as two figures with no tie', () => {
    // Beat 4 of bar 1, held a half note long into bar 2.
    const over = said([note(BAR - QUARTER, QUARTER * 2, { spelling: 'C4' })])
    expect(about(over, 'crosses a barline')).toContain('no ties')
    expect(about(over, 'crosses a barline')).toContain('1 note')
  })

  it('counts a long note crossing several barlines once', () => {
    const long = said([note(0, BAR * 3, { spelling: 'C4' })])
    expect(about(long, 'crosses a barline')).toContain('1 note')
  })

  it('says nothing about ties where no note leaves its bar', () => {
    const inside = said([note(0, BAR, { spelling: 'C4' })])
    expect(inside.filter((one) => one.includes('barline'))).toEqual([])
  })

  it('owns up to a figure it rounded, which a triplet is', () => {
    const triplet = said([
      note(0, 160, { spelling: 'C4' }),
      note(160, 160, { spelling: 'C4' }),
      note(320, 160, { spelling: 'C4' }),
      note(BAR - QUARTER * 3, QUARTER * 3, { spelling: 'C4' }),
    ])
    expect(about(triplet, 'nearest note value')).toContain('rounded away')
  })

  it('says a held note under another loses its own figure', () => {
    const under = said([
      note(0, BAR, { hand: 'left', pitch: 48, spelling: 'C3' }),
      note(QUARTER * 2, QUARTER * 2, { hand: 'left', pitch: 55, spelling: 'G3' }),
      note(0, BAR, { hand: 'right', pitch: 72, spelling: 'C5' }),
    ])
    expect(about(under, 'notes under other notes')).toContain('left hand holds')
  })

  it('says nothing about held notes where each hand plays one line', () => {
    const plain = said([
      note(0, QUARTER * 2, { hand: 'left', pitch: 48, spelling: 'C3' }),
      note(QUARTER * 2, QUARTER * 2, { hand: 'left', pitch: 55, spelling: 'G3' }),
    ])
    expect(plain.filter((one) => one.includes('under other notes'))).toEqual([])
  })

  it('says an odd meter was left unbeamed, so loose flags are not an oversight', () => {
    const seven = resolveTiming({ timeSignatures: [{ tick: 0, numerator: 7, denominator: 8 }] })
    const notes = [note(0, QUARTER, { spelling: 'C4' })]
    const plan = planSheet({ timing: seven, notes, width: WIDTH })
    const out = readings({ timing: seven, notes, plan })
    expect(about(out, 'Nothing in 7/8 is beamed')).toContain('flags claim less')
  })

  it('says nothing about beaming in a meter that has a beat', () => {
    const plain = said([note(0, BAR, { spelling: 'C4' })])
    expect(plain.filter((one) => one.includes('beamed'))).toEqual([])
  })

  it('reads a score with no key, mixed hands and a short bar', () => {
    // The case the whole thing exists for: three separate inferences at once.
    const messy = said([
      note(0, QUARTER, { hand: 'right', pitch: 73 }),
      note(0, QUARTER, { hand: 'left', pitch: 48 }),
    ])
    expect(about(messy, 'treble stave is the right hand')).not.toBe('')
    expect(about(messy, 'No key signature')).toContain('names no key')
    expect(about(messy, 'Every accidental is a sharp')).not.toBe('')
    expect(about(messy, 'a gap in the score')).not.toBe('')
    // Every sentence is a sentence, since a reader is handed these whole.
    for (const one of messy) {
      expect(one.endsWith('.'), one).toBe(true)
    }
  })
})
