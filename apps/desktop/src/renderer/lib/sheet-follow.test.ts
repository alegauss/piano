import { resolveTiming, type Note } from '@piano/score-format'
import { describe, expect, it } from 'vitest'

import { NO_FEEDBACK, noteKey, type Feedback, type Outcome } from './grading'
import { bandFor, colouring, systemFor } from './sheet-follow'
import { planSheet, STAVE_HEIGHT } from './sheet'

/**
 * Following the playhead, as arithmetic over the plan.
 *
 * Which bar is sounding, where its box is, which system holds it and what
 * each figure should be coloured are all decided here rather than on the page,
 * so none of it needs a browser to answer. That the colours reach the glyphs
 * is the browser test's claim.
 */

const timing = resolveTiming(undefined)
const QUARTER = timing.ticksPerQuarter
const BAR = QUARTER * 4
/** Two bars to a system at this width, which is what the page-turn tests count on. */
const NARROW = 520

const note = (start: number, duration: number, rest: Partial<Note> = {}): Note => ({
  pitch: 60,
  start,
  duration,
  velocity: 80,
  ...rest,
})

/** Eight bars, one note each, so every bar exists and is told apart by its start. */
const eight = Array.from({ length: 8 }, (_unused, index) => note(index * BAR, QUARTER))

const plan = (notes: readonly Note[] = eight, width = 2000) => planSheet({ timing, notes, width })

/** Nothing judged, and no attempt under way. */
const listening: Feedback = NO_FEEDBACK

const judging = (outcomes: readonly [number, number, Outcome][]): Feedback => ({
  ...NO_FEEDBACK,
  notes: new Map(outcomes.map(([start, pitch, outcome]) => [noteKey(start, pitch), outcome])),
  attempting: true,
})

const at = (position: number, feedback: Feedback | null = null) => ({
  position,
  look: (one: { readonly start: number; readonly pitch: number }) =>
    feedback === null ? null : (feedback.notes.get(noteKey(one.start, one.pitch)) ?? null),
})

describe('bandFor', () => {
  it('boxes the bar across every stave of its system', () => {
    const hands = plan([
      note(0, BAR, { hand: 'right', pitch: 72 }),
      note(0, BAR, { hand: 'left', pitch: 48 }),
    ])
    const box = bandFor(hands, 1)
    expect(box?.height).toBe(2 * STAVE_HEIGHT)
    const bar = hands.systems[0]?.bars[0]
    expect(box?.x).toBe(bar?.x)
    expect(box?.width).toBe(bar?.width)
    expect(box?.y).toBe(hands.systems[0]?.y)
  })

  it('moves along the system, bar by bar', () => {
    const page = plan()
    const first = bandFor(page, 1)
    const second = bandFor(page, 2)
    expect(second?.x ?? 0).toBeGreaterThan(first?.x ?? 0)
    expect(second?.y).toBe(first?.y)
  })

  it('has no box for a bar the page does not hold', () => {
    expect(bandFor(plan(), 99)).toBeNull()
    expect(bandFor(plan([]), 1)).toBeNull()
  })
})

describe('systemFor', () => {
  it('drops to the next system when the bars run out', () => {
    const page = plan(eight, NARROW)
    const perSystem = page.systems[0]?.bars.length ?? 0
    expect(perSystem).toBeGreaterThan(0)
    expect(systemFor(page, 1)).toBe(0)
    expect(systemFor(page, 1 + perSystem)).toBe(1)
  })

  it('says -1 about a bar that is not written anywhere', () => {
    expect(systemFor(plan(), 99)).toBe(-1)
  })
})

describe('colouring', () => {
  it('leaves a page exactly as engraved wherever nothing is sounding', () => {
    // Mid-bar 1, after its quarter has stopped and before bar 2 begins.
    expect(colouring(plan(), at(QUARTER * 2)).size).toBe(0)
  })

  it('marks the downbeat at rest, as the roll lights that key at rest', () => {
    // A note starting on the tick the transport sits on is sounding, which is
    // the same reading soundingPitches gives the keyboard.
    expect([...colouring(plan(), at(0)).keys()]).toEqual(['1:0:0'])
  })

  it('colours the figure that is sounding, and only that one', () => {
    const page = plan()
    const wanted = colouring(page, at(BAR + 10))
    // Bar 2's note starts on its downbeat and lasts a quarter.
    expect([...wanted.keys()]).toEqual(['2:0:0'])
    expect(wanted.get('2:0:0')).toBe('--accent')
  })

  it('lets go of a figure once it stops sounding', () => {
    const page = plan()
    expect(colouring(page, at(QUARTER * 2)).size).toBe(0)
  })

  it('paints a verdict from the same map the roll paints from', () => {
    const page = plan()
    const wanted = colouring(
      page,
      at(
        0,
        judging([
          [0, 60, 'correct'],
          [BAR, 60, 'wrong'],
        ]),
      ),
    )
    expect(wanted.get('1:0:0')).toBe('--judge-correct')
    expect(wanted.get('2:0:0')).toBe('--judge-wrong')
  })

  it('keeps a verdict after the note has stopped sounding', () => {
    const page = plan()
    // Well past bar 1, which is when a verdict matters and sounding does not.
    const wanted = colouring(page, at(BAR * 4, judging([[0, 60, 'wrong']])))
    expect(wanted.get('1:0:0')).toBe('--judge-wrong')
  })

  it('takes the worst verdict in a chord, since that is the one to go back and fix', () => {
    const chord = plan([
      note(0, BAR, { pitch: 60 }),
      note(0, BAR, { pitch: 64 }),
      note(0, BAR, { pitch: 67 }),
    ])
    const wanted = colouring(
      chord,
      at(
        BAR * 9,
        judging([
          [0, 60, 'correct'],
          [0, 64, 'late'],
          [0, 67, 'wrong'],
        ]),
      ),
    )
    expect(wanted.get('1:0:0')).toBe('--judge-wrong')
  })

  it('marks a note nobody played as one the score was still owed', () => {
    const page = plan()
    const wanted = colouring(page, at(BAR * 4, judging([[0, 60, 'missed']])))
    expect(wanted.get('1:0:0')).toBe('--judge-expected')
  })

  it('colours no rest, whatever is happening', () => {
    // Bar 1 holds a quarter and three beats of rest; only the note is coloured.
    const page = plan([note(0, QUARTER)])
    const wanted = colouring(page, at(10))
    expect([...wanted.keys()]).toEqual(['1:0:0'])
  })

  it('follows a note tied over the barline by its own start, not the figure it is drawn in', () => {
    // One note from bar 1 beat 4 into bar 2: two figures, one note. Judged by
    // its own start, both ends of the tie carry the verdict.
    const page = plan([note(BAR - QUARTER, QUARTER * 2)])
    const wanted = colouring(page, at(BAR * 4, judging([[BAR - QUARTER, 60, 'wrong']])))
    expect(wanted.get('1:0:1')).toBe('--judge-wrong')
    expect(wanted.get('2:0:0')).toBe('--judge-wrong')
  })

  it('judges nothing while the piece is only being listened to', () => {
    // In a gap, so anything coloured here would be a verdict rather than a
    // note sounding — and nothing is being attempted.
    expect(colouring(plan(), at(BAR * 4 + QUARTER * 2, listening)).size).toBe(0)
  })
})
