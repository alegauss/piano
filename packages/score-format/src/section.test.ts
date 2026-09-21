import { describe, expect, it } from 'vitest'

import {
  flattenSections,
  rangeContains,
  resolveRange,
  sectionAtTick,
  sectionRange,
  validateSections,
  type Section,
} from './section'
import { resolveTiming, DEFAULT_TICKS_PER_QUARTER as PPQ } from './time'

const BAR = PPQ * 4
const timing = resolveTiming(undefined)

const sections: Section[] = [
  { id: 'intro', label: 'Intro', startTick: 0, endTick: 4 * BAR },
  {
    id: 'verse',
    label: 'Verse',
    startTick: 4 * BAR,
    endTick: 12 * BAR,
    children: [{ id: 'hook', label: 'Hook', startTick: 8 * BAR, endTick: 10 * BAR }],
  },
  { id: 'chorus', label: 'Chorus', startTick: 12 * BAR, endTick: 20 * BAR },
]

describe('naming a passage', () => {
  it('resolves a section id to the ticks it covers', () => {
    expect(sectionRange(sections, 'chorus')).toEqual({ start: 12 * BAR, end: 20 * BAR })
  })

  it('finds a nested section by id, without the caller knowing it is nested', () => {
    expect(sectionRange(sections, 'hook')).toEqual({ start: 8 * BAR, end: 10 * BAR })
  })

  it('answers nothing for a name the score does not carry', () => {
    expect(sectionRange(sections, 'bridge')).toBeNull()
  })

  it('lists parents before children', () => {
    expect(flattenSections(sections).map((s) => s.id)).toEqual(['intro', 'verse', 'hook', 'chorus'])
  })
})

describe('resolveRange', () => {
  it('gives a dragged loop and a named one the same ticks', () => {
    // The chorus runs bars 13 to 20 in 4/4. Asking either way must land on the
    // same range, or the app disagrees with itself about where the chorus is.
    const named = resolveRange({ kind: 'section', id: 'chorus' }, timing, sections)
    const byBar = resolveRange({ kind: 'bars', from: 13, to: 20 }, timing, sections)
    expect(named).toEqual(byBar)
  })

  it('resolves bars through the time signature map, not by multiplying', () => {
    const changed = resolveTiming({
      timeSignatures: [
        { tick: 0, numerator: 4, denominator: 4 },
        { tick: 4 * BAR, numerator: 3, denominator: 4 },
      ],
    })
    // Bar 6 begins one 3/4 bar after bar 5, which begins where the meter changed.
    expect(resolveRange({ kind: 'bars', from: 6, to: 6 }, changed, [])).toEqual({
      start: 4 * BAR + PPQ * 3,
      end: 4 * BAR + PPQ * 6,
    })
  })

  it('takes a raw tick range and puts it in order', () => {
    expect(resolveRange({ kind: 'ticks', start: 900, end: 100 }, timing, [])).toEqual({
      start: 100,
      end: 900,
    })
  })

  it('answers nothing for a section that is not there', () => {
    expect(resolveRange({ kind: 'section', id: 'nope' }, timing, sections)).toBeNull()
  })
})

describe('where am I', () => {
  it('names the innermost section containing a tick', () => {
    expect(sectionAtTick(sections, 9 * BAR)?.id).toBe('hook')
    expect(sectionAtTick(sections, 5 * BAR)?.id).toBe('verse')
    expect(sectionAtTick(sections, 100 * BAR)).toBeNull()
  })

  it('treats the end tick as outside, the way a loop point is', () => {
    expect(rangeContains({ start: 0, end: 480 }, 479)).toBe(true)
    expect(rangeContains({ start: 0, end: 480 }, 480)).toBe(false)
    expect(sectionAtTick(sections, 4 * BAR)?.id).toBe('verse')
  })
})

describe('validateSections', () => {
  it('accepts a sound list', () => {
    expect(validateSections(sections)).toEqual([])
  })

  it('refuses a section that ends where it starts', () => {
    expect(
      validateSections([{ id: 'x', label: 'X', startTick: 480, endTick: 480 }]).join('\n'),
    ).toContain('not after its start')
  })

  it('refuses two sections sharing an id, because progress is keyed on it', () => {
    expect(
      validateSections([
        { id: 'a', label: 'A', startTick: 0, endTick: 480 },
        { id: 'a', label: 'B', startTick: 480, endTick: 960 },
      ]).join('\n'),
    ).toContain('share the id')
  })

  it('refuses a child that reaches outside its parent', () => {
    expect(
      validateSections([
        {
          id: 'p',
          label: 'P',
          startTick: 0,
          endTick: 480,
          children: [{ id: 'c', label: 'C', startTick: 240, endTick: 960 }],
        },
      ]).join('\n'),
    ).toContain('reaches outside it')
  })
})
