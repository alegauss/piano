import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { keySignature, planSheet, type SheetPlan } from './sheet'

/**
 * What the page says, before anything draws it.
 *
 * Every claim here is arithmetic over the score — which clef a hand gets,
 * which bar lands on which system, what a figure is written as — so jsdom is
 * enough. What a stave looks like is the browser test's question.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4
/** Two bars fit across this, which is what the wrapping tests count on. */
const WIDTH = 1040

const note = (start: number, duration: number, rest: Partial<Note> = {}): Note => ({
  pitch: 60,
  start,
  duration,
  velocity: 80,
  ...rest,
})

const plan = (notes: readonly Note[], over: { key?: string; width?: number } = {}): SheetPlan =>
  planSheet({
    timing,
    notes,
    width: over.width ?? WIDTH,
    ...(over.key === undefined ? {} : { key: over.key }),
  })

/** Every bar of every system, in reading order. */
const bars = (page: SheetPlan) => page.systems.flatMap((system) => system.bars)

describe('keySignature', () => {
  it('reads the spellings people actually write', () => {
    expect(keySignature('C')).toBe('C')
    expect(keySignature('Bb')).toBe('Bb')
    expect(keySignature('bb major')).toBe('Bb')
    expect(keySignature('F# minor')).toBe('F#m')
    expect(keySignature(' Am ')).toBe('Am')
  })

  it('drops a key it cannot read rather than inventing one', () => {
    expect(keySignature(undefined)).toBeUndefined()
    expect(keySignature('modal-ish')).toBeUndefined()
    expect(keySignature('H')).toBeUndefined()
    // A real key, but not one of the thirty a signature can be written in.
    expect(keySignature('G#')).toBeUndefined()
  })
})

describe('planSheet', () => {
  it('has nothing to say about a score with no notes', () => {
    const page = plan([])
    expect(page.systems).toEqual([])
    expect(page.height).toBeGreaterThan(0)
  })

  it('gives the right hand a treble stave and the left a bass one', () => {
    const page = plan([
      note(0, QUARTER, { hand: 'right', pitch: 72 }),
      note(0, QUARTER, { hand: 'left', pitch: 48 }),
    ])
    expect(page.clefs).toEqual(['treble', 'bass'])
    expect(bars(page)[0]?.staves.map((stave) => stave.clef)).toEqual(['treble', 'bass'])
  })

  it('reads a score that names no hands as one stave, not an empty grand staff', () => {
    const page = plan([note(0, QUARTER)])
    expect(page.clefs).toEqual(['treble'])
    expect(bars(page)[0]?.staves).toHaveLength(1)
  })

  it('writes the figures PI72 spelled, and a rest for the gap after them', () => {
    const page = plan([note(0, 720), note(720, 240)])
    const written = bars(page)[0]?.staves[0]?.notes ?? []
    expect(written.map((one) => `${one.duration}${'.'.repeat(one.dots)}`)).toEqual(['q.', '8', 'h'])
    expect(written.map((one) => one.rest)).toEqual([false, false, true])
  })

  it('takes the accidental from the spelling the score wrote', () => {
    const page = plan([note(0, BAR, { pitch: 61, spelling: 'Db4' })])
    const written = bars(page)[0]?.staves[0]?.notes[0]
    expect(written?.keys).toEqual(['db/4'])
    expect(written?.accidentals).toEqual(['b'])
  })

  it('falls back to sharps where the score spelled nothing', () => {
    const page = plan([note(0, BAR, { pitch: 61 })])
    const written = bars(page)[0]?.staves[0]?.notes[0]
    expect(written?.keys).toEqual(['c#/4'])
    expect(written?.accidentals).toEqual(['#'])
  })

  it('writes the notes struck together as one chord', () => {
    const page = plan([note(0, BAR, { pitch: 60 }), note(0, BAR, { pitch: 64 })])
    expect(bars(page)[0]?.staves[0]?.notes[0]?.keys).toEqual(['c/4', 'e/4'])
  })

  it('counts the figures it had to round, which a triplet is', () => {
    const straight = plan([note(0, QUARTER), note(QUARTER, QUARTER * 3)])
    expect(straight.leftovers).toBe(0)
    const triplet = plan([note(0, 160), note(160, 160), note(320, 160), note(480, QUARTER * 3)])
    expect(triplet.leftovers).toBe(3)
  })

  it('wraps the bars to the width it was given', () => {
    const notes = Array.from({ length: 8 }, (_unused, index) => note(index * BAR, QUARTER))
    const wide = plan(notes, { width: 2000 })
    const narrow = plan(notes, { width: 500 })
    expect(wide.systems[0]?.bars.length).toBeGreaterThan(narrow.systems[0]?.bars.length ?? 0)
    expect(bars(wide)).toHaveLength(8)
    expect(bars(narrow)).toHaveLength(8)
    // A narrower page is a taller one, since the same music needs more systems.
    expect(narrow.height).toBeGreaterThan(wide.height)
  })

  it('lays each system out left to right with no bar off the edge', () => {
    const notes = Array.from({ length: 6 }, (_unused, index) => note(index * BAR, QUARTER))
    const page = plan(notes)
    for (const system of page.systems) {
      let x = system.bars[0]?.x ?? 0
      for (const bar of system.bars) {
        expect(bar.x).toBeCloseTo(x, 6)
        x += bar.width
      }
      expect(x).toBeLessThanOrEqual(page.width + 1)
    }
  })

  it('carries the clef and the key again on every system, and only there', () => {
    const notes = Array.from({ length: 6 }, (_unused, index) => note(index * BAR, QUARTER))
    const page = plan(notes, { key: 'Bb' })
    for (const system of page.systems) {
      expect(system.bars[0]?.head).toBe(true)
      expect(system.bars[0]?.key).toBe('Bb')
      for (const bar of system.bars.slice(1)) {
        expect(bar.head).toBe(false)
        expect(bar.key).toBeUndefined()
      }
    }
  })

  it('shows the meter where a system opens and where it changes, not on every bar', () => {
    const changeAt = 2 * BAR
    const meters = resolveTiming({
      timeSignatures: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: changeAt, numerator: 3, denominator: 4 },
      ],
    })
    const page = planSheet({
      timing: meters,
      notes: [note(0, QUARTER), note(BAR, QUARTER), note(changeAt, QUARTER)],
      width: 2000,
    })
    const first = page.systems[0]?.bars ?? []
    expect(first.map((bar) => bar.meter)).toEqual(['4/4', undefined, '3/4'])
  })

  it('counts the pickup as bar 0 and starts there', () => {
    const pickup = resolveTiming({ pickupTicks: QUARTER })
    const page = planSheet({
      timing: pickup,
      notes: [note(0, QUARTER), note(QUARTER, BAR)],
      width: WIDTH,
    })
    expect(bars(page).map((bar) => bar.bar)).toEqual([0, 1])
  })
})
