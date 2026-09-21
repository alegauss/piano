import {
  partOf,
  secondsToTicks,
  ticksToSeconds,
  type Note,
  type ResolvedTiming,
} from '@piano/score-format'

import { keyRect } from './keyboard-geometry'
import type { CanvasToken } from './theme'

/**
 * Where a note is on the roll: a function of its tick and the position
 * playing, and of nothing else.
 *
 * The vertical axis is time and the horizontal axis is the keyboard, so a
 * note's column comes from keyRect, the function the keys are laid out by,
 * and cannot disagree with the key it will strike.
 *
 * Distance is measured in seconds rather than ticks, which is what makes a
 * ritardando look like one: a note twice as far away in time is twice as far
 * up the field, whatever the tempo map does in between. The lead is seconds
 * of wall clock, so slowing the practice tempo does not speed the roll up —
 * it puts less music on screen and the notes fall at the same rate.
 */

/** Seconds of music visible at once, from the strike line to the top. */
export const DEFAULT_LEAD_SECONDS = 3

/** What a beginner and a reader need: three bars of warning down to one. */
export const MIN_LEAD_SECONDS = 0.5
export const MAX_LEAD_SECONDS = 12

export function clampLead(seconds: number): number {
  return Math.min(MAX_LEAD_SECONDS, Math.max(MIN_LEAD_SECONDS, seconds))
}

/** What the roll is drawing, and where playback stands in it. */
export type RollView = {
  readonly timing: ResolvedTiming
  /** The tick sounding now, from the audio clock. */
  readonly position: number
  /** Wall-clock seconds from the strike line to the top of the field. */
  readonly leadSeconds: number
  /** The practice tempo, as a multiple of the written one. */
  readonly tempoScale: number
  readonly width: number
  /** The field above the keyboard. The strike line is its bottom edge. */
  readonly height: number
}

/** Written seconds the field spans: fewer of them the slower the practice tempo. */
function span(view: RollView): number {
  return view.leadSeconds * view.tempoScale
}

/**
 * The ticks on screen, from the strike line to the top.
 *
 * The end is found by walking seconds through the tempo map, not by dividing,
 * so a tempo change inside the window lands where the music does. That walk
 * is score-format's, because a second copy of the conversion is how a roll
 * slides away from the sound over the course of a piece.
 */
export function visibleTicks(view: RollView): { readonly from: number; readonly to: number } {
  const now = ticksToSeconds(view.timing, view.position)
  return { from: view.position, to: secondsToTicks(view.timing, now + span(view)) }
}

export type NoteBox = {
  readonly x: number
  readonly width: number
  /** The top of the note: where it ends, since later is higher. */
  readonly y: number
  readonly height: number
}

/** How thin a note may get before it stops reading as one. */
const MIN_NOTE_HEIGHT = 3

/**
 * A note's rectangle, or null when it is off the field.
 *
 * A note being played has its head below the strike line, which is what makes
 * it look struck rather than removed; the canvas clips it.
 */
export function noteBox(note: Note, view: RollView): NoteBox | null {
  const key = keyRect(note.pitch, view.width)
  if (key === null) {
    return null
  }
  const now = ticksToSeconds(view.timing, view.position)
  const start = ticksToSeconds(view.timing, note.start)
  const end = ticksToSeconds(view.timing, note.start + note.duration)
  const visible = span(view)
  if (start > now + visible || end < now) {
    return null
  }
  const y = (seconds: number) => view.height * (1 - (seconds - now) / visible)
  const top = y(end)
  return {
    x: key.x,
    width: key.width,
    y: top,
    height: Math.max(MIN_NOTE_HEIGHT, y(start) - top),
  }
}

/**
 * The score, arranged once for a draw loop to ask questions of.
 *
 * Sorted by tick with the longest note remembered, which is what lets the
 * visible window be found by binary search rather than by walking every note
 * in the piece on every frame. The longest note is the slack: a note that
 * started before the window can still be sounding inside it, and no note
 * starting earlier than a whole longest-note back can be.
 */
export type RollScore = {
  /** Every note, by tick. */
  readonly notes: readonly Note[]
  /** The longest duration in the piece, in ticks. */
  readonly longest: number
  readonly colours: ReadonlyMap<string, CanvasToken>
}

export function prepareRoll(notes: readonly Note[]): RollScore {
  const sorted = [...notes].sort((a, b) => a.start - b.start)
  let longest = 0
  for (const note of sorted) {
    longest = Math.max(longest, note.duration)
  }
  return { notes: sorted, longest, colours: partColours(sorted) }
}

/** The first note that could still be sounding at a tick, by binary search. */
function firstFrom(score: RollScore, tick: number): number {
  const earliest = tick - score.longest
  let low = 0
  let high = score.notes.length
  while (low < high) {
    const middle = (low + high) >> 1
    if ((score.notes[middle]?.start ?? 0) < earliest) {
      low = middle + 1
    } else {
      high = middle
    }
  }
  return low
}

/** What one frame touched: drawn notes, and notes looked at to find them. */
export type RollStats = {
  readonly drawn: number
  readonly considered: number
}

/**
 * Visit the notes on screen, in tick order, without allocating: a draw loop
 * runs sixty times a second, and an array per frame is sixty arrays a second
 * for the collector to take back.
 */
export function forEachVisible(
  score: RollScore,
  view: RollView,
  visit: (note: Note) => void,
): RollStats {
  const { from, to } = visibleTicks(view)
  let considered = 0
  let drawn = 0
  for (let index = firstFrom(score, from); index < score.notes.length; index += 1) {
    const note = score.notes[index]
    if (note === undefined) {
      break
    }
    considered += 1
    if (note.start > to) {
      break
    }
    if (note.start + note.duration >= from) {
      drawn += 1
      visit(note)
    }
  }
  return { drawn, considered }
}

/** The notes on screen, for a caller that wants them in hand rather than one at a time. */
export function visibleNotes(score: RollScore, view: RollView): Note[] {
  const notes: Note[] = []
  forEachVisible(score, view, (note) => notes.push(note))
  return notes
}

/** The pitches sounding at a tick: what the keyboard lights up. */
export function soundingPitches(score: RollScore, position: number): number[] {
  const sounding = new Set<number>()
  for (let index = firstFrom(score, position); index < score.notes.length; index += 1) {
    const note = score.notes[index]
    if (note === undefined || note.start > position) {
      break
    }
    if (position < note.start + note.duration) {
      sounding.add(note.pitch)
    }
  }
  return [...sounding].sort((a, b) => a - b)
}

/** The four part colours, handed out in the order the parts first appear. */
export const PART_TOKENS = [
  '--note-part-1',
  '--note-part-2',
  '--note-part-3',
  '--note-part-4',
] as const satisfies readonly CanvasToken[]

function partColours(notes: readonly Note[]): Map<string, CanvasToken> {
  const colours = new Map<string, CanvasToken>()
  for (const note of notes) {
    const part = partOf(note)
    if (!colours.has(part)) {
      colours.set(part, PART_TOKENS[colours.size % PART_TOKENS.length] ?? PART_TOKENS[0])
    }
  }
  return colours
}
