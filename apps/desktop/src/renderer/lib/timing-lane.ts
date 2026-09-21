import type { TimingMark } from './grading'
import { keyRect } from './keyboard-geometry'
import type { CanvasToken } from './theme'

/**
 * How early or late each strike was, drawn as a shape rather than a word.
 *
 * The colour of a judged note says it was not in time; it does not say by how
 * much or which way, and those are different problems: somebody consistently
 * twenty milliseconds early is keeping a different beat, not making mistakes.
 * So every strike that found its note leaves a short dash over its key in a
 * narrow lane just above the strike line: above the lane's middle for early,
 * below it for late, as far from the middle as the error, with the timing
 * window's edges a quarter of the lane either side. A passage struck a little
 * to one side is a row of dashes on that side, which is a bias; dashes either
 * side of the middle are ordinary timing.
 *
 * The lane, and not the note, is where a mark lives, because a note being
 * judged is at the strike line by definition and gone below it a moment
 * later, and a mark on a note three pixels tall would not be legible anyway.
 * The dashes fade over a few seconds, long enough to read a phrase's shape.
 */

/** How long a dash stays in the lane, fading as it goes. */
export const LANE_SECONDS = 4

/** The lane's height, and the most of the field it may take on a short one. */
const LANE_HEIGHT = 28
const LANE_SHARE = 0.15

/** A dash's thickness. */
export const DASH_HEIGHT = 2

export type Lane = {
  /** Where the lane's middle is: a strike exactly on the beat. */
  readonly middle: number
  readonly top: number
  readonly height: number
}

export type Dash = {
  readonly x: number
  readonly width: number
  /** The dash's centre line. */
  readonly y: number
  /** 1 when fresh, towards 0 as it fades. */
  readonly alpha: number
  readonly colour: CanvasToken
}

/** The lane on a field of a given height: its bottom edge is the strike line. */
export function laneOf(fieldHeight: number): Lane {
  const height = Math.min(LANE_HEIGHT, fieldHeight * LANE_SHARE)
  const top = fieldHeight - height
  return { top, height, middle: top + height / 2 }
}

/** Where a strike's dash sits: its error against the window, a quarter of the lane per window, kept inside it. */
export function dashY(lane: Lane, offset: number, window: number): number {
  const windows = window > 0 ? offset / window : 0
  const reach = lane.height / 2 - DASH_HEIGHT
  return lane.middle + Math.max(-reach, Math.min(reach, (windows * lane.height) / 4))
}

/** The dashes to draw now, for the strikes recent enough to show. */
export function laneDashes(
  marks: readonly TimingMark[],
  now: number,
  window: number,
  fieldWidth: number,
  lane: Lane,
): Dash[] {
  const dashes: Dash[] = []
  for (const mark of marks) {
    const age = now - mark.at
    if (age < 0 || age > LANE_SECONDS) {
      continue
    }
    const key = keyRect(mark.pitch, fieldWidth)
    if (key === null) {
      continue
    }
    dashes.push({
      x: key.x,
      width: key.width,
      y: dashY(lane, mark.offset, window),
      alpha: 1 - age / LANE_SECONDS,
      colour: mark.outcome === 'correct' ? '--judge-correct' : '--judge-late',
    })
  }
  return dashes
}
