import {
  barAtTick,
  flattenSections,
  rangeContains,
  ticksToSeconds,
  type Note,
  type ResolvedTiming,
  type Section,
} from '@piano/score-format'

import { median } from './latency'

/**
 * How the attempt went, note by note.
 *
 * Playing along without judgement is entertainment; practice needs to know
 * what went wrong. Each note the score asked for is matched against what
 * actually arrived, and comes back as one of four things — played inside the
 * window, played outside it early or late, played at the wrong pitch, or not
 * played at all — with notes that were never written as a fifth.
 *
 * The difficult part is the matching rather than the scoring. A player who
 * drops one note must not have every following note counted wrong through a
 * cascade, so nothing here aligns two sequences: every written note looks for
 * the nearest strike it could plausibly be, on its own, and a strike nobody
 * claims is an extra. Skipping a note costs exactly one note.
 *
 * The report is per bar and per named section rather than a percentage,
 * because a number tells nobody what to do next and "bars 17 to 20" does.
 *
 * Both sides of every comparison have been through PI35's arithmetic before
 * they arrive: the score's notes at the time they are heard, the player's at
 * the time the key really went down. What is left here is the comparison.
 */

/** How strict the timing window is, which is a setting because players differ. */
export type Strictness = 'gentle' | 'steady' | 'strict'

/** The window each strictness allows either side of the written time, in seconds. */
export const WINDOWS: Readonly<Record<Strictness, number>> = {
  gentle: 0.25,
  steady: 0.12,
  strict: 0.06,
}

export const STRICTNESSES: readonly Strictness[] = ['gentle', 'steady', 'strict']

export const DEFAULT_STRICTNESS: Strictness = 'steady'

/**
 * How far outside the window a strike can still be an attempt at a note, as a
 * multiple of it. Past this it is not a late note, it is a different note.
 */
export const REACH = 2

/** How far from the written velocity a note is still the right touch, of 127. */
export const TOUCH_WINDOW = 20

/** A note the score asked for. */
export type Expected = {
  readonly pitch: number
  readonly tick: number
  /** As written, which is what the touch is graded against. */
  readonly velocity: number
}

/** A note the player played, already put back where the machine's lag moved it. */
export type Played = {
  readonly pitch: number
  readonly velocity: number
  /** Where it landed in the score, from the transport's own mapping. */
  readonly tick: number
  /**
   * Seconds between that tick and the strike itself. A tick is a coarse unit
   * at a slow tempo, and the position does not run before the start of a
   * pass, so the remainder is kept rather than rounded away.
   */
  readonly slip: number
  /** The practice tempo it was played at: what turns a tick into a second a player feels. */
  readonly scale: number
  /** Whether the input can say how hard a key was struck. A typing keyboard cannot. */
  readonly expressive: boolean
}

export type Outcome = 'correct' | 'early' | 'late' | 'wrong' | 'missed'

export type Judged = {
  readonly expected: Expected
  readonly outcome: Outcome
  /** Seconds late, negative for early, zero for a note nothing was played for. */
  readonly offset: number
  /** What was played for it, which for a wrong note is the note played instead. */
  readonly played: Played | null
}

export type Tally = {
  readonly correct: number
  readonly early: number
  readonly late: number
  readonly wrong: number
  readonly missed: number
  /** Notes played that the score never asked for. */
  readonly extra: number
  /** How many notes the score asked for here. */
  readonly of: number
}

export type BarReport = {
  readonly bar: number
  readonly tally: Tally
}

export type SectionReport = {
  readonly id: string
  readonly label: string
  readonly tally: Tally
}

/**
 * How the touch went, kept apart from the notes.
 *
 * Playing the right notes and playing them at the right weight are different
 * skills, and rolling them into one figure hides which of the two is the
 * problem. Null where nothing was graded, which is what an input with no
 * velocity means.
 */
export type Dynamics = {
  /** Notes graded for touch: right pitch, on an input that has velocity. */
  readonly of: number
  readonly within: number
  /** The middle difference from what is written, positive for harder than asked. */
  readonly off: number
}

export type Attempt = {
  readonly strictness: Strictness
  /** The window that was applied, in seconds. */
  readonly window: number
  readonly judged: readonly Judged[]
  readonly extras: readonly Played[]
  readonly tally: Tally
  readonly bars: readonly BarReport[]
  readonly sections: readonly SectionReport[]
  readonly dynamics: Dynamics | null
}

/** The notes of a stretch, as the grader asks for them. Both ends included. */
export function expectedFrom(notes: readonly Note[], from: number, to: number): Expected[] {
  return notes
    .filter((note) => note.start >= from && note.start <= to)
    .map((note) => ({ pitch: note.pitch, tick: note.start, velocity: note.velocity }))
    .sort((one, other) => one.tick - other.tick || one.pitch - other.pitch)
}

/**
 * How late a strike was against a note, in seconds a player would feel.
 *
 * Through the tempo map and then the practice tempo, so half speed makes the
 * window twice as wide in written time and exactly as wide in real time,
 * which is what a window in milliseconds means.
 */
function offsetOf(timing: ResolvedTiming, expected: Expected, played: Played): number {
  return (
    (ticksToSeconds(timing, played.tick) - ticksToSeconds(timing, expected.tick)) / played.scale +
    played.slip
  )
}

export function grade(
  expected: readonly Expected[],
  played: readonly Played[],
  options: {
    readonly timing: ResolvedTiming
    readonly sections?: readonly Section[]
    readonly strictness?: Strictness
  },
): Attempt {
  const strictness = options.strictness ?? DEFAULT_STRICTNESS
  const window = WINDOWS[strictness]
  const reach = window * REACH
  const timing = options.timing

  const notes = [...expected].sort((one, other) => one.tick - other.tick || one.pitch - other.pitch)
  const strikes = [...played].sort((one, other) => one.tick - other.tick || one.pitch - other.pitch)
  /** Which strike each note was matched to, and which strikes are spoken for. */
  const matched = new Map<number, number>()
  const taken = new Set<number>()

  /** The nearest strike a note could be, within reach and not already claimed. */
  const nearest = (note: Expected, samePitch: boolean): number => {
    let found = -1
    let closest = Infinity
    strikes.forEach((strike, index) => {
      if (taken.has(index) || (samePitch && strike.pitch !== note.pitch)) {
        return
      }
      const off = Math.abs(offsetOf(timing, note, strike))
      if (off <= reach && off < closest) {
        closest = off
        found = index
      }
    })
    return found
  }

  // The right note first, everywhere, before anything is called wrong: a
  // strike that is some note's own is never spent standing in for another.
  notes.forEach((note, index) => {
    const found = nearest(note, true)
    if (found >= 0) {
      matched.set(index, found)
      taken.add(found)
    }
  })
  // Then what is left over, which is what a wrong note looks like: a strike
  // near a note nobody played, at a pitch the score did not ask for there.
  notes.forEach((note, index) => {
    if (matched.has(index)) {
      return
    }
    const found = nearest(note, false)
    if (found >= 0) {
      matched.set(index, found)
      taken.add(found)
    }
  })

  const judged = notes.map((note, index): Judged => {
    const found = matched.get(index)
    const strike = found === undefined ? undefined : strikes[found]
    if (strike === undefined) {
      return { expected: note, outcome: 'missed', offset: 0, played: null }
    }
    const offset = offsetOf(timing, note, strike)
    return {
      expected: note,
      outcome: outcomeOf(note, strike, offset, window),
      offset,
      played: strike,
    }
  })
  const extras = strikes.filter((_strike, index) => !taken.has(index))

  return {
    strictness,
    window,
    judged,
    extras,
    tally: tallyOf(judged, extras),
    bars: barReports(timing, judged, extras),
    sections: sectionReports(options.sections ?? [], judged, extras),
    dynamics: dynamicsOf(judged),
  }
}

function outcomeOf(
  note: Expected,
  strike: Played,
  offset: number,
  window: number,
): Exclude<Outcome, 'missed'> {
  if (strike.pitch !== note.pitch) {
    return 'wrong'
  }
  if (Math.abs(offset) <= window) {
    return 'correct'
  }
  return offset < 0 ? 'early' : 'late'
}

export function tallyOf(judged: readonly Judged[], extras: readonly Played[]): Tally {
  const count = (outcome: Outcome) => judged.filter((one) => one.outcome === outcome).length
  return {
    correct: count('correct'),
    early: count('early'),
    late: count('late'),
    wrong: count('wrong'),
    missed: count('missed'),
    extra: extras.length,
    of: judged.length,
  }
}

/** Everything that was not a note played in time, which is what a bar is judged on. */
export function faults(tally: Tally): number {
  return tally.of - tally.correct + tally.extra
}

/** The bars that did not come out, worst first, which is what a report is for. */
export function troubled(bars: readonly BarReport[]): BarReport[] {
  return bars
    .filter((bar) => faults(bar.tally) > 0)
    .sort((one, other) => faults(other.tally) - faults(one.tally) || one.bar - other.bar)
}

/**
 * Bar numbers as somebody says them out loud: runs become ranges, so four
 * failing bars read as "17–20" rather than as a list to piece together.
 */
export function barNames(bars: readonly number[]): string {
  const sorted = [...new Set(bars)].sort((one, other) => one - other)
  const runs: [number, number][] = []
  for (const bar of sorted) {
    const last = runs[runs.length - 1]
    if (last !== undefined && bar === last[1] + 1) {
      last[1] = bar
      continue
    }
    runs.push([bar, bar])
  }
  return runs
    .map(([from, to]) => (from === to ? String(from) : `${String(from)}–${String(to)}`))
    .join(', ')
}

function barReports(
  timing: ResolvedTiming,
  judged: readonly Judged[],
  extras: readonly Played[],
): BarReport[] {
  const bars = new Set<number>()
  const barOf = (tick: number) => barAtTick(timing, tick).bar
  for (const one of judged) {
    bars.add(barOf(one.expected.tick))
  }
  for (const extra of extras) {
    bars.add(barOf(extra.tick))
  }
  return [...bars]
    .sort((one, other) => one - other)
    .map((bar) => ({
      bar,
      tally: tallyOf(
        judged.filter((one) => barOf(one.expected.tick) === bar),
        extras.filter((extra) => barOf(extra.tick) === bar),
      ),
    }))
}

function sectionReports(
  sections: readonly Section[],
  judged: readonly Judged[],
  extras: readonly Played[],
): SectionReport[] {
  return flattenSections(sections)
    .map((section) => {
      const range = { start: section.startTick, end: section.endTick }
      return {
        id: section.id,
        label: section.label,
        tally: tallyOf(
          judged.filter((one) => rangeContains(range, one.expected.tick)),
          extras.filter((extra) => rangeContains(range, extra.tick)),
        ),
      }
    })
    .filter((report) => report.tally.of > 0 || report.tally.extra > 0)
}

/**
 * The touch, over the notes that were played at the right pitch on an input
 * that has velocity. The middle difference and not the mean, for the reason
 * the calibration uses one: a single stab drags an average and not a median.
 */
function dynamicsOf(judged: readonly Judged[]): Dynamics | null {
  const offs: number[] = []
  let within = 0
  for (const one of judged) {
    const strike = one.played
    if (strike === null || !strike.expressive || one.outcome === 'wrong') {
      continue
    }
    const off = strike.velocity - one.expected.velocity
    offs.push(off)
    if (Math.abs(off) <= TOUCH_WINDOW) {
      within += 1
    }
  }
  return offs.length === 0 ? null : { of: offs.length, within, off: median(offs) }
}
