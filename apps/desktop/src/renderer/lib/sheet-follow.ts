import { noteEnd, type Note } from '@piano/score-format'

import type { Outcome } from './grading'
import { JUDGED_TOKENS } from './roll-draw'
import { STAVE_HEIGHT, type SheetPlan } from './sheet'
import type { CanvasToken } from './theme'

/**
 * Following the playhead across a page that was engraved once.
 *
 * Re-engraving per frame is out of the question: VexFlow lays a page out in
 * milliseconds, not microseconds, and laying out again belongs to a resize or
 * a new piece. So the page is drawn once, and everything about playback is a
 * band moved over it and a colour swapped on glyphs already on it.
 *
 * All of it is arithmetic over the plan, which is why it is here rather than
 * in the component: which bar is sounding, where its box is, which system
 * holds it, and what colour each figure should be. The component does the
 * writing, once a frame, and nothing in this file touches the document.
 */

/** A box on the page, in the plan's own pixels. */
export type Band = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Where a bar sits, across every stave of its system; nothing if it is not on the page. */
export function bandFor(plan: SheetPlan, bar: number): Band | null {
  for (const system of plan.systems) {
    for (const one of system.bars) {
      if (one.bar === bar) {
        return {
          x: one.x,
          y: system.y,
          width: one.width,
          height: Math.max(one.staves.length, 1) * STAVE_HEIGHT,
        }
      }
    }
  }
  return null
}

/** Which system a bar is written on, counted from the top, or -1 for one that is not. */
export function systemFor(plan: SheetPlan, bar: number): number {
  return plan.systems.findIndex((system) => system.bars.some((one) => one.bar === bar))
}

/**
 * Which verdict wins where a chord's notes disagree.
 *
 * The worst of them, because one wrong note in three is a chord played wrong,
 * and a green chord with a red note inside it is not something a reader can
 * act on. Wrong ranks highest: it is the one they have to go back and fix.
 */
const RANK: Readonly<Record<Outcome, number>> = {
  correct: 0,
  early: 1,
  late: 1,
  missed: 2,
  wrong: 3,
}

/** What the score is asking for, and what it got, as the roll paints them. */
const SOUNDING_TOKEN: CanvasToken = '--accent'
const MISSED_TOKEN: CanvasToken = '--judge-expected'

export type Following = {
  readonly position: number
  /**
   * What the player made of a note, as noteLook decides it for the roll, or
   * null where nothing is being judged. The same function, so a wrong note
   * looks wrong in whichever reading is open.
   */
  readonly look: (note: { readonly start: number; readonly pitch: number }) => Outcome | null
}

/**
 * What each figure should be coloured, for the figures that should be.
 *
 * A verdict first, then the playhead: a wrong note stays wrong once the music
 * has moved on, where sounding is only true for as long as it lasts. Only the
 * ids that want a colour come back, so everything absent is the engraving as
 * it was drawn — which is what a page nobody is playing looks like.
 */
export function colouring(plan: SheetPlan, at: Following): Map<string, CanvasToken> {
  const wanted = new Map<string, CanvasToken>()
  for (const system of plan.systems) {
    for (const bar of system.bars) {
      for (const stave of bar.staves) {
        for (const one of stave.notes) {
          const token = tokenFor(one.shows, at)
          if (token !== null) {
            wanted.set(one.id, token)
          }
        }
      }
    }
  }
  return wanted
}

function tokenFor(shows: readonly Note[], at: Following): CanvasToken | null {
  let judged: Outcome | null = null
  let ringing = false
  for (const note of shows) {
    const look = at.look(note)
    if (look !== null && (judged === null || RANK[look] > RANK[judged])) {
      judged = look
    }
    ringing ||= note.start <= at.position && at.position < noteEnd(note)
  }
  if (judged === 'missed') {
    return MISSED_TOKEN
  }
  if (judged !== null) {
    return JUDGED_TOKENS[judged]
  }
  return ringing ? SOUNDING_TOKEN : null
}
